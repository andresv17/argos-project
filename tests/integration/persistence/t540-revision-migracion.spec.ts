/**
 * T540 [N2] migración de la columna `revision` (D-16 A) y ausencia de borrado lógico (D-11 A), en los tres motores
 * (REQ-BOR-005, INV-REG-003, REQ-BOR-004): SQLite `0006_record_revision.sql` y Postgres `0002_record_revision.sql` añaden
 * `revision INTEGER NOT NULL DEFAULT 0` a las 6 tablas de registros; las filas anteriores quedan en 0; la migración es repetible;
 * ninguna tabla gana `deleted_at` ni `deleted_by_user_id`. En memoria no hay columnas: el registro borrado desaparece sin marca.
 * Contra Postgres real solo con TEST_DATABASE_URL (esquema desechable propio; nunca otro entorno).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DeleteRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { DEFAULT_MIGRATIONS_DIR, IN_MEMORY_DATABASE, openSqliteDatabase, runMigrations } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { ANDRES, ARGOS, envelope } from '../../fixtures/application-harness.ts';
import { createEngines } from '../../fixtures/record-engines.ts';

const TABLES = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'] as const;
const PG_FILE = new URL('../../../src/infrastructure/persistence/postgres/migrations/0002_record_revision.sql', import.meta.url);
const PG_BASELINE = new URL('../../../src/infrastructure/persistence/postgres/migrations/0001_baseline.sql', import.meta.url);
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null }

describe('T540 SQLite 0006_record_revision (D-16 A, D-11 A)', () => {
  it('[REQ-BOR-005][INV-REG-003] la migración 0006 existe y deja revision INTEGER NOT NULL DEFAULT 0 en las 6 tablas, sin columnas de borrado lógico', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR)).toContain('0006_record_revision.sql');
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    for (const table of TABLES) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
      expect(columns.find((c) => c.name === 'revision'), table).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '0' });
      expect(columns.filter((c) => /deleted/i.test(c.name)), table).toEqual([]);
    }
    const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string; sql: string | null }>;
    expect(indexes.filter((i) => /deleted/i.test(i.name + (i.sql ?? '')))).toEqual([]);
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all()).toContain('0006_record_revision.sql');
    db.close();
  });

  it('[REQ-BOR-005] sobre una base de la 0005 con registros, la 0006 los deja en revision 0, es repetible y el INSERT sin revision sigue valiendo 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t540-'));
    dirs.push(dir);
    const upTo0005 = join(dir, 'hasta-0005');
    mkdirSync(upTo0005);
    for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0006')) writeFileSync(join(upTo0005, name), readFileSync(join(DEFAULT_MIGRATIONS_DIR, name), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: upTo0005 });
    const weight = envelope.records.weights[0]!;
    legacy.pragma('foreign_keys = OFF');
    legacy.prepare('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES (?, ?, ?, ?)').run(weight.id, weight.petId, JSON.stringify(weight), Math.round(weight.weightKg * 1000));
    legacy.close();
    const migrated = openSqliteDatabase(path);
    expect(migrated.prepare('SELECT revision FROM weights WHERE id = ?').pluck().get(weight.id)).toBe(0);
    expect(runMigrations(migrated)).toEqual([]);
    migrated.pragma('foreign_keys = OFF');
    migrated.prepare('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES (?, ?, ?, ?)').run('ffffffff-ffff-4fff-8fff-ffffffffff01', weight.petId, JSON.stringify(weight), Math.round(weight.weightKg * 1000));
    expect(migrated.prepare('SELECT revision FROM weights WHERE id = ?').pluck().get('ffffffff-ffff-4fff-8fff-ffffffffff01')).toBe(0);
    migrated.close();
  });
});

describe('T540 memoria: sin borrado lógico (D-11 A)', () => {
  it('[REQ-BOR-004] borrar un registro lo quita del estado en memoria: no queda ninguna marca deleted_at ni deleted_by_user_id', async () => {
    const [memory] = await createEngines();
    const id = envelope.records.weights.find((w) => w.petId === ARGOS.id)!.id;
    await new DeleteRecordUseCase(memory!.deps).execute(ANDRES, ARGOS.id, 'weights', id);
    expect(memory!.snapshot()).not.toContain(id.concat('"deleted'));
    expect(memory!.snapshot()).not.toMatch(/deleted_?(at|by)/i);
    expect(memory!.recordIds('weights')).not.toContain(id);
  });
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)('T540 Postgres real 0002_record_revision (requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  it('[REQ-BOR-005][INV-REG-003] sobre el baseline con registros, la 0002 añade revision INTEGER NOT NULL DEFAULT 0 a las 6 tablas (filas previas en 0), no añade borrado lógico y es una sola transacción válida', async () => {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t540_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(readFileSync(PG_BASELINE, 'utf8'));
      const weight = envelope.records.weights[0]!;
      // Una fila previa a la migración (sin claves foráneas activas en esta sesión desechable).
      await client.query('SET session_replication_role = replica');
      await client.query('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES ($1, $2, $3, $4)', [weight.id, weight.petId, JSON.stringify(weight), Math.round(weight.weightKg * 1000)]);
      await client.query('SET session_replication_role = DEFAULT');
      const before = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'revision'", [schema]);
      expect(before.rowCount).toBe(0);
      await client.query('BEGIN');
      await client.query(readFileSync(PG_FILE, 'utf8'));
      await client.query('COMMIT');
      const { rows } = await client.query<{ table_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
        "SELECT table_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'revision' ORDER BY table_name",
        [schema],
      );
      expect(rows).toEqual([...TABLES].sort().map((table_name) => ({ table_name, data_type: 'integer', is_nullable: 'NO', column_default: '0' })));
      const deleted = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND column_name ILIKE '%deleted%'", [schema]);
      expect(deleted.rows).toEqual([]);
      expect((await client.query('SELECT revision FROM weights WHERE id = $1', [weight.id])).rows).toEqual([{ revision: 0 }]);
      const idx = await client.query('SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND (indexname ILIKE $2 OR indexdef ILIKE $2)', [schema, '%deleted%']);
      expect(idx.rows).toEqual([]);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  });
});
