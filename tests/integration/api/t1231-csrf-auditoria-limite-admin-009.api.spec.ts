import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_ACCESS_LIMIT, ADMIN_START_LIMIT } from '../../../src/infrastructure/config/app-config.ts';
import {
  ADMIN_EMAIL,
  ADMIN_OAUTH_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SUB,
  OWN_ORIGIN,
  UUID_V4,
  adminCallback,
  adminKit,
  adminLogin,
  adminStart,
  cookieNamed,
  staticRootWithIndex,
  stateOfUrl,
  valueOf,
  ADMIN_COOKIE_PATTERN,
} from '../../fixtures/admin-fixtures.ts';
import { GOOGLE_CODE } from '../../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1231 (pruebas rojas, Feature 009, Fase 3, #19): CSRF (origen ajeno o sin cookie propia se rechaza), auditoría propia (id de administrador, acción y marca de tiempo, sin valores de
 * prompt ni datos personales) y límite de intentos por IP efectiva y no por cuenta (EDGE-009-035, valores solo en `app-config.ts`, ADR-009-15).
 * REQ-ADM9-004, REQ-ADM9-005, EDGE-009-010, EDGE-009-011; SC-009-013, SC-009-014.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot() {
  const kit = adminKit();
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithIndex() });
  api = a;
  return { a, kit };
}

const count = (a: Api, sql: string): number => (a.db.prepare(sql).get() as { n: number }).n;
const problem = (r: ApiResponse): { status: number; code: string } => ({ status: r.status, code: (r.json as { code: string }).code });
const logout = (a: Api, cookie: string | null, headers: Record<string, string> = { origin: OWN_ORIGIN }, csrf = true) =>
  a.call('DELETE', '/api/admin/session', { cookie, headers, csrf, contract: false });
const at = (a: Api, ms: number): void => {
  const iso = new Date(ms).toISOString();
  a.clock.setClock(iso.slice(0, 10), iso);
};
/** Un fallo del callback desde la IP indicada: estado inexistente y sin cookie. */
const failFrom = (a: Api, ip: string) => adminCallback(a, null, `code=${GOOGLE_CODE}&state=${'q'.repeat(43)}`, { ip });

describe('T1231 [REQ-ADM9-005] [EDGE-009-011] [SC-009-014] CSRF: la mutación exige cookie propia, origen propio y X-Argos-Request', () => {
  it('[REQ-ADM9-005] [SC-009-014] con sesión, origen propio y la cabecera: 204, la sesión se revoca en el servidor, la cookie se expira (Strict, Path=/api/admin) y la segunda llamada es el 404 uniforme', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const done = await logout(a, cookie);
    expect(done.status).toBe(204);
    const expired = cookieNamed(done, ADMIN_SESSION_COOKIE)!;
    expect(expired).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(expired).toMatch(/Path=\/api\/admin(;|$)/);
    expect(expired).toMatch(/SameSite=Strict/i);
    expect((a.db.prepare('SELECT revoked_at FROM admin_sessions').get() as { revoked_at: string | null }).revoked_at).toBe(a.clock.nowIsoTimestamp());
    expect((await logout(a, cookie)).status).toBe(404);
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(404);
  });

  it('origen ajeno (otro host, otro esquema, otro puerto, subdominio parecido o "null"): 403 ERR-AUTH-CSRF-REJECTED y la sesión NO se revoca', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    for (const origin of ['https://evil.example', 'https://localhost', 'http://localhost:8080', 'http://localhost.evil.example', 'null']) {
      const r = await logout(a, cookie, { origin });
      expect(problem(r), origin).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
    }
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(200);
  });

  it('sin cabecera Origin con sesión válida: 403 y no se revoca', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    expect(problem(await logout(a, cookie, {}))).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(200);
  });

  it('sin X-Argos-Request con sesión válida y origen propio: 403 y no se revoca', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    expect(problem(await logout(a, cookie, { origin: OWN_ORIGIN }, false))).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(200);
  });

  it('sin cookie propia (aunque haya cookie de usuario) y con origen propio: el 404 uniforme, nunca un 403 que delate la ruta', async () => {
    const { a } = await boot();
    const user = await a.login('andres');
    const r = await logout(a, user);
    expect(r.status).toBe(404);
    expect(r.text).toBe('Not Found');
    expect((await logout(a, null)).status).toBe(404);
  });

  it('un origen ajeno SIN sesión de administración sigue siendo el 404 uniforme (no revela si la ruta existe)', async () => {
    const { a } = await boot();
    const r = await logout(a, null, { origin: 'https://evil.example' });
    expect(r.status).toBe(404);
  });
});

describe('T1231 [REQ-ADM9-004] [SC-009-013] auditoría de administración en tabla propia, sin datos personales', () => {
  it('la tabla admin_audit_entries tiene solo id, admin_id, action, object_ref y occurred_at (sin correo, sub ni valores)', async () => {
    const { a } = await boot();
    const columns = (a.db.prepare("SELECT name FROM pragma_table_info('admin_audit_entries') ORDER BY cid").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(['id', 'admin_id', 'action', 'object_ref', 'occurred_at', 'metadata']);
  });

  it('[REQ-ADM9-004] [SC-009-013] el acceso y el cierre dejan una entrada cada uno con el id del administrador, la acción y la marca de tiempo del reloj inyectado', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    const adminId = ((await a.call('GET', '/api/admin/session', { cookie, contract: false })).json as { adminId: string }).adminId;
    await logout(a, cookie);
    const rows = a.db.prepare('SELECT * FROM admin_audit_entries ORDER BY occurred_at, action').all() as Array<Record<string, string | null>>;
    expect(rows.map((r) => [r['admin_id'], r['action'], r['occurred_at']])).toEqual([
      [adminId, 'ADMIN_SESSION_END', a.clock.nowIsoTimestamp()],
      [adminId, 'ADMIN_SESSION_START', a.clock.nowIsoTimestamp()],
    ]);
    for (const row of rows) expect(row['id']).toMatch(UUID_V4);
  });

  it('ninguna entrada contiene el correo, el sub de Google ni el identificador de sesión', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    await logout(a, cookie);
    const dump = JSON.stringify(a.db.prepare('SELECT * FROM admin_audit_entries').all());
    for (const secret of [ADMIN_EMAIL, 'admin.uno', ADMIN_SUB, cookie!.split('=')[1]!]) expect(dump).not.toContain(secret);
  });

  it('un acceso fallido no escribe auditoría de administrador (no hay administrador) y el registro de usuarios (audit_log) no cambia', async () => {
    const { a } = await boot();
    const before = count(a, 'SELECT COUNT(*) AS n FROM audit_log');
    await failFrom(a, '10.0.0.1');
    expect(count(a, 'SELECT COUNT(*) AS n FROM admin_audit_entries')).toBe(0);
    await adminLogin(a);
    expect(count(a, 'SELECT COUNT(*) AS n FROM audit_log')).toBe(before);
  });

  it('un cierre rechazado por CSRF no se audita ni revoca', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a);
    await logout(a, cookie, { origin: 'https://evil.example' });
    expect(count(a, "SELECT COUNT(*) AS n FROM admin_audit_entries WHERE action = 'ADMIN_SESSION_END'")).toBe(0);
  });
});

describe('T1231 [REQ-ADM9-004] [EDGE-009-010] [EDGE-009-035] límite de fallos por IP efectiva, no por cuenta', () => {
  it('tras el máximo de fallos de una IP en la ventana, el siguiente intento (callback o inicio) responde 429 ERR-ADMIN-RATE-LIMITED con Retry-After', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i += 1) expect((await failFrom(a, '10.0.0.1')).status).toBe(404);
    const blocked = await failFrom(a, '10.0.0.1');
    expect(problem(blocked)).toEqual({ status: 429, code: 'ERR-ADMIN-RATE-LIMITED' });
    expect(String(blocked.headers['content-type'])).toMatch(/^application\/problem\+json/);
    const retry = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(ADMIN_ACCESS_LIMIT.windowMinutes * 60);
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(problem(await adminStart(a, { ip: '10.0.0.1' }))).toEqual({ status: 429, code: 'ERR-ADMIN-RATE-LIMITED' });
    expect(blocked.text).not.toMatch(new RegExp(`\\b${ADMIN_ACCESS_LIMIT.maxFailures}\\b`));
  });

  it('es por IP efectiva y no por cuenta: otra IP no queda bloqueada y la misma cuenta no acumula entre IPs distintas', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i += 1) await failFrom(a, '10.0.0.1');
    expect((await adminStart(a, { ip: '10.0.0.2' })).status).toBe(302);
    expect((await adminLogin(a, { ip: '10.0.0.2' })).cookie).toMatch(ADMIN_COOKIE_PATTERN);
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures * 2; i += 1) await failFrom(a, `10.1.0.${i + 1}`);
    expect((await adminStart(a, { ip: '10.1.0.250' })).status).toBe(302);
  });

  it('el Retry-After baja con el tiempo y la IP vuelve a entrar al expirar la ventana', async () => {
    const { a } = await boot();
    const t0 = Date.parse(a.clock.nowIsoTimestamp());
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i += 1) await failFrom(a, '10.0.0.1');
    const first = Number((await failFrom(a, '10.0.0.1')).headers['retry-after']);
    at(a, t0 + 5 * 60_000);
    const later = Number((await failFrom(a, '10.0.0.1')).headers['retry-after']);
    expect(first - later).toBe(300);
    at(a, t0 + ADMIN_ACCESS_LIMIT.windowMinutes * 60_000 + 1000);
    expect((await adminStart(a, { ip: '10.0.0.1' })).status).toBe(302);
  });

  it('una sesión de administración válida no se ve afectada por el bloqueo de su IP (el límite solo cuenta fallos del flujo de Google)', async () => {
    const { a } = await boot();
    const { cookie } = await adminLogin(a, { ip: '10.0.0.1' });
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures + 2; i += 1) await failFrom(a, '10.0.0.1');
    const r = await a.call('GET', '/api/admin/session', { cookie, ip: '10.0.0.1', contract: false });
    expect(r.status).toBe(200);
  });

  it('los accesos correctos no cuentan: muchos inicios de sesión válidos desde la misma IP nunca la bloquean', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures + 5; i += 1) expect((await adminLogin(a, { ip: '10.0.0.3' })).cookie).toMatch(ADMIN_COOKIE_PATTERN);
  });

  it('el 429 solo existe en el flujo de Google: el resto de /api/admin/* sin sesión conserva el 404 uniforme aunque la IP esté bloqueada', async () => {
    const { a } = await boot();
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures; i += 1) await failFrom(a, '10.0.0.1');
    const hidden = await a.call('GET', '/api/admin/session', { ip: '10.0.0.1', contract: false });
    expect(hidden.status).toBe(404);
  });

  it('[O-2] tope de inicios del flujo por IP efectiva: tras el máximo en la ventana el siguiente inicio responde 429 con Retry-After, otra IP no se ve afectada y la ventana expira', async () => {
    const { a } = await boot();
    const t0 = Date.parse(a.clock.nowIsoTimestamp());
    expect(ADMIN_START_LIMIT).toEqual({ maxStarts: 20, windowMinutes: 15 });
    for (let i = 0; i < ADMIN_START_LIMIT.maxStarts; i += 1) expect((await adminStart(a, { ip: '10.0.0.7' })).status).toBe(302);
    const blocked = await adminStart(a, { ip: '10.0.0.7' });
    expect(problem(blocked)).toEqual({ status: 429, code: 'ERR-ADMIN-RATE-LIMITED' });
    const retry = Number(blocked.headers['retry-after']);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(ADMIN_START_LIMIT.windowMinutes * 60);
    expect((await adminStart(a, { ip: '10.0.0.8' })).status).toBe(302);
    at(a, t0 + ADMIN_START_LIMIT.windowMinutes * 60_000 + 1000);
    expect((await adminStart(a, { ip: '10.0.0.7' })).status).toBe(302);
  });

  it('un fallo no consume el estado de otra persona: el flujo propio sigue funcionando tras los fallos ajenos de otra IP', async () => {
    const { a } = await boot();
    const started = await adminStart(a, { ip: '10.0.0.5' });
    for (let i = 0; i < ADMIN_ACCESS_LIMIT.maxFailures + 3; i += 1) await failFrom(a, '10.0.0.6');
    const done = await adminCallback(a, valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE)), `code=${GOOGLE_CODE}&state=${stateOfUrl(started.headers['location'] as string)}`, { ip: '10.0.0.5' });
    expect(done.status).toBe(200);
  });
});
