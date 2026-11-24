import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1322 (009, fix de producción; orden Nivel 2 de Neo): migración ADITIVA e idempotente que lleva la fila heredada `scene.provider_model = 'gemini-3.1-flash-image'` a
 * `gemini-3.1-flash-image-preview` y fija `scene.provider_location = 'global'` (D9-27; INV-CFG9-001 fail-closed al arrancar: la migración garantiza la transición limpia).
 * SQLite `0025_scene_model_preview_global.sql`, Postgres `0021_scene_model_preview_global.sql`. No toca filas con otro valor ni crea la fila de región si el modelo no es el heredado.
 * @implements REQ-CFG9-001, INV-CFG9-001, SC-009-052
 */
const SQLITE_MIGRATION = '0025_scene_model_preview_global.sql';
const PG_MIGRATION = '0021_scene_model_preview_global.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const T = '2026-11-20T00:00:00.000Z';
const LEGACY = 'gemini-3.1-flash-image';
const PREVIEW = 'gemini-3.1-flash-image-preview';

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deployed(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-preview-'));
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

describe('T1322 SQLite 0025_scene_model_preview_global.sql', () => {
  it('el modelo heredado pasa a -preview y la región a global; otras claves no cambian', () => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', LEGACY);
    put(db, 'album.max_photos_per_pet', '9');
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(params(db)).toEqual([
      expect.objectContaining({ key: 'scene.provider_location', value: 'global' }),
      expect.objectContaining({ key: 'scene.provider_model', value: PREVIEW }),
    ]);
    expect(db.prepare("SELECT value FROM platform_parameters WHERE key = 'album.max_photos_per_pet'").get()).toEqual({ value: '9' });
  });

  it('una fila scene.provider_location previa se sobrescribe a global solo cuando el modelo era el heredado', () => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', LEGACY);
    put(db, 'scene.provider_location', 'us-central1');
    upgrade(db, migrationsDir);
    expect(params(db).map((r) => (r as { value: string }).value)).toEqual(['global', PREVIEW]);
  });

  it.each([['gemini-2.5-flash-image'], [PREVIEW], ['otro-modelo']])('no toca filas con otro valor (%s)', (model) => {
    const { db, migrationsDir } = deployed();
    put(db, 'scene.provider_model', model);
    put(db, 'scene.provider_location', 'us-central1');
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
    put(db, 'scene.provider_model', LEGACY);
    upgrade(db, migrationsDir);
    const once = params(db);
    db.exec(readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8'));
    expect(params(db)).toEqual(once);
  });

  it('paridad: ambos motores usan el mismo valor de modelo, región y condición', () => {
    const lite = readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8').replace(/--[^\n]*/g, '');
    const pg = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    for (const sql of [lite, pg]) for (const token of [`'${LEGACY}'`, `'${PREVIEW}'`, "'global'", "'scene.provider_model'", "'scene.provider_location'"]) expect(sql).toContain(token);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1322 Postgres real (0021_scene_model_preview_global.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t1322_${randomUUID().replaceAll('-', '')}`;
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

  it('modelo heredado -> preview + global; segunda ejecución idempotente', async () => {
    await withSchema(async (client) => {
      await putPg(client, 'scene.provider_model', LEGACY);
      await client.query(sql());
      const once = await paramsPg(client);
      expect(once.map((r) => [r.key, r.value])).toEqual([['scene.provider_location', 'global'], ['scene.provider_model', PREVIEW]]);
      await client.query(sql());
      expect(await paramsPg(client)).toEqual(once);
    });
  });

  it('sobrescribe una región previa solo con el modelo heredado', async () => {
    await withSchema(async (client) => {
      await putPg(client, 'scene.provider_model', LEGACY);
      await putPg(client, 'scene.provider_location', 'us-central1');
      await client.query(sql());
      expect((await paramsPg(client)).map((r) => r.value)).toEqual(['global', PREVIEW]);
    });
  });

  it.each([['gemini-2.5-flash-image'], [PREVIEW], ['otro-modelo']])('no toca filas con otro valor (%s)', async (model) => {
    await withSchema(async (client) => {
      await putPg(client, 'scene.provider_model', model);
      await putPg(client, 'scene.provider_location', 'us-central1');
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
