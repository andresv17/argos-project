import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**: rutas `auth` sobre la API real y SQLite. */
let api: Api;
afterEach(async () => api.close());

describe('autenticación por HTTP (src/infrastructure/http/routes/auth.routes.ts)', () => {
  it('[REQ-AUTH-001] el registro responde 201 con SessionView y la cookie argos_session HttpOnly, SameSite=Strict, Path=/ y Max-Age de 7 días', async () => {
    api = await createApi();
    const r = await api.call('POST', '/api/auth/register', { body: { username: '  Nueva.Usuaria ', displayName: 'Nueva', password: 'Clave2026x' } });
    expect([r.status, (r.json as { user: { username: string } }).user.username, (r.json as { expiresAt: string }).expiresAt, r.setCookie]).toEqual([
      201,
      'nueva.usuaria',
      '2026-11-12T12:00:00.000Z',
      'argos_session=token-0001; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict',
    ]);
  });

  it('[REQ-AUTH-001] EDGE-010 y EDGE-011: username repetido tras normalizar → 409 y contraseña débil → 422, sin cookie', async () => {
    api = await createApi();
    const taken = await api.call('POST', '/api/auth/register', { body: { username: 'ANDRES', displayName: 'Otro', password: 'Clave2026x' } });
    const weak = await api.call('POST', '/api/auth/register', { body: { username: 'nuevo', displayName: 'Nuevo', password: 'abcdefgh' } });
    expect([problemOf(taken), problemOf(weak), taken.setCookie, weak.setCookie]).toEqual([
      { status: 409, code: 'ERR-AUTH-USERNAME-TAKEN' },
      { status: 422, code: 'ERR-AUTH-WEAK-PASSWORD' },
      null,
      null,
    ]);
  });

  it('[REQ-AUTH-002] login correcto → 200 y cookie; usuario inexistente y contraseña errónea → mismo 401 genérico (EDGE-012)', async () => {
    api = await createApi();
    const ok = await api.call('POST', '/api/auth/login', { body: { username: ' Andres ', password: 'Argos2026a' } });
    const wrong = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: 'wrong-1234' } });
    const ghost = await api.call('POST', '/api/auth/login', { body: { username: 'nadie.x', password: 'wrong-1234' } });
    const strip = (r: typeof wrong) => ({ ...(r.json as object), instance: null });
    expect([ok.status, ok.cookie, problemOf(wrong), strip(wrong)]).toEqual([200, 'argos_session=token-0001', { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' }, strip(ghost)]);
  });

  it('[REQ-AUTH-002] EDGE-013: el 6.º intento en 15 minutos → 429 aunque la contraseña sea correcta', async () => {
    api = await createApi();
    for (let i = 0; i < 5; i += 1) await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: 'wrong-1234' } });
    const blocked = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: 'Argos2026a' } });
    expect(problemOf(blocked)).toEqual({ status: 429, code: 'ERR-AUTH-TOO-MANY-ATTEMPTS' });
  });

  it('[REQ-AUTH-003] D-04: logout responde 204 y borra la cookie con sesión, sin sesión y con una cookie ya revocada', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const withSession = await api.call('POST', '/api/auth/logout', { cookie });
    const again = await api.call('POST', '/api/auth/logout', { cookie });
    const anonymous = await api.call('POST', '/api/auth/logout');
    const me = await api.call('GET', '/api/auth/me', { cookie });
    expect([withSession.status, withSession.setCookie, again.status, anonymous.status, problemOf(me)]).toEqual([
      204,
      'argos_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
      204,
      204,
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[REQ-AUTH-004] /auth/me devuelve la sesión vigente; sin cookie, con token desconocido o con la sesión expirada (7 días, EDGE-014) → 401', async () => {
    api = await createApi();
    const cookie = await api.login('maria.v');
    const me = await api.call('GET', '/api/auth/me', { cookie });
    const none = await api.call('GET', '/api/auth/me');
    const unknown = await api.call('GET', '/api/auth/me', { cookie: 'argos_session=desconocido' });
    api.clock.setClock('2026-11-12', '2026-11-12T12:00:00.000Z');
    const expired = await api.call('GET', '/api/auth/me', { cookie });
    expect([me.status, (me.json as { user: { username: string } }).user.username, problemOf(none), problemOf(unknown), problemOf(expired)]).toEqual([
      200,
      'maria.v',
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[REQ-AUTH-001] la cookie lleva Secure cuando COOKIE_SECURE es true', async () => {
    api = await createApi(undefined, { cookieSecure: true });
    const r = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: 'Argos2026a' } });
    expect(r.setCookie).toBe('argos_session=token-0001; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict');
  });
});
