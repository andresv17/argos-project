/**
 * T556/T557 [US3] migraciones del ámbito MICROCHIP_DUPLICATE de `rate_limit_events` (REQ-PET4-002, ADR-004-04):
 *  - SQLite `0010_rate_limit_microchip_scope.sql` (reconstruye la tabla por el CHECK) y Postgres `0006_rate_limit_microchip_scope.sql`
 *    (cambia la restricción `rate_limit_events_scope_check`);
 *  - conservan las filas EXPORT e INVITE y el índice `rate_limit_events_subject`, aceptan el ámbito nuevo y siguen rechazando cualquier otro;
 *  - la comprobación previa ABORTA con el conteo, sin identificadores, y deja el esquema intacto.
 * Las pruebas de Postgres se OMITEN sin TEST_DATABASE_URL y usan un esquema desechable.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const USER = 'f0000000-0000-4000-8000-0000000000a1';
const EVENT = (n: number) => `f0000000-0000-4000-8000-00000000010${n}`;

describe('T556 migración 0010 de SQLite (rate_limit_events admite MICROCHIP_DUPLICATE)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function legacyDatabase() {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-t556-'));
    dirs.push(dir);
    const previous = join(dir, 'previas');
    mkdirSync(previous);
    for (const file of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0010')) writeFileSync(join(previous, file), readFileSync(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    return { path, legacy: openSqliteDatabase(path, { migrationsDir: previous }) };
  }

  it('[REQ-PET4-002] conserva las filas EXPORT e INVITE, el índice y la cascada, acepta MICROCHIP_DUPLICATE y rechaza cualquier otro ámbito', () => {
    const { path, legacy } = legacyDatabase();
    legacy.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'migrante', 'h', '{}')").run(USER);
    const insert = legacy.prepare('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)');
    insert.run(EVENT(1), 'EXPORT', USER, '2026-11-01T10:00:00.000Z');
    insert.run(EVENT(2), 'INVITE', USER, '2026-11-01T11:00:00.000Z');
    expect(() => insert.run(EVENT(3), 'MICROCHIP_DUPLICATE', USER, '2026-11-01T12:00:00.000Z')).toThrow(/CHECK constraint failed/);
    legacy.close();

    const db = openSqliteDatabase(path);
    expect(db.prepare('SELECT id, scope, subject_user_id, occurred_at FROM rate_limit_events ORDER BY id').all()).toEqual([
      { id: EVENT(1), scope: 'EXPORT', subject_user_id: USER, occurred_at: '2026-11-01T10:00:00.000Z' },
      { id: EVENT(2), scope: 'INVITE', subject_user_id: USER, occurred_at: '2026-11-01T11:00:00.000Z' },
    ]);
    expect(db.prepare("SELECT count(*) FROM schema_migrations WHERE version = '0010_rate_limit_microchip_scope.sql'").pluck().get()).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rate_limit_events' AND name NOT LIKE 'sqlite_%'").pluck().all()).toEqual(['rate_limit_events_subject']);
    db.prepare('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)').run(EVENT(3), 'MICROCHIP_DUPLICATE', USER, '2026-11-01T12:00:00.000Z');
    expect(() => db.prepare('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)').run(EVENT(4), 'OTRO', USER, '2026-11-01T12:00:00.000Z')).toThrow(/CHECK constraint failed/);
    db.prepare('DELETE FROM users WHERE id = ?').run(USER);
    expect(db.prepare('SELECT count(*) FROM rate_limit_events').pluck().get()).toBe(0);
    db.close();
  });

  it('[REQ-PET4-002] con eventos huérfanos (sin usuario) la migración ABORTA con el conteo, sin identificadores, deja la tabla intacta y no anota la versión', () => {
    const { path, legacy } = legacyDatabase();
    legacy.pragma('foreign_keys = OFF');
    const insert = legacy.prepare('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)');
    insert.run(EVENT(1), 'EXPORT', USER, '2026-11-01T10:00:00.000Z');
    insert.run(EVENT(2), 'INVITE', USER, '2026-11-01T11:00:00.000Z');
    legacy.close();
    let message = '';
    try {
      openSqliteDatabase(path);
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('2 evento(s)');
    expect(message).toContain('0010');
    for (const leaked of [USER, EVENT(1), EVENT(2), 'f0000000']) expect(message, leaked).not.toContain(leaked);
    const after = openSqliteDatabase(path, { migrationsDir: join(path, '..', 'previas') });
    expect(after.prepare('SELECT count(*) FROM rate_limit_events').pluck().get()).toBe(2);
    expect(after.prepare("SELECT count(*) FROM schema_migrations WHERE version LIKE '0010%'").pluck().get()).toBe(0);
    after.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T556 migración 0006 de Postgres real (requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const { randomUUID } = await import('node:crypto');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t556_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of ['0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql']) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const insertEvent = (client: import('pg').Client, id: string, scope: string) =>
    client.query('INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES ($1, $2, $3, $4)', [id, scope, USER, '2026-11-01T10:00:00.000Z']);

  it('[REQ-PET4-002] conserva las filas, el índice y la cascada, acepta MICROCHIP_DUPLICATE y rechaza cualquier otro ámbito (23514)', async () => {
    await withSchema(async (client) => {
      await client.query("INSERT INTO users (id, username, password_hash, data) VALUES ($1, 'migrante', 'h', '{}'::jsonb)", [USER]);
      await insertEvent(client, EVENT(1), 'EXPORT');
      await insertEvent(client, EVENT(2), 'INVITE');
      const before = await insertEvent(client, EVENT(3), 'MICROCHIP_DUPLICATE').then(() => null, (e: unknown) => e as { code?: string; constraint?: string });
      expect([before?.code, before?.constraint]).toEqual(['23514', 'rate_limit_events_scope_check']);
      await client.query(readFileSync(new URL('0006_rate_limit_microchip_scope.sql', PG_DIR), 'utf8'));
      expect((await client.query('SELECT id, scope FROM rate_limit_events ORDER BY id')).rows).toEqual([
        { id: EVENT(1), scope: 'EXPORT' },
        { id: EVENT(2), scope: 'INVITE' },
      ]);
      await insertEvent(client, EVENT(3), 'MICROCHIP_DUPLICATE');
      const after = await insertEvent(client, EVENT(4), 'OTRO').then(() => null, (e: unknown) => e as { code?: string; constraint?: string });
      expect([after?.code, after?.constraint]).toEqual(['23514', 'rate_limit_events_scope_check']);
      const index = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'rate_limit_events' AND indexname = 'rate_limit_events_subject'")).rows;
      expect(index).toHaveLength(1);
      await client.query('DELETE FROM users WHERE id = $1', [USER]);
      expect((await client.query('SELECT count(*)::int AS n FROM rate_limit_events')).rows[0]).toEqual({ n: 0 });
    });
  });

  it('[REQ-PET4-002] si la restricción esperada no existe o hay filas con un ámbito desconocido, la migración ABORTA con el conteo, sin identificadores', async () => {
    await withSchema(async (client) => {
      await client.query("INSERT INTO users (id, username, password_hash, data) VALUES ($1, 'migrante', 'h', '{}'::jsonb)", [USER]);
      await client.query('ALTER TABLE rate_limit_events DROP CONSTRAINT rate_limit_events_scope_check');
      await insertEvent(client, EVENT(1), 'EXPORT');
      await insertEvent(client, EVENT(2), 'DESCONOCIDO');
      await insertEvent(client, EVENT(3), 'OTRO');
      let message = '';
      try {
        await client.query(readFileSync(new URL('0006_rate_limit_microchip_scope.sql', PG_DIR), 'utf8'));
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).toContain('2 evento(s)');
      expect(message).toContain('0006 abortada');
      for (const leaked of [USER, EVENT(1), 'DESCONOCIDO', 'OTRO', 'f0000000']) expect(message, leaked).not.toContain(leaked);
    });
  });

  it('[REQ-PET4-002] sin la restricción nombrada la migración ABORTA con un mensaje que no trae datos', async () => {
    await withSchema(async (client) => {
      await client.query('ALTER TABLE rate_limit_events DROP CONSTRAINT rate_limit_events_scope_check');
      let message = '';
      try {
        await client.query(readFileSync(new URL('0006_rate_limit_microchip_scope.sql', PG_DIR), 'utf8'));
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).toContain('0006 abortada');
      expect(message).toContain('rate_limit_events_scope_check');
    });
  });
});
