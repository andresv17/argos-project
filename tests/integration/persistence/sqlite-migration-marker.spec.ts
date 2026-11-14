import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  IN_MEMORY_DATABASE,
  openSqliteDatabase,
  runMigrations,
  type SqliteDatabase,
} from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * Fila MIGRATION única y repetibilidad (REQ-MIG-001, REQ-AUD-001, SC-011; T267).
 * La migración de base de datos genera 1 fila MIGRATION por ejecución (SYSTEM, entityId MIG-<versión>, hashes nulos),
 * sin filas por entidad; volver a aplicarla no duplica nada (schema_migrations).
 */
const MIGRATION_ID = 'MIG-0005_audit_log_and_clinical_columns';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const opened: SqliteDatabase[] = [];
const tempDirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function track(db: SqliteDatabase): SqliteDatabase {
  opened.push(db);
  return db;
}
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'argos-mig-marker-'));
  tempDirs.push(dir);
  return dir;
};
const migrationRows = (db: SqliteDatabase) =>
  db.prepare("SELECT * FROM audit_log WHERE mutation_type = 'MIGRATION'").all() as Array<Record<string, unknown>>;
const totalRows = (db: SqliteDatabase) => db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get() as number;

describe('fila MIGRATION única (REQ-MIG-001, REQ-AUD-001)', () => {
  it('una base nueva queda con exactamente una fila MIGRATION con los valores cerrados', () => {
    const db = track(openSqliteDatabase(IN_MEMORY_DATABASE));
    const rows = migrationRows(db);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      executor_user_id: 'SYSTEM',
      mutation_type: 'MIGRATION',
      entity_type: 'SYSTEM',
      entity_id: MIGRATION_ID,
      previous_state_hash: null,
      new_state_hash: null,
    });
    expect(row.id).toMatch(UUID_V4);
    expect(Number.isNaN(Date.parse(String(row.timestamp)))).toBe(false);
    expect(totalRows(db)).toBe(1);
  });

  it('aplicar las migraciones otra vez no aplica nada ni duplica la fila (repetibilidad)', () => {
    const db = track(openSqliteDatabase(IN_MEMORY_DATABASE));
    const before = migrationRows(db);
    expect(runMigrations(db)).toEqual([]);
    expect(runMigrations(db)).toEqual([]);
    expect(migrationRows(db)).toEqual(before);
    expect(totalRows(db)).toBe(1);
  });

  it('reabrir la base en archivo varias veces conserva la misma fila, con el mismo id y la misma marca de tiempo', () => {
    const path = join(tempDir(), 'base.sqlite');
    const first = openSqliteDatabase(path);
    const original = migrationRows(first);
    first.close();
    for (let i = 0; i < 2; i += 1) {
      const again = openSqliteDatabase(path);
      expect(migrationRows(again)).toEqual(original);
      expect(totalRows(again)).toBe(1);
      again.close();
    }
    expect(original).toHaveLength(1);
  });

  it('migrar una base 001 con datos añade una sola fila MIGRATION y ninguna fila por entidad', () => {
    const dir = tempDir();
    const legacy = join(dir, 'previas');
    mkdirSync(legacy);
    for (const name of ['0001_init.sql', '0002_account_identity.sql', '0003_pets_species_and_weight_grams.sql', '0004_roles_and_pet_assignments.sql']) {
      copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(legacy, name));
    }
    const path = join(dir, 'base.sqlite');
    const old = openSqliteDatabase(path, { migrationsDir: legacy });
    old.close();

    const db = track(openSqliteDatabase(path));
    expect(migrationRows(db)).toHaveLength(1);
    expect(totalRows(db)).toBe(1);
    expect(runMigrations(db)).toEqual([]);
    expect(totalRows(db)).toBe(1);
  });

  it('el esquema rechaza una fila MIGRATION con ejecutor, entidad o hashes distintos de los cerrados', () => {
    const db = track(openSqliteDatabase(IN_MEMORY_DATABASE));
    const insert = db.prepare(
      "INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash) VALUES (?, '2026-01-01T00:00:00.000Z', ?, 'MIGRATION', ?, 'MIG-x', ?, NULL)",
    );
    expect(() => insert.run('x1', 'alguien', 'SYSTEM', null)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run('x2', 'SYSTEM', 'PET', null)).toThrow(/CHECK constraint failed/);
    expect(() => insert.run('x3', 'SYSTEM', 'SYSTEM', 'a'.repeat(64))).toThrow(/CHECK constraint failed/);
    expect(totalRows(db)).toBe(1);
  });
});
