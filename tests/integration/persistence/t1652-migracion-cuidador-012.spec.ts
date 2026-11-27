import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1652 (Feature 012, Bloque C, #26): migraciones SQLite 0039 y PostgreSQL 0035 (`care_routines`, `care_log_entries`, `pet_caregiver_access`).
 * Comprueba CHECK, UNIQUE parcial de serie + fecha + hora (A-05), FK y cascadas en SQLite; en PostgreSQL real (TEST_DATABASE_URL) los mismos CHECK y UNIQUE.
 * La paridad estática de columnas, tipos, CHECK e índices vive en `schema-parity.spec.ts`.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007
 */
const NOW = '2026-11-27T10:00:00.000Z';
const U1 = '00000000-0000-4000-8000-0000000000a1';
const U2 = '00000000-0000-4000-8000-0000000000a2';
const P1 = '00000000-0000-4000-8000-0000000000b1';
const R1 = '00000000-0000-4000-8000-0000000000c1';
const R2 = '00000000-0000-4000-8000-0000000000c2';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ROUTINE_COLS = 'id, series_id, pet_id, kind, title, instructions, dose_amount, dose_unit, times_of_day, days_of_week, start_date, end_date, ongoing, effective_from, effective_to, created_by_user_id, created_at, updated_at';
type Row = [string, string, string, string, string, string, number | null, string | null, string, string, string, string | null, number, string, string | null, string | null, string, string];
const routine = (over: Partial<Record<number, unknown>> = {}): unknown[] => {
  const base: Row = [R1, R1, P1, 'MEDICATION', 'Amoxicilina', '', 1.5, 'TABLET', '["08:00","20:00"]', '[1,2,3,4,5,6,7]', '2026-11-27', '2026-12-05', 0, NOW, null, U1, NOW, NOW];
  const row: unknown[] = [...base];
  for (const [k, v] of Object.entries(over)) row[Number(k)] = v;
  return row;
};
const IDX = { id: 0, kind: 3, title: 4, instr: 5, amount: 6, unit: 7, times: 8, days: 9, end: 11, ongoing: 12, effTo: 14 };

function seed(db: ReturnType<typeof openSqliteDatabase>): void {
  for (const [id, name] of [[U1, 'ana'], [U2, 'beto']] as const) db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, 'x', '{}')").run(id, name);
  db.prepare("INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, '{}')").run(P1, U1);
}
const insertRoutine = (db: ReturnType<typeof openSqliteDatabase>, row: unknown[]): void => {
  db.prepare(`INSERT INTO care_routines (${ROUTINE_COLS}) VALUES (${row.map(() => '?').join(',')})`).run(...row);
};
const insertLog = (db: ReturnType<typeof openSqliteDatabase>, id: string, routineId: string, seriesId: string, time: string, reverted: string | null = null): void => {
  db.prepare('INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, performed_at, performed_by_user_id, reverted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, routineId, seriesId, '2026-11-27', time, 'DONE', NOW, U1, reverted);
};

describe('T1652 [REQ-CAR12-001][REQ-CAR12-007] care_routines (SQLite 0039)', () => {
  it('acepta una rutina válida y rechaza kind, unidad (UNIT retirada), dosis, título y arreglos fuera de catálogo', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    insertRoutine(db, routine());
    insertRoutine(db, routine({ [IDX.id]: R2, [IDX.unit]: 'IU' }));
    const bad = (over: Partial<Record<number, unknown>>): void => expect(() => insertRoutine(db, routine({ [IDX.id]: ID(90), ...over }))).toThrow(/CHECK constraint failed/);
    bad({ [IDX.kind]: 'BATH' });
    bad({ [IDX.unit]: 'UNIT' });
    bad({ [IDX.amount]: 0 });
    bad({ [IDX.amount]: 100001 });
    bad({ [IDX.amount]: null }); // unidad sin dosis, y MEDICATION exige dosis
    bad({ [IDX.title]: '' });
    bad({ [IDX.title]: 'x'.repeat(61) });
    bad({ [IDX.instr]: 'x'.repeat(301) });
    bad({ [IDX.times]: 'no es arreglo' });
    bad({ [IDX.days]: '1' });
    bad({ [IDX.ongoing]: 2 });
    bad({ [IDX.end]: '2026-11-01' }); // end_date < start_date
    bad({ [IDX.effTo]: '2026-11-01T00:00:00.000Z' }); // effective_to < effective_from
    db.close();
  });

  it('MEDICATION: end_date XOR ongoing (ni ambos ni ninguno); MEAL no lo exige y la dosis es opcional', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    insertRoutine(db, routine({ [IDX.id]: ID(1), [IDX.end]: null, [IDX.ongoing]: 1 }));
    expect(() => insertRoutine(db, routine({ [IDX.id]: ID(2), [IDX.end]: '2026-12-01', [IDX.ongoing]: 1 }))).toThrow(/CHECK constraint failed/);
    expect(() => insertRoutine(db, routine({ [IDX.id]: ID(3), [IDX.end]: null, [IDX.ongoing]: 0 }))).toThrow(/CHECK constraint failed/);
    insertRoutine(db, routine({ [IDX.id]: ID(4), [IDX.kind]: 'MEAL', [IDX.amount]: null, [IDX.unit]: null, [IDX.end]: null, [IDX.ongoing]: 0 }));
    db.close();
  });

  it('FK: pet inexistente rechazada; supersedes_routine_id apunta a otra versión; borrar la mascota cascada; borrar al autor deja created_by NULL', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    expect(() => insertRoutine(db, routine({ 2: ID(99) }))).toThrow(/FOREIGN KEY constraint failed/);
    insertRoutine(db, routine());
    insertRoutine(db, [...routine({ [IDX.id]: R2 }).slice(0, 15), U2, NOW, NOW]); // sin supersedes aún
    db.prepare('UPDATE care_routines SET supersedes_routine_id = ? WHERE id = ?').run(R1, R2);
    expect(() => db.prepare('UPDATE care_routines SET supersedes_routine_id = ? WHERE id = ?').run(ID(98), R2)).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare('DELETE FROM users WHERE id = ?').run(U2);
    expect(db.prepare('SELECT created_by_user_id FROM care_routines WHERE id = ?').pluck().get(R2)).toBeNull();
    db.close();
  });
});

describe('T1652 [REQ-CAR12-003][A-05] care_log_entries (SQLite 0039)', () => {
  it('UNIQUE parcial (series_id, fecha, hora) entre no revertidos: el segundo falla, uno revertido libera la ocurrencia, otra serie u otra hora conviven', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    insertRoutine(db, routine());
    insertRoutine(db, routine({ [IDX.id]: R2 })); // misma serie lógica R1 (otra versión)
    insertLog(db, ID(10), R1, R1, '08:00');
    expect(() => insertLog(db, ID(11), R2, R1, '08:00')).toThrow(/UNIQUE constraint failed/); // otra versión, misma serie
    insertLog(db, ID(12), R1, R1, '20:00');
    db.prepare('UPDATE care_log_entries SET reverted_at = ? WHERE id = ?').run(NOW, ID(10));
    insertLog(db, ID(13), R2, R1, '08:00');
    insertLog(db, ID(14), R1, R1, '08:00', NOW); // otro revertido a la misma ocurrencia: permitido
    db.close();
  });

  it('CHECK de estado, hora HH:MM, nota ≤ 140, motivo de reversión solo con reverted_at; sin columna idempotency_key (P-10)', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    insertRoutine(db, routine());
    expect(() => insertLog(db, ID(20), R1, R1, '8:00')).toThrow(/CHECK constraint failed/);
    expect(() => db.prepare("INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, performed_at) VALUES (?, ?, ?, '2026-11-27', '08:00', 'LATE', ?)").run(ID(21), R1, R1, NOW)).toThrow(/CHECK constraint failed/);
    expect(() => db.prepare("INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, performed_at, note) VALUES (?, ?, ?, '2026-11-27', '08:00', 'DONE', ?, ?)").run(ID(22), R1, R1, NOW, 'x'.repeat(141))).toThrow(/CHECK constraint failed/);
    expect(() => db.prepare("INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, performed_at, revert_reason) VALUES (?, ?, ?, '2026-11-27', '08:00', 'DONE', ?, 'sin reversion')").run(ID(23), R1, R1, NOW)).toThrow(/CHECK constraint failed/);
    expect(db.prepare("SELECT count(*) FROM pragma_table_info('care_log_entries') WHERE name = 'idempotency_key'").pluck().get()).toBe(0);
    db.close();
  });

  it('FK a rutina: la mascota borrada cascada a rutinas y registros; el autor borrado deja performed_by NULL y conserva el registro', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    insertRoutine(db, routine());
    insertLog(db, ID(30), R1, R1, '08:00');
    expect(() => insertLog(db, ID(31), ID(97), R1, '20:00')).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare('DELETE FROM users WHERE id = ?').run(U2);
    db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'cami', 'x', '{}')").run(ID(500));
    db.prepare('UPDATE care_log_entries SET performed_by_user_id = ? WHERE id = ?').run(ID(500), ID(30));
    db.prepare('DELETE FROM users WHERE id = ?').run(ID(500));
    expect(db.prepare('SELECT performed_by_user_id FROM care_log_entries WHERE id = ?').pluck().get(ID(30))).toBeNull();
    db.prepare('DELETE FROM pets WHERE id = ?').run(P1);
    expect(db.prepare('SELECT (SELECT count(*) FROM care_routines) + (SELECT count(*) FROM care_log_entries)').pluck().get()).toBe(0);
    db.close();
  });
});

describe('T1652 [REQ-CAR12-004][REQ-CAR12-006] pet_caregiver_access (SQLite 0039)', () => {
  it('UNIQUE (pet_id, user_id) por clave primaria, nivel cerrado, care_until de 10 caracteres y NULL, granted_by NULL al borrar al titular', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    seed(db);
    const insert = db.prepare('INSERT INTO pet_caregiver_access (pet_id, user_id, level, care_until, granted_by_user_id, granted_at) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(P1, U2, 'VIEW_ONLY', null, U1, NOW);
    expect(() => insert.run(P1, U2, 'BASIC_LOG', null, U1, NOW)).toThrow(/UNIQUE constraint failed/);
    expect(() => insert.run(P1, U1, 'ADMIN', null, U1, NOW)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run(P1, U1, 'BASIC_LOG', '27/11/2026', U1, NOW)).toThrow(/CHECK constraint failed/);
    insert.run(P1, U1, 'BASIC_LOG', '2026-12-31', U2, NOW);
    db.prepare('DELETE FROM users WHERE id = ?').run(U1);
    expect(db.prepare('SELECT count(*) FROM pet_caregiver_access WHERE user_id = ?').pluck().get(U1)).toBe(0);
    expect(db.prepare('SELECT granted_by_user_id FROM pet_caregiver_access WHERE user_id = ?').pluck().get(U2)).toBeNull();
    db.close();
  });
});

const PG_SQL = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0035_care_mode.sql', import.meta.url), 'utf8');

describe.skipIf(process.env['TEST_DATABASE_URL'] === undefined)('T1652 PostgreSQL real (TEST_DATABASE_URL): mismos CHECK y UNIQUE parcial de serie + fecha + hora', () => {
  it('aplica 0035 y rechaza lo mismo que SQLite', async () => {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env['TEST_DATABASE_URL']! });
    await client.connect();
    const schema = `t1652_${process.pid}_${Date.now()}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query('CREATE TABLE users (id TEXT PRIMARY KEY)');
      await client.query('CREATE TABLE pets (id TEXT PRIMARY KEY)');
      await client.query(PG_SQL);
      await client.query('INSERT INTO users VALUES ($1), ($2)', [U1, U2]);
      await client.query('INSERT INTO pets VALUES ($1)', [P1]);
      const ins = `INSERT INTO care_routines (${ROUTINE_COLS}) VALUES (${Array.from({ length: 18 }, (_, i) => `$${i + 1}`).join(',')})`;
      await client.query(ins, routine());
      await client.query(ins, routine({ [IDX.id]: R2, [IDX.unit]: 'IU' }));
      for (const over of [{ [IDX.kind]: 'BATH' }, { [IDX.unit]: 'UNIT' }, { [IDX.amount]: 0 }, { [IDX.amount]: null }, { [IDX.times]: 'no es arreglo' }, { [IDX.ongoing]: 2 }, { [IDX.end]: '2026-11-01' }, { [IDX.end]: '2026-12-01', [IDX.ongoing]: 1 }, { [IDX.end]: null, [IDX.ongoing]: 0 }]) {
        await expect(client.query(ins, routine({ [IDX.id]: ID(90), ...over })), JSON.stringify(over)).rejects.toThrow(/check constraint/i);
      }
      const log = 'INSERT INTO care_log_entries (id, routine_id, series_id, occurrence_date, occurrence_time, status, performed_at, performed_by_user_id, reverted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
      await client.query(log, [ID(10), R1, R1, '2026-11-27', '08:00', 'DONE', NOW, U1, null]);
      await expect(client.query(log, [ID(11), R2, R1, '2026-11-27', '08:00', 'DONE', NOW, U1, null])).rejects.toThrow(/duplicate key|unique/i);
      await expect(client.query(log, [ID(12), R1, R1, '2026-11-27', '8:00', 'DONE', NOW, U1, null])).rejects.toThrow(/check constraint/i);
      await client.query(log, [ID(13), R1, R1, '2026-11-27', '08:00', 'SKIPPED', NOW, U1, NOW]);
      await client.query('UPDATE care_log_entries SET reverted_at = $1 WHERE id = $2', [NOW, ID(10)]);
      await client.query(log, [ID(14), R2, R1, '2026-11-27', '08:00', 'DONE', NOW, U1, null]);
      const acc = 'INSERT INTO pet_caregiver_access (pet_id, user_id, level, care_until, granted_by_user_id, granted_at) VALUES ($1, $2, $3, $4, $5, $6)';
      await client.query(acc, [P1, U2, 'VIEW_ONLY', null, U1, NOW]);
      await expect(client.query(acc, [P1, U2, 'BASIC_LOG', null, U1, NOW])).rejects.toThrow(/duplicate key|unique/i);
      await expect(client.query(acc, [P1, U1, 'ADMIN', null, U1, NOW])).rejects.toThrow(/check constraint/i);
      await client.query('DELETE FROM users WHERE id = $1', [U1]);
      const { rows } = await client.query('SELECT granted_by_user_id FROM pet_caregiver_access');
      expect(rows).toEqual([{ granted_by_user_id: null }]);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  });
});
