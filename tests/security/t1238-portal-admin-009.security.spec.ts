import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_ACCESS_LIMIT } from '../../src/infrastructure/config/app-config.ts';
import { ADMIN_SESSION_ABSOLUTE_MINUTES, ADMIN_SESSION_IDLE_MINUTES } from '../../src/domain/auth/admin-session-policy.ts';
import {
  ADMIN_EMAIL,
  ADMIN_SESSION_COOKIE,
  OWN_ORIGIN,
  adminCallback,
  adminKit,
  adminLogin,
  adminStart,
  cookieNamed,
  observable,
  setCookies,
  staticRootWithAdmin,
} from '../fixtures/admin-fixtures.ts';
import { GOOGLE_CODE } from '../fixtures/google-fixtures.ts';
import { createApi, type Api } from '../integration/api/api-harness.ts';

/**
 * T1238 (Trinity, Feature 009, portal `/admin`): vectores de seguridad XSS cross-site, IDOR, enumeración de rutas, sesión expirada, CSRF, fuerza bruta y uniformidad de tiempos.
 * REQ-ADM9-001, REQ-ADM9-005, EDGE-009-012; SC-009-014, SC-009-016. Un fallo de esta suite es un HALLAZGO real del producto (no se corrige aquí).
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});
async function boot() {
  const kit = adminKit();
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithAdmin() });
  api = a;
  return { a, kit };
}
const at = (a: Api, ms: number): void => {
  const iso = new Date(ms).toISOString();
  a.clock.setClock(iso.slice(0, 10), iso);
};
const NOT_FOUND = '/api/ruta-inexistente-zz';
const EVIL = 'https://evil.example';
const get = (a: Api, path: string, cookie: string | null = null, headers: Record<string, string> = {}) => a.call('GET', path, { cookie, headers, contract: false, csrf: false });
const sessionOf = (a: Api, cookie: string | null) => get(a, '/api/admin/session', cookie);

describe('T1238 [XSS cross-site] el portal no refleja ni ejecuta contenido enviado desde la app de usuarios u otro sitio', () => {
  const PAYLOAD = `"><script>alert(1)</script>`;
  it('[REQ-ADM9-001] ningún parámetro del callback (code, state, error) se refleja en cuerpo ni cabeceras, ni en éxito ni en fallo', async () => {
    const { a } = await boot();
    const q = encodeURIComponent(PAYLOAD);
    const fail = await adminCallback(a, null, `code=${q}&state=${q}&error=${q}`);
    expect(fail.status).toBe(404);
    expect(fail.text).not.toContain('script');
    expect(JSON.stringify(fail.headers)).not.toContain('script');
    const unknown = await get(a, `/api/admin/${q}?x=${q}`);
    expect(unknown.text).not.toContain('<script');
    expect(unknown.text).not.toContain('alert');
  });
  it('[REQ-ADM9-001] la página de éxito del callback no contiene script ni valor del atacante y su CSP es default-src none', async () => {
    const { a } = await boot();
    const { done } = await adminLogin(a);
    expect(done.status).toBe(200);
    expect(done.text).not.toMatch(/<script|onload=|onerror=|javascript:/i);
    expect(done.headers['content-security-policy']).toContain("default-src 'none'");
    expect(done.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(done.headers['referrer-policy']).toBe('no-referrer');
  });
  it('[REQ-ADM9-005] una cookie de administración inyectada desde el sitio de usuarios (argos_session con script) no cambia la respuesta', async () => {
    const { a } = await boot();
    const reference = observable(await sessionOf(a, null));
    expect(observable(await sessionOf(a, `argos_session=${encodeURIComponent(PAYLOAD)}`))).toEqual(reference);
    expect(observable(await sessionOf(a, `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(PAYLOAD)}`))).toEqual(reference);
  });
  it('[REQ-ADM9-005] las respuestas de /api/admin/* no habilitan CORS a un origen ajeno (sin Access-Control-Allow-Origin ni credenciales)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    for (const c of [null, cookie]) {
      const r = await get(a, '/api/admin/session', c, { origin: EVIL });
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
      expect(r.headers['access-control-allow-credentials']).toBeUndefined();
    }
    const pre = await a.call('OPTIONS', '/api/admin/session', { headers: { origin: EVIL, 'access-control-request-method': 'DELETE' }, contract: false, csrf: false });
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('[REQ-ADM9-001] la sesión autenticada declara CSP estricta y no se cachea', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const r = await sessionOf(a, cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('T1238 [IDOR] las identidades no se cruzan entre la app de usuarios y el portal', () => {
  it('[REQ-ADM9-001] la sesión de un usuario normal no da acceso al portal (mismo 404 que sin sesión)', async () => {
    const { a } = await boot();
    const userCookie = await a.login('andres');
    const reference = observable(await sessionOf(a, null));
    expect(observable(await sessionOf(a, userCookie))).toEqual(reference);
    for (const p of ['/api/admin/registrations', '/api/admin/parameters', '/api/admin/pending-count']) {
      expect((await get(a, p, userCookie)).status).toBe(404);
    }
  });
  it('[REQ-ADM9-001] la cookie de administración no autentica rutas de la app de usuarios', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const me = await get(a, '/api/auth/me', cookie);
    expect(me.status).toBe(401);
    const pets = await get(a, '/api/pets', cookie);
    expect(pets.status).toBe(401);
  });
  it('[REQ-ADM9-005] la cookie de administración se emite con Path=/api/admin, HttpOnly y SameSite=Strict (no viaja a la app de usuarios ni a scripts)', async () => {
    const { a } = await boot();
    const { done } = await adminLogin(a);
    const c = cookieNamed(done, ADMIN_SESSION_COOKIE)!;
    expect(c).toMatch(/Path=\/api\/admin(;|$)/);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
  });
  it('[REQ-ADM9-001] un identificador de sesión adivinado o manipulado (mayúsculas, truncado, ajeno) nunca autentica', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const token = cookie!.split('=')[1]!;
    const reference = observable(await sessionOf(a, null));
    for (const t of [token.slice(0, -1), `${token}x`, token.toUpperCase(), token.replace(/./, token[0] === 'A' ? 'B' : 'A'), '0'.repeat(43)]) {
      expect(observable(await sessionOf(a, `${ADMIN_SESSION_COOKIE}=${t}`)), t).toEqual(reference);
    }
  });
  it('[REQ-ADM9-001] una sesión revocada con logout no se puede reutilizar (sin resurrección)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    expect((await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN }, contract: false })).status).toBe(204);
    expect((await sessionOf(a, cookie)).status).toBe(404);
  });
});

describe('T1238 [enumeración de rutas] [EDGE-009-012] sin sesión nada distingue una ruta del portal de una inexistente', () => {
  const ROUTES: ReadonlyArray<readonly [string, string]> = [
    ['GET', '/api/admin/session'],
    ['GET', '/api/admin/registrations'],
    ['GET', '/api/admin/registrations/00000000-0000-4000-8000-000000000001'],
    ['GET', '/api/admin/parameters'],
    ['GET', '/api/admin/pending-count'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/'],
    ['GET', '/api/admin/%2e%2e/session'],
    ['GET', '/api/admin/session/'],
    ['GET', '/api/admin/SESSION'],
    ['GET', '/api/admin/auth/google'],
    ['HEAD', '/api/admin/session'],
    ['OPTIONS', '/api/admin/session'],
    ['PATCH', '/api/admin/session'],
  ];
  it('[EDGE-009-012] estado, cuerpo y cabeceras idénticos a una ruta inexistente de /api (salvo la propia ruta)', async () => {
    const { a } = await boot();
    const ref = await a.call('GET', NOT_FOUND, { contract: false, csrf: false });
    for (const [method, path] of ROUTES) {
      const r = await a.call(method, path, { contract: false, csrf: false });
      const refM = method === 'GET' ? ref : await a.call(method, NOT_FOUND, { contract: false, csrf: false });
      expect(r.status, `${method} ${path}`).toBe(refM.status);
      const norm = (t: string): string => t.replace(/"instance":"[^"]*"/, '');
      if (method !== 'HEAD') expect(norm(r.text), `${method} ${path}`).toBe(norm(refM.text));
      expect(r.headers['content-type'], `${method} ${path}`).toBe(refM.headers['content-type']);
      expect(setCookies(r), `${method} ${path}: sin Set-Cookie`).toEqual([]);
    }
  });
  it('[EDGE-009-012] el 404 no filtra tecnología ni rastros (sin ERR-*, sin stack, sin x-powered-by)', async () => {
    const { a } = await boot();
    for (const p of ['/api/admin/registrations', '/api/admin/zzz']) {
      const r = await get(a, p);
      expect(r.text).not.toMatch(/ERR-|stack|admin|fastify|node_modules/i);
      expect(r.headers['x-powered-by']).toBeUndefined();
    }
  });
  it('[REQ-ADM9-001] /admin/<subruta> y rutas estáticas del portal tampoco revelan nada (404 uniforme text/plain)', async () => {
    const { a } = await boot();
    for (const p of ['/admin/x', '/admin/', '/admin.html', '/admin/../admin.html']) {
      const r = await get(a, p);
      expect([200, 404], p).toContain(r.status);
      if (r.status === 404) {
        expect(r.text, p).toBe('Not Found');
        expect(String(r.headers['content-type']), p).toMatch(/^text\/plain/);
      }
    }
  });
  it('[REQ-ADM9-001] con sesión de administración las rutas no implementadas siguen siendo el 404 uniforme', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const ref = await a.call('GET', NOT_FOUND, { contract: false, csrf: false });
    const r = await get(a, '/api/admin/lo/que/sea', cookie);
    expect(r.status).toBe(ref.status);
    expect(r.text).toBe(ref.text);
  });
});

describe('T1238 [sesión expirada] [REQ-ADM9-002] la sesión vence por tope absoluto e inactividad y se comporta como inexistente', () => {
  it('[SC-009-016] tras 10 min de inactividad responde el 404 uniforme (GET no renueva)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const t0 = Date.parse(a.clock.nowIsoTimestamp());
    at(a, t0 + (ADMIN_SESSION_IDLE_MINUTES * 60_000 - 1000));
    expect((await sessionOf(a, cookie)).status).toBe(200);
    at(a, t0 + ADMIN_SESSION_IDLE_MINUTES * 60_000 + 1000);
    const r = await sessionOf(a, cookie);
    expect(observable(r)).toEqual(observable(await sessionOf(a, null)));
  });
  it('[SC-009-016] pasados 30 min absolutos responde el 404 uniforme', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const t0 = Date.parse(a.clock.nowIsoTimestamp());
    at(a, t0 + ADMIN_SESSION_ABSOLUTE_MINUTES * 60_000 + 1000);
    expect(observable(await sessionOf(a, cookie))).toEqual(observable(await sessionOf(a, null)));
  });
  it('[REQ-ADM9-005] una sesión expirada no puede ejecutar logout con efecto: DELETE da el 404 uniforme, no 204', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    at(a, Date.parse(a.clock.nowIsoTimestamp()) + (ADMIN_SESSION_ABSOLUTE_MINUTES + 1) * 60_000);
    const r = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN }, contract: false });
    expect(r.status).toBe(404);
  });
  it('[REQ-ADM9-002] un administrador retirado de la lista pierde la sesión en la petición siguiente (EDGE-009-047)', async () => {
    const { a, kit } = await boot();
    const { cookie } = await adminLogin(a);
    kit.emails.length = 0;
    expect((await sessionOf(a, cookie)).status).toBe(404);
  });
});

describe('T1238 [CSRF] [REQ-ADM9-005] [SC-009-014] mutaciones y GET con efecto lateral', () => {
  it('[SC-009-014] DELETE con sesión sin X-Argos-Request: 403 y la sesión sigue viva', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const r = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN }, csrf: false, contract: false });
    expect(r.status).toBe(403);
    expect((await sessionOf(a, cookie)).status).toBe(200);
  });
  it('[SC-009-014] DELETE con cabecera pero origen ajeno, nulo, ausente o con puerto/esquema distinto: 403 y la sesión sigue viva', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const origins: Array<Record<string, string>> = [{ origin: EVIL }, { origin: 'null' }, {}, { origin: 'https://localhost' }, { origin: 'http://localhost:8080' }, { origin: `${OWN_ORIGIN}.evil.example` }, { origin: `${OWN_ORIGIN}/` }];
    for (const headers of origins) {
      const r = await a.call('DELETE', '/api/admin/session', { cookie, headers, contract: false });
      expect(r.status, JSON.stringify(headers)).toBe(403);
    }
    expect((await sessionOf(a, cookie)).status).toBe(200);
  });
  it('[SC-009-014] la mutación sin cabecera se rechaza con el MISMO 403 con o sin sesión (no revela el portal)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const withS = await a.call('DELETE', '/api/admin/session', { cookie, csrf: false, contract: false });
    const noS = await a.call('DELETE', '/api/admin/session', { csrf: false, contract: false });
    const ghost = await a.call('DELETE', NOT_FOUND, { csrf: false, contract: false });
    expect(withS.status).toBe(403);
    expect(noS.status).toBe(403);
    expect(ghost.status).toBe(403);
    expect(withS.text.replace(/"instance":"[^"]*"/, '')).toBe(noS.text.replace(/"instance":"[^"]*"/, ''));
  });
  it('[REQ-ADM9-005] los GET de /api/admin no tienen efecto lateral (GET session no extiende ni revoca)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const before = await sessionOf(a, cookie);
    for (let i = 0; i < 3; i++) await get(a, '/api/admin/session', cookie, { origin: EVIL });
    const after = await sessionOf(a, cookie);
    expect((after.json as { idleExpiresAt: string }).idleExpiresAt).toBe((before.json as { idleExpiresAt: string }).idleExpiresAt);
  });
  it('[REQ-ADM9-005] login CSRF: el callback sin la cookie propia de OAuth (flujo iniciado por otro) no crea sesión', async () => {
    const { a } = await boot();
    const started = await adminStart(a);
    const state = new URL(started.headers['location'] as string).searchParams.get('state')!;
    const r = await adminCallback(a, null, `code=${GOOGLE_CODE}&state=${state}`);
    expect(r.status).toBe(404);
    expect(cookieNamed(r, ADMIN_SESSION_COOKIE)).toBeUndefined();
  });
});

describe('T1238 [fuerza bruta] [EDGE-009-035] los fallos por IP bloquean y no por cuenta', () => {
  const fail = (a: Api, ip: string) => adminCallback(a, null, `code=${GOOGLE_CODE}&state=${'q'.repeat(43)}`, { ip });
  it('[EDGE-009-035] tras maxFailures fallos desde una IP: 429 con Retry-After en callback y en start; otra IP no se ve afectada', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i++) expect((await fail(a, '10.0.0.1')).status).toBe(404);
    const blocked = await fail(a, '10.0.0.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await adminStart(a, { ip: '10.0.0.1' })).status).toBe(429);
    expect((await adminStart(a, { ip: '10.0.0.2' })).status).toBe(302);
  });
  it('[EDGE-009-035] el bloqueo no impide la sesión válida ya emitida y expira con la ventana', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a, { ip: '10.0.0.9' });
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i++) await fail(a, '10.0.0.9');
    expect((await sessionOf(a, cookie)).status).toBe(200);
    at(a, Date.parse(a.clock.nowIsoTimestamp()) + (ADMIN_ACCESS_LIMIT.windowMinutes * 60_000 + 1000));
    expect((await fail(a, '10.0.0.9')).status).toBe(404);
  });
  it('[EDGE-009-035] el 429 no incluye ERR de existencia de cuenta ni el correo', async () => {
    const { a } = await boot();
    for (let i = 0; i <= ADMIN_ACCESS_LIMIT.maxFailures; i++) await fail(a, '10.0.0.3');
    const r = await fail(a, '10.0.0.3');
    expect(r.text).not.toContain(ADMIN_EMAIL);
  });
  it('[EDGE-009-035] el rastro X-Forwarded-For falsificado por un cliente directo no evade el bloqueo', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i++) await fail(a, '10.0.0.4');
    const spoof = await a.call('GET', `/api/admin/auth/google/callback?code=${GOOGLE_CODE}&state=${'q'.repeat(43)}`, { ip: '10.0.0.4', headers: { 'x-forwarded-for': '203.0.113.7' }, csrf: false, contract: false });
    expect(spoof.status).toBe(429);
  });
});

describe('T1238 [uniformidad de tiempos] no hay canal de tiempo entre sin sesión, sesión inválida, expirada y ruta inexistente', () => {
  const median = (xs: number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
  async function time(a: Api, path: string, cookie: string | null, n = 120): Promise<number> {
    for (let i = 0; i < 20; i++) await get(a, path, cookie);
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = process.hrtime.bigint();
      await get(a, path, cookie);
      samples.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    return median(samples);
  }
  it('[EDGE-009-012] la mediana de latencia de GET /api/admin/session es equivalente sin cookie, con basura y con sesión expirada, y a /api/admin/<oculta> (tolerancia 3x o 1 ms)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    at(a, Date.parse(a.clock.nowIsoTimestamp()) + (ADMIN_SESSION_ABSOLUTE_MINUTES + 5) * 60_000);
    const none = await time(a, '/api/admin/session', null);
    const junk = await time(a, '/api/admin/session', `${ADMIN_SESSION_COOKIE}=${'z'.repeat(43)}`);
    const expired = await time(a, '/api/admin/session', cookie);
    const hidden = await time(a, '/api/admin/registrations', null);
    const ghost = await time(a, NOT_FOUND, null);
    const all = [none, junk, expired, hidden, ghost];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    expect(hi - lo < 1 || hi / lo < 3, `medianas ms: ${all.map((x) => x.toFixed(3)).join(', ')}`).toBe(true);
  });
});
