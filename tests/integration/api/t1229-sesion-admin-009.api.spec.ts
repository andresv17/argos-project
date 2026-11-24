import { afterEach, describe, expect, it } from 'vitest';
import { AuthenticateAdminUseCase } from '../../../src/application/use-cases/admin-use-cases.ts';
import { ADMIN_COOKIE_PATTERN, ADMIN_SESSION_COOKIE, ADMIN_OAUTH_COOKIE, ADMIN_SUB, UUID_V4, adminKit, adminLogin, cookieNamed, setCookies, valueOf } from '../../fixtures/admin-fixtures.ts';
import { GOOGLE_EMAIL } from '../../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1229 (pruebas rojas, Feature 009, Fase 3, #19): sesión de administración separada de la de usuarios. Atributos de cookie (`HttpOnly`, `Strict`, `Secure` en Cloud, `Path=/api/admin`),
 * expiración 30 min absolutos y 10 min de inactividad (`GET /api/admin/session` sin keep-alive), y la misma persona con ambas sesiones. REQ-ADM9-002, INV-ADM9-002, EDGE-009-013;
 * SC-009-011, SC-009-015. Enmienda constitucional 009-A.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot(options: { cookieSecure?: boolean } = {}) {
  const kit = adminKit();
  const a = await createApi(undefined, { admin: kit.admin, ...options });
  api = a;
  return { a, kit };
}

const BASE_MS = Date.parse('2026-11-05T12:00:00.000Z');
const at = (a: Api, offsetSeconds: number): void => {
  const iso = new Date(BASE_MS + offsetSeconds * 1000).toISOString();
  a.clock.setClock(iso.slice(0, 10), iso);
};
const sessionView = (a: Api, cookie: string | null): Promise<ApiResponse> => a.call('GET', '/api/admin/session', { cookie, contract: false });

describe('T1229 [REQ-ADM9-002] [SC-009-015] atributos de las cookies de administración (Enmienda 009-A)', () => {
  it('argos_admin_session: HttpOnly, SameSite=Strict, Path=/api/admin, Max-Age 1800 s; sin Secure en local', async () => {
    const { a } = await boot();
    const { done } = await adminLogin(a);
    const cookie = cookieNamed(done, ADMIN_SESSION_COOKIE)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/admin(;|$)/);
    expect(cookie).toMatch(/Max-Age=1800/);
    expect(cookie).not.toMatch(/Secure/i);
    expect(valueOf(cookie)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('argos_admin_session lleva Secure con la configuración de Cloud (cookieSecure)', async () => {
    const { a } = await boot({ cookieSecure: true });
    const { done } = await adminLogin(a);
    expect(cookieNamed(done, ADMIN_SESSION_COOKIE)).toMatch(/Secure/i);
  });

  it('argos_admin_oauth: HttpOnly, SameSite=Lax, Path=/api/admin/auth/google, Max-Age 900 s, solo un identificador opaco (y Secure en Cloud)', async () => {
    const { a } = await boot({ cookieSecure: true });
    const { started } = await adminLogin(a);
    const cookie = cookieNamed(started, ADMIN_OAUTH_COOKIE)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/admin\/auth\/google(;|$)/);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(cookie).toMatch(/Secure/i);
    expect(valueOf(cookie)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.headers['cache-control']).toBe('no-store');
  });

  it('el callback exitoso responde 200 (no 302) con una página SIN script en línea que navega a /admin, retira argos_admin_oauth y no emite argos_session', async () => {
    const { a } = await boot();
    const { done } = await adminLogin(a);
    expect(done.status).toBe(200);
    expect(String(done.headers['content-type'])).toMatch(/^text\/html/);
    expect(done.headers['cache-control']).toBe('no-store');
    expect(done.text).toContain('url=/admin');
    expect(done.text).not.toMatch(/<script/i);
    expect(cookieNamed(done, ADMIN_OAUTH_COOKIE)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
    expect(setCookies(done).every((c) => !c.startsWith('argos_oauth='))).toBe(true);
  });

  it('[REQ-ADM9-002] el identificador de sesión se rota en cada callback: dos accesos dan identificadores distintos', async () => {
    const { a } = await boot();
    const first = await adminLogin(a);
    const second = await adminLogin(a);
    expect(first.cookie).toMatch(ADMIN_COOKIE_PATTERN);
    expect(second.cookie).toMatch(ADMIN_COOKIE_PATTERN);
    expect(first.cookie).not.toBe(second.cookie);
  });

  it('el identificador de sesión solo se guarda como SHA-256 (64 hex), nunca en claro', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const id = cookie!.split('=')[1]!;
    const rows = a.db.prepare('SELECT token_hash FROM admin_sessions').all() as Array<{ token_hash: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.token_hash).not.toContain(id);
  });
});

describe('T1229 [REQ-ADM9-002] [INV-ADM9-002] [SC-009-011] las sesiones de usuario y de administración no se cruzan', () => {
  it('la sesión de administración lee GET /api/admin/session con la vista cerrada y sin correo, sub ni identificador de sesión', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const r = await sessionView(a, cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Object.keys(r.json as object).sort()).toEqual(['adminId', 'authenticated', 'expiresAt', 'idleExpiresAt']);
    expect((r.json as { adminId: string }).adminId).toMatch(UUID_V4);
    expect(r.text).not.toContain(ADMIN_SUB);
    expect(r.text).not.toContain('example.test');
    expect(r.text).not.toContain(cookie!.split('=')[1]!);
  });

  it('la cookie de administración NO autoriza la API de usuarios, ni con su nombre ni haciéndola pasar por argos_session', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const token = cookie!.split('=')[1]!;
    for (const header of [cookie!, `argos_session=${token}`]) {
      const r = await a.call('GET', '/api/auth/me', { cookie: header, contract: false });
      expect(r.status).toBe(401);
      expect((r.json as { code: string }).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    }
    const pets = await a.call('GET', '/api/pets', { cookie: cookie!, contract: false });
    expect(pets.status).toBe(401);
  });

  it('la cookie de usuario NO autoriza /api/admin/*, ni con su nombre ni haciéndola pasar por argos_admin_session', async () => {
    const { a } = await boot();
    const user = await a.login('andres');
    const token = user.split('=')[1]!;
    expect((await sessionView(a, user)).status).toBe(404);
    expect((await sessionView(a, `${ADMIN_SESSION_COOKIE}=${token}`)).status).toBe(404);
  });

  it('[EDGE-009-013] la misma persona con sesión de usuario y de administración a la vez: las dos funcionan y cerrar una no cierra la otra', async () => {
    const { a } = await boot();
    const user = await a.login('andres');
    const { cookie: admin } = await adminLogin(a);
    const both = `${user}; ${admin}`;
    expect((await a.call('GET', '/api/auth/me', { cookie: both, contract: false })).status).toBe(200);
    expect((await sessionView(a, both)).status).toBe(200);
    const closed = await a.call('DELETE', '/api/admin/session', { cookie: both, headers: { origin: 'http://localhost' }, contract: false });
    expect(closed.status).toBe(204);
    expect((await a.call('GET', '/api/auth/me', { cookie: both, contract: false })).status).toBe(200);
    expect((await sessionView(a, both)).status).toBe(404);
  });

  it('iniciar sesión de administración no crea ni modifica cuentas ni sesiones de usuario (INV-ADM9-002)', async () => {
    const { a } = await boot();
    const count = (sql: string): number => (a.db.prepare(sql).get() as { n: number }).n;
    const before = [count('SELECT COUNT(*) AS n FROM users'), count('SELECT COUNT(*) AS n FROM sessions'), count('SELECT COUNT(*) AS n FROM auth_identities'), count('SELECT COUNT(*) AS n FROM oauth_flow_states')];
    await adminLogin(a);
    const after = [count('SELECT COUNT(*) AS n FROM users'), count('SELECT COUNT(*) AS n FROM sessions'), count('SELECT COUNT(*) AS n FROM auth_identities'), count('SELECT COUNT(*) AS n FROM oauth_flow_states')];
    expect(after).toEqual(before);
  });
});

describe('T1229 [REQ-ADM9-002] [SC-009-015] [D9-19] 30 min absolutos y 10 min de inactividad, sin keep-alive', () => {
  it('la vista informa expiresAt = creación + 30 min e idleExpiresAt = creación + 10 min', async () => {
    const { a } = await boot();
    at(a, 0);
    const { cookie } = await adminLogin(a);
    const view = (await sessionView(a, cookie)).json as { expiresAt: string; idleExpiresAt: string };
    expect(view.expiresAt).toBe('2026-11-05T12:30:00.000Z');
    expect(view.idleExpiresAt).toBe('2026-11-05T12:10:00.000Z');
  });

  it('vigente 1 s antes de los 10 min; a los 10 min exactos sin actividad la sesión ya no existe (404 uniforme)', async () => {
    const { a } = await boot();
    at(a, 0);
    const { cookie } = await adminLogin(a);
    at(a, 599);
    expect((await sessionView(a, cookie)).status).toBe(200);
    at(a, 600);
    expect((await sessionView(a, cookie)).status).toBe(404);
  });

  it('[SC-009-015] GET /api/admin/session NO renueva la inactividad: sondear cada 5 min no mantiene viva la sesión', async () => {
    const { a } = await boot();
    at(a, 0);
    const { cookie } = await adminLogin(a);
    at(a, 300);
    expect((await sessionView(a, cookie)).status).toBe(200);
    at(a, 590);
    const probe = await sessionView(a, cookie);
    expect(probe.status).toBe(200);
    expect((probe.json as { idleExpiresAt: string }).idleExpiresAt).toBe('2026-11-05T12:10:00.000Z');
    at(a, 600);
    expect((await sessionView(a, cookie)).status).toBe(404);
  });

  it('una sesión vencida por inactividad sigue vencida al consultarla otra vez (el 404 no la reactiva)', async () => {
    const { a } = await boot();
    at(a, 0);
    const { cookie } = await adminLogin(a);
    at(a, 700);
    expect((await sessionView(a, cookie)).status).toBe(404);
    at(a, 700);
    expect((await sessionView(a, cookie)).status).toBe(404);
  });

  it('una acción de mutación SÍ renueva la inactividad, pero nunca pasa de los 30 min absolutos (caso de uso)', async () => {
    const { a } = await boot();
    at(a, 0);
    const { cookie } = await adminLogin(a);
    const token = cookie!.split('=')[1]!;
    const authenticate = new AuthenticateAdminUseCase(a.deps);
    at(a, 540);
    expect((await authenticate.execute(token, { renew: true }))?.idleExpiresAt).toBe('2026-11-05T12:19:00.000Z');
    at(a, 1080);
    expect((await authenticate.execute(token, { renew: true }))?.idleExpiresAt).toBe('2026-11-05T12:28:00.000Z');
    at(a, 1620);
    const last = await authenticate.execute(token, { renew: true });
    expect(last?.idleExpiresAt).toBe('2026-11-05T12:30:00.000Z');
    expect(last?.expiresAt).toBe('2026-11-05T12:30:00.000Z');
    at(a, 1800);
    expect(await authenticate.execute(token, { renew: true })).toBeNull();
    expect((await sessionView(a, cookie)).status).toBe(404);
  });

  it('sin cookie o con un identificador desconocido el caso de uso de autenticación devuelve null', async () => {
    const { a } = await boot();
    const authenticate = new AuthenticateAdminUseCase(a.deps);
    expect(await authenticate.execute(null, { renew: false })).toBeNull();
    expect(await authenticate.execute('x'.repeat(43), { renew: true })).toBeNull();
  });

  it('un acceso desde un correo ajeno a la lista no abre sesión (el correo de Google de usuarios no es administrador)', async () => {
    const { a, kit } = await boot();
    kit.oidc.identity = { sub: ADMIN_SUB, email: GOOGLE_EMAIL };
    const { cookie } = await adminLogin(a);
    expect(cookie).toBeNull();
  });
});
