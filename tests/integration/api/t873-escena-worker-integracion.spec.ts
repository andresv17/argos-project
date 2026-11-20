import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { createRouteOidcVerifier } from '../../../src/infrastructure/http/oidc-verify.ts';
import { registerProblemDetails } from '../../../src/infrastructure/http/plugins/problem-details.ts';
import { registerSceneWorkerRoute } from '../../../src/infrastructure/http/routes/scene-worker.routes.ts';
import { HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { NEW_PET } from './api-fixtures.ts';
import { createApi, type Api } from './api-harness.ts';

/**
 * T873 (006, Fase 6): el worker HTTP sobre el caso de uso real y SQLite. `attemptId` de otra escena, escena inexistente, intento inexistente y entrega duplicada
 * responden el mismo 204 sin efecto y sin llamar al generador ni descontar cuota (sin oráculo; entrega al-menos-una-vez). REQ-ESC6-033, REQ-ESC6-036, REQ-ESC6-012;
 * INV-ESC6-003; EDGE-ESC6-024, EDGE-ESC6-027; SC-ESC6-059, SC-ESC6-070, SC-ESC6-075.
 */
const H1 = HOUSEHOLD.id;
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const KID = 'integracion-key-1';
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW_ISO = '2026-11-05T12:00:00.000Z';

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});
const token = (): Promise<string> =>
  new SignJWT({ email: TASKS_EMAIL, email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: KID }).setIssuer('https://accounts.google.com').setAudience(WORKER_URL).setSubject('sub').setIssuedAt().setExpirationTime('5m').sign(privateKey);

let api: Api;
let worker: FastifyInstance;
afterEach(async () => {
  await worker?.close();
  await api?.close();
});

async function setup(): Promise<{ fixture: SceneFixture; cookie: string; run: RunSceneGenerationUseCase }> {
  const fixture = sceneFixture();
  const storage = new ControlledStorage(() => new Date(NOW_ISO));
  api = await createApi(undefined, { scene: fixture.services, media: { storage, limits: DEFAULT_LIMITS } });
  const run = new RunSceneGenerationUseCase(api.deps);
  worker = Fastify();
  worker.removeAllContentTypeParsers();
  worker.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(worker);
  registerSceneWorkerRoute(worker, {
    verifyOidc: createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks }),
    expectedEmail: TASKS_EMAIL,
    run: (job, signal) => run.execute(job, signal),
    genTimeoutSeconds: 90,
  });
  await worker.ready();
  return { fixture, cookie: await api.login('andres'), run };
}

const deliver = async (job: unknown) =>
  worker.inject({ method: 'POST', url: '/internal/scene-worker', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` }, payload: JSON.stringify(job) });
const generate = (cookie: string, n: number, base: string) => api.call('POST', `${base}/generate`, { cookie, contract: false, body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(n) } });
const view = async (cookie: string, base: string) => (await api.call('GET', base, { cookie, contract: false })).json as { status: string; quota: { remaining: number } };

describe('worker HTTP sobre el caso de uso real (T873)', () => {
  it('[REQ-ESC6-036][SC-ESC6-075] la tarea del intento aceptado genera, publica y la escena queda ready con una generación descontada; la respuesta es 204', async () => {
    const { fixture, cookie } = await setup();
    const accepted = await generate(cookie, 1, `/api/households/${H1}/scene`);
    expect(accepted.status).toBe(202);
    const job = fixture.dispatcher.jobs[0]!;
    const r = await deliver(job);
    const after = await view(cookie, `/api/households/${H1}/scene`);
    expect([r.statusCode, r.body, fixture.generator.calls.length, after.status, after.quota.remaining]).toEqual([204, '', 1, 'ready', 9]);
  });

  it('[EDGE-ESC6-024][EDGE-ESC6-027][SC-ESC6-059] entrega duplicada (al-menos-una-vez): el segundo 204 es idéntico, el generador se llama una sola vez y la cuota se descuenta una vez', async () => {
    const { fixture, cookie } = await setup();
    await generate(cookie, 1, `/api/households/${H1}/scene`);
    const job = fixture.dispatcher.jobs[0]!;
    const first = await deliver(job);
    const second = await deliver(job);
    const after = await view(cookie, `/api/households/${H1}/scene`);
    expect([first.statusCode, second.statusCode, second.body, fixture.generator.calls.length, after.quota.remaining]).toEqual([204, 204, '', 1, 9]);
  });

  it('[REQ-ESC6-033][H-TRI-006-01] un attemptId que no pertenece al sceneId, una escena inexistente y un intento inexistente responden el mismo 204 sin efecto: sin generador, sin cuota, sin cambio de estado', async () => {
    const { fixture, cookie } = await setup();
    await generate(cookie, 1, `/api/households/${H1}/scene`);
    // La escena del propietario sin hogar (D6-09) es la de Lucía con una mascota sin asignar.
    const lucia = await api.login('lucia.r');
    expect((await api.call('POST', '/api/pets', { cookie: lucia, body: NEW_PET })).status).toBe(201);
    expect((await generate(lucia, 2, '/api/me/scene')).status).toBe(202);
    const [household, owner] = fixture.dispatcher.jobs;
    const dumpBefore = api.dump();
    const crossed = await deliver({ sceneId: household!.sceneId, attemptId: owner!.attemptId });
    const crossed2 = await deliver({ sceneId: owner!.sceneId, attemptId: household!.attemptId });
    const noScene = await deliver({ sceneId: KEY(90), attemptId: household!.attemptId });
    const noAttempt = await deliver({ sceneId: household!.sceneId, attemptId: KEY(91) });
    const noBoth = await deliver({ sceneId: KEY(92), attemptId: KEY(93) });
    const results = [crossed, crossed2, noScene, noAttempt, noBoth].map((r) => [r.statusCode, r.body, r.headers['content-type'] ?? null]);
    expect(results).toEqual(Array.from({ length: 5 }, () => [204, '', null]));
    expect([fixture.generator.calls.length, api.dump()]).toEqual([0, dumpBefore]);
  });

  it('[SC-ESC6-070][INV-ESC6-003] un fallo del generador se registra como intento failed sin cuota y la respuesta sigue siendo 204 (nunca 5xx a la cola)', async () => {
    const fixture = sceneFixture({ mode: 'fail' });
    const storage = new ControlledStorage(() => new Date(NOW_ISO));
    api = await createApi(undefined, { scene: fixture.services, media: { storage, limits: DEFAULT_LIMITS } });
    const run = new RunSceneGenerationUseCase(api.deps);
    worker = Fastify();
    worker.removeAllContentTypeParsers();
    worker.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    registerProblemDetails(worker);
    registerSceneWorkerRoute(worker, { verifyOidc: createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks }), expectedEmail: TASKS_EMAIL, run: (job, signal) => run.execute(job, signal), genTimeoutSeconds: 90 });
    await worker.ready();
    const cookie = await api.login('andres');
    await generate(cookie, 1, `/api/households/${H1}/scene`);
    const r = await deliver(fixture.dispatcher.jobs[0]!);
    const after = await view(cookie, `/api/households/${H1}/scene`);
    expect([r.statusCode, r.body, after.status, after.quota.remaining]).toEqual([204, '', 'failed', 10]);
  });
});
