import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_PARAMETER_CATALOG } from '../../../src/domain/platform/admin-parameter-catalog.ts';
import { DEFAULT_PROMPT_BLOCKS, validatePromptBlocks } from '../../../src/domain/scene/prompt-blocks.ts';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1303 (Feature 009, Fase 5b, #20; Nivel 2 pre-autorizada por Neo): migracion ADITIVA de siembra de `scene.prompt.blocks` en `platform_parameters` con el valor por defecto de los 6 bloques
 * (byte a byte el texto vigente tras #57), SQLite `0022_scene_prompt_blocks_seed.sql` y Postgres `0018_scene_prompt_blocks_seed.sql`, con paridad. No edita migraciones desplegadas, respeta una fila
 * existente (ON CONFLICT DO NOTHING) y no siembra modelo, region ni tope global (siguen por entorno). Postgres vivo con TEST_DATABASE_URL.
 * @implements REQ-CFG9-005, REQ-CFG9-003, NFR-009-002, SC-009-024
 */
const SQLITE_MIGRATION = '0022_scene_prompt_blocks_seed.sql';
const PG_MIGRATION = '0018_scene_prompt_blocks_seed.sql';
const KEY = 'scene.prompt.blocks';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SEED = JSON.stringify(DEFAULT_PROMPT_BLOCKS);

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deployedDatabase(extra: (db: SqliteDatabase) => void = () => undefined): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-seed-pb-'));
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

describe('T1303 [REQ-CFG9-005][SC-009-024] migracion SQLite 0022 sobre una base desplegada', () => {
  it('existe como la ULTIMA migracion de SQLite hasta 0023 (scene_attempts) y se aplica sola sobre 0021', () => {
    const names = readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names).toContain(SQLITE_MIGRATION);
    expect(names[names.indexOf(SQLITE_MIGRATION) - 1]).toBe('0021_scene_enabled_seed.sql');
    const { db, migrationsDir } = deployedDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
  });

  it('siembra scene.prompt.blocks con EXACTAMENTE el JSON de los 6 bloques vigentes, sin autor y con fecha ISO', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    const row = rows(db).find((r) => r.key === KEY)!;
    expect(row.value).toBe(SEED);
    expect(row.value).toBe(ADMIN_PARAMETER_CATALOG[KEY].defaultValue);
    expect(row.by).toBeNull();
    expect(row.description.length).toBeGreaterThan(0);
    expect(row.updatedAt).toMatch(ISO);
  });

  it('el valor sembrado pasa validatePromptBlocks con el maximo del catalogo y es efectivo en el catalogo', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    const value = rows(db).find((r) => r.key === KEY)!.value;
    const spec = ADMIN_PARAMETER_CATALOG[KEY];
    const max = (spec.constraints as { maxBlockLength?: number }).maxBlockLength ?? 0;
    expect(validatePromptBlocks(value, max)).toMatchObject({ ok: true, blocks: DEFAULT_PROMPT_BLOCKS });
    expect(spec.isEffective(value)).toBe(true);
  });

  it('es ADITIVA: las filas previas no cambian y solo se agrega UNA fila; no siembra modelo, region ni tope global', () => {
    const { db, migrationsDir } = deployedDatabase();
    const before = rows(db);
    upgrade(db, migrationsDir);
    const after = rows(db);
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((r) => r.key !== KEY)).toEqual(before);
    for (const absent of ['scene.global_quota_max', 'scene.provider_model', 'scene.provider_location']) expect(after.map((r) => r.key)).not.toContain(absent);
  });

  it('respeta una fila scene.prompt.blocks ya existente (editada a mano): no la pisa ni falla', () => {
    const { db, migrationsDir } = deployedDatabase((d) => {
      d.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ('scene.prompt.blocks', 'manual', 'manual', '2026-11-22T00:00:00.000Z', NULL)").run();
    });
    expect(upgrade(db, migrationsDir)).toEqual([SQLITE_MIGRATION]);
    expect(rows(db).find((r) => r.key === KEY)).toEqual({ key: KEY, value: 'manual', description: 'manual', updatedAt: '2026-11-22T00:00:00.000Z', by: null });
  });

  it('no se aplica dos veces y una base nueva con TODAS las migraciones queda con las tres filas sembradas', () => {
    const { db, migrationsDir } = deployedDatabase();
    upgrade(db, migrationsDir);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
    const fresh = openSqliteDatabase(':memory:');
    opened.push(fresh);
    expect(rows(fresh).map((r) => [r.key, r.value])).toEqual([['album.max_photos_per_pet', '10'], ['scene.enabled', 'true'], [KEY, SEED]]);
  });
});

describe('T1303 paridad SQLite/Postgres (texto de la siembra)', () => {
  const body = (sql: string): string => sql.replace(/--[^\n]*/g, '');
  const literal = (sql: string): string => {
    const m = /VALUES\s*\(\s*'scene\.prompt\.blocks'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/i.exec(body(sql));
    if (m === null) throw new Error('INSERT de scene.prompt.blocks no encontrado');
    return `${m[1]!.replaceAll("''", "'")}|${m[2]!.replaceAll("''", "'")}`;
  };
  const lite = (): string => readFileSync(join(DEFAULT_MIGRATIONS_DIR, SQLITE_MIGRATION), 'utf8');
  const pg = (): string => readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');

  it('Postgres 0018 existe y va justo despues de 0017', () => {
    const names = readdirSync(PG_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort();
    expect(names[names.indexOf(PG_MIGRATION) - 1]).toBe('0017_scene_enabled_seed.sql');
  });

  it('ambos motores siembran el MISMO valor y la MISMA descripcion, y el valor es el JSON por defecto', () => {
    expect(literal(pg())).toBe(literal(lite()));
    expect(literal(lite()).startsWith(`${SEED}|`)).toBe(true);
  });

  it('ambas son idempotentes (ON CONFLICT DO NOTHING), aditivas y sin BEGIN/COMMIT', () => {
    for (const sql of [lite(), pg()]) {
      const text = body(sql);
      expect(text).toMatch(/ON CONFLICT\s*\(\s*key\s*\)\s*DO NOTHING/i);
      expect(text).not.toMatch(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
      expect(text).not.toMatch(/\b(UPDATE|DELETE|BEGIN|COMMIT)\b/i);
      expect((text.match(/INSERT INTO/gi) ?? []).length).toBe(1);
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T1303 Postgres real (0018_scene_prompt_blocks_seed.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(upTo: string, work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t1303_${randomUUID().replaceAll('-', '')}`;
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

  it('siembra el JSON de los 6 bloques sin autor y deja intactas las filas previas (aditiva)', async () => {
    await withSchema('0017_scene_enabled_seed.sql', async (client) => {
      await client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('scene.global_quota_used.2026-11', '37', 'contador', '2026-11-21T00:00:00.000Z')");
      const before = (await client.query('SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters ORDER BY key')).rows;
      await client.query(readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8'));
      const after = (await client.query('SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters ORDER BY key')).rows;
      expect(after).toHaveLength(before.length + 1);
      expect(after.filter((r) => r.key !== KEY)).toEqual(before);
      const seeded = after.find((r) => r.key === KEY)!;
      expect(seeded).toMatchObject({ value: SEED, updated_by_user_id: null });
      expect(String(seeded.updated_at)).toMatch(ISO);
    });
  });

  it('respeta una fila existente y se puede reaplicar sin error ni cambios', async () => {
    await withSchema('0017_scene_enabled_seed.sql', async (client) => {
      await client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('scene.prompt.blocks', 'manual', 'manual', '2026-11-22T00:00:00.000Z')");
      const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');
      await client.query(sql);
      await client.query(sql);
      const { rows: seeded } = await client.query("SELECT value, description FROM platform_parameters WHERE key = 'scene.prompt.blocks'");
      expect(seeded).toEqual([{ value: 'manual', description: 'manual' }]);
    });
  });

  it('paridad viva: sobre el esquema completo ambos motores terminan con las mismas filas sembradas', async () => {
    await withSchema('9999', async (client) => {
      const { rows } = await client.query('SELECT key, value FROM platform_parameters ORDER BY key');
      expect(rows).toEqual([{ key: 'album.max_photos_per_pet', value: '10' }, { key: 'scene.enabled', value: 'true' }, { key: KEY, value: SEED }]);
    });
  });
});
