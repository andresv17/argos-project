import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1613 (Feature 012, Bloque A, #22): migración SQLite 0033 (`pets.ownership_version`, `pet_co_owners`, `owner_requests`, `pet_assignments.assigned_by_user_id` NULLable con FK SET NULL).
 * La paridad estática con PostgreSQL 0029 vive en `schema-parity.spec.ts`.
 *
 * @implements REQ-OWN12-001, REQ-OWN12-007, NFR-012-006, NFR-012-008, INV-CHP12-005
 */
const MIGRATION = '0033_co_ownership.sql';
const NOW = '2026-11-26T10:00:00.000Z';
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const P1 = '00000000-0000-4000-8000-0000000000a1';
const H1 = '00000000-0000-4000-8000-0000000000b1';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function previousDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-coown-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  return { db, migrationsDir };
}
const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(db, migrationsDir);
};
const seedUsers = (db: SqliteDatabase): void => {
  for (const [id, name] of [[U1, 'ana'], [U2, 'beto']] as const) db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, 'x', '{}')").run(id, name);
  db.prepare("INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, '{}')").run(P1, U1);
};
const request = (db: SqliteDatabase, id: string, fields: Record<string, string | number | null> = {}): void => {
  const row = { id, action: 'DELETE_PET', pet_id: P1, pet_version: 1, requester_user_id: U1, status: 'PENDING', created_at: NOW, expires_at: NOW, ...fields };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO owner_requests (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row));
};
const coOwner = (db: SqliteDatabase, id: string, fields: Record<string, string | number | null> = {}): void => {
  const row = { id, pet_id: P1, user_id: U2, status: 'INVITED', invited_by_user_id: U1, invited_at: NOW, expires_at: NOW, ...fields };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO pet_co_owners (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row));
};

describe('T1613 [REQ-OWN12-001] la migración SQLite 0033 (co-propiedad)', () => {
  it('se aplica sola sobre la base previa, es la última y deja las mascotas existentes con ownership_version = 1 y sin co-propietarios', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-7)).toBe(MIGRATION); // posteriores: 0039 (T1652, modo cuidador), 0038 (H-01), 0037 (T1648), 0036 (T1633), 0035 (ámbitos), 0034 (auditoría)
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
    expect(db.prepare('SELECT ownership_version, owner_user_id FROM pets').get()).toEqual({ ownership_version: 1, owner_user_id: U1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM pet_co_owners').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM owner_requests').get()).toEqual({ n: 0 });
    expect(() => db.prepare('UPDATE pets SET ownership_version = 0').run()).toThrow(/CHECK/);
  });

  it('[REQ-OWN12-007] pet_assignments conserva sus filas, rellena con el propietario el ID huérfano y pasa a FK SET NULL', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    db.prepare("INSERT INTO households (id, owner_user_id, data) VALUES (?, ?, '{}')").run(H1, U1);
    db.prepare('INSERT INTO pet_assignments (pet_id, household_id, assigned_by_user_id, assigned_at) VALUES (?, ?, ?, ?)').run(P1, H1, 'usuario-que-ya-no-existe', NOW);
    upgrade(db, migrationsDir);
    expect(db.prepare('SELECT pet_id, household_id, assigned_by_user_id, assigned_at FROM pet_assignments').all()).toEqual([{ pet_id: P1, household_id: H1, assigned_by_user_id: U1, assigned_at: NOW }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'pet_assignments_household_id'").all()).toHaveLength(1);
    db.prepare('UPDATE pet_assignments SET assigned_by_user_id = ?').run(U2);
    db.prepare('DELETE FROM users WHERE id = ?').run(U2);
    expect(db.prepare('SELECT assigned_by_user_id FROM pet_assignments').get()).toEqual({ assigned_by_user_id: null });
    expect(() => db.prepare('UPDATE pet_assignments SET assigned_by_user_id = ?').run('inexistente')).toThrow(/FOREIGN KEY/);
  });

  it('[STATE-COOWN12-001] pet_co_owners: estados cerrados, UNIQUE parcial (pet, usuario) solo para INVITED/ACTIVE, ACTIVE exige joined_at y promotion_kind solo con PROMOTED', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    upgrade(db, migrationsDir);
    expect(() => coOwner(db, ID(1), { status: 'BORRADO' })).toThrow(/CHECK/);
    coOwner(db, ID(1));
    expect(() => coOwner(db, ID(2), { status: 'ACTIVE', joined_at: NOW })).toThrow(/UNIQUE/);
    db.prepare("UPDATE pet_co_owners SET status = 'DECLINED' WHERE id = ?").run(ID(1));
    coOwner(db, ID(2), { status: 'ACTIVE', joined_at: NOW });
    expect(() => coOwner(db, ID(3), { user_id: U1, status: 'ACTIVE' })).toThrow(/CHECK/);
    expect(() => coOwner(db, ID(4), { user_id: U1, status: 'LEFT', promotion_kind: 'AUTO' })).toThrow(/CHECK/);
    coOwner(db, ID(5), { user_id: U1, status: 'PROMOTED', joined_at: NOW, promotion_kind: 'DESIGNATED' });
  });

  it('[H-13] el borrado de la cuenta deja la fila de co-propiedad con user_id NULL; el de la mascota la arrastra', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    upgrade(db, migrationsDir);
    coOwner(db, ID(1), { status: 'ACTIVE', joined_at: NOW });
    db.prepare('DELETE FROM users WHERE id = ?').run(U2);
    expect(db.prepare('SELECT user_id, status FROM pet_co_owners').get()).toEqual({ user_id: null, status: 'ACTIVE' });
    db.prepare('DELETE FROM pets WHERE id = ?').run(P1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pet_co_owners').get()).toEqual({ n: 0 });
  });

  it('[REQ-OWN12-004] owner_requests: una solicitud PENDING viva por (mascota, acción crítica); la reclamación se ancla al chip y no a la mascota', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    upgrade(db, migrationsDir);
    request(db, ID(1));
    expect(() => request(db, ID(2))).toThrow(/UNIQUE/);
    request(db, ID(3), { action: 'TRANSFER_PRINCIPAL' });
    db.prepare("UPDATE owner_requests SET status = 'EXPIRED' WHERE id = ?").run(ID(1));
    request(db, ID(4));
    const claim = { action: 'CLAIM_CO_OWNERSHIP', requester_user_id: U2, chip_hmac: 'h'.repeat(64), chip_last4: '1234' };
    request(db, ID(5), claim);
    expect(() => request(db, ID(6), { ...claim, pet_id: null })).toThrow(/UNIQUE/);
    expect(() => request(db, ID(7), { action: 'CLAIM_CO_OWNERSHIP', requester_user_id: U1 })).toThrow(/CHECK/);
    expect(() => request(db, ID(8), { action: 'ABRIR_PUERTA' })).toThrow(/CHECK/);
    expect(() => request(db, ID(9), { status: 'STALE' })).toThrow(/CHECK/);
  });

  it('[INV-CHP12-005][N2-R1] disputas: una abierta por (usuario, chip), ancla (mascota, target) para ausencia, chip nulo en ausencia, resoluciones coherentes con el motivo y 60 días por dominio', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    upgrade(db, migrationsDir);
    const chip = { requester_user_id: U2, action: 'CHIP_DISPUTE', status: 'UNDER_REVIEW', dispute_reason: 'CHIP_APPROPRIATION', chip_hmac: 'h'.repeat(64), chip_last4: '1234', frozen_until: NOW, message: null };
    request(db, ID(1), chip);
    expect(() => request(db, ID(2), { ...chip, pet_id: null })).toThrow(/UNIQUE/);
    expect(() => request(db, ID(3), { ...chip, requester_user_id: U1, chip_hmac: null })).toThrow(/CHECK/);
    const absent = { requester_user_id: U2, action: 'CHIP_DISPUTE', status: 'UNDER_REVIEW', dispute_reason: 'CO_OWNER_ABSENT_OR_BLOCKING', target_user_id: U1 };
    request(db, ID(4), absent);
    expect(() => request(db, ID(5), { ...absent, requester_user_id: U1 })).toThrow(/UNIQUE/);
    expect(() => request(db, ID(6), { ...absent, target_user_id: U2, chip_hmac: 'h'.repeat(64) })).toThrow(/CHECK/);
    expect(() => request(db, ID(7), { ...chip, requester_user_id: U1, chip_hmac: 'x'.repeat(64), status: 'RESOLVED', resolution: 'END_CO_OWNERSHIP' })).toThrow(/CHECK/);
    expect(() => request(db, ID(8), { ...absent, target_user_id: U2, status: 'RESOLVED', resolution: 'REQUEST_CHANGE_PRINCIPAL' })).toThrow(/CHECK/);
    request(db, ID(9), { ...absent, target_user_id: U2, status: 'RESOLVED', resolution: 'END_CO_OWNERSHIP' });
    expect(() => request(db, ID(10), { resolution: 'REJECT' })).toThrow(/CHECK/);
    expect(() => request(db, ID(11), { ...absent, target_user_id: U2, status: 'RESOLVED', freeze_extended_at: NOW, frozen_until: null })).toThrow(/CHECK/);
  });

  it('[INV-CHP12-005][F-06] la mascota y las cuentas eliminadas no borran el expediente: pet_id y las columnas de usuario pasan a NULL; message, target_username_sealed y target_response se borran al decidir', () => {
    const { db, migrationsDir } = previousDatabase();
    seedUsers(db);
    upgrade(db, migrationsDir);
    request(db, ID(1), { action: 'CHIP_DISPUTE', status: 'UNDER_REVIEW', dispute_reason: 'CHIP_APPROPRIATION', chip_hmac: 'h'.repeat(64), chip_last4: '1234', requester_user_id: U2, target_user_id: U1, rejected_by: U1, target_response: 'x'.repeat(280) });
    db.prepare('DELETE FROM pets WHERE id = ?').run(P1);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(U1, U2);
    expect(db.prepare('SELECT pet_id, requester_user_id, target_user_id, rejected_by, status FROM owner_requests').get()).toEqual({ pet_id: null, requester_user_id: null, target_user_id: null, rejected_by: null, status: 'UNDER_REVIEW' });
    expect(() => db.prepare("UPDATE owner_requests SET status = 'RESOLVED'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE owner_requests SET target_response = ?").run('x'.repeat(281))).toThrow(/CHECK/);
    db.prepare("UPDATE owner_requests SET status = 'RESOLVED', target_response = NULL").run();
    expect(() => db.prepare("UPDATE owner_requests SET message = 'hola'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE owner_requests SET target_username_sealed = 'beto'").run()).toThrow(/CHECK/);
  });
});
