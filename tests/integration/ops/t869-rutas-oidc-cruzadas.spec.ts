import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as oidc from '../../../src/infrastructure/http/oidc-verify.ts';
import { registerCsrfGuard } from '../../../src/infrastructure/http/plugins/csrf-guard.ts';
import { registerProblemDetails } from '../../../src/infrastructure/http/plugins/problem-details.ts';
import { registerMaintenanceRoute } from '../../../src/infrastructure/http/routes/maintenance-routes.ts';

/**
 * T869 (006, Fase 6, N2-07 = A): identidad cruzada en `/internal/maintenance` con el verificador real por ruta (jose, JWKS efímero). El token de la cola de la
 * escena (audiencia = URL del worker, cuenta `argos-scene-tasks`) NO abre el mantenimiento; el del Planificador sí, con su audiencia y su correo exactos.
 * REQ-ESC6-033, REQ-SEC-007; INV-ESC6-018; SC-ESC6-077, SC-ESC6-087, SC-CLD-009.
 */
const MAINTENANCE_AUDIENCE = 'https://argos-abcdef-uc.a.run.app';
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const SCHEDULER_EMAIL = 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const KID = 'cruzada-key-1';
const COUNTS = { sessionsPurged: 1, confirmationTokensPurged: 2, membershipsPurged: 3, invitationsPurged: 4, auditRowsPurged: 5 };

type CreateRouteVerifier = (route: string, options: { readonly audience: string; readonly jwks: { keys: JWK[] } }) => (token: string) => Promise<{ email: string; sub: string }>;
const createRouteOidcVerifier = (oidc as unknown as Record<string, CreateRouteVerifier>)['createRouteOidcVerifier'] as CreateRouteVerifier;

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});

const sign = (audience: string, email: string): Promise<string> =>
  new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject('sub-cruzada')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function maintenanceApp(runMaintenance: () => Promise<typeof COUNTS>): Promise<FastifyInstance> {
  const app = Fastify();
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(app);
  registerCsrfGuard(app);
  registerMaintenanceRoute(app, { verifyOidc: createRouteOidcVerifier('/internal/maintenance', { audience: MAINTENANCE_AUDIENCE, jwks }), runMaintenance, schedulerEmail: SCHEDULER_EMAIL });
  await app.ready();
  apps.push(app);
  return app;
}

const post = (app: FastifyInstance, token: string) => app.inject({ method: 'POST', url: '/internal/maintenance', headers: { authorization: `Bearer ${token}` } });

describe('POST /internal/maintenance con identidad cruzada (T869)', () => {
  it('[SC-ESC6-077][REQ-ESC6-033] el token de la cola de la escena (audiencia del worker, cuenta argos-scene-tasks) responde 401 y no ejecuta el mantenimiento', async () => {
    const run = vi.fn(async () => COUNTS);
    const app = await maintenanceApp(run);
    const response = await post(app, await sign(WORKER_URL, TASKS_EMAIL));
    expect([response.statusCode, run.mock.calls.length]).toEqual([401, 0]);
  });

  it('[SC-ESC6-077][REQ-ESC6-033] con la audiencia de mantenimiento pero el correo de la cola responde 403 sin purga (correo exacto por ruta)', async () => {
    const run = vi.fn(async () => COUNTS);
    const app = await maintenanceApp(run);
    const response = await post(app, await sign(MAINTENANCE_AUDIENCE, TASKS_EMAIL));
    expect([response.statusCode, run.mock.calls.length]).toEqual([403, 0]);
  });

  it('[SC-CLD-009][REQ-SEC-007] el token del Planificador (su audiencia y su correo) sigue ejecutando el mantenimiento: 200 con los cinco conteos', async () => {
    const run = vi.fn(async () => COUNTS);
    const app = await maintenanceApp(run);
    const response = await post(app, await sign(MAINTENANCE_AUDIENCE, SCHEDULER_EMAIL));
    expect([response.statusCode, response.json(), run.mock.calls.length]).toEqual([200, COUNTS, 1]);
  });
});
