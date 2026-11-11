import { afterEach, describe, expect, it } from 'vitest';
import { ANA, BRUNO, DIEGO, ELENA, HOUSEHOLD_ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, USERNAMES } from '../../fixtures/identity-fixtures.ts';
import { createIdentityApi, problemOf, type Api } from './api-harness.ts';

/** T211 (HTTP): POST /api/account/deletion sobre la API real y SQLite (REQ-ACC-002, STATE-ACCOUNT-DELETE-001, SC-014). */
let api: Api;
afterEach(async () => api.close());

const PHRASE = 'ELIMINAR MI CUENTA';
const MINUTE = 60_000;
const UNAUTHENTICATED = { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' };
const MISMATCH = { status: 409, code: 'ERR-ACCOUNT-CONFIRMATION-MISMATCH' };
const body = (overrides: Record<string, unknown> = {}) => ({ confirmationPhrase: PHRASE, password: IDENTITY_PASSWORDS['elena.solo'], ...overrides });
const del = (cookie: string | null, payload: unknown) => api.call('POST', '/api/account/deletion', { ...(cookie === null ? {} : { cookie }), body: payload });

describe('eliminación de cuenta por HTTP, fase A (sin escrituras)', () => {
  it('[REQ-ACC-002][INV-AUTH-007][ERR-AUTH-UNAUTHENTICATED] sin cabecera CSRF → 403 y sin sesión → 401, antes de leer el cuerpo', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const noCsrf = await api.call('POST', '/api/account/deletion', { cookie, body: body({ backupConfirmationToken: token }), csrf: false, contract: false });
    const noSession = await del(null, body({ backupConfirmationToken: token }));
    expect([noCsrf.status, problemOf(noSession)]).toEqual([403, UNAUTHENTICATED]);
  });

  it('[REQ-ACC-002][SC-014][ERR-SCHEMA-VALIDATION-FAILED] sin frase literal o sin contraseña → 422 y la base queda igual', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const before = api.dump();
    const cases = [
      body({ confirmationPhrase: 'eliminar mi cuenta', backupConfirmationToken: token }),
      body({ confirmationPhrase: undefined, backupConfirmationToken: token }),
      body({ password: undefined, backupConfirmationToken: token }),
      body({ password: '', backupConfirmationToken: token }),
    ];
    const results = [];
    for (const payload of cases) results.push(problemOf(await del(cookie, payload)));
    expect(results).toEqual(Array(4).fill({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }));
    expect(api.dump()).toBe(before);
  });

  it('[REQ-ACC-002][SC-014][ERR-AUTH-INVALID-CREDENTIALS][ERR-AUTH-TOO-MANY-ATTEMPTS] contraseña incorrecta → 401 sin borrar nada y, tras 5 fallos, 429 aunque luego sea correcta', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const before = api.dump();
    for (let i = 0; i < 5; i += 1) {
      expect(problemOf(await del(cookie, body({ password: `mal-${i}`, backupConfirmationToken: token })))).toEqual({ status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' });
    }
    const blocked = await del(cookie, body({ backupConfirmationToken: token }));
    expect(problemOf(blocked)).toEqual({ status: 429, code: 'ERR-AUTH-TOO-MANY-ATTEMPTS' });
    const tables = (dump: string) => JSON.parse(dump).filter(([table]: [string]) => table !== 'login_attempts');
    expect(tables(api.dump())).toEqual(tables(before));
  });

  it('[REQ-ACC-002][SC-014][ERR-ACCOUNT-CONFIRMATION-MISMATCH] token ausente, mal formado, ajeno o caducado → 409 (nunca 422) y la cuenta sigue intacta', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const own = await api.issueConfirmationToken(ELENA);
    const alien = await api.issueConfirmationToken(DIEGO);
    const attempts = [undefined, 'corto', `${own}x`, alien].map((backupConfirmationToken) => del(cookie, body({ backupConfirmationToken })));
    const results = [];
    for (const attempt of attempts) results.push(problemOf(await attempt));
    expect(results).toEqual(Array(4).fill(MISMATCH));
    api.clock.setClock(REFERENCE_TODAY, new Date(Date.parse(REFERENCE_NOW) + 10 * MINUTE).toISOString());
    const stale = await del(await api.login('elena.solo'), body({ backupConfirmationToken: own }));
    expect(problemOf(stale)).toEqual(MISMATCH);
    expect(api.dump().includes(ELENA)).toBe(true);
    expect(JSON.parse(api.dump()).find(([table]: [string]) => table === 'users')[1].length).toBe(6);
  });
});

describe('eliminación de cuenta por HTTP, fase B (atómica)', () => {
  it('[REQ-ACC-002][SC-014][STATE-ACCOUNT-DELETE-001] con todo correcto responde 204, expira la cookie y deja 0 filas del usuario, su hogar de un solo ACTIVE y sin sesiones', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const second = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const done = await del(cookie, body({ backupConfirmationToken: token }));
    expect([done.status, done.text, done.setCookie]).toEqual([204, '', 'argos_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict']);
    const dump = api.dump();
    for (const trace of [ELENA, USERNAMES[ELENA]!, HOUSEHOLD_ELENA.id, 'Luna']) expect(dump.includes(trace), trace).toBe(false);
    expect(dump.includes(ANA)).toBe(true);
    const me = await api.call('GET', '/api/auth/me', { cookie });
    const secondMe = await api.call('GET', '/api/auth/me', { cookie: second });
    const login = await api.call('POST', '/api/auth/login', { body: { username: 'elena.solo', password: IDENTITY_PASSWORDS['elena.solo'] } });
    expect([problemOf(me), problemOf(secondMe), problemOf(login)]).toEqual([UNAUTHENTICATED, UNAUTHENTICATED, { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' }]);
  });

  it('[REQ-ACC-002][SC-014][INV-AUTH-003] el token es de un solo uso y no sirve tras eliminar la cuenta: otra persona con ese token recibe 409', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    await del(cookie, body({ backupConfirmationToken: token }));
    const diego = await api.login('diego.lector');
    const reuse = await del(diego, body({ password: IDENTITY_PASSWORDS['diego.lector'], backupConfirmationToken: token }));
    expect(problemOf(reuse)).toEqual(MISMATCH);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD] la propietaria de un hogar con otros miembros ACTIVE recibe 409, la base no cambia y el token sigue vigente', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const token = await api.issueConfirmationToken(ANA);
    const before = api.dump();
    const blocked = await del(cookie, body({ password: IDENTITY_PASSWORDS['ana.duena'], backupConfirmationToken: token }));
    expect([problemOf(blocked), api.dump() === before]).toEqual([{ status: 409, code: 'ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD' }, true]);
    const bruno = await api.login('bruno.admin');
    const left = await api.call('DELETE', `/api/households/c0000000-0000-4000-8000-000000000001/members/${BRUNO}`, { cookie: bruno, contract: false });
    expect(left.status).toBe(204);
    const retry = await del(cookie, body({ password: IDENTITY_PASSWORDS['ana.duena'], backupConfirmationToken: token }));
    expect(retry.status).toBe(204);
  });

  it('[REQ-ACC-002][STATE-ACCOUNT-DELETE-001][ERR-INTERNAL-UNEXPECTED] una falla de SQLite a mitad de la fase B revierte todo: 500, base idéntica byte a byte y token todavía vigente', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    api.db.exec("CREATE TEMP TRIGGER falla_al_borrar_usuario BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'fallo inyectado'); END");
    const before = api.dump();
    const failed = await api.call('POST', '/api/account/deletion', { cookie, body: body({ backupConfirmationToken: token }) });
    expect([problemOf(failed), api.dump() === before]).toEqual([{ status: 500, code: 'ERR-INTERNAL-UNEXPECTED' }, true]);
    expect(failed.text).not.toContain('fallo inyectado');
    api.db.exec('DROP TRIGGER falla_al_borrar_usuario');
    const retry = await del(cookie, body({ backupConfirmationToken: token }));
    expect(retry.status).toBe(204);
  });

  it('[REQ-ACC-002][SC-014] un miembro sin hogar propio elimina su cuenta y el hogar compartido y las mascotas de la propietaria siguen intactos', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('bruno.admin');
    const token = await api.issueConfirmationToken(BRUNO);
    const done = await del(cookie, body({ password: IDENTITY_PASSWORDS['bruno.admin'], backupConfirmationToken: token }));
    const dump = api.dump();
    expect([done.status, dump.includes(BRUNO), dump.includes('Casa de Ana'), dump.includes('Toby')]).toEqual([204, false, true, true]);
  });
});
