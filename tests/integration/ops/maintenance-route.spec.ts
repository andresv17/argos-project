import { join } from 'node:path';
import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T413 (pruebas primero; las implementa T414): POST /internal/maintenance.
 * REQ-CLD-007, REQ-SEC-007, INV-AUD-001, SC-CLD-009. Ruta ajena a cookies y a CSRF (H-MERO-017): se prueba aparte.
 *
 * Contrato de módulo: src/infrastructure/http/routes/maintenance-routes.ts exporta
 * registerMaintenanceRoute(app, { verifyOidc, runMaintenance }).
 *  - verifyOidc(token): Promise<Identity>, inyectada; rechaza (throw) si el token es inválido.
 *  - runMaintenance(): Promise<{ purged: number }>.
 * La identidad esperada del Scheduler se fija aquí (no es un secreto real).
 */

const MAINTENANCE_ROUTES = join(process.cwd(), 'src', 'infrastructure', 'http', 'routes', 'maintenance-routes.ts');

interface Identity {
  readonly email: string;
  readonly sub: string;
}
interface Options {
  readonly verifyOidc: (token: string) => Promise<Identity>;
  readonly runMaintenance: () => Promise<{ readonly purged: number }>;
}
type RegisterMaintenanceRoute = (app: FastifyInstance, options: Options) => Promise<void> | void;

const SCHEDULER: Identity = { email: 'argos-scheduler@test-project.iam.gserviceaccount.com', sub: 'sub-scheduler-0001' };
const STRANGER: Identity = { email: 'otra-cuenta@test-project.iam.gserviceaccount.com', sub: 'sub-ajena-0002' };
const VALID_TOKEN = 'token-del-scheduler-FAKE-aaa.bbb.ccc';
const STRANGER_TOKEN = 'token-ajeno-FAKE-ddd.eee.fff';
const BAD_TOKEN = 'token-invalido-FAKE-ggg.hhh.iii';

let verifyOidc: ReturnType<typeof vi.fn<(token: string) => Promise<Identity>>>;
let runMaintenance: ReturnType<typeof vi.fn<() => Promise<{ purged: number }>>>;
let logLines: string[];
const apps: FastifyInstance[] = [];

async function newApp(): Promise<FastifyInstance> {
  const mod = (await import(/* @vite-ignore */ MAINTENANCE_ROUTES)) as Record<string, unknown>;
  const registerMaintenanceRoute = mod.registerMaintenanceRoute as RegisterMaintenanceRoute;
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      logLines.push(chunk.toString('utf8'));
      cb();
    },
  });
  const instance = Fastify({ logger: { level: 'info', stream } });
  await registerMaintenanceRoute(instance, { verifyOidc, runMaintenance });
  await instance.ready();
  apps.push(instance);
  return instance;
}

const post = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/internal/maintenance', headers });
const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  logLines = [];
  verifyOidc = vi.fn<(token: string) => Promise<Identity>>().mockImplementation(async (token) => {
    if (token === VALID_TOKEN) return SCHEDULER;
    if (token === STRANGER_TOKEN) return STRANGER;
    throw new Error('token OIDC inválido');
  });
  runMaintenance = vi.fn<() => Promise<{ purged: number }>>().mockResolvedValue({ purged: 7 });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('POST /internal/maintenance — autenticación OIDC (REQ-SEC-007, SC-CLD-009)', () => {
  it('401 sin cabecera Authorization: no verifica ni purga', async () => {
    const app = await newApp();
    const res = await post(app);
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json<{ code: string }>().code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(verifyOidc).not.toHaveBeenCalled();
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('401 con Authorization que no es Bearer', async () => {
    const app = await newApp();
    const res = await post(app, { authorization: 'Basic dXNlcjpwYXNz' });
    expect(res.statusCode).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('401 con token inválido (verifyOidc rechaza)', async () => {
    const app = await newApp();
    const res = await post(app, bearer(BAD_TOKEN));
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(verifyOidc).toHaveBeenCalledTimes(1);
    expect(verifyOidc).toHaveBeenCalledWith(BAD_TOKEN);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('403 con identidad válida pero ajena al Scheduler', async () => {
    const app = await newApp();
    const res = await post(app, bearer(STRANGER_TOKEN));
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json<{ code: string }>().code).toBe('ERR-ACC-FORBIDDEN');
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('200 con la identidad del Scheduler: ejecuta una vez y devuelve el conteo', async () => {
    const app = await newApp();
    const res = await post(app, bearer(VALID_TOKEN));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json<{ purged: number }>().purged).toBe(7);
    expect(verifyOidc).toHaveBeenCalledWith(VALID_TOKEN);
    expect(runMaintenance).toHaveBeenCalledTimes(1);
  });

  it('si runMaintenance falla responde 5xx sin revelar la causa ni el token', async () => {
    runMaintenance.mockRejectedValue(new Error('conexión a neon perdida: secreto-interno'));
    const app = await newApp();
    const res = await post(app, bearer(VALID_TOKEN));
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.body).not.toContain('secreto-interno');
    expect(res.body).not.toContain(VALID_TOKEN);
  });
});

describe('POST /internal/maintenance — solo conteos, sin token ni identidad (INV-AUD-001)', () => {
  it('la respuesta 200 no contiene el token ni la identidad', async () => {
    const app = await newApp();
    const res = await post(app, bearer(VALID_TOKEN));
    expect(res.body).not.toContain(VALID_TOKEN);
    expect(res.body).not.toContain(SCHEDULER.email);
    expect(res.body).not.toContain(SCHEDULER.sub);
  });

  it('el log no contiene token ni identidad completa en ninguna ruta (200, 401, 403)', async () => {
    const app = await newApp();
    await post(app, bearer(VALID_TOKEN));
    await post(app, bearer(STRANGER_TOKEN));
    await post(app, bearer(BAD_TOKEN));
    await post(app);
    const log = logLines.join('');
    for (const secret of [VALID_TOKEN, STRANGER_TOKEN, BAD_TOKEN, SCHEDULER.email, SCHEDULER.sub, STRANGER.email, STRANGER.sub]) {
      expect(log).not.toContain(secret);
    }
  });

  it('tras la pasada el log registra el conteo (purged: 7) y ningún identificador', async () => {
    const app = await newApp();
    await post(app, bearer(VALID_TOKEN));
    const log = logLines.join('');
    expect(log).toMatch(/"purged":7/);
    expect(log).not.toContain('authorization');
  });
});

describe('POST /internal/maintenance — exclusión de la matriz CSRF, probada aparte (H-MERO-017)', () => {
  it('sin cookie y con Bearer válido no devuelve 403 por CSRF ni exige cabecera CSRF', async () => {
    const app = await newApp();
    const res = await post(app, bearer(VALID_TOKEN));
    expect(res.headers.cookie).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.statusCode).not.toBe(403);
  });

  it('una cookie de sesión no sustituye al Bearer: 401 sin token aunque haya cookie', async () => {
    const app = await newApp();
    const res = await post(app, { cookie: 'argos_session=sesion-de-usuario; argos_csrf=abc', 'x-csrf-token': 'abc' });
    expect(res.statusCode).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
  });
});

describe('POST /internal/maintenance — método', () => {
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'] as const)('%s no está permitido (404 o 405)', async (method) => {
    const app = await newApp();
    const res = await app.inject({ method, url: '/internal/maintenance', headers: bearer(VALID_TOKEN) });
    expect([404, 405]).toContain(res.statusCode);
    expect(runMaintenance).not.toHaveBeenCalled();
  });
});
