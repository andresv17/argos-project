import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closePool, createPostgresPool, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { postgresMigrationFiles } from '../../fixtures/postgres-migrations.ts';

/**
 * T1429 (Feature 010, Bloque E, #33; Nivel 2 pre-autorizada por Neo): migración ADITIVA de la tabla singleton `about_content` (SQLite 0029, Postgres 0025), sin filas (estado vacío = versión 0),
 * con tope de 20 000 caracteres en `body_markdown` (EDGE-010-011), `version >= 1` (CAS, EDGE-010-006) y sin clave foránea hacia `users`. La paridad estática vive en `schema-parity.spec.ts`;
 * la viva (PostgreSQL 17 real) aquí con esquema desechable propio (se OMITE sin TEST_DATABASE_URL).
 *
 * @implements REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-011
 */
const MIGRATION = '0029_about_content.sql';
const PG_MIGRATION = '0025_about_content.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';
const NOW = '2026-11-25T10:00:00.000Z';
const ADMIN = 'ad000000-0000-4000-8000-000000000001';
const COLUMNS = ['id', 'body_markdown', 'photo_object_key', 'photo_alt', 'version', 'updated_at', 'updated_by'];

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function previousDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-about-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name !== MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  return { db, migrationsDir };
}
const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(db, migrationsDir);
};
const insert = (db: SqliteDatabase, row: { id?: number; body?: string; key?: string | null; alt?: string; version?: number; at?: string; by?: string }) =>
  db.prepare('INSERT INTO about_content (id, body_markdown, photo_object_key, photo_alt, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.id ?? 1, row.body ?? 'texto', row.key ?? null, row.alt ?? '', row.version ?? 1, row.at ?? NOW, row.by ?? ADMIN);

describe('T1429 [REQ-ACE10-004] la migración SQLite 0029 (about_content)', () => {
  it('se aplica sola sobre la base previa, es la última, no toca otras tablas y deja la tabla SIN filas (estado vacío = versión 0)', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-9)).toBe(MIGRATION); // 012 T1616: la 0034 (auditoría de la co-propiedad) también es posterior; la 0033 (co-propiedad, T1613) es posterior; 011: la 0030 (saneado del snapshot de escena), la 0031 (admin_delegates) y la 0032 (user_avatar, T1556) son posteriores
    const { db, migrationsDir } = previousDatabase();
    const tables = () => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name <> 'about_content' AND name <> 'schema_migrations' ORDER BY name").all();
    const before = tables();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
    expect(tables()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM about_content').get()).toEqual({ n: 0 });
  });

  it('tiene exactamente las siete columnas de data-model.md, sin clave foránea y sin columnas de documento o datos de menores', () => {
    const { db, migrationsDir } = previousDatabase();
    upgrade(db, migrationsDir);
    const cols = db.prepare("SELECT name FROM pragma_table_info('about_content') ORDER BY cid").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(COLUMNS);
    expect(db.prepare("SELECT COUNT(*) AS n FROM pragma_foreign_key_list('about_content')").get()).toEqual({ n: 0 });
  });

  it('singleton: solo id = 1; un segundo registro y un id distinto se rechazan', () => {
    const { db, migrationsDir } = previousDatabase();
    upgrade(db, migrationsDir);
    insert(db, {});
    expect(() => insert(db, {})).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insert(db, { id: 2 })).toThrow(/CHECK/);
  });

  it('[EDGE-010-011] body_markdown admite 20 000 caracteres y rechaza 20 001; [EDGE-010-006] version >= 1; alt <= 300; clave de foto 1..512; updated_by de 36 caracteres', () => {
    const { db, migrationsDir } = previousDatabase();
    upgrade(db, migrationsDir);
    expect(() => insert(db, { body: 'ñ'.repeat(20_001) })).toThrow(/CHECK/);
    expect(() => insert(db, { version: 0 })).toThrow(/CHECK/);
    expect(() => insert(db, { alt: 'a'.repeat(301) })).toThrow(/CHECK/);
    expect(() => insert(db, { key: '' })).toThrow(/CHECK/);
    expect(() => insert(db, { key: 'k'.repeat(513) })).toThrow(/CHECK/);
    expect(() => insert(db, { by: 'corto' })).toThrow(/CHECK/);
    expect(() => insert(db, { at: 'ayer' })).toThrow(/CHECK/);
    insert(db, { body: 'ñ'.repeat(20_000), alt: 'a'.repeat(300), key: 'k'.repeat(512) });
    expect((db.prepare('SELECT length(body_markdown) AS n FROM about_content').get() as { n: number }).n).toBe(20_000);
  });
});

describe('T1429 [REQ-ACE10-004] la migración 0025 de Postgres es la equivalente y la última', () => {
  it('existe, es la última, no tiene BEGIN/COMMIT y es aditiva (solo CREATE TABLE about_content)', () => {
    expect(postgresMigrationFiles().at(-9)).toBe(PG_MIGRATION); // 012 T1616: la 0030 (auditoría de la co-propiedad) también es posterior; la 0029 (co-propiedad, T1613) es posterior; 011: la 0026 (saneado del snapshot de escena), la 0027 (admin_delegates) y la 0028 (user_avatar, T1556) son posteriores
    const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|DROP|UPDATE|DELETE|ALTER)\b/i);
    expect(sql.split(';').map((s) => s.trim()).filter(Boolean)).toHaveLength(1);
    expect(sql.trim()).toMatch(/^CREATE TABLE about_content \(/);
  });

  it.skipIf(!HAS_POSTGRES)('sobre PostgreSQL 17 real: la tabla nace vacía y los CHECK rechazan lo mismo que SQLite', async () => {
    const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
    const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 2 });
    try {
      for (const name of postgresMigrationFiles().filter((n) => n !== PG_MIGRATION)) await pool.query(readFileSync(new URL(name, PG_DIR), 'utf8'));
      await pool.query(readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8'));
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM about_content')).rows).toEqual([{ n: 0 }]);
      const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'about_content' ORDER BY ordinal_position")).rows as Array<{ column_name: string }>;
      expect(cols.map((c) => c.column_name)).toEqual(COLUMNS);
      const put = (row: { id?: number; body?: string; key?: string | null; alt?: string; version?: number; at?: string; by?: string }) =>
        pool.query('INSERT INTO about_content (id, body_markdown, photo_object_key, photo_alt, version, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [row.id ?? 1, row.body ?? 'texto', row.key ?? null, row.alt ?? '', row.version ?? 1, row.at ?? NOW, row.by ?? ADMIN]);
      await expect(put({ body: 'ñ'.repeat(20_001) })).rejects.toThrow(/check/i);
      await expect(put({ version: 0 })).rejects.toThrow(/check/i);
      await expect(put({ alt: 'a'.repeat(301) })).rejects.toThrow(/check/i);
      await expect(put({ key: '' })).rejects.toThrow(/check/i);
      await expect(put({ by: 'corto' })).rejects.toThrow(/check/i);
      await expect(put({ id: 2 })).rejects.toThrow(/check/i);
      await put({ body: 'ñ'.repeat(20_000), alt: 'a'.repeat(300), key: 'k'.repeat(512) });
      await expect(put({})).rejects.toThrow(/duplicate|unique/i);
      expect((await pool.query('SELECT length(body_markdown)::int AS n FROM about_content')).rows).toEqual([{ n: 20_000 }]);
    } finally {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    }
  }, 120_000);
});
