import { afterEach, describe, expect, it } from 'vitest';
import { ANA, ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY } from '../../fixtures/identity-fixtures.ts';
import { createIdentityApi, problemOf, type Api } from './api-harness.ts';

/** T209: rutas `auth` de la Feature 002 sobre la API real y SQLite, con el reloj inyectado y el OpenAPI 3.0.0 como oráculo. */
let api: Api;
afterEach(async () => api.close());

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const instant = (offsetMs: number) => new Date(Date.parse(REFERENCE_NOW) + offsetMs).toISOString();
/** Mueve el reloj inyectado `offsetMs` después del instante de referencia (el día civil no importa para la sesión). */
const advance = (offsetMs: number) => api.clock.setClock(REFERENCE_TODAY, instant(offsetMs));
const UNAUTHENTICATED = { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' };
const registration = (overrides: Record<string, unknown> = {}) => ({
  username: 'nueva.usuaria',
  displayName: 'Nueva',
  password: 'Clave2026x!',
  confirmPassword: 'Clave2026x!',
  ...overrides,
});

describe('registro por HTTP (src/infrastructure/http/routes/auth.routes.ts)', () => {
  it('[REQ-AUTH2-001][SC-001] el registro responde 201 con SessionView 3.0.0 y la cookie argos_session de 24 h, HttpOnly y SameSite=Strict', async () => {
    api = await createIdentityApi();
    const r = await api.call('POST', '/api/auth/register', { body: registration() });
    const view = r.json as { user: Record<string, unknown> };
    expect([r.status, r.setCookie]).toEqual([201, 'argos_session=token-0001; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict']);
    expect(r.json).toEqual({
      user: { id: view.user['id'], username: 'nueva.usuaria', displayName: 'Nueva', createdAt: REFERENCE_NOW, email: null, preferredLanguage: 'es', timezone: 'America/Bogota' },
      createdAt: REFERENCE_NOW,
      lastActivityAt: REFERENCE_NOW,
      idleExpiresAt: instant(30 * MINUTE),
      absoluteExpiresAt: instant(24 * HOUR),
    });
    expect(r.text).not.toMatch(/password|passwordHash|scrypt|token-0001/i);
  });

  it('[REQ-AUTH2-001][SC-001] tras registrarse la persona queda autenticada, cierra sesión y vuelve a entrar con la política nueva', async () => {
    api = await createIdentityApi();
    const registered = await api.call('POST', '/api/auth/register', { body: registration() });
    const me = await api.call('GET', '/api/auth/me', { cookie: registered.cookie });
    const out = await api.call('POST', '/api/auth/logout', { cookie: registered.cookie });
    const again = await api.call('POST', '/api/auth/login', { body: { username: 'nueva.usuaria', password: 'Clave2026x!' } });
    expect([me.status, out.status, again.status]).toEqual([200, 204, 200]);
  });

  it('[REQ-AUTH2-001][ERR-SCHEMA-VALIDATION-FAILED] un username con mayúsculas se rechaza (422) y no se normaliza: no se crea ninguna cuenta ni cookie', async () => {
    api = await createIdentityApi();
    const upper = await api.call('POST', '/api/auth/register', { body: registration({ username: 'Nueva.Usuaria' }) });
    const spaced = await api.call('POST', '/api/auth/register', { body: registration({ username: '  nueva.usuaria ' }) });
    const lower = await api.call('POST', '/api/auth/login', { body: { username: 'nueva.usuaria', password: 'Clave2026x!' } });
    expect([problemOf(upper), (upper.json as { field: string }).field, upper.setCookie, problemOf(spaced), problemOf(lower)]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      'username',
      null,
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' },
    ]);
  });

  it('[REQ-AUTH2-001] el correo es opcional, no es único y nunca aparece en la sesión de otra persona', async () => {
    api = await createIdentityApi();
    const first = await api.call('POST', '/api/auth/register', { body: registration({ email: 'compartido@example.com' }) });
    const second = await api.call('POST', '/api/auth/register', { body: registration({ username: 'otra.persona', email: 'compartido@example.com' }) });
    const none = await api.call('POST', '/api/auth/register', { body: registration({ username: 'sin.correo' }) });
    const bad = await api.call('POST', '/api/auth/register', { body: registration({ username: 'mal.correo', email: 'no-es-correo' }) });
    const emailOf = (r: typeof first) => (r.json as { user: { email: string | null } }).user.email;
    expect([first.status, emailOf(first), second.status, emailOf(second), none.status, emailOf(none), problemOf(bad)]).toEqual([
      201,
      'compartido@example.com',
      201,
      'compartido@example.com',
      201,
      null,
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-AUTH2-001][ERR-AUTH-USERNAME-TAKEN][ERR-AUTH-WEAK-PASSWORD] nombre repetido → 409, contraseña débil → 422 y confirmación distinta → 422, sin cookie', async () => {
    api = await createIdentityApi();
    const taken = await api.call('POST', '/api/auth/register', { body: registration({ username: 'ana.duena' }) });
    const weak = await api.call('POST', '/api/auth/register', { body: registration({ password: 'abcdefghij', confirmPassword: 'abcdefghij' }) });
    const mismatch = await api.call('POST', '/api/auth/register', { body: registration({ confirmPassword: 'Clave2026y!' }) });
    expect([problemOf(taken), problemOf(weak), problemOf(mismatch), (mismatch.json as { field: string }).field, taken.setCookie, weak.setCookie, mismatch.setCookie]).toEqual([
      { status: 409, code: 'ERR-AUTH-USERNAME-TAKEN' },
      { status: 422, code: 'ERR-AUTH-WEAK-PASSWORD' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      'confirmPassword',
      null,
      null,
      null,
    ]);
  });

  it('[REQ-AUTH2-001] la cookie lleva Secure cuando COOKIE_SECURE es true', async () => {
    api = await createIdentityApi({ cookieSecure: true });
    const r = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    expect(r.setCookie).toBe('argos_session=token-0001; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Strict');
  });
});

describe('inicio de sesión por HTTP (REQ-AUTH2-002)', () => {
  it('[REQ-AUTH2-002][SC-010] el inicio de sesión no aplica la política: la cuenta de la 001 con 8 caracteres entra', async () => {
    api = await createIdentityApi();
    const old = await api.call('POST', '/api/auth/login', { body: { username: 'vieja.cuenta', password: 'abcd1234' } });
    expect([old.status, old.cookie, (old.json as { user: { username: string } }).user.username]).toEqual([200, 'argos_session=token-0001', 'vieja.cuenta']);
  });

  it('[REQ-AUTH2-002][INV-AUTH-006] usuario inexistente, contraseña errónea y username con otra capitalización dan el mismo 401 genérico, con una verificación por rama', async () => {
    api = await createIdentityApi();
    const wrong = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: 'incorrecta' } });
    api.hasher.reset();
    const ghost = await api.call('POST', '/api/auth/login', { body: { username: 'nadie.x', password: 'incorrecta' } });
    const ghostCalls = api.hasher.calls.filter((c) => c.method === 'verify').length;
    api.hasher.reset();
    const exact = await api.call('POST', '/api/auth/login', { body: { username: 'Ana.Duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    const strip = (r: typeof wrong) => ({ ...(r.json as object), instance: null });
    expect([problemOf(wrong), strip(wrong), ghostCalls, problemOf(exact), api.hasher.calls.filter((c) => c.method === 'verify').length]).toEqual([
      { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' },
      strip(ghost),
      1,
      { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' },
      1,
    ]);
  });

  it('[REQ-AUTH2-002][INV-AUTH-005] el 6.º intento fallido en 15 minutos → 429 aunque la contraseña sea correcta', async () => {
    api = await createIdentityApi();
    for (let i = 0; i < 5; i += 1) await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: 'incorrecta' } });
    const blocked = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    expect(problemOf(blocked)).toEqual({ status: 429, code: 'ERR-AUTH-TOO-MANY-ATTEMPTS' });
  });

  it('[REQ-AUTH2-002] una contraseña vacía o de más de 128 caracteres en el login es un error de esquema, no de política', async () => {
    api = await createIdentityApi();
    const empty = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: '' } });
    const huge = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: 'x'.repeat(129) } });
    expect([problemOf(empty), problemOf(huge)]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-AUTH2-002][STATE-AUTH-SESSION-001] iniciar sesión con una cookie previa crea un token nuevo y no toca la sesión anterior', async () => {
    api = await createIdentityApi();
    const first = await api.login('ana.duena');
    const second = await api.call('POST', '/api/auth/login', { cookie: first, body: { username: 'ana.duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    const stillValid = await api.call('GET', '/api/auth/me', { cookie: first });
    expect([second.cookie, stillValid.status]).toEqual(['argos_session=token-0002', 200]);
  });
});

describe('cierre y sesión actual por HTTP (REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002)', () => {
  it('[REQ-AUTH-003][SC-009] logout es idempotente (204 con sesión, sin sesión, ya cerrada o vencida), borra la cookie y revoca al instante', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const withSession = await api.call('POST', '/api/auth/logout', { cookie });
    const reuse = await api.call('GET', '/api/auth/me', { cookie });
    const again = await api.call('POST', '/api/auth/logout', { cookie });
    const anonymous = await api.call('POST', '/api/auth/logout');
    const expiring = await api.login('bruno.admin');
    advance(25 * HOUR);
    const expired = await api.call('POST', '/api/auth/logout', { cookie: expiring });
    expect([withSession.status, withSession.setCookie, problemOf(reuse), again.status, anonymous.status, expired.status]).toEqual([
      204,
      'argos_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
      UNAUTHENTICATED,
      204,
      204,
      204,
    ]);
  });

  it('[REQ-AUTH-004][SC-009] GET /auth/me tras recargar a los 10 minutos devuelve la sesión con la actividad renovada', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    advance(10 * MINUTE);
    const me = await api.call('GET', '/api/auth/me', { cookie });
    const view = me.json as { user: { id: string; email: null }; createdAt: string; lastActivityAt: string; idleExpiresAt: string; absoluteExpiresAt: string };
    expect([me.status, view.user.id, view.createdAt, view.lastActivityAt, view.idleExpiresAt, view.absoluteExpiresAt]).toEqual([
      200,
      ANA,
      REFERENCE_NOW,
      instant(10 * MINUTE),
      instant(40 * MINUTE),
      instant(24 * HOUR),
    ]);
  });

  it('[REQ-AUTH-004][ERR-AUTH-UNAUTHENTICATED] sin cookie, con token desconocido o con cookie manipulada → 401 ERR-AUTH-UNAUTHENTICATED', async () => {
    api = await createIdentityApi();
    await api.login('ana.duena');
    const none = await api.call('GET', '/api/auth/me');
    const unknown = await api.call('GET', '/api/auth/me', { cookie: 'argos_session=desconocido' });
    const tampered = await api.call('GET', '/api/auth/me', { cookie: 'argos_session=token-0001x' });
    expect([problemOf(none), problemOf(unknown), problemOf(tampered)]).toEqual([UNAUTHENTICATED, UNAUTHENTICATED, UNAUTHENTICATED]);
  });

  it('[INV-AUTH2-002][SC-009] expiración por inactividad: 29 min 59 s sigue y renueva; 30 min exactos sin actividad dan 401', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    advance(30 * MINUTE - 1000);
    const alive = await api.call('GET', '/api/auth/me', { cookie });
    advance(59 * MINUTE);
    const renewed = await api.call('GET', '/api/auth/me', { cookie });
    advance(89 * MINUTE);
    const idle = await api.call('GET', '/api/auth/me', { cookie });
    expect([alive.status, renewed.status, problemOf(idle)]).toEqual([200, 200, UNAUTHENTICATED]);
  });

  it('[INV-AUTH2-002][SC-009] una sesión que nadie usa muere a los 30 min y la que se usa cada 20 min muere en el tope de 24 h', async () => {
    api = await createIdentityApi();
    const idleCookie = await api.login('ana.duena');
    const busyCookie = await api.login('bruno.admin');
    let last = 200;
    for (let minute = 20; minute < 24 * 60; minute += 20) {
      advance(minute * MINUTE);
      last = (await api.call('GET', '/api/auth/me', { cookie: busyCookie })).status;
      expect(last, `minuto ${minute}`).toBe(200);
    }
    advance(24 * HOUR - 1);
    const beforeCap = await api.call('GET', '/api/auth/me', { cookie: busyCookie });
    advance(24 * HOUR);
    const atCap = await api.call('GET', '/api/auth/me', { cookie: busyCookie });
    const idle = await api.call('GET', '/api/auth/me', { cookie: idleCookie });
    expect([beforeCap.status, problemOf(atCap), problemOf(idle)]).toEqual([200, UNAUTHENTICATED, UNAUTHENTICATED]);
  });

  it('[INV-AUTH2-002] solo la petición válida renueva: una rechazada por CSRF o con otra cookie no desplaza la ventana', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    advance(20 * MINUTE);
    const noCsrf = await api.call('POST', '/api/auth/logout', { cookie, csrf: false, contract: false });
    const foreign = await api.call('GET', '/api/auth/me', { cookie: 'argos_session=otra' });
    advance(31 * MINUTE);
    const after = await api.call('GET', '/api/auth/me', { cookie });
    expect([noCsrf.status, problemOf(foreign), problemOf(after)]).toEqual([403, UNAUTHENTICATED, UNAUTHENTICATED]);
  });

  it('[INV-AUTH2-002][REQ-AUTH-004] la sesión de otra persona no se ve afectada por la expiración de la primera', async () => {
    api = await createIdentityApi();
    const ana = await api.login('ana.duena');
    advance(25 * MINUTE);
    const elena = await api.login('elena.solo');
    advance(40 * MINUTE);
    const anaMe = await api.call('GET', '/api/auth/me', { cookie: ana });
    const elenaMe = await api.call('GET', '/api/auth/me', { cookie: elena });
    expect([problemOf(anaMe), elenaMe.status, (elenaMe.json as { user: { id: string } }).user.id]).toEqual([UNAUTHENTICATED, 200, ELENA]);
  });
});
