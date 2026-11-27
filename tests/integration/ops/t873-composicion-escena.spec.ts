import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { FastifyInstance } from 'fastify';
import { activateInFile } from '../../fixtures/active-accounts.ts';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CloudTasksSceneDispatcher } from '../../../src/infrastructure/adapters/cloud-tasks-scene-dispatcher.adapter.ts';
import { FakeSceneImageGenerator } from '../../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { InProcessSceneDispatcher } from '../../../src/infrastructure/adapters/in-process-scene-dispatcher.adapter.ts';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { composeSceneServices, selectSceneDispatcher } from '../../../src/infrastructure/http/scene-composition.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';
import { loadAppConfigActivated, PROD_SCENE } from '../../fixtures/scene-config-fixtures.ts';

/**
 * T873 (006, Fase 6): composición de la escena. En desarrollo y CI: generador SIMULADO, despachador EN PROCESO y ninguna llamada a GCP; el `CloudTasksSceneDispatcher` solo
 * se construye con `ARGOS_SCENE_DRIVER=real` (que hoy no arranca) y se prueba con dobles. La ruta `/internal/scene-worker` existe solo con cuenta y URL configuradas.
 * REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031, REQ-ESC6-033; INV-ESC6-002, INV-ESC6-018; SC-ESC6-050, SC-ESC6-077, SC-ESC6-087.
 */
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const KID = 'composicion-key-1';
const NEW_PET = { name: 'Lucía', species: 'CANINE', breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE', avatarUrl: null };

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});
const sign = (audience: string, email: string): Promise<string> =>
  new SignJWT({ email, email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: KID }).setIssuer('https://accounts.google.com').setAudience(audience).setSubject('sub').setIssuedAt().setExpirationTime('5m').sign(privateKey);

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'argos-t873-'));
  dirs.push(dir);
  const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'argos.sqlite'), ...extra }), false, { oidcJwks: jwks });
  apps.push(app);
  const post = (url: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, headers: { 'x-argos-request': '1', 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }), ...headers }, payload: JSON.stringify(body) });
  await post('/api/auth/register', { adultDeclaration: true, username: 'prueba', displayName: 'Prueba', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' });
  await activateInFile(join(dir, 'argos.sqlite'), 'prueba'); // 009 (T1246): el alta nace PENDING y sin sesión; el arnés T1244 la activa
  const logged = await post('/api/auth/login', { username: 'prueba', password: 'Clave2026x!' });
  const cookie = String(logged.headers['set-cookie']).split(';')[0]!;
  return { app, cookie, post };
}

describe('composición de la escena en desarrollo y CI (T873, REQ-ESC6-017, REQ-ESC6-031)', () => {
  it('[SC-ESC6-050][REQ-ESC6-031] con el driver fake se componen el generador simulado y el despachador en proceso; el de Cloud Tasks no se construye', () => {
    const config = loadAppConfig({ NODE_ENV: 'test' });
    const services = composeSceneServices(config, { run: async () => 'NOOP' });
    expect([services.generator instanceof FakeSceneImageGenerator, services.dispatcher instanceof InProcessSceneDispatcher, services.dispatcher instanceof CloudTasksSceneDispatcher, services.realDriver]).toEqual([true, true, false, false]);
    expect([services.maxPets, services.quotaMax, services.genTimeoutSeconds, services.leaseSeconds, services.queueWaitSeconds]).toEqual([8, 10, 90, 150, 600]);
  });

  it('[REQ-ESC6-026] el aviso de consentimiento vigente y el desfase horario de APP_TIMEZONE salen de las constantes y de la configuración, no de la petición', () => {
    const bogota = composeSceneServices(loadAppConfig({ NODE_ENV: 'test' }), { run: async () => 'NOOP' });
    const utc = composeSceneServices(loadAppConfig({ NODE_ENV: 'test', APP_TIMEZONE: 'UTC' }), { run: async () => 'NOOP' });
    expect([bogota.noticeVersion, bogota.providerId, bogota.utcOffsetMinutes, utc.utcOffsetMinutes]).toEqual(['3', 'vertex-gemini-image', -300, 0]);
  });

  it('[INV-ESC6-018][SC-ESC6-087] con el driver real el despachador es el de Cloud Tasks con destino y cuenta de la configuración validada y se prueba con dobles (sin llamadas)', async () => {
    const config = loadAppConfigActivated({ NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media', ...PROD_SCENE });
    const calls: string[] = [];
    const dispatcher = selectSceneDispatcher(config.scene, {
      run: async () => 'NOOP',
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push(`${String(url)} ${String(init?.body).length > 0}`);
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
      getAccessToken: async () => 'token-falso',
    });
    expect(dispatcher instanceof CloudTasksSceneDispatcher).toBe(true);
    await dispatcher.enqueue({ sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000001' });
    expect(calls).toEqual(['https://cloudtasks.googleapis.com/v2/projects/argos-prod-1234/locations/us-central1/queues/argos-scene/tasks true']);
  });

  it('[REQ-ESC6-028][REQ-ESC6-031] el driver real está activado por T885: con la constante del código arranca; con sceneRealDriverActivated: false no, y la composición del real sin tope global se niega', () => {
    const env = { NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media', ...PROD_SCENE };
    expect(loadAppConfig(env).scene.driver).toBe('real');
    expect(() => loadAppConfig(env, { sceneRealDriverActivated: false })).toThrow('ARGOS_SCENE_DRIVER');
    const config = loadAppConfigActivated(env);
    expect(() => composeSceneServices(config, { run: async () => 'NOOP' })).toThrow('Configuración del driver real incompleta');
  });
});

describe('createProductionApp con la escena (T873)', () => {
  it('[REQ-ESC6-017][SC-ESC6-050] recorrido de desarrollo: consentir, generar (202), el despachador en proceso ejecuta al generador simulado y la escena queda ready con la imagen por 302', async () => {
    const { app, cookie, post } = await start();
    const pet = await post('/api/pets', NEW_PET, cookie);
    expect(pet.statusCode).toBe(201);
    const accepted = await post('/api/me/scene/generate', { action: 'UPDATE' }, cookie, { 'idempotency-key': 'b0000000-0000-4000-8000-000000000001' });
    expect([accepted.statusCode, (accepted.json() as { status: string }).status]).toEqual([202, 'generating']);
    let status = 'generating';
    for (let i = 0; i < 100 && status === 'generating'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      status = ((await app.inject({ method: 'GET', url: '/api/me/scene', headers: { cookie } })).json() as { status: string }).status;
    }
    expect(status).toBe('ready');
    const image = await app.inject({ method: 'GET', url: '/api/me/scene/image', headers: { cookie } });
    expect([image.statusCode, String(image.headers['location']).startsWith('/__dev/media/scenes/'), image.headers['cache-control']]).toEqual([302, true, 'no-store']);
  });

  it('[REQ-ESC6-033] sin ARGOS_SCENE_TASKS_SA_EMAIL y ARGOS_SCENE_WORKER_URL la ruta /internal/scene-worker no existe (404 aun con un token válido)', async () => {
    const { app } = await start();
    const r = await app.inject({ method: 'POST', url: '/internal/scene-worker', headers: { 'content-type': 'application/json', authorization: `Bearer ${await sign(WORKER_URL, TASKS_EMAIL)}` }, payload: '{}' });
    expect(r.statusCode).toBe(404);
  });

  it('[SC-ESC6-077][SC-ESC6-087] con ambas variables la ruta existe y exige identidad: sin token 401, el token del Planificador (otra audiencia) 401, otra cuenta 403, la cola con tarea de otra escena 204', async () => {
    const { app } = await start({ ARGOS_SCENE_TASKS_SA_EMAIL: TASKS_EMAIL, ARGOS_SCENE_WORKER_URL: WORKER_URL });
    const send = (token: string | null, payload = JSON.stringify({ sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000001' })) =>
      app.inject({ method: 'POST', url: '/internal/scene-worker', headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) }, payload });
    const codes = [
      (await send(null)).statusCode,
      (await send(await sign('https://argos-abcdef-uc.a.run.app', 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com'))).statusCode,
      (await send(await sign(WORKER_URL, 'otra@argos-prod-1234.iam.gserviceaccount.com'))).statusCode,
      (await send(await sign(WORKER_URL, TASKS_EMAIL))).statusCode,
    ];
    expect(codes).toEqual([401, 401, 403, 204]);
  });
});
