import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1323 (009, Fase 5d, T1315; D9-31; SC-009-060): migracion ADITIVA del reinicio real de los cuatro limites. SQLite `0026_scene_limits_reset.sql`, Postgres `0022_scene_limits_reset.sql`:
 * `home_scenes.limits_reset_at` (nullable, sin relleno retroactivo) y la tabla minima `scene_actor_limit_marks`. Sin perdida: `scene_attempts` y `home_scenes` previos quedan intactos.
 * @implements REQ-CFG9-006, REQ-LIM9-004, SC-009-060
 */
const SQLITE_MIGRATION = '0026_scene_limits_reset.sql';
const PG_MIGRATION = '0022_scene_limits_reset.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('T1323 SQLite 0026_scene_limits_reset.sql', () => {
  it('aditiva y sin perdida: la columna nueva queda NULL en las escenas previas y scene_attempts no cambia; la tabla de marcas nace vacia y es idempotente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-limits-'));
    dirs.push(dir);
    const migrationsDir = join(dir, 'migraciones');
    mkdirSync(migrationsDir);
    for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < SQLITE_MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
    const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
    opened.push(db);
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'u1', 'h', '{}')").run();
    db.prepare("INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ('s1', 'u1', '2026-11', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    const before = db.prepare('SELECT * FROM home_scenes').all();
    copyFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), join(migrationsDir, SQLITE_MIGRATION));
    expect(runMigrations(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
    const after = db.prepare('SELECT * FROM home_scenes').all() as Array<Record<string, unknown>>;
    expect(after).toEqual(before.map((row) => ({ ...(row as object), limits_reset_at: null })));
    expect(db.prepare('SELECT COUNT(*) AS n FROM scene_actor_limit_marks').get()).toEqual({ n: 0 });
    const cols = db.prepare("SELECT name, type FROM pragma_table_info('scene_actor_limit_marks') ORDER BY cid").all();
    expect(cols).toEqual([{ name: 'user_id', type: 'TEXT' }, { name: 'limits_reset_at', type: 'TEXT' }]);
  });
});

describe('T1323 Postgres 0022_scene_limits_reset.sql', () => {
  const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
  it('existe, sin BEGIN/COMMIT, solo aditiva e idempotente (sin DROP ni UPDATE)', () => {
    expect(readdirSync(PG_DIR).sort()).toContain(PG_MIGRATION); // la 0023 (modelo flash-image) es posterior
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|DROP|UPDATE)\b|DELETE FROM/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS limits_reset_at TEXT;/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS scene_actor_limit_marks/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS limits_reset_at TEXT (NOT NULL|DEFAULT)/); // la columna de la escena es nullable y sin relleno retroactivo
  });
});
