import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRouteOidcVerifier } from '../../../src/infrastructure/http/oidc-verify.ts';
import { registerCsrfGuard } from '../../../src/infrastructure/http/plugins/csrf-guard.ts';
import { registerProblemDetails } from '../../../src/infrastructure/http/plugins/problem-details.ts';
import * as workerModule from '../../../src/infrastructure/http/routes/scene-worker.routes.ts';

/**
 * T873 (006, Fase 6): `POST /internal/scene-worker` (Cloud Tasks). La identidad se verifica ANTES de leer el cuerpo (token OIDC con audiencia propia = URL del worker y
 * correo exacto de `argos-scene-tasks`, cuerpo <= 1 KiB), sin cookie ni CSRF; 401 sin token, inválido o audiencia equivocada; 403 con audiencia correcta y otro correo
 * (incluida la identidad del Planificador); 204 sin oráculo; el worker ESPERA la generación antes de responder. REQ-ESC6-033, REQ-ESC6-036, REQ-ESC6-012;
 * INV-ESC6-018, INV-ESC6-003; EDGE-ESC6-024, EDGE-ESC6-027; NFR-ESC6-002; SC-ESC6-055, SC-ESC6-059, SC-ESC6-070, SC-ESC6-075, SC-ESC6-077, SC-ESC6-087.
 * JWKS efímero y tokens sintéticos: ninguna clave real.
 */
const MAINTENANCE_AUDIENCE = 'https://argos-abcdef-uc.a.run.app';
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const SCHEDULER_EMAIL = 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const KID = 'worker-key-1';
const JOB = { sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000001' };

type RunOutcome = 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'NOOP';
type Run = (job: { sceneId: string; attemptId: string }, signal: AbortSignal) => Promise<RunOutcome>;
interface Options {
  readonly verifyOidc: ReturnType<typeof createRouteOidcVerifier>;
  readonly expectedEmail: string;
  readonly run: Run;
  readonly genTimeoutSeconds: number;
}
const registerSceneWorkerRoute = (workerModule as unknown as Record<string, (app: FastifyInstance, options: Options) => void>)['registerSceneWorkerRoute'] as (app: FastifyInstance, options: Options) => void;

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});

const sign = (audience: string, email: string, extra: { emailVerified?: boolean; expired?: boolean } = {}): Promise<string> =>
  new SignJWT({ email, email_verified: extra.emailVerified ?? true })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject('sub-worker')
    .setIssuedAt()
    .setExpirationTime(extra.expired === true ? Math.floor(Date.now() / 1000) - 3600 : '5m')
    .sign(privateKey);

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function workerApp(run: Run, genTimeoutSeconds = 90): Promise<FastifyInstance> {
  const app = Fastify();
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(app);
  registerCsrfGuard(app);
  registerSceneWorkerRoute(app, { verifyOidc: createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks }), expectedEmail: TASKS_EMAIL, run, genTimeoutSeconds });
  await app.ready();
  apps.push(app);
  return app;
}

const post = (app: FastifyInstance, token: string | null, payload: string | Buffer = JSON.stringify(JOB), extraHeaders: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/internal/scene-worker', headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...extraHeaders }, payload });

describe('identidad antes del cuerpo (T873, REQ-ESC6-033, SC-ESC6-077)', () => {
  it('[SC-ESC6-077] sin Bearer, con token inválido o con una firma ajena responde 401 sin cuerpo y no ejecuta nada', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const stranger = await generateKeyPair('RS256');
    const foreign = await new SignJWT({ email: TASKS_EMAIL, email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: KID }).setIssuer('https://accounts.google.com').setAudience(WORKER_URL).setSubject('s').setExpirationTime('5m').sign(stranger.privateKey);
    const results = [await post(app, null), await post(app, 'no.es.un-token'), await post(app, foreign)];
    expect(results.map((r) => [r.statusCode, r.body])).toEqual([[401, ''], [401, ''], [401, '']]);
    expect(run).not.toHaveBeenCalled();
  });

  it('[SC-ESC6-077] el token del Planificador (audiencia de mantenimiento, su cuenta) responde 401: la audiencia es propia de la ruta', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const r = await post(app, await sign(MAINTENANCE_AUDIENCE, SCHEDULER_EMAIL));
    expect([r.statusCode, r.body, run.mock.calls.length]).toEqual([401, '', 0]);
  });

  it('[SC-ESC6-077] token de la cola caducado o con email_verified falso responde 401', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const expired = await post(app, await sign(WORKER_URL, TASKS_EMAIL, { expired: true }));
    const unverified = await post(app, await sign(WORKER_URL, TASKS_EMAIL, { emailVerified: false }));
    expect([expired.statusCode, unverified.statusCode, run.mock.calls.length]).toEqual([401, 401, 0]);
  });

  it('[SC-ESC6-077][REQ-ESC6-033] con la audiencia del worker y el correo del Planificador o de cualquier otra cuenta responde 403 sin cuerpo ni detalle; el correo se compara exacto', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const emails = [SCHEDULER_EMAIL, 'otra@argos-prod-1234.iam.gserviceaccount.com', TASKS_EMAIL.toUpperCase(), `x${TASKS_EMAIL}`, `${TASKS_EMAIL}.evil.example`];
    const results = [];
    for (const email of emails) results.push(await post(app, await sign(WORKER_URL, email)));
    expect(results.map((r) => [r.statusCode, r.body])).toEqual(emails.map(() => [403, '']));
    expect(run).not.toHaveBeenCalled();
  });

  it('[REQ-ESC6-033][H-TRI-006-01] la identidad se verifica ANTES de parsear el cuerpo: sin token, un cuerpo mal formado o de 2 KiB sigue siendo 401 (no 422 ni 413)', async () => {
    const app = await workerApp(vi.fn<Run>(async () => 'PUBLISHED'));
    const malformed = await post(app, null, '{no-json');
    const huge = await post(app, null, Buffer.alloc(2048, 0x61));
    const wrongEmailHuge = await post(app, await sign(WORKER_URL, SCHEDULER_EMAIL), Buffer.alloc(2048, 0x61));
    expect([malformed.statusCode, huge.statusCode, wrongEmailHuge.statusCode]).toEqual([401, 401, 403]);
  });

  it('[REQ-ESC6-033] ajena a cookies y a CSRF: la identidad correcta sin X-Argos-Request y con cookie ignorada ejecuta la tarea (204)', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const r = await post(app, await sign(WORKER_URL, TASKS_EMAIL), JSON.stringify(JOB), { cookie: 'argos_session=ignorada' });
    expect([r.statusCode, r.body, run.mock.calls.length]).toEqual([204, '', 1]);
  });
});

describe('cuerpo de la tarea (T873, contrato SceneWorkerTask)', () => {
  it('[REQ-ESC6-033] con identidad válida un cuerpo mayor de 1 KiB, que no es JSON, con campos extra, sin UUID o vacío es 422 sin ejecutar nada', async () => {
    const run = vi.fn<Run>(async () => 'PUBLISHED');
    const app = await workerApp(run);
    const token = await sign(WORKER_URL, TASKS_EMAIL);
    const bodies: Array<string | Buffer> = [
      Buffer.alloc(1025, 0x20),
      '{no-json',
      JSON.stringify({ ...JOB, extra: 1 }),
      JSON.stringify({ sceneId: 'no-uuid', attemptId: JOB.attemptId }),
      JSON.stringify({ sceneId: JOB.sceneId }),
      JSON.stringify([JOB]),
      '',
    ];
    const codes = [];
    for (const body of bodies) codes.push((await post(app, token, body)).statusCode);
    expect(codes).toEqual([422, 422, 422, 422, 422, 422, 422]);
    expect(run).not.toHaveBeenCalled();
  });

  it('[SC-ESC6-075] el cuerpo de hasta 1 KiB con los dos identificadores se entrega a la ejecución con una señal de aborto activa', async () => {
    let received: { job: unknown; signal: AbortSignal } | null = null;
    const app = await workerApp(async (job, signal) => {
      received = { job, signal };
      return 'PUBLISHED';
    });
    const r = await post(app, await sign(WORKER_URL, TASKS_EMAIL));
    expect([r.statusCode, received!.job, received!.signal instanceof AbortSignal, received!.signal.aborted]).toEqual([204, JOB, true, false]);
  });
});

describe('el worker espera la generación y responde 204 sin oráculo (T873, REQ-ESC6-036, NFR-ESC6-002)', () => {
  it('[SC-ESC6-055][NFR-ESC6-002] la respuesta NO sale hasta que la generación termina (nada de setImmediate tras responder)', async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const app = await workerApp(async () => {
      events.push('run:start');
      await gate;
      events.push('run:end');
      return 'PUBLISHED';
    });
    const token = await sign(WORKER_URL, TASKS_EMAIL);
    const pending = post(app, token).then((r) => {
      events.push(`response:${r.statusCode}`);
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events).toEqual(['run:start']);
    release();
    await pending;
    expect(events).toEqual(['run:start', 'run:end', 'response:204']);
  });

  it('[SC-ESC6-059][SC-ESC6-070][EDGE-ESC6-024] éxito, fallo registrado, cancelado y duplicado ignorado responden el MISMO 204 sin cuerpo (sin oráculo)', async () => {
    const outcomes: RunOutcome[] = ['PUBLISHED', 'FAILED', 'CANCELLED', 'NOOP'];
    let next = 0;
    const app = await workerApp(async () => outcomes[next++]!);
    const token = await sign(WORKER_URL, TASKS_EMAIL);
    const results = [];
    for (let i = 0; i < outcomes.length; i += 1) {
      const r = await post(app, token);
      results.push([r.statusCode, r.body, r.headers['content-type'] ?? null]);
    }
    expect(results).toEqual(outcomes.map(() => [204, '', null]));
  });

  it('[REQ-ESC6-036] un fallo inesperado de la ejecución responde 500 sin mensaje, causa ni identificadores (maxAttempts = 1: el arrendamiento resuelve)', async () => {
    const app = await workerApp(async () => {
      throw new Error('boom-secreto sceneId=c1000000');
    });
    const r = await post(app, await sign(WORKER_URL, TASKS_EMAIL));
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('boom');
    expect(r.body).not.toContain(JOB.sceneId);
  });
});
