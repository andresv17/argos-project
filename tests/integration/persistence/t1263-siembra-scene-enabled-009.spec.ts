import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1263 (Feature 009, Fase 5a, #20; Nivel 2): migracion ADITIVA de siembra de `scene.enabled = 'true'` en `platform_parameters` (SQLite `0021_scene_enabled_seed.sql`, Postgres
 * `0017_scene_enabled_seed.sql`), con paridad. No edita migraciones desplegadas (0011/0007 siguen sembrando SOLO el tope de fotos), no crea claves nuevas desde la interfaz (el JSON del
 * prompt se siembra en 5b, T1303; modelo, region y tope global siguen por entorno hasta 5b) y respeta una fila que ya exista (ON CONFLICT DO NOTHING). Postgres vivo con TEST_DATABASE_URL.
 * @implements REQ-CFG9-001, REQ-CFG9-003, NFR-009-002, SC-009-017
 */
const SQLITE_MIGRATION = '0021_scene_enabled_seed.sql';
const PG_MIGRATION = '0017_scene_enabled_seed.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Base en el estado desplegado (0001..0020) con filas previas de parametros: tope de fotos EDITADO y un contador global. */
function deployedDatabase(extra: (db: SqliteDatabase) => void = () => undefined): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-seed-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < SQLITE_MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  db.prepare("UPDATE platform_parameters SET value = '12', updated_at = '2026-11-20T08:00:00.000Z' WHERE key = 'album.max_photos_per_pet'").run();
  db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ('scene.global_quota_used.2026-11', '37', 'contador', '2026-11-21T00:00:00.000Z', NULL)").run();
  extra(db);
  return { db, migrationsDir };
}
const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), join(migrationsDir, SQLITE_MIGRATION));
  return runMigrations(db, migrationsDir);
};
const rows = (db: SqliteDatabase) => db.prepare('SELECT key, value, description, updated_at AS updatedAt, updated_by_user_id AS by FROM platform_parameters ORDER BY key').all() as Array<{ key: string; value: string; description: string; updatedAt: string; by: string | null }>;

describe('T1263 [NFR-009-002] migracion SQLite 0021 sobre una base desplegada', () => {
  it('existe en SQLite justo tras 0020 y se aplica sola sobre 0020 (0022/0023 la siguen)', () => {
    const names = readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names[names.indexOf(SQLITE_MIGRATION) - 1]).toBe('0020_account_status.sql');
    const { db, migrationsDir } = deployedDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
  });

  it('siembra scene.enabled = true con descripcion, fecha ISO y SIN autor (updated_by_user_id NULL)', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    const row = rows(db).find((r) => r.key === 'scene.enabled')!;
    expect(row).toMatchObject({ value: 'true', by: null });
    expect(row.description.length).toBeGreaterThan(0);
    expect(row.updatedAt).toMatch(ISO);
  });

  it('es ADITIVA: las filas previas (tope de fotos editado y contador global) no cambian en nada y solo se agrega UNA fila', () => {
    const { db, migrationsDir } = deployedDatabase();
    const before = rows(db);
    upgrade(db, migrationsDir);
    const after = rows(db);
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((r) => r.key !== 'scene.enabled')).toEqual(before);
    expect(after.find((r) => r.key === 'album.max_photos_per_pet')).toMatchObject({ value: '12', updatedAt: '2026-11-20T08:00:00.000Z' });
  });

  it('sin claves nuevas desde la interfaz: NO siembra scene.global_quota_max, modelo, region ni scene.prompt.blocks (5b / entorno)', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    const keys = rows(db).map((r) => r.key);
    expect(keys).toEqual(['album.max_photos_per_pet', 'scene.enabled', 'scene.global_quota_used.2026-11']);
    for (const absent of ['scene.global_quota_max', 'scene.provider_model', 'scene.provider_location']) expect(keys).not.toContain(absent);
  });

  it('respeta una fila scene.enabled ya existente (p. ej. false puesta a mano): no la pisa ni falla', () => {
    const { db, migrationsDir } = deployedDatabase((d) => {
      d.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ('scene.enabled', 'false', 'manual', '2026-11-22T00:00:00.000Z', NULL)").run();
    });
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(rows(db).find((r) => r.key === 'scene.enabled')).toEqual({ key: 'scene.enabled', value: 'false', description: 'manual', updatedAt: '2026-11-22T00:00:00.000Z', by: null });
  });

  it('no se aplica dos veces (schema_migrations) y una base nueva con TODAS las migraciones conserva scene.enabled sembrada (T1303 suma scene.prompt.blocks)', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
    const fresh = openSqliteDatabase(':memory:');
    opened.push(fresh);
    expect(rows(fresh).map((r) => [r.key, r.value]).filter(([k]) => k !== 'scene.prompt.blocks')).toEqual([['album.max_photos_per_pet', '10'], ['scene.enabled', 'true']]);
  });

  it('las migraciones desplegadas 0011 y 0007 NO se editaron: siguen sembrando solo el tope de fotos', () => {
    const lite = readFileSync(join(DEFAULT_MIGRATIONS_DIR, '0011_platform_parameters.sql'), 'utf8');
    const pg = readFileSync(new URL('0007_platform_parameters.sql', PG_DIR), 'utf8');
    for (const sql of [lite, pg]) {
      expect(sql).not.toContain('scene.');
      expect((sql.match(/INSERT INTO platform_parameters/g) ?? []).length).toBe(1);
    }
  });
});

describe('T1263 paridad SQLite/Postgres (texto de la siembra)', () => {
  const tuple = (sql: string): { key: string; value: string; description: string; by: string } => {
    const body = sql.replace(/--[^\n]*/g, '');
    const insert = /INSERT INTO platform_parameters[\s\S]*?VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'((?:[^']|'')*)'\s*,[\s\S]*?,\s*(NULL)\s*\)/i.exec(body);
    if (insert === null) throw new Error('INSERT de platform_parameters no encontrado');
    return { key: insert[1]!, value: insert[2]!, description: insert[3]!, by: insert[4]! };
  };
  const lite = (): string => readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8');
  const pg = (): string => readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');

  it('Postgres 0017 existe justo tras 0016 (0018/0019 la siguen)', () => {
    const names = readdirSync(PG_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names[names.indexOf(PG_MIGRATION) - 1]).toBe('0016_account_status.sql');
  });

  it('ambos motores siembran la MISMA clave, valor, descripcion y autor (NULL)', () => {
    expect(tuple(pg())).toEqual(tuple(lite()));
    expect(tuple(lite())).toMatchObject({ key: 'scene.enabled', value: 'true', by: 'NULL' });
  });

  it('ambas son idempotentes ante una fila existente (ON CONFLICT DO NOTHING) y no crean ni alteran tablas', () => {
    for (const sql of [lite(), pg()]) {
      const body = sql.replace(/--[^\n]*/g, '');
      expect(body).toMatch(/ON CONFLICT\s*\(\s*key\s*\)\s*DO NOTHING/i);
      expect(body).not.toMatch(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
      expect(body).not.toMatch(/\b(UPDATE|DELETE)\b/i);
      expect((body.match(/INSERT INTO/gi) ?? []).length).toBe(1);
    }
  });

  it('Postgres no usa BEGIN/COMMIT propios (el migrador corre cada migracion en una transaccion)', () => {
    expect(pg().replace(/--[^\n]*/g, '')).not.toMatch(/\b(BEGIN|COMMIT)\b/i);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1263 Postgres real (0017_scene_enabled_seed.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(upTo: string, work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t1263_${randomUUID().replaceAll('-', '')}`;
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

  it('siembra scene.enabled = true sin autor y deja intactas las filas previas (aditiva)', async () => {
    await withSchema('0016_account_status.sql', async (client) => {
      await client.query("UPDATE platform_parameters SET value = '12', updated_at = '2026-11-20T08:00:00.000Z' WHERE key = 'album.max_photos_per_pet'");
      await client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('scene.global_quota_used.2026-11', '37', 'contador', '2026-11-21T00:00:00.000Z')");
      const before = (await client.query('SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters ORDER BY key')).rows;
      await client.query(readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8'));
      const after = (await client.query('SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters ORDER BY key')).rows;
      expect(after).toHaveLength(before.length + 1);
      expect(after.filter((r) => r.key !== 'scene.enabled')).toEqual(before);
      const seeded = after.find((r) => r.key === 'scene.enabled')!;
      expect(seeded).toMatchObject({ value: 'true', updated_by_user_id: null });
      expect(String(seeded.description).length).toBeGreaterThan(0);
      expect(String(seeded.updated_at)).toMatch(ISO);
    });
  });

  it('respeta una fila existente y se puede reaplicar sin error ni cambios', async () => {
    await withSchema('0016_account_status.sql', async (client) => {
      await client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('scene.enabled', 'false', 'manual', '2026-11-22T00:00:00.000Z')");
      const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');
      await client.query(sql);
      await client.query(sql);
      const { rows: seeded } = await client.query("SELECT value, description FROM platform_parameters WHERE key = 'scene.enabled'");
      expect(seeded).toEqual([{ value: 'false', description: 'manual' }]);
    });
  });

  it('paridad viva: sobre el esquema completo ambos motores terminan con las mismas filas sembradas', async () => {
    await withSchema('9999', async (client) => {
      const { rows } = await client.query('SELECT key, value FROM platform_parameters ORDER BY key');
      expect(rows.filter((r) => r.key !== 'scene.prompt.blocks')).toEqual([{ key: 'album.max_photos_per_pet', value: '10' }, { key: 'scene.enabled', value: 'true' }]);
    });
  });
});
