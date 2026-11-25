import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closePool, createPostgresPool, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { postgresMigrationFiles } from '../../fixtures/postgres-migrations.ts';

/**
 * T1423 (Feature 010, Bloque D, #75; Nivel 2 pre-autorizada por Neo): migraciones ADITIVAS de `users.adult_declared_at` y `users.adult_notice_version` (SQLite 0028, Postgres 0024) aplicadas
 * sobre una base con cuentas previas. REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003 (sin fecha de nacimiento ni documento). La paridad estática vive en `schema-parity.spec.ts`; la viva
 * (PostgreSQL 17 real) aquí, con esquema desechable propio (se OMITE sin TEST_DATABASE_URL).
 */
const MIGRATION = '0028_adult_declaration.sql';
const PG_MIGRATION = '0024_adult_declaration.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';
const NOW = '2026-11-25T10:00:00.000Z';

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function previousDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-adult-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name !== MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  for (const [id, name] of [['u1', 'ana'], ['u2', 'beto']] as const) db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run(id, name, 'hash', JSON.stringify({ id, username: name }));
  return { db, migrationsDir };
}
const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(db, migrationsDir);
};
const insertUser = (db: SqliteDatabase, id: string, at: string | null, version: string | null) =>
  db.prepare('INSERT INTO users (id, username, password_hash, data, adult_declared_at, adult_notice_version) VALUES (?, ?, ?, ?, ?, ?)').run(id, `user-${id}`, 'hash', '{}', at, version);

describe('T1423 [REQ-MEN10-001][REQ-MEN10-002] la migración SQLite 0028 sobre una base con cuentas previas', () => {
  it('se aplica sola sobre la base previa y no toca otras tablas', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()).toContain(MIGRATION); // T1429: ya no es la última (0029 about_content)
    const { db, migrationsDir } = previousDatabase();
    const tables = () => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name <> 'users' AND name <> 'schema_migrations' ORDER BY name").all();
    const otherBefore = tables();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
    expect(tables()).toEqual(otherBefore);
  });

  it('las cuentas anteriores quedan con las dos columnas en NULL y conservan sus datos (cuentas anteriores intactas)', () => {
    const { db, migrationsDir } = previousDatabase();
    const before = db.prepare('SELECT id, username, password_hash, data FROM users ORDER BY id').all();
    upgrade(db, migrationsDir);
    expect(db.prepare('SELECT id, adult_declared_at, adult_notice_version FROM users ORDER BY id').all()).toEqual([
      { id: 'u1', adult_declared_at: null, adult_notice_version: null },
      { id: 'u2', adult_declared_at: null, adult_notice_version: null },
    ]);
    expect(db.prepare('SELECT id, username, password_hash, data FROM users ORDER BY id').all()).toEqual(before);
  });

  it('agrega exactamente dos columnas anulables sin defecto y ninguna de fecha de nacimiento ni documento [REQ-MEN10-003]', () => {
    const { db, migrationsDir } = previousDatabase();
    const cols = () => db.prepare("SELECT name, \"notnull\" AS nn, dflt_value AS d FROM pragma_table_info('users') ORDER BY cid").all() as Array<{ name: string; nn: number; d: string | null }>;
    const names = cols().map((c) => c.name);
    upgrade(db, migrationsDir);
    const after = cols();
    expect(after.map((c) => c.name)).toEqual([...names, 'adult_declared_at', 'adult_notice_version']);
    expect(after.find((c) => c.name === 'adult_declared_at')).toMatchObject({ nn: 0, d: null });
    expect(after.find((c) => c.name === 'adult_notice_version')).toMatchObject({ nn: 0, d: null });
    expect(after.map((c) => c.name).filter((n) => /birth|born|nacim|document/i.test(n))).toEqual([]);
  });

  it('ambas columnas van juntas (las dos nulas o las dos presentes) y la versión tiene tope', () => {
    const { db, migrationsDir } = previousDatabase();
    upgrade(db, migrationsDir);
    expect(() => insertUser(db, 'a', NOW, null)).toThrow(/CHECK/);
    expect(() => insertUser(db, 'b', null, '1.0.0')).toThrow(/CHECK/);
    expect(() => insertUser(db, 'c', NOW, '')).toThrow(/CHECK/);
    expect(() => insertUser(db, 'd', NOW, '1'.repeat(33))).toThrow(/CHECK/);
    expect(() => insertUser(db, 'e', 'corto', '1.0.0')).toThrow(/CHECK/);
    insertUser(db, 'f', NOW, '1.0.0');
    insertUser(db, 'g', null, null);
    expect(db.prepare('SELECT id, adult_declared_at, adult_notice_version FROM users WHERE id IN (?, ?) ORDER BY id').all('f', 'g')).toEqual([
      { id: 'f', adult_declared_at: NOW, adult_notice_version: '1.0.0' },
      { id: 'g', adult_declared_at: null, adult_notice_version: null },
    ]);
  });
});

describe('T1423 [REQ-MEN10-001] la migración 0024 de Postgres es la equivalente y la última', () => {
  it('existe, no tiene BEGIN/COMMIT y es aditiva (solo ALTER TABLE users, sin DROP, UPDATE ni DELETE)', () => {
    expect(postgresMigrationFiles()).toContain(PG_MIGRATION); // T1429: ya no es la última (0025 about_content)
    const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|DROP|UPDATE|DELETE)\b/i);
    expect(sql).toMatch(/ADD COLUMN adult_declared_at TEXT;/);
    expect(sql).toMatch(/ADD COLUMN adult_notice_version TEXT;/);
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) expect(stmt).toMatch(/^ALTER TABLE users /);
  });

  it.skipIf(!HAS_POSTGRES)('sobre PostgreSQL 17 real con cuentas previas: quedan en NULL y los CHECK rechazan lo mismo que SQLite', async () => {
    const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
    const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 2 });
    try {
      for (const name of postgresMigrationFiles().filter((n) => n !== PG_MIGRATION)) await pool.query(readFileSync(new URL(name, PG_DIR), 'utf8'));
      await pool.query("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'hash', '{}'), ('u2', 'beto', 'hash', '{}')");
      await pool.query(readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8'));
      const rows = (await pool.query('SELECT id, adult_declared_at, adult_notice_version FROM users ORDER BY id')).rows;
      expect(rows).toEqual([
        { id: 'u1', adult_declared_at: null, adult_notice_version: null },
        { id: 'u2', adult_declared_at: null, adult_notice_version: null },
      ]);
      const insert = (id: string, at: string | null, version: string | null) => pool.query("INSERT INTO users (id, username, password_hash, data, adult_declared_at, adult_notice_version) VALUES ($1, $2, 'hash', '{}', $3, $4)", [id, `user-${id}`, at, version]);
      await expect(insert('a', NOW, null)).rejects.toThrow(/check/i);
      await expect(insert('b', null, '1.0.0')).rejects.toThrow(/check/i);
      await expect(insert('c', NOW, '')).rejects.toThrow(/check/i);
      await expect(insert('d', NOW, '1'.repeat(33))).rejects.toThrow(/check/i);
      await insert('f', NOW, '1.0.0');
      const f = (await pool.query("SELECT adult_declared_at, adult_notice_version FROM users WHERE id = 'f'")).rows;
      expect(f).toEqual([{ adult_declared_at: NOW, adult_notice_version: '1.0.0' }]);
    } finally {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    }
  }, 120_000);
});
