import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1321 (006, enmienda Nivel 2 de REQ-ESC6-035 autorizada por Neo): `home_scenes.image_mime` admite `image/jpeg` (el generador devuelve JPEG). Migración ADITIVA nueva
 * (SQLite `0024_home_scenes_image_mime_jpeg.sql`, Postgres `0020_home_scenes_image_mime_jpeg.sql`); las 0013 y 0009 NO se editan. SQLite reconstruye la tabla SIN perder filas
 * propias ni de sus hijas (intentos y fuentes, con cascada). Postgres vivo con TEST_DATABASE_URL.
 * @implements REQ-ESC6-035, INV-ESC6-005
 */
const SQLITE_MIGRATION = '0024_home_scenes_image_mime_jpeg.sql';
const PG_MIGRATION = '0020_home_scenes_image_mime_jpeg.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const NOW = '2026-11-24T10:00:00.000Z';

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deployedDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-jpeg-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < SQLITE_MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  return { db, migrationsDir };
}
const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), join(migrationsDir, SQLITE_MIGRATION));
  return runMigrations(db, migrationsDir);
};
function seed(db: SqliteDatabase): void {
  db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'x', '{}')").run();
  db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u2', 'beto', 'x', '{}')").run();
  db.prepare(
    "INSERT INTO home_scenes (id, owner_user_id, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, consumed_generations, quota_window, created_at, updated_at) VALUES ('s1', 'u1', 'i1', 'image/webp', 10, ?, '{\"v\":1}', ?, 2, '2026-11', ?, ?)",
  ).run('a'.repeat(64), NOW, NOW, NOW);
  db.prepare("INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ('s2', 'u2', '2026-11', ?, ?)").run(NOW, NOW);
  for (const id of ['a1', 'a2']) {
    db.prepare(
      "INSERT INTO scene_attempts (id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, quota_window, quota_max, started_at, provider_model, provider_location) VALUES (?, 's1', 'u1', 'UPDATE', 'FROM_SCRATCH', 'f', '{}', 'o', 'DONE', '2026-11', 5, ?, 'modelo-x', 'us-central1')",
    ).run(id, NOW);
  }
  db.prepare("INSERT INTO scene_image_sources (scene_id, owner_user_id) VALUES ('s1', 'u1')").run();
}
const dump = (db: SqliteDatabase) => ({
  scenes: db.prepare('SELECT * FROM home_scenes ORDER BY id').all(),
  attempts: db.prepare('SELECT * FROM scene_attempts ORDER BY id').all(),
  sources: db.prepare('SELECT * FROM scene_image_sources ORDER BY scene_id, owner_user_id').all(),
});

describe('T1321 migración SQLite 0024 sobre una base desplegada (REQ-ESC6-035)', () => {
  it('existe justo tras 0023 y se aplica sola', () => {
    const names = readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names[names.indexOf(SQLITE_MIGRATION) - 1]).toBe('0023_scene_attempts_provider_call.sql');
    const { db, migrationsDir } = deployedDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
  });

  it('conserva sin pérdida las escenas, los intentos y las fuentes (la cascada no se dispara al reconstruir)', () => {
    const { db, migrationsDir } = deployedDatabase();
    seed(db);
    const before = dump(db);
    expect(before.attempts).toHaveLength(2);
    upgrade(db, migrationsDir);
    expect(dump(db)).toEqual(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('admite image/jpeg y sigue rechazando otros tipos; el resto de CHECK, índices y cascadas se conservan', () => {
    const { db, migrationsDir } = deployedDatabase();
    seed(db);
    upgrade(db, migrationsDir);
    const set = (mime: string) => () =>
      db.prepare("UPDATE home_scenes SET image_id = 'i2', image_mime = ?, image_size_bytes = 10, image_fingerprint = ?, image_inputs_snapshot = '{\"v\":1}', image_created_at = ? WHERE id = 's2'").run(mime, 'b'.repeat(64), NOW);
    const runs = (f: () => unknown): string => {
      try {
        f();
        return 'ok';
      } catch {
        return 'throws';
      }
    };
    for (const ok of ['image/png', 'image/webp', 'image/jpeg']) expect(runs(set(ok)), ok).toBe('ok');
    for (const bad of ['image/gif', 'image/jpg']) expect(set(bad)).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE home_scenes SET image_size_bytes = NULL WHERE id = 's2'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ('s3', 'u2', '2026-11', ?, ?)").run(NOW, NOW)).toThrow(/UNIQUE/);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('home_scenes','scene_attempts') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toEqual(['home_scenes_household', 'home_scenes_owner', 'scene_attempts_actor_started', 'scene_attempts_idempotency', 'scene_attempts_scene_started']);
    db.prepare("DELETE FROM home_scenes WHERE id = 's1'").run();
    expect([db.prepare('SELECT COUNT(*) AS n FROM scene_attempts').get(), db.prepare('SELECT COUNT(*) AS n FROM scene_image_sources').get()]).toEqual([{ n: 0 }, { n: 0 }]);
    const fks = db.prepare("PRAGMA foreign_key_list('scene_attempts')").all() as Array<{ table: string; on_delete: string }>;
    expect(fks).toEqual([expect.objectContaining({ table: 'home_scenes', on_delete: 'CASCADE' })]);
  });

  it('las migraciones desplegadas 0013 y 0009 NO se editaron (siguen con PNG/WebP)', () => {
    const lite = readFileSync(join(DEFAULT_MIGRATIONS_DIR, '0013_home_scenes.sql'), 'utf8');
    const pg = readFileSync(new URL('0009_home_scenes.sql', PG_DIR), 'utf8');
    for (const sql of [lite, pg]) expect(sql).toContain("image_mime IN ('image/png', 'image/webp')");
  });
});

describe('T1321 paridad SQLite/Postgres (texto)', () => {
  const pg = (): string => readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');
  const lite = (): string => readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8');

  it('Postgres 0020 existe justo tras 0019 y reemplaza el CHECK de image_mime sin BEGIN/COMMIT propios', () => {
    const names = readdirSync(PG_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names[names.indexOf(PG_MIGRATION) - 1]).toBe('0019_scene_attempts_provider_call.sql');
    const body = pg().replace(/--[^\n]*/g, '');
    expect(body).toMatch(/ALTER TABLE home_scenes DROP CONSTRAINT home_scenes_image_mime_check/);
    expect(body).toMatch(/ALTER TABLE home_scenes ADD CONSTRAINT home_scenes_image_mime_check CHECK \(image_mime IN \('image\/png', 'image\/webp', 'image\/jpeg'\)\)/);
    expect(body).not.toMatch(/\b(BEGIN|COMMIT)\b/i);
  });

  it('ambos motores declaran la misma lista de tipos', () => {
    for (const sql of [lite(), pg()]) expect(sql.replace(/--[^\n]*/g, '')).toContain("image_mime IN ('image/png', 'image/webp', 'image/jpeg')");
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1321 Postgres real (0020_home_scenes_image_mime_jpeg.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(upTo: string, work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t1321_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of readdirSync(PG_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f <= upTo).sort()) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const setImage = (client: import('pg').Client, mime: string) =>
    client.query("UPDATE home_scenes SET image_id = 'i1', image_mime = $1, image_size_bytes = 10, image_fingerprint = $2, image_inputs_snapshot = '{\"v\":1}', image_created_at = $3 WHERE id = 's1'", [mime, 'a'.repeat(64), NOW]);

  it('antes de 0020 rechaza image/jpeg; después lo admite, conserva la fila previa y sigue rechazando otros tipos', async () => {
    await withSchema('0019_scene_attempts_provider_call.sql', async (client) => {
      await client.query("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'x', '{}')");
      await client.query('INSERT INTO home_scenes (id, owner_user_id, quota_window, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)', ['s1', 'u1', '2026-11', NOW]);
      await setImage(client, 'image/webp');
      await expect(setImage(client, 'image/jpeg')).rejects.toThrow(/home_scenes_image_mime_check/);
      await client.query(pg());
      expect((await client.query("SELECT image_mime FROM home_scenes WHERE id = 's1'")).rows).toEqual([{ image_mime: 'image/webp' }]);
      await setImage(client, 'image/jpeg');
      await setImage(client, 'image/png');
      await expect(setImage(client, 'image/gif')).rejects.toThrow(/home_scenes_image_mime_check/);
    });
  });
  function pg(): string {
    return readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');
  }
});
