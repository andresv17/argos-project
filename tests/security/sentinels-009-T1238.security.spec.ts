import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_START_LIMIT } from '../../src/infrastructure/config/app-config.ts';
import {
  ADMIN_EMAIL,
  ADMIN_EMAIL_2,
  ADMIN_OAUTH_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SUB_2,
  OWN_ORIGIN,
  adminCallback,
  adminKit,
  adminLogin,
  adminStart,
  cookieNamed,
  observable,
  staticRootWithAdmin,
  valueOf,
} from '../fixtures/admin-fixtures.ts';
import { GOOGLE_CODE } from '../fixtures/google-fixtures.ts';
import { createApi, type Api } from '../integration/api/api-harness.ts';

/**
 * Enjambre `/sentinels` (Feature 009, T1238, `#19`): 9 vectores de ataque sobre `/api/admin/*` y `/admin`.
 * Complementa (no duplica) `t1238-portal-admin-009.security.spec.ts` de Trinity (28 casos).
 * Reglas FINALES de Neo/Logos: el origen se valida DESPUÉS de la sesión; sin sesión y con origen ajeno = 404 uniforme;
 * solo la cabecera `X-Argos-Request` ausente responde 403 antes de la sesión. No se marcan como hallazgo.
 * Un fallo de esta suite es un HALLAZGO real del producto: no se corrige aquí (`src/**` intocable).
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot(emails: string[] = [ADMIN_EMAIL]) {
  const kit = adminKit(emails);
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithAdmin() });
  api = a;
  return { a, kit };
}

const NOT_FOUND = '/api/ruta-inexistente-zz';
const EVIL = 'https://evil.example';
const get = (a: Api, path: string, cookie: string | null = null, headers: Record<string, string> = {}) => a.call('GET', path, { cookie, headers, contract: false, csrf: false });
const sessionOf = (a: Api, cookie: string | null) => get(a, '/api/admin/session', cookie);
const reference404 = async (a: Api) => observable(await get(a, NOT_FOUND));

// ---------------------------------------------------------------------------
// Sentinel I — IDOR: identificadores y variantes de ruta no revelan ni cruzan recursos.
// ---------------------------------------------------------------------------
describe('Sentinel I [IDOR] variantes de ruta y de identificador no exponen recursos ajenos', () => {
  it('[REQ-ADM9-001] la variante de mayúsculas /API/ADMIN/SESSION nunca devuelve datos de sesión (con o sin cookie)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const withCookie = await get(a, '/API/ADMIN/SESSION', cookie);
    expect(withCookie.headers['content-type']).not.toContain('application/json');
    expect(withCookie.text).not.toContain('adminId');
  });

  it('[EDGE-009-012] SEN-T1238-01: las variantes de ruta del portal (mayúsculas, barra final, segmentos codificados, punto y coma) dan el 404 uniforme sin sesión y con sesión', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const ref = await reference404(a);
    const variants = [
      '/API/ADMIN/SESSION',
      '/Api/Admin/Session',
      '/api/admin/Session',
      '/api/admin/session/',
      '/api/admin//session',
      '/api/admin/%73ession',
      '/api/admin/session%2F',
      '/api/admin/session;x=1',
    ];
    for (const v of variants) {
      for (const c of [null, cookie]) {
        const r = await get(a, v, c);
        expect(r.status, `variante ${v} ${c ? 'con' : 'sin'} sesión`).not.toBe(500);
        expect(observable(r), `variante ${v} ${c ? 'con' : 'sin'} sesión`).toEqual(ref);
      }
    }
  });

  it('[EDGE-009-012] SEN-T1238-01b: /api/admin/./session por socket real (sin normalizar /./ como hace light-my-request) da el 404 uniforme text/plain, nunca la sesión 200', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    await a.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (a.app.server.address() as AddressInfo).port;
    const raw = (path: string, c: string | null) =>
      new Promise<{ status: number; type: string; text: string }>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, method: 'GET', path, headers: { 'x-argos-request': '1', ...(c ? { cookie: c } : {}) } }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (d: Buffer) => chunks.push(d));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), text: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.end();
      });
    // Control real: la ruta canónica con la misma cookie SÍ devuelve la sesión por el mismo canal.
    const canonical = await raw('/api/admin/session', cookie);
    expect(canonical.status).toBe(200);
    expect(canonical.type).toContain('application/json');
    const ref = await raw(NOT_FOUND, null);
    expect(ref.status).toBe(404);
    for (const c of [null, cookie]) {
      const r = await raw('/api/admin/./session', c);
      expect(r.status, `/./ ${c ? 'con' : 'sin'} sesión`).toBe(404);
      expect(r.type, `/./ ${c ? 'con' : 'sin'} sesión`).toContain('text/plain');
      expect(r.text, `/./ ${c ? 'con' : 'sin'} sesión`).toBe(ref.text);
      expect(r.text).not.toContain('adminId');
    }
  });

  it('[REQ-ADM9-001] con sesión de un administrador, identificadores ajenos en rutas hipotéticas (/sessions/<id>, /admins/<id>, /session/<id>) dan el 404 uniforme', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const ref = await reference404(a);
    for (const p of [
      '/api/admin/sessions/00000000-0000-4000-8000-000000000000',
      '/api/admin/admins/00000000-0000-4000-8000-000000000000',
      '/api/admin/session/00000000-0000-4000-8000-000000000000',
    ]) {
      const r = await get(a, p, cookie);
      expect(observable(r), p).toEqual(ref);
    }
    // Segmentos "../" se normalizan ANTES de enrutar (cliente y servidor): resuelven a /api/admin/session y no son un recurso nuevo.
    expect(observable(await get(a, '/api/admin/admins/../session', cookie))).toEqual(observable(await sessionOf(a, cookie)));
  });
});

// ---------------------------------------------------------------------------
// Sentinel II — Multi-tenant / estados inválidos: un administrador no actúa sobre la sesión de otro.
// ---------------------------------------------------------------------------
describe('Sentinel II [MULTI-TENANT] la sesión de un administrador no se puede revocar ni usar desde otra identidad administrativa', () => {
  it('[REQ-ADM9-001] el DELETE de un administrador B no revoca la sesión de un administrador A (y viceversa)', async () => {
    const kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
    const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithAdmin() });
    api = a;
    const first = await adminLogin(a);
    expect(first.cookie).toMatch(new RegExp(`^${ADMIN_SESSION_COOKIE}=[^;\\s]+$`));
    kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL_2 };
    const second = await adminLogin(a);
    expect(second.cookie).toMatch(new RegExp(`^${ADMIN_SESSION_COOKIE}=[^;\\s]+$`));
    expect(second.cookie).not.toBe(first.cookie);

    const del = await a.call('DELETE', '/api/admin/session', { cookie: second.cookie, headers: { origin: OWN_ORIGIN }, contract: false, csrf: true });
    expect(del.status).toBe(204);
    expect((await sessionOf(a, first.cookie)).status).toBe(200);
    expect((await sessionOf(a, second.cookie)).status).toBe(404);
  });

  it('[REQ-ADM9-001] la cookie de sesión de administración no autentica en una ruta de la app de usuarios (/api/households, /api/auth/me)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const ref = await observable(await get(a, '/api/households'));
    const r = await get(a, '/api/households', cookie);
    expect(r.status).not.toBe(200);
    expect(observable(r)).toEqual(ref);
    expect((await get(a, '/api/auth/me', cookie)).status).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Sentinel III — Acceso anónimo: matriz de métodos × rutas sin credenciales.
// ---------------------------------------------------------------------------
describe('Sentinel III [ANÓNIMO] matriz de verbos y rutas sin sesión: nunca 2xx ni 5xx', () => {
  it('[REQ-ADM9-001] GET/POST/PUT/PATCH/DELETE/HEAD sobre /api/admin/* sin sesión responden el 404 uniforme (con origen propio y cabecera CSRF)', async () => {
    const { a } = await boot();
    const ref = await reference404(a);
    const paths = ['/api/admin/session', '/api/admin/x', '/api/admin/auth/google/callback/x', '/api/admin/auth', '/api/admin'];
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      for (const p of paths) {
        const r = await a.call(method, p, { headers: { origin: OWN_ORIGIN }, contract: false, csrf: true, body: method === 'GET' || method === 'HEAD' ? undefined : {} });
        expect(r.status, `${method} ${p}`).toBe(404);
        expect(r.status, `${method} ${p}`).not.toBeGreaterThanOrEqual(500);
        if (method !== "HEAD") expect(r.text, `${method} ${p}`).toBe(ref.text);
      }
    }
  });

  it('[REQ-ADM9-001] sin cookie, el callback sin código ni estado y el start con verbo distinto de GET no crean ni devuelven Set-Cookie de sesión', async () => {
    const { a } = await boot();
    const bare = await adminCallback(a, null, '');
    expect(bare.status).toBe(404);
    expect(cookieNamed(bare, ADMIN_SESSION_COOKIE)).toBeUndefined();
    const post = await a.call('POST', '/api/admin/auth/google/start', { headers: { origin: OWN_ORIGIN }, contract: false, csrf: true, body: {} });
    expect(post.status).toBe(404);
    expect(cookieNamed(post, ADMIN_OAUTH_COOKIE)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sentinel IV — Sesiones expiradas, revocadas o alteradas: nunca reutilizables.
// ---------------------------------------------------------------------------
describe('Sentinel IV [SESIÓN] tokens alterados, intercambiados entre cookies o duplicados no autentican', () => {
  it('[REQ-ADM9-002] alterar cualquier posición del token de sesión (un carácter) hace que no autentique (404 uniforme)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const token = cookie!.split('=')[1]!;
    const ref = await reference404(a);
    for (const i of [0, 7, 21, 42]) {
      const flipped = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      const r = await sessionOf(a, `${ADMIN_SESSION_COOKIE}=${flipped}`);
      expect(observable(r), `posición ${i}`).toEqual(ref);
    }
  });

  it('[REQ-ADM9-002] el token de la cookie OAuth no sirve como sesión, ni el token de sesión como cookie OAuth en el callback', async () => {
    const { a } = await boot();
    const started = await adminStart(a);
    const oauth = valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE));
    expect((await sessionOf(a, `${ADMIN_SESSION_COOKIE}=${oauth}`)).status).toBe(404);
    const { cookie } = await adminLogin(a);
    const sessionToken = valueOf(`${ADMIN_OAUTH_COOKIE}=${cookie!.split('=')[1]}`);
    const cb = await adminCallback(a, sessionToken, `code=${GOOGLE_CODE}&state=x`);
    expect(cb.status).toBe(404);
    expect(cookieNamed(cb, ADMIN_SESSION_COOKIE)).toBeUndefined();
  });

  it('[REQ-ADM9-002] cookies de sesión duplicadas (una inválida antes de una válida) nunca dan 5xx ni filtran el portal a una sesión inválida', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const valid = cookie!.split('=')[1]!;
    for (const header of [
      `${ADMIN_SESSION_COOKIE}=bogus; ${ADMIN_SESSION_COOKIE}=${valid}`,
      `${ADMIN_SESSION_COOKIE}=${valid}; ${ADMIN_SESSION_COOKIE}=bogus`,
      `${ADMIN_SESSION_COOKIE}=; ${ADMIN_SESSION_COOKIE}=`,
    ]) {
      const r = await sessionOf(a, header);
      expect(r.status, header).not.toBeGreaterThanOrEqual(500);
      expect([200, 404], header).toContain(r.status);
    }
  });
});

// ---------------------------------------------------------------------------
// Sentinel V — CSRF: mutaciones sin cabecera o con origen no propio no revocan nada.
// ---------------------------------------------------------------------------
describe('Sentinel V [CSRF] formas de petición de navegador entre sitios no cierran la sesión', () => {
  it('[SC-009-014] DELETE con content-type de formulario, text/plain o sin cuerpo, sin X-Argos-Request: 403 y la sesión sigue viva', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    for (const contentType of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const r = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN, 'content-type': contentType }, csrf: false, contract: false });
      expect(r.status, contentType).toBe(403);
    }
    expect((await sessionOf(a, cookie)).status).toBe(200);
  });

  it('[SC-009-014] DELETE con origen propio pero Sec-Fetch-Site cross-site y Referer ajeno (sin cabecera CSRF): 403 y la sesión sigue viva', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const r = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: EVIL, referer: `${EVIL}/x`, 'sec-fetch-site': 'cross-site' }, csrf: false, contract: false });
    expect(r.status).toBe(403);
    expect((await sessionOf(a, cookie)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Sentinel VI — Enumeración y fuerza bruta: causas de fallo indistinguibles; topes por IP.
// ---------------------------------------------------------------------------
describe('Sentinel VI [ENUMERACIÓN/FUERZA BRUTA] causas de fallo del callback indistinguibles y topes de inicio por IP', () => {
  it('[EDGE-009-012] sin código, código inválido, estado inválido, error de Google, cookie OAuth ausente o basura: todos responden el mismo 404 uniforme', async () => {
    const { a } = await boot();
    const started = await adminStart(a, { ip: '10.9.0.1' });
    const oauth = valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE));
    const state = new URL(started.headers['location'] as string).searchParams.get('state')!;
    const cases: Array<[string | null, string]> = [
      [oauth, ''],
      [oauth, 'code=bogus&state=' + state],
      [oauth, `code=${GOOGLE_CODE}&state=wrong`],
      [oauth, `code=${GOOGLE_CODE}&state=${state}&error=access_denied`],
      [null, `code=${GOOGLE_CODE}&state=${state}`],
      ['garbage', `code=${GOOGLE_CODE}&state=${state}`],
    ];
    const bodies: Array<{ status: number; text: string; headers: Record<string, unknown> }> = [];
    for (const [cookie, query] of cases) {
      const r = await adminCallback(a, cookie, query, { ip: `10.9.${bodies.length}.2` });
      expect(r.status).toBe(404);
      expect(cookieNamed(r, ADMIN_SESSION_COOKIE)).toBeUndefined();
      bodies.push(observable(r));
    }
    for (const b of bodies) expect(b).toEqual(bodies[0]);
  });

  it('[EDGE-009-035] el tope de INICIOS por IP (ADMIN_START_LIMIT) responde 429 con Retry-After y no emite cookie OAuth nueva; el X-Forwarded-For rotado no reinicia el conteo', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_START_LIMIT.maxStarts; i++) {
      const r = await adminStart(a, { ip: '10.8.0.1' });
      expect(r.status).toBe(302);
    }
    const blocked = await adminStart(a, { ip: '10.8.0.1' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(cookieNamed(blocked, ADMIN_OAUTH_COOKIE)).toBeUndefined();
    const spoofed = await a.call("GET", "/api/admin/auth/google/start", { csrf: false, contract: false, ip: "10.8.0.1", headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(spoofed.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Sentinel VII — Prototype pollution y esquema: propiedades maliciosas no contaminan ni alteran el comportamiento.
// ---------------------------------------------------------------------------
describe('Sentinel VII [PROTOTYPE POLLUTION] __proto__ y constructor.prototype no contaminan el proceso ni cambian la respuesta', () => {
  it('[REQ-ADM9-005] un cuerpo JSON con __proto__ y constructor.prototype enviado a DELETE (con sesión) no contamina Object.prototype', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const raw = `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"admin":true}`;
    const r = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN, 'content-type': 'application/json' }, csrf: true, contract: false, raw: raw });
    expect(r.status).not.toBeGreaterThanOrEqual(500);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('[REQ-ADM9-005] parámetros de consulta con corchetes (__proto__[x], constructor[prototype][x]) en session, callback y ruta oculta no cambian la respuesta', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const ref = observable(await sessionOf(a, cookie));
    expect(observable(await get(a, '/api/admin/session?__proto__[polluted]=1&constructor[prototype][polluted]=1', cookie))).toEqual(ref);
    const cb = await adminCallback(a, null, '__proto__[polluted]=1&constructor[prototype][polluted]=1');
    expect(cb.status).toBe(404);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('[REQ-ADM9-005] cuerpos JSON no objeto (array, cadena, null, número) a una mutación con sesión no dan 5xx', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    for (const raw of ['[1,2]', '"x"', 'null', '42']) {
      const r = await a.call('POST', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN, 'content-type': 'application/json' }, csrf: true, contract: false, raw: raw });
      expect(r.status, raw).not.toBeGreaterThanOrEqual(500);
      expect(r.status, raw).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Sentinel VIII — Desbordamiento de carga: cuerpos y consultas gigantes se rechazan sin 5xx ni efectos.
// ---------------------------------------------------------------------------
describe('Sentinel VIII [PAYLOAD] cuerpos de 2 MB y consultas enormes se rechazan sin 5xx ni revocar sesiones', () => {
  it('[REQ-ADM9-005] DELETE de 2 MB sin sesión y con sesión: nunca 2xx sin sesión; con sesión, o se rechaza (413) y la sesión sigue viva, o se procesa sin 5xx', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const big = 'x'.repeat(2 * 1024 * 1024);
    const anon = await a.call('DELETE', '/api/admin/session', { headers: { origin: OWN_ORIGIN }, csrf: true, contract: false, raw: `{"p":"${big}"}` });
    expect(anon.status).not.toBeGreaterThanOrEqual(500);
    expect(anon.status).not.toBe(204);
    const auth = await a.call('DELETE', '/api/admin/session', { cookie, headers: { origin: OWN_ORIGIN }, csrf: true, contract: false, raw: `{"p":"${big}"}` });
    expect(auth.status).not.toBeGreaterThanOrEqual(500);
    if (auth.status === 413) expect((await sessionOf(a, cookie)).status).toBe(200);
  });

  it('[EDGE-009-012] código de Google de 3 KB o estado de 10 KB en el callback son ignorados como ausentes: 404 uniforme, sin 5xx ni eco', async () => {
    const { a } = await boot();
    const huge = 'A'.repeat(3000);
    const r1 = await adminCallback(a, null, `code=${huge}&state=x`);
    const r2 = await adminCallback(a, null, `code=${GOOGLE_CODE}&state=${'B'.repeat(10_000)}`);
    for (const r of [r1, r2]) {
      expect([404, 414]).toContain(r.status);
      expect(r.text).not.toContain('AAAA');
      expect(r.text).not.toContain('BBBB');
    }
  });

  it('[REQ-ADM9-005] cabecera Cookie de 20 KB en /api/admin/session no produce 5xx', async () => {
    const { a } = await boot();
    const r = await sessionOf(a, `${ADMIN_SESSION_COOKIE}=${'z'.repeat(20_000)}`);
    expect(r.status).not.toBeGreaterThanOrEqual(500);
    expect(r.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Sentinel IX — XSS y esquemas peligrosos: ningún valor del atacante llega a la página ni a un href.
// ---------------------------------------------------------------------------
describe('Sentinel IX [XSS/URI] esquemas javascript: y data: en parámetros no llegan a la respuesta ni al destino de navegación', () => {
  it('[REQ-ADM9-001] state/code/error con javascript: o data:text/html no se reflejan en el callback', async () => {
    const { a } = await boot();
    const payloads = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)'];
    for (const p of payloads) {
      const q = encodeURIComponent(p);
      const r = await adminCallback(a, null, `code=${q}&state=${q}&error=${q}`);
      expect(r.status).toBe(404);
      expect(r.text.toLowerCase()).not.toContain('javascript:');
      expect(r.text.toLowerCase()).not.toContain('data:text');
      expect(JSON.stringify(r.headers).toLowerCase()).not.toContain('javascript:');
    }
  });

  it('[REQ-ADM9-001] la página de éxito navega únicamente a /admin (destino fijo, no derivado de la consulta)', async () => {
    const { a } = await boot();
    const { done } = await adminLogin(a);
    expect(done.status).toBe(200);
    expect(done.text).toContain('url=/admin"');
    expect(done.text).toContain('href="/admin"');
    expect(done.text.toLowerCase()).not.toMatch(/javascript:|data:|https?:\/\/evil/);
  });

  it('[REQ-ADM9-001] GET /admin?next=javascript:... sirve el HTML estático sin reflejar la consulta', async () => {
    const { a } = await boot();
    const r = await get(a, `/admin?next=${encodeURIComponent('javascript:alert(1)')}&x=<script>alert(1)</script>`);
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('javascript:alert');
    expect(r.text).not.toContain('<script>alert');
    expect(r.text).toContain('admin-root');
  });
});
