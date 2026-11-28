import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1692 (Feature 012, Bloque E, #81): migración SQLite 0042 (`share_links.scope` admite PETS con CHECK combinado y tabla `share_link_pets` sin `position`) y revisión estática de la 0038 de PostgreSQL.
 * La paridad estática de columnas, CHECK e índices vive en `schema-parity.spec.ts`. PostgreSQL real: ver `TEST_DATABASE_URL` (no se ejecuta sin ella).
 *
 * @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, INV-VET12-001, SC-012-060, SC-012-061
 */
const MIGRATION = '0042_share_link_pets.sql';
const NOW = '2026-11-28T10:00:00.000Z';
const LATER = '2026-11-29T10:00:00.000Z';
const U1 = '00000000-0000-4000-8000-000000000001';
const H1 = '00000000-0000-4000-8000-0000000000b1';
const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const HASH = (n: number): string => String(n).padStart(64, '0');

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function previousDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-sharepets-'));
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
const seed = (db: SqliteDatabase): void => {
  db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'ana', 'x', '{}')").run(U1);
  db.prepare("INSERT INTO households (id, owner_user_id, data) VALUES (?, ?, '{}')").run(H1, U1);
  for (const id of [P1, P2]) db.prepare("INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, '{}')").run(id, U1);
};
const link = (db: SqliteDatabase, n: number, fields: Record<string, string | number | null>): void => {
  const row = { id: `00000000-0000-4000-8000-00000000c${String(n).padStart(3, '0')}`, token_hash: HASH(n), created_by_user_id: U1, created_at: NOW, expires_in_days: 1, expires_at: LATER, idempotency_key: `k${n}`, ...fields };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO share_links (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row));
};

describe('T1692 [REQ-VET12-004] la migración SQLite 0042 (alcance PETS)', () => {
  it('conserva byte a byte los enlaces PET y HOUSEHOLD (token, bandera de fallecimiento) y crea share_link_pets sin columna position', () => {
    const { db, migrationsDir } = previousDatabase();
    seed(db);
    link(db, 1, { scope: 'PET', pet_id: P1, pet_owner_user_id_at_creation: U1, include_deceased_at: 1 });
    link(db, 2, { scope: 'HOUSEHOLD', household_id: H1, revoked_at: NOW });
    const before = db.prepare('SELECT * FROM share_links ORDER BY id').all();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
    expect(db.prepare('SELECT * FROM share_links ORDER BY id').all()).toEqual(before);
    expect((db.prepare("SELECT name FROM pragma_table_info('share_link_pets')").pluck().all() as string[]).sort()).toEqual(['pet_id', 'share_link_id']);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'share_links' AND name LIKE 'share_links_%' ORDER BY name").pluck().all()).toEqual(['share_links_created_by', 'share_links_expires', 'share_links_household_active', 'share_links_pet_active', 'share_links_revoked']);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
  });

  it('acepta un PETS de hogar sin mascota y rechaza las combinaciones de forma inválidas y los alcances desconocidos', () => {
    const { db, migrationsDir } = previousDatabase();
    seed(db);
    upgrade(db, migrationsDir);
    link(db, 3, { scope: 'PETS', household_id: H1 });
    expect(() => link(db, 4, { scope: 'PETS', household_id: H1, pet_id: P1 })).toThrow(/CHECK/);
    expect(() => link(db, 5, { scope: 'PETS', pet_id: P1 })).toThrow(/CHECK/);
    expect(() => link(db, 6, { scope: 'PETS', household_id: H1, pet_owner_user_id_at_creation: U1 })).toThrow(/CHECK/);
    expect(() => link(db, 7, { scope: 'ALL', household_id: H1 })).toThrow(/CHECK/);
    expect(() => link(db, 8, { scope: 'PET', household_id: H1 })).toThrow(/CHECK/);
  });

  it('share_link_pets: PK (enlace, mascota), cascada con el enlace y con la mascota, FK a ambos', () => {
    const { db, migrationsDir } = previousDatabase();
    seed(db);
    upgrade(db, migrationsDir);
    link(db, 3, { scope: 'PETS', household_id: H1 });
    const id = '00000000-0000-4000-8000-00000000c003';
    const add = db.prepare('INSERT INTO share_link_pets (share_link_id, pet_id) VALUES (?, ?)');
    add.run(id, P1);
    add.run(id, P2);
    expect(() => add.run(id, P1)).toThrow(/UNIQUE|PRIMARY/);
    expect(() => add.run('00000000-0000-4000-8000-00000000c999', P1)).toThrow(/FOREIGN KEY/);
    db.prepare('DELETE FROM pets WHERE id = ?').run(P2);
    expect(db.prepare('SELECT pet_id FROM share_link_pets').pluck().all()).toEqual([P1]);
    db.prepare('DELETE FROM share_links WHERE id = ?').run(id);
    expect(db.prepare('SELECT count(*) FROM share_link_pets').pluck().get()).toBe(0);
  });

  it('no toca el CHECK de share_link_audit.event_type (annex §2)', () => {
    expect(readFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), 'utf8').replace(/--[^\n]*/g, '')).not.toMatch(/share_link_audit/);
  });
});

describe('T1692 la 0038 de PostgreSQL (revisión estática; sin TEST_DATABASE_URL no se ejecuta)', () => {
  const sql = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0038_share_link_pets.sql', import.meta.url), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');
  it('agrega los CHECK NOT VALID y los valida, no lleva BEGIN/COMMIT ni toca la auditoría y share_link_pets no tiene position', () => {
    expect(code).toMatch(/ADD CONSTRAINT share_links_scope_check CHECK \(scope IN \('PET', 'HOUSEHOLD', 'PETS'\)\) NOT VALID;/);
    expect(code).toMatch(/ADD CONSTRAINT share_links_scope_shape_check CHECK[^;]+NOT VALID;/);
    expect(code).toContain('VALIDATE CONSTRAINT share_links_scope_check;');
    expect(code).toContain('VALIDATE CONSTRAINT share_links_scope_shape_check;');
    expect(code).not.toMatch(/\bBEGIN\s*;|\bCOMMIT\b/);
    expect(code).not.toMatch(/share_link_audit/);
    expect(code).not.toMatch(/position/i);
  });
});
