import { afterEach, describe, expect, it } from 'vitest';
import { ANA, BRUNO, DIEGO, ELENA, HOUSEHOLD_ELENA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, USERNAMES } from '../../fixtures/identity-fixtures.ts';
import { auditRows, auditText, hmacHex } from '../../fixtures/audit-fixtures.ts';
import { NEW_PET } from './api-fixtures.ts';
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

/**
 * T256 (fase ROJA): seudonimización de la auditoría al eliminar la cuenta (REQ-AUD-001, INV-AUD-001, SC-014, N-1, N-A).
 * Causa roja esperada: la tabla audit_log aún no existe ("no such table: audit_log"); el HMAC lo calcula el oráculo de
 * tests/fixtures/audit-fixtures.ts con el secreto de pruebas del contrato.
 */
describe('seudonimización de la auditoría al eliminar la cuenta (REQ-AUD-001, SC-014, STATE-ACCOUNT-DELETE-001)', () => {
  const HEX64 = /^[0-9a-f]{64}$/;
  const deleteAs = async (username: string, userId: string) => {
    const cookie = await api.login(username);
    const token = await api.issueConfirmationToken(userId);
    return del(cookie, body({ password: IDENTITY_PASSWORDS[username], backupConfirmationToken: token }));
  };

  it('[REQ-AUD-001][SC-014] la fila ACCOUNT_DELETE guarda executorUserId y entityId iguales al HMAC-SHA256 hexadecimal del userId, y ningún userId en claro', async () => {
    api = await createIdentityApi();
    const done = await deleteAs('elena.solo', ELENA);
    const rows = auditRows(api.db).filter((r) => r.mutation_type === 'ACCOUNT_DELETE');
    expect(done.status).toBe(204);
    expect(rows).toHaveLength(1);
    expect([rows[0]!.executor_user_id, rows[0]!.entity_id, rows[0]!.entity_type, rows[0]!.new_state_hash]).toEqual([hmacHex(ELENA), hmacHex(ELENA), 'USER', null]);
    expect([HEX64.test(rows[0]!.executor_user_id), HEX64.test(rows[0]!.entity_id), rows[0]!.timestamp]).toEqual([true, true, api.deps.clock.nowIsoTimestamp()]);
  });

  it('[REQ-AUD-001][SC-014] cero apariciones del userId eliminado en audit_log y en el volcado completo de la base, y el HMAC del mismo usuario es siempre el mismo (determinista) y distinto al de otro usuario', async () => {
    api = await createIdentityApi();
    await deleteAs('elena.solo', ELENA);
    const everything = api.dump() + auditText(api.db);
    expect([everything.includes(ELENA), auditText(api.db).includes(ELENA), auditText(api.db).includes(hmacHex(ELENA))]).toEqual([false, false, true]);
    expect(hmacHex(ELENA)).toBe(hmacHex(ELENA));
    expect(hmacHex(ELENA)).not.toBe(hmacHex(DIEGO));
  });

  it('[REQ-AUD-001][SC-014] el historial previo del usuario eliminado se seudonimiza en todas sus filas (solo executorUserId, y entityId de filas USER); las filas de otras personas conservan su userId', async () => {
    api = await createIdentityApi();
    const bruno = await api.login('bruno.admin');
    const ana = await api.login('ana.duena');
    const pet = ((await api.call('POST', '/api/pets', { cookie: bruno, body: NEW_PET })).json as { id: string }).id;
    await api.call('PATCH', '/api/account/profile', { cookie: bruno, body: { displayName: 'Bruno B.' } });
    await api.call('POST', '/api/pets', { cookie: ana, body: { ...NEW_PET, name: 'Mora' } });
    const antes = auditRows(api.db);
    expect(antes.filter((r) => r.executor_user_id === BRUNO).length).toBeGreaterThanOrEqual(2);
    const done = await deleteAs('bruno.admin', BRUNO);
    const rows = auditRows(api.db);
    expect(done.status).toBe(204);
    expect(rows.filter((r) => r.executor_user_id === BRUNO || r.entity_id === BRUNO)).toEqual([]);
    expect(rows.filter((r) => r.executor_user_id === hmacHex(BRUNO)).length).toBe(antes.filter((r) => r.executor_user_id === BRUNO).length + 1);
    expect(rows.filter((r) => r.entity_type === 'PET' && r.entity_id === pet).map((r) => r.executor_user_id)).toEqual([hmacHex(BRUNO)]);
    expect(rows.filter((r) => r.executor_user_id === ANA).length).toBe(antes.filter((r) => r.executor_user_id === ANA).length);
    expect(auditText(api.db).includes(BRUNO)).toBe(false);
  });

  it('[REQ-AUD-001][SC-014] las filas USER del eliminado con entityId = userId cambian ese entityId por el HMAC; los hashes de estado y las demás columnas no cambian', async () => {
    api = await createIdentityApi();
    const bruno = await api.login('bruno.admin');
    await api.call('PATCH', '/api/account/profile', { cookie: bruno, body: { displayName: 'Bruno B.' } });
    const userRowsBefore = auditRows(api.db).filter((r) => r.entity_type === 'USER' && r.entity_id === BRUNO);
    expect(userRowsBefore.length).toBeGreaterThanOrEqual(1);
    await deleteAs('bruno.admin', BRUNO);
    const rows = auditRows(api.db);
    for (const before of userRowsBefore) {
      const after = rows.find((r) => r.id === before.id)!;
      expect({ ...after }).toEqual({ ...before, executor_user_id: hmacHex(BRUNO), entity_id: hmacHex(BRUNO) });
    }
  });

  it('[REQ-ACC-002][SC-014] un intento rechazado (contraseña incorrecta o token ajeno) no escribe ninguna fila ni seudonimiza nada', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const wrong = await del(cookie, body({ password: 'mal-password', backupConfirmationToken: token }));
    const alien = await del(cookie, body({ backupConfirmationToken: await api.issueConfirmationToken(DIEGO) }));
    expect([problemOf(wrong).status, problemOf(alien).status, auditRows(api.db)]).toEqual([401, 409, []]);
  });
});
