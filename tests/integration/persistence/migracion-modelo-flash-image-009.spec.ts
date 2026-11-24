import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * Modelo flash-image (009, fix de produccion; orden Nivel 2 de Neo): migracion ADITIVA e idempotente que retira `gemini-3.1-flash-image-preview` (404 en Vertex global) y lleva
 * `scene.provider_model` a `gemini-3.1-flash-image`. SQLite `0027_scene_model_flash_image.sql`, Postgres `0023_scene_model_flash_image.sql`. No toca otros valores ni crea filas.
 * @implements REQ-CFG9-001, INV-CFG9-001
 */
const SQLITE_MIGRATION = '0027_scene_model_flash_image.sql';
const PG_MIGRATION = '0023_scene_model_flash_image.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const T = '2026-11-20T00:00:00.000Z';
const PREVIEW = 'gemini-3.1-flash-image-preview';
const FINAL = 'gemini-3.1-flash-image';

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deployed(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-flash-'));
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
const put = (db: SqliteDatabase, key: string, value: string): void => {
  db.prepare('INSERT OR REPLACE INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, NULL)').run(key, value, 'x', T);
};
const params = (db: SqliteDatabase) => db.prepare("SELECT key, value, updated_at FROM platform_parameters WHERE key LIKE 'scene.provider_%' ORDER BY key").all();

describe('Modelo flash-image SQLite 0027_scene_model_flash_image.sql', () => {
  it('el modelo -preview pasa a gemini-3.1-flash-image; otras claves no cambian', () => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', PREVIEW);
    put(db, 'album.max_photos_per_pet', '9');
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(params(db)).toEqual([expect.objectContaining({ key: 'scene.provider_model', value: FINAL })]);
    expect(db.prepare("SELECT value FROM platform_parameters WHERE key = 'album.max_photos_per_pet'").get()).toEqual({ value: '9' });
  });

  it.each([['gemini-2.5-flash-image'], [FINAL], ['otro-modelo']])('no toca filas con otro valor (%s)', (model) => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', model);
    const before = params(db);
    upgrade(db, migrationsDir);
    expect(params(db)).toEqual(before);
  });

  it('sin fila de modelo no crea ninguna fila', () => {
    const { db, migrationsDir } = deployed();
    upgrade(db, migrationsDir);
    expect(params(db)).toEqual([]);
  });

  it('idempotente: dos ejecuciones del SQL dejan el mismo estado', () => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', PREVIEW);
    upgrade(db, migrationsDir);
    const once = params(db);
    db.exec(readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8'));
    expect(params(db)).toEqual(once);
  });

  it('paridad: ambos motores usan el mismo valor origen, destino y clave', () => {
    const lite = readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8').replace(/--[^\n]*/g, '');
    const pg = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    for (const sql of [lite, pg]) for (const token of [`'${PREVIEW}'`, `'${FINAL}'`, "'scene.provider_model'"]) expect(sql).toContain(token);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('Modelo flash-image Postgres real (0023_scene_model_flash_image.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t1323_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of readdirSync(PG_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f < PG_MIGRATION).sort()) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const putPg = (client: import('pg').Client, key: string, value: string) =>
    client.query('INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ($1, $2, $3, $4, NULL) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value, 'x', T]);
  const paramsPg = async (client: import('pg').Client) => (await client.query("SELECT key, value, updated_at FROM platform_parameters WHERE key LIKE 'scene.provider_%' ORDER BY key")).rows;
  const sql = () => readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');

  it('modelo -preview -> gemini-3.1-flash-image; segunda ejecucion idempotente', async () => {
    await withSchema(async (client) => {
      await putPg(client, 'scene.provider_model', PREVIEW);
      await client.query(sql());
      const once = await paramsPg(client);
      expect(once.map((r) => [r.key, r.value])).toEqual([['scene.provider_model', FINAL]]);
      await client.query(sql());
      expect(await paramsPg(client)).toEqual(once);
    });
  });

  it.each([['gemini-2.5-flash-image'], [FINAL], ['otro-modelo']])('no toca filas con otro valor (%s)', async (model) => {
    await withSchema(async (client) => {
      await putPg(client, 'scene.provider_model', model);
      const before = await paramsPg(client);
      await client.query(sql());
      expect(await paramsPg(client)).toEqual(before);
    });
  });

  it('sin fila de modelo no crea ninguna fila', async () => {
    await withSchema(async (client) => {
      await client.query(sql());
      expect(await paramsPg(client)).toEqual([]);
    });
  });
});
