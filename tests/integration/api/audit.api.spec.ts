import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, MARIA } from '../../fixtures/application-harness.ts';
import { AUDIT_HMAC_VECTORS, AUDIT_SECRET_HEX, auditRows, auditText, hmacHex, insertAuditRow, type AuditRow } from '../../fixtures/audit-fixtures.ts';
import { ELENA, IDENTITY_PASSWORDS } from '../../fixtures/identity-fixtures.ts';
import { ARGOS_ID, NEW_PET, RECORD_INPUTS } from './api-fixtures.ts';
import { createApi, createIdentityApi, problemOf, type Api } from './api-harness.ts';

/**
 * T254 (fase ROJA) — auditoría por HTTP sobre la API real y SQLite (REQ-AUD-001, INV-AUD-001, SC-012, ERR-INTERNAL-UNEXPECTED).
 * Se lee la tabla `audit_log` (data-model §2.12) con SQL directo: no existe endpoint de lectura para usuarios.
 * Causa roja esperada: la tabla audit_log aún no existe ("no such table: audit_log") y el mantenimiento (T266) tampoco.
 * Contrato supuesto del mantenimiento (T266): módulo src/application/use-cases/maintenance-use-cases.ts con
 * `runMaintenance(deps)` que devuelve solo conteos; el de auditoría se llama `auditRowsPurged`.
 */
let api: Api;
afterEach(async () => api?.close());

const HEX64 = /^[0-9a-f]{64}$/;
const idOf = (json: unknown) => (json as { id: string }).id;
const householdIdOf = (json: unknown) => (json as { household: { id: string } }).household.id;
const count = (db: Api['db'], where = '1 = 1', ...params: unknown[]) => db.prepare(`SELECT COUNT(*) FROM audit_log WHERE ${where}`).pluck().get(...params) as number;
const MAINTENANCE_MODULE = '../../../src/application/use-cases/maintenance-use-cases.ts';

async function newHousehold(cookie: string, name: string): Promise<string> {
  return householdIdOf((await api.call('POST', '/api/households', { cookie, body: { name } })).json);
}
async function inviteAndAccept(hid: string, ownerCookie: string, username: string, roleOnJoin: string): Promise<void> {
  await api.call('POST', `/api/households/${hid}/invitations`, { cookie: ownerCookie, body: { username, roleOnJoin } });
  await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
}

describe('una fila por operación sobre la entidad raíz (REQ-AUD-001, SC-012)', () => {
  it('[REQ-AUD-001][SC-012] crear una mascota deja exactamente 1 fila CREATE/PET con executor, timestamp del reloj, entityId de la mascota, hash anterior nulo y hash nuevo SHA-256', async () => {
    api = await createApi();
    expect(count(api.db)).toBe(0);
    const cookie = await api.login('andres');
    const created = await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
    const rows = auditRows(api.db);
    expect(created.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect({ ...rows[0]!, id: 'ID', new_state_hash: HEX64.test(rows[0]!.new_state_hash ?? '') }).toEqual({
      id: 'ID',
      timestamp: api.deps.clock.nowIsoTimestamp(),
      executor_user_id: ANDRES,
      mutation_type: 'CREATE',
      entity_type: 'PET',
      entity_id: idOf(created.json),
      previous_state_hash: null,
      new_state_hash: true,
    });
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('[REQ-AUD-001][SC-012] editar la mascota agrega 1 fila UPDATE cuyo hash anterior es el hash nuevo de la fila CREATE y cuyo hash nuevo es distinto', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const pet = idOf((await api.call('POST', '/api/pets', { cookie, body: NEW_PET })).json);
    const patched = await api.call('PATCH', `/api/pets/${pet}`, { cookie, body: { ...NEW_PET, name: 'Lucía II' } });
    const [created, updated, ...rest] = auditRows(api.db);
    expect([patched.status, rest.length, updated!.mutation_type, updated!.entity_type, updated!.entity_id, updated!.executor_user_id]).toEqual([200, 0, 'UPDATE', 'PET', pet, ANDRES]);
    expect(updated!.previous_state_hash).toBe(created!.new_state_hash);
    expect([HEX64.test(updated!.new_state_hash ?? ''), updated!.new_state_hash === updated!.previous_state_hash]).toEqual([true, false]);
  });

  it('[REQ-AUD-001][SC-012] un UPDATE que solo cambia microchipId (clave excluida de la vista pública) escribe igualmente la fila, con hashes iguales (R2)', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const pet = idOf((await api.call('POST', '/api/pets', { cookie, body: NEW_PET })).json);
    await api.call('PATCH', `/api/pets/${pet}`, { cookie, body: { ...NEW_PET, microchipId: '985112345678901' } });
    const rows = auditRows(api.db);
    expect(rows.map((r) => r.mutation_type)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]!.previous_state_hash).toBe(rows[1]!.new_state_hash);
    expect(rows[1]!.new_state_hash).toBe(rows[0]!.new_state_hash);
  });

  it('[REQ-AUD-001][SC-012] registrar un peso agrega 1 fila CREATE/WEIGHT_RECORD y borrarlo agrega 1 fila DELETE con hash nuevo nulo y hash anterior igual al de la creación', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const posted = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie, body: RECORD_INPUTS.weights });
    const recordId = (posted.json as { record: { id: string } }).record.id;
    const removed = await api.call('DELETE', `/api/pets/${ARGOS_ID}/records/weights/${recordId}`, { cookie });
    const [created, deleted, ...rest] = auditRows(api.db);
    expect([posted.status, removed.status, rest.length]).toEqual([201, 204, 0]);
    expect([created!.mutation_type, created!.entity_type, created!.entity_id, created!.previous_state_hash]).toEqual(['CREATE', 'WEIGHT_RECORD', recordId, null]);
    expect([deleted!.mutation_type, deleted!.entity_type, deleted!.entity_id, deleted!.new_state_hash, deleted!.previous_state_hash]).toEqual(['DELETE', 'WEIGHT_RECORD', recordId, null, created!.new_state_hash]);
  });

  it('[REQ-AUD-001][SC-012] eliminar una mascota con 6 colecciones de registros deja 1 sola fila DELETE/PET: los registros en cascada no generan fila propia', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const removed = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { cookie });
    const rows = auditRows(api.db);
    expect(removed.status).toBe(204);
    expect(rows.map((r) => [r.mutation_type, r.entity_type, r.entity_id, r.new_state_hash])).toEqual([['DELETE', 'PET', ARGOS_ID, null]]);
    expect(HEX64.test(rows[0]!.previous_state_hash ?? '')).toBe(true);
  });

  it('[REQ-AUD-001][SC-012] crear un hogar y asignarle una mascota deja 1 fila CREATE/HOUSEHOLD y 1 fila ASSIGN/PET_ASSIGNMENT con entityId = HMAC de "<petId>:<householdId>"', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const hid = await newHousehold(cookie, 'Casa de auditoría');
    const assigned = await api.call('PUT', `/api/pets/${ARGOS_ID}/assignments/${hid}`, { cookie });
    const rows = auditRows(api.db);
    expect(assigned.status).toBeLessThan(300);
    expect(rows.map((r) => [r.mutation_type, r.entity_type, r.entity_id])).toEqual([
      ['CREATE', 'HOUSEHOLD', hid],
      ['ASSIGN', 'PET_ASSIGNMENT', hmacHex(`${ARGOS_ID}:${hid}`)],
    ]);
  });
});

describe('transferencia con asignaciones podadas (REQ-AUD-001, REQ-OWN-001, SC-016)', () => {
  it('[REQ-AUD-001][SC-016] transferir una mascota asignada a dos hogares, uno sin el nuevo dueño: 1 fila OWNERSHIP_TRANSFER/PET + 1 fila UNASSIGN por la asignación podada; la que sobrevive no genera fila', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const pet = idOf((await api.call('POST', '/api/pets', { cookie: andres, body: NEW_PET })).json);
    const hMaria = await newHousehold(andres, 'Casa con María');
    await inviteAndAccept(hMaria, andres, 'maria.v', 'READER');
    const hLucia = await newHousehold(lucia, 'Casa de Lucía');
    await inviteAndAccept(hLucia, lucia, 'andres', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hMaria}`, { cookie: andres });
    await api.call('PUT', `/api/pets/${pet}/assignments/${hLucia}`, { cookie: andres });
    const before = count(api.db);
    const transferred = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: MARIA } });
    const added = auditRows(api.db).slice(before);
    expect(transferred.status).toBe(200);
    expect(added.map((r) => [r.mutation_type, r.entity_type, r.entity_id, r.executor_user_id])).toEqual([
      ['OWNERSHIP_TRANSFER', 'PET', pet, ANDRES],
      ['UNASSIGN', 'PET_ASSIGNMENT', hmacHex(`${pet}:${hLucia}`), ANDRES],
    ]);
    expect(added.some((r) => r.entity_id === hmacHex(`${pet}:${hMaria}`))).toBe(false);
  });

  it('[REQ-AUD-001] el entityId de PET_ASSIGNMENT es determinista: asignar, desasignar y reasignar el mismo par comparten el mismo HMAC y no aparece ningún petId ni householdId en claro como entityId', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const hid = await newHousehold(cookie, 'Casa determinista');
    await api.call('PUT', `/api/pets/${ARGOS_ID}/assignments/${hid}`, { cookie });
    await api.call('DELETE', `/api/pets/${ARGOS_ID}/assignments/${hid}`, { cookie });
    await api.call('PUT', `/api/pets/${ARGOS_ID}/assignments/${hid}`, { cookie });
    const assignmentRows = auditRows(api.db).filter((r) => r.entity_type === 'PET_ASSIGNMENT');
    expect(assignmentRows.map((r) => [r.mutation_type, r.entity_id])).toEqual([
      ['ASSIGN', hmacHex(`${ARGOS_ID}:${hid}`)],
      ['UNASSIGN', hmacHex(`${ARGOS_ID}:${hid}`)],
      ['ASSIGN', hmacHex(`${ARGOS_ID}:${hid}`)],
    ]);
  });
});

describe('eliminación de cuenta: una fila ACCOUNT_DELETE y nada en cascada (REQ-AUD-001, REQ-ACC-002)', () => {
  it('[REQ-AUD-001][REQ-ACC-002][SC-012] eliminar a Elena (hogar propio y mascota Luna con registros) agrega 1 sola fila ACCOUNT_DELETE/USER; mascotas, registros, hogar, sesiones y token no generan fila', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const before = count(api.db);
    const done = await api.call('POST', '/api/account/deletion', { cookie, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    const added = auditRows(api.db).slice(before);
    expect(done.status).toBe(204);
    expect(added.map((r) => [r.mutation_type, r.entity_type, r.entity_id, r.executor_user_id, r.new_state_hash])).toEqual([
      ['ACCOUNT_DELETE', 'USER', hmacHex(ELENA), hmacHex(ELENA), null],
    ]);
  });
});

describe('sin fila cuando la mutación no termina con éxito (REQ-AUD-001, US6 AC2)', () => {
  it('[REQ-AUD-001][SC-012] una validación fallida (422), un permiso denegado (403) y un recurso ajeno (404) no dejan ninguna fila; los inicios de sesión tampoco se auditan', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    const invalid = await api.call('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: '' } });
    const forbidden = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie: maria, body: RECORD_INPUTS.weights });
    const hidden = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { cookie: await api.login('lucia.r') });
    expect([invalid.status, forbidden.status, hidden.status]).toEqual([422, 403, 404]);
    expect(count(api.db)).toBe(0);
  });
});

describe('escritura en la misma transacción que la mutación (REQ-AUD-001, ERR-INTERNAL-UNEXPECTED)', () => {
  it('[REQ-AUD-001][ERR-INTERNAL-UNEXPECTED] si la inserción en audit_log falla, la mutación se revierte: 500, ninguna mascota nueva y base idéntica', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = api.dump();
    api.db.exec("CREATE TEMP TRIGGER falla_auditoria BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'auditoria inyectada'); END");
    const failed = await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
    expect([problemOf(failed), api.dump() === before, count(api.db)]).toEqual([{ status: 500, code: 'ERR-INTERNAL-UNEXPECTED' }, true, 0]);
    expect(failed.text).not.toContain('auditoria inyectada');
  });

  it('[REQ-AUD-001][ERR-INTERNAL-UNEXPECTED] si la mutación falla después de preparar la auditoría, no queda fila huérfana: 500, 0 filas y base idéntica', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = api.dump();
    api.db.exec("CREATE TEMP TRIGGER falla_peso BEFORE INSERT ON weights BEGIN SELECT RAISE(ABORT, 'peso inyectado'); END");
    const failed = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie, body: RECORD_INPUTS.weights });
    expect([problemOf(failed), api.dump() === before, count(api.db)]).toEqual([{ status: 500, code: 'ERR-INTERNAL-UNEXPECTED' }, true, 0]);
  });

  it('[REQ-AUD-001][ERR-INTERNAL-UNEXPECTED] si la inserción de audit_log falla al eliminar una cuenta, la cuenta y sus datos siguen intactos y el token vigente', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('elena.solo');
    const token = await api.issueConfirmationToken(ELENA);
    const before = api.dump();
    api.db.exec("CREATE TEMP TRIGGER falla_auditoria BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'auditoria inyectada'); END");
    const failed = await api.call('POST', '/api/account/deletion', { cookie, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    expect([problemOf(failed), api.dump() === before, count(api.db)]).toEqual([{ status: 500, code: 'ERR-INTERNAL-UNEXPECTED' }, true, 0]);
  });
});

describe('sin secretos en la auditoría (INV-AUD-001)', () => {
  it('[INV-AUD-001] tras iniciar sesión y mutar datos, audit_log no contiene contraseñas, hashes de contraseña, tokens, cookies ni el secreto HMAC', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const pet = idOf((await api.call('POST', '/api/pets', { cookie, body: NEW_PET })).json);
    await api.call('PATCH', `/api/pets/${pet}`, { cookie, body: { ...NEW_PET, notes: 'Contraseña-Nueva-123!' } });
    const text = auditText(api.db);
    const columns = (api.db.prepare('PRAGMA table_info(audit_log)').all() as Array<{ name: string }>).map((c) => c.name).sort();
    expect(columns).toEqual(['entity_id', 'entity_type', 'executor_user_id', 'id', 'mutation_type', 'new_state_hash', 'previous_state_hash', 'timestamp']);
    expect([cookie.split('=')[1]!, 'argos_session', 'password', 'token', 'cookie', AUDIT_SECRET_HEX, 'Contraseña-Nueva-123!'].map((s) => text.includes(s))).toEqual([false, false, false, false, false, false, false]);
  });

  it('[INV-AUD-001][REQ-AUD-001] audit_log no tiene claves foráneas ni a users ni a ninguna otra tabla (R1)', async () => {
    api = await createApi();
    expect(api.db.prepare('PRAGMA foreign_key_list(audit_log)').all()).toEqual([]);
  });

  it('[REQ-AUD-001] el vector HMAC del contrato (userId de Diego) coincide con el oráculo de la prueba, para que los demás casos usen un HMAC verificado', () => {
    const vector = AUDIT_HMAC_VECTORS[0]!;
    expect([vector.message, hmacHex(vector.message)]).toEqual(['a0000000-0000-4000-8000-000000000004', 'd8025dd34f4d142c5e1132056755801e0cc8f9d7711c1efb0e65e381f9125337']);
    expect(hmacHex(AUDIT_HMAC_VECTORS[1]!.message)).toBe(AUDIT_HMAC_VECTORS[1]!.hmac);
  });
});

describe('retención de 24 meses con purga que registra solo un conteo (REQ-AUD-001, ADR-002-14)', () => {
  const row = (n: number, timestamp: string): AuditRow => ({
    id: `10000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    timestamp,
    executor_user_id: ANDRES,
    mutation_type: 'UPDATE',
    entity_type: 'PET',
    entity_id: ARGOS_ID,
    previous_state_hash: 'a'.repeat(64),
    new_state_hash: 'b'.repeat(64),
  });

  it('[REQ-AUD-001] el mantenimiento borra las filas con más de 24 meses (relojes 2026-11-05: filas de 2024-11-01 y 2023-01-15) y conserva las de 2024-11-12, 2025-06-01 y 2026-11-04', async () => {
    api = await createApi();
    const rows = [row(1, '2023-01-15T08:00:00.000Z'), row(2, '2024-11-01T08:00:00.000Z'), row(3, '2024-11-12T08:00:00.000Z'), row(4, '2025-06-01T08:00:00.000Z'), row(5, '2026-11-04T08:00:00.000Z')];
    for (const r of rows) insertAuditRow(api.db, r);
    const { runMaintenance } = (await import(/* @vite-ignore */ MAINTENANCE_MODULE)) as { runMaintenance: (deps: Api['deps']) => Promise<Record<string, number>> };
    const result = await runMaintenance(api.deps);
    expect(result['auditRowsPurged']).toBe(2);
    expect(auditRows(api.db).map((r) => r.id)).toEqual(rows.slice(2).map((r) => r.id));
  });

  it('[REQ-AUD-001][INV-AUD-001] la purga no genera fila de auditoría y su resultado contiene solo conteos numéricos, sin identificadores ni hashes de las filas borradas', async () => {
    api = await createApi();
    insertAuditRow(api.db, row(1, '2023-01-15T08:00:00.000Z'));
    insertAuditRow(api.db, row(2, '2026-11-04T08:00:00.000Z'));
    const { runMaintenance } = (await import(/* @vite-ignore */ MAINTENANCE_MODULE)) as { runMaintenance: (deps: Api['deps']) => Promise<Record<string, unknown>> };
    const result = await runMaintenance(api.deps);
    expect(count(api.db)).toBe(1);
    expect(Object.values(result).every((v) => typeof v === 'number')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/10000000-0000-4000|a{64}|b{64}|a0000000/);
  });
});
