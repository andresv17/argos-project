import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCsrfGuard } from '../../src/infrastructure/http/plugins/csrf-guard.ts';
import { registerProblemDetails } from '../../src/infrastructure/http/plugins/problem-details.ts';
import { registerSecurityHeaders } from '../../src/infrastructure/http/plugins/security-headers.ts';
import { registerStaticAssets } from '../../src/infrastructure/http/plugins/static-assets.ts';
import { registerMaintenanceRoute } from '../../src/infrastructure/http/routes/maintenance-routes.ts';
import { registerOpsRoutes } from '../../src/infrastructure/http/routes/ops-routes.ts';

/**
 * O-4 (T453, Trinity): los 9 vectores de los Sentinels sobre la superficie operativa (/healthz, /readyz, estáticos y
 * POST /internal/maintenance), persistidos como regresión. La composición replica el orden de buildApp
 * (cookie, parser de cuerpo, problem-details, cabeceras, CSRF, sondas, estáticos al final) con inject(): sin puertos.
 * El verificador OIDC es inyectado (tokens sintéticos); el 200 con token real de Google queda para T462.
 * REQ-CLD-004, REQ-CLD-007, REQ-CLD-009, REQ-SEC-007, SC-CLD-009, SC-CLD-022.
 */

const SECRET = 'SECRETO-FUERA-DE-DIST-7c1e';
const INDEX_HTML = '<!doctype html><html><body><div id="root">ARGOS-SPA</div></body></html>';
const SCHEDULER_EMAIL = 'argos-scheduler@test-project.iam.gserviceaccount.com';
const VALID = 'token-scheduler-FAKE-aaa.bbb.ccc';
const STRANGER = 'token-ajeno-FAKE-ddd.eee.fff';
const COUNTS = { sessionsPurged: 1, confirmationTokensPurged: 2, membershipsPurged: 3, invitationsPurged: 4, auditRowsPurged: 5 };
const CSRF = { 'x-argos-request': '1' };
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

let sandbox: string;
let app: FastifyInstance;
let checkReady: ReturnType<typeof vi.fn<() => Promise<void>>>;
let runMaintenance: ReturnType<typeof vi.fn<() => Promise<typeof COUNTS>>>;

async function buildOpsSurface(): Promise<FastifyInstance> {
  const instance = Fastify();
  await instance.register(cookie);
  instance.removeAllContentTypeParsers();
  instance.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(instance);
  registerSecurityHeaders(instance);
  registerCsrfGuard(instance);
  registerOpsRoutes(instance, { checkReady });
  registerMaintenanceRoute(instance, {
    verifyOidc: async (token) => {
      if (token === VALID) return { email: SCHEDULER_EMAIL, sub: 'sub-scheduler' };
      if (token === STRANGER) return { email: 'otra@test-project.iam.gserviceaccount.com', sub: 'sub-ajena' };
      throw new Error('token OIDC inválido');
    },
    runMaintenance,
    schedulerEmail: SCHEDULER_EMAIL,
  });
  await registerStaticAssets(instance, { root: join(sandbox, 'dist') });
  await instance.ready();
  return instance;
}

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-ops-sec-'));
  mkdirSync(join(sandbox, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(sandbox, 'dist', 'index.html'), INDEX_HTML);
  writeFileSync(join(sandbox, 'dist', 'assets', 'app-abc123.js'), 'console.log("ARGOS-ASSET");');
  writeFileSync(join(sandbox, 'dist', '.env'), 'DOTFILE=1');
  writeFileSync(join(sandbox, 'secret.txt'), SECRET);
  checkReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  runMaintenance = vi.fn<() => Promise<typeof COUNTS>>().mockResolvedValue(COUNTS);
  app = await buildOpsSurface();
});

afterEach(async () => {
  await app.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('vector I - IDOR: las sondas ignoran identificadores y no devuelven datos de recursos', () => {
  it('/healthz y /readyz ignoran id/userId en la consulta', async () => {
    const health = await app.inject({ method: 'GET', url: '/healthz?id=1&userId=2' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    const ready = await app.inject({ method: 'GET', url: '/readyz?id=1&userId=2' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
  });

  it('no existen /api/healthz ni /api/readyz', async () => {
    for (const url of ['/api/healthz', '/api/readyz']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.body, url).not.toContain('ARGOS-SPA');
    }
  });
});

describe('vector II - aislamiento: una sesión válida no cambia lo que ven las sondas ni los estáticos', () => {
  it('con cookie de sesión el cuerpo es idéntico al anónimo y sin Set-Cookie', async () => {
    for (const url of ['/healthz', '/readyz', '/index.html', '/assets/app-abc123.js']) {
      const anon = await app.inject({ method: 'GET', url });
      const withSession = await app.inject({ method: 'GET', url, headers: { cookie: 'argos_session=valida-0123456789' } });
      expect(withSession.statusCode, url).toBe(anon.statusCode);
      expect(withSession.body, url).toBe(anon.body);
      expect(withSession.headers['set-cookie'], url).toBeUndefined();
    }
  });
});

describe('vector III - rutas sin autenticar: públicas solo las sondas; la purga exige OIDC', () => {
  it('las sondas no exponen configuración, versión ni causa del 503', async () => {
    checkReady.mockRejectedValue(new Error('password=hunter2 host=ep-secret.neon.tech'));
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toMatch(/hunter2|neon\.tech|password|DATABASE_URL|version/i);
  });

  it('GET /internal/maintenance no ejecuta la purga', async () => {
    await app.inject({ method: 'GET', url: '/internal/maintenance' });
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('POST /internal/maintenance sin Authorization: 401 y sin purga', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/maintenance' });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it.each([
    ['Bearer vacío', { authorization: 'Bearer ' }],
    ['esquema Basic', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['bearer en minúscula', { authorization: `bearer ${VALID}` }],
    ['token con espacio', { authorization: `Bearer ${VALID} extra` }],
    ['token inválido', { authorization: 'Bearer token-invalido-FAKE' }],
    ['solo cookie de sesión', { cookie: 'argos_session=valida-0123456789' }],
  ])('401 sin purga: %s', async (_name, headers) => {
    const res = await app.inject({ method: 'POST', url: '/internal/maintenance', headers });
    expect(res.statusCode).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('el token solo en la consulta no autentica', async () => {
    const res = await app.inject({ method: 'POST', url: `/internal/maintenance?token=${VALID}` });
    expect(res.statusCode).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('403 con identidad válida pero ajena al Scheduler, también con cookie de sesión', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/maintenance',
      headers: { authorization: `Bearer ${STRANGER}`, cookie: 'argos_session=valida-0123456789' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('ERR-ACC-FORBIDDEN');
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('200 con la identidad del Scheduler (verificador inyectado), sin CSRF y con los 5 conteos', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/maintenance', headers: { authorization: `Bearer ${VALID}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(COUNTS);
    expect(runMaintenance).toHaveBeenCalledTimes(1);
  });

  it('GET y DELETE con el token del Scheduler no purgan', async () => {
    for (const method of ['GET', 'DELETE'] as const) {
      await app.inject({ method, url: '/internal/maintenance', headers: { authorization: `Bearer ${VALID}`, ...CSRF } });
    }
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('la variante con barra final no queda exenta de CSRF ni purga', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/maintenance/', headers: { authorization: `Bearer ${VALID}` } });
    expect(res.statusCode).toBe(403);
    expect(runMaintenance).not.toHaveBeenCalled();
  });
});

describe('vector IV - sesión expirada, revocada o forjada: las cookies basura no alteran las sondas', () => {
  it.each(['AAAA', '', 'x'.repeat(4096), '%00%ff', 'argos_session=;', 'argos_session=revocada-0000'])('cookie forjada %j', async (value) => {
    for (const url of ['/healthz', '/readyz']) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie: value } });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['set-cookie'], url).toBeUndefined();
    }
  });
});

describe('vector V - CSRF: ninguna mutación sin X-Argos-Request, y las sondas no mutan con él', () => {
  const URLS = ['/healthz', '/readyz', '/index.html', '/assets/x.js', '/'];

  it.each(MUTATING)('%s sin X-Argos-Request: 403 ERR-AUTH-CSRF-REJECTED en todas las superficies', async (method) => {
    for (const url of URLS) {
      const res = await (method === 'DELETE' ? app.inject({ method, url }) : app.inject({ method, url, payload: 'x' }));
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json<{ code: string }>().code, `${method} ${url}`).toBe('ERR-AUTH-CSRF-REJECTED');
    }
  });

  it('con el encabezado, POST/DELETE sobre /readyz no mutan (404)', async () => {
    for (const method of ['POST', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/readyz', headers: CSRF });
      expect(res.statusCode, method).toBe(404);
    }
    expect(checkReady).not.toHaveBeenCalled();
  });

  it('sin cabeceras CORS permisivas ante un Origin ajeno', async () => {
    const res = await app.inject({ method: 'OPTIONS', url: '/readyz', headers: { origin: 'https://evil.example' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const get = await app.inject({ method: 'GET', url: '/readyz', headers: { origin: 'https://evil.example' } });
    expect(get.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('vector VI - enumeración y fuerza bruta: respuestas uniformes y /readyz absorbe la carga', () => {
  it('300 /readyz concurrentes: todas idénticas y una sola comprobación (caché, D-17)', async () => {
    const responses = await Promise.all(Array.from({ length: 300 }, () => app.inject({ method: 'GET', url: '/readyz' })));
    expect(new Set(responses.map((r) => r.statusCode))).toEqual(new Set([200]));
    expect(new Set(responses.map((r) => r.body)).size).toBe(1);
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('rutas inexistentes de API y de estáticos responden igual, sin oráculo de existencia', async () => {
    const a = await app.inject({ method: 'GET', url: '/assets/no-existe-1.js' });
    const b = await app.inject({ method: 'GET', url: '/assets/otro-nombre-2.js' });
    expect(a.statusCode).toBe(404);
    expect(b.statusCode).toBe(404);
    expect(a.body).toBe(b.body);
    expect(a.headers['content-type']).toBe(b.headers['content-type']);
  });
});

describe('vector VII - contaminación de prototipo e inyección', () => {
  it('parámetros y cuerpos con __proto__/constructor no producen 5xx ni contaminan Object.prototype', async () => {
    const query = '?__proto__[polluted]=1&constructor[prototype][polluted]=1';
    for (const url of ['/healthz', '/readyz']) {
      const res = await app.inject({ method: 'GET', url: `${url}${query}` });
      expect(res.statusCode, url).toBe(200);
    }
    for (const payload of ['{"__proto__":{"polluted":1}}', '{"constructor":{"prototype":{"polluted":1}}}']) {
      const res = await app.inject({ method: 'POST', url: '/readyz', headers: { ...CSRF, 'content-type': 'application/json' }, payload });
      expect(res.statusCode).toBeLessThan(500);
      const maint = await app.inject({
        method: 'POST',
        url: '/internal/maintenance',
        headers: { authorization: `Bearer ${VALID}`, 'content-type': 'application/json' },
        payload,
      });
      expect(maint.statusCode).toBe(200);
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ status: 'ok' });
  });
});

describe('vector VIII - desbordamiento de payload: rechazo sin caída del servidor', () => {
  it('cuerpos de 2 MiB y 5 MiB se rechazan (4xx) y la sonda sigue viva', async () => {
    for (const size of [2 * 1024 * 1024, 5 * 1024 * 1024]) {
      const res = await app.inject({ method: 'POST', url: '/readyz', headers: { ...CSRF, 'content-type': 'text/plain' }, payload: 'a'.repeat(size) });
      expect(res.statusCode, String(size)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, String(size)).toBeLessThan(500);
      expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    }
  });

  it('un cuerpo de 2 MiB al Scheduler autenticado no purga', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/maintenance',
      headers: { authorization: `Bearer ${VALID}`, 'content-type': 'text/plain' },
      payload: 'a'.repeat(2 * 1024 * 1024),
    });
    expect(res.statusCode).toBe(422);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('cabecera de 70 KB: rechazada sin 5xx', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/maintenance', headers: { authorization: `Bearer ${'t'.repeat(70 * 1024)}` } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(runMaintenance).not.toHaveBeenCalled();
  });
});

describe('vector IX - XSS y URIs peligrosas: ninguna ruta refleja la URL y las cabeceras blindan', () => {
  const PAYLOADS = ['/<script>alert(1)</script>', '/javascript:alert(1)', '/data:text/html,<script>alert(1)</script>', '/%3Cscript%3Ealert(1)%3C/script%3E'];

  it.each(PAYLOADS)('%s no se refleja en el cuerpo', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBeLessThan(500);
    expect(res.body).not.toContain('alert(1)');
    expect(res.body).not.toContain('<script>');
  });

  it('CSP, nosniff y Referrer-Policy en sondas, estáticos y 404', async () => {
    for (const url of ['/healthz', '/readyz', '/index.html', '/assets/app-abc123.js', '/assets/no-existe.js']) {
      const res = await app.inject({ method: 'GET', url });
      expect(String(res.headers['content-security-policy']), url).toContain("default-src 'self'");
      expect(String(res.headers['content-security-policy']), url).toContain("frame-ancestors 'none'");
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(res.headers['referrer-policy'], url).toBe('no-referrer');
    }
  });

  it('las sondas responden application/json', async () => {
    for (const url of ['/healthz', '/readyz']) {
      expect(String((await app.inject({ method: 'GET', url })).headers['content-type']), url).toContain('application/json');
    }
  });
});

describe('estáticos: traversal y dotfiles (REQ-CLD-009, SC-CLD-022, F-T453-01)', () => {
  const TRAVERSAL = [
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%252e%252e%252fsecret.txt',
    '//secret.txt',
    '/assets\\..\\..\\secret.txt',
    '/assets/..%5c..%5csecret.txt',
    '/assets/app-abc123.js%00/../../secret.txt',
    '/package.json',
    '/src/index.ts',
  ];

  it.each(TRAVERSAL)('traversal %s: sin contenido fuera de dist/', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBeLessThan(500);
    expect(res.body).not.toContain(SECRET);
  });

  it.each(['/.env', '/.git/config', '/assets/.x', '/.well-known/x', '/%2eenv'])('dotfile %s: 404 sin contenido ni 5xx (GET y HEAD)', async (url) => {
    for (const method of ['GET', 'HEAD'] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.body).not.toContain('DOTFILE');
      expect(res.body).not.toContain('ERR-INTERNAL-UNEXPECTED');
    }
  });

  it('assets inmutables, index.html sin caché y sin listado de directorios', async () => {
    const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(String(asset.headers['cache-control'])).toContain('immutable');
    const index = await app.inject({ method: 'GET', url: '/index.html' });
    expect(String(index.headers['cache-control'])).toMatch(/no-cache|no-store/);
    expect((await app.inject({ method: 'GET', url: '/assets/' })).body).not.toContain('app-abc123.js');
  });
});
