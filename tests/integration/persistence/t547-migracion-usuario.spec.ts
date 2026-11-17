/**
 * T547 [N2] migración «usuario único sin distinguir mayúsculas» (SC-CAT-016, SC-CAT-025 análogo; REQ-LOG-002, REQ-LOG-001, INV-LOG-001),
 * SQLite `0007_username_case_insensitive.sql` y Postgres `0003_username_case_insensitive.sql`:
 *  - con grupos de usuarios que solo difieren en mayúsculas la migración ABORTA sin cambiar el esquema y el mensaje trae SOLO el conteo;
 *  - los intentos de login pasan a minúsculas y, si dos filas colapsan, se conserva la de mayor contador;
 *  - es repetible (schema_migrations impide aplicarla dos veces) y la base de datos limpia queda con los dos índices.
 * Contra Postgres real solo con TEST_DATABASE_URL (esquema desechable propio).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function legacyDir(before: string): string {
  const cache = join(process.cwd(), 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-t547-'));
  dirs.push(dir);
  const upTo = join(dir, 'previas');
  mkdirSync(upTo);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < before)) writeFileSync(join(upTo, name), readFileSync(join(DEFAULT_MIGRATIONS_DIR, name), 'utf8'));
  return upTo;
}
const dataOf = (id: string, username: string) => JSON.stringify({ id, username, displayName: 'N', createdAt: '2026-01-01T00:00:00.000Z' });

describe('T547 SQLite 0007_username_case_insensitive', () => {
  it('[SC-CAT-016][INV-LOG-001] con «Ana» y «ana» en users la migración aborta con el CONTEO (sin ningún username), no anota la versión y deja el esquema intacto', () => {
    const upTo0006 = legacyDir('0007');
    const path = join(upTo0006, '..', 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: upTo0006 });
    const insert = legacy.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)');
    insert.run('u1', 'Ana', 'h', dataOf('u1', 'Ana'));
    insert.run('u2', 'ana', 'h', dataOf('u2', 'ana'));
    insert.run('u3', 'Beto', 'h', dataOf('u3', 'Beto'));
    legacy.close();
    let message = '';
    try {
      openSqliteDatabase(path);
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('1 grupo(s)');
    expect(message).toContain('0007');
    expect(message).not.toMatch(/(?:^|\W)(Ana|ana|Beto)(?:\W|$)/);
    const check = openSqliteDatabase(path, { migrationsDir: upTo0006 });
    expect(check.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'users_username_lower'").pluck().get()).toBe(0);
    expect(check.prepare("SELECT count(*) FROM schema_migrations WHERE version LIKE '0007%'").pluck().get()).toBe(0);
    check.close();
  });

  it('[REQ-LOG-001] sin colisiones: login_attempts pasa a minúsculas conservando la fila con más fallos, la base queda con los dos índices y la migración es repetible', () => {
    const upTo0006 = legacyDir('0007');
    const path = join(upTo0006, '..', 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: upTo0006 });
    const attempt = legacy.prepare('INSERT INTO login_attempts (username, failures) VALUES (?, ?)');
    attempt.run('Ana', JSON.stringify(['2026-11-05T11:50:00.000Z', '2026-11-05T11:51:00.000Z', '2026-11-05T11:52:00.000Z']));
    attempt.run('ana', JSON.stringify(['2026-11-05T11:59:00.000Z']));
    attempt.run('BETO', JSON.stringify(['2026-11-05T11:00:00.000Z']));
    attempt.run('carla', JSON.stringify([]));
    legacy.close();
    const migrated = openSqliteDatabase(path);
    expect(migrated.prepare('SELECT username, json_array_length(failures) AS n FROM login_attempts ORDER BY username').all()).toEqual([
      { username: 'ana', n: 3 },
      { username: 'beto', n: 1 },
      { username: 'carla', n: 0 },
    ]);
    const names = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('users_username_lower', 'household_invitations_one_open') ORDER BY name").pluck().all();
    expect(names).toEqual(['household_invitations_one_open', 'users_username_lower']);
    expect(runMigrations(migrated)).toEqual([]);
    migrated.close();
  });

  it('[INV-LOG-001] ya migrada, la base rechaza una segunda cuenta que solo difiere en mayúsculas', () => {
    const db = openSqliteDatabase(':memory:');
    const insert = db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)');
    insert.run('u1', 'Ana', 'h', dataOf('u1', 'Ana'));
    expect(() => insert.run('u2', 'ANA', 'h', dataOf('u2', 'ANA'))).toThrow(/UNIQUE constraint failed/);
    db.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T547 Postgres real 0003_username_case_insensitive (requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t547_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(readFileSync(new URL('0001_baseline.sql', PG_DIR), 'utf8'));
      await client.query(readFileSync(new URL('0002_record_revision.sql', PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const insertUser = (client: import('pg').Client, id: string, username: string) =>
    client.query('INSERT INTO users (id, username, password_hash, data) VALUES ($1, $2, $3, $4::jsonb)', [id, username, 'h', dataOf(id, username)]);

  it('[SC-CAT-016] con «Ana» y «ana» aborta con el conteo, sin ningún username, y no crea el índice', async () => {
    await withSchema(async (client) => {
      await insertUser(client, 'u1', 'Ana');
      await insertUser(client, 'u2', 'ana');
      await insertUser(client, 'u3', 'Beto');
      let message = '';
      try {
        await client.query(readFileSync(new URL('0003_username_case_insensitive.sql', PG_DIR), 'utf8'));
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).toContain('1 grupo(s)');
      expect(message).toContain('0003 abortada');
      expect(message).not.toMatch(/(?:^|\W)(Ana|ana|Beto)(?:\W|$)/);
      expect((await client.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'users_username_lower'")).rows[0]!['n']).toBe(0);
    });
  });

  it('[REQ-LOG-001][INV-LOG-001] sin colisiones: intentos en minúsculas con la fila de más fallos, índices LOWER creados y segunda cuenta por mayúsculas rechazada (23505)', async () => {
    await withSchema(async (client) => {
      const attempt = (username: string, failures: string[]) => client.query('INSERT INTO login_attempts (username, failures) VALUES ($1, $2)', [username, JSON.stringify(failures)]);
      await attempt('Ana', ['2026-11-05T11:50:00.000Z', '2026-11-05T11:51:00.000Z', '2026-11-05T11:52:00.000Z']);
      await attempt('ana', ['2026-11-05T11:59:00.000Z']);
      await attempt('BETO', ['2026-11-05T11:00:00.000Z']);
      await client.query(readFileSync(new URL('0003_username_case_insensitive.sql', PG_DIR), 'utf8'));
      const rows = (await client.query('SELECT username, jsonb_array_length(failures::jsonb)::int AS n FROM login_attempts ORDER BY username')).rows;
      expect(rows).toEqual([{ username: 'ana', n: 3 }, { username: 'beto', n: 1 }]);
      await insertUser(client, 'u1', 'Ana');
      await expect(insertUser(client, 'u2', 'ANA')).rejects.toMatchObject({ code: '23505', constraint: 'users_username_lower' });
    });
  });
});
