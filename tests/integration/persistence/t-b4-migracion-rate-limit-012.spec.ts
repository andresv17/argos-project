/**
 * B-4 (Feature 012, Bloque B, #22) migraciones de los ámbitos CO_OWNER_INVITE y OWNER_REQUEST de `rate_limit_events` (H-02, H-10; REQ-OWN12-002, REQ-OWN12-004):
 *  - SQLite `0035_co_ownership_rate_limit_scopes.sql` (reconstruye la tabla por el CHECK, patrón de la 0010) y Postgres `0031_co_ownership_rate_limit_scopes.sql` (patrón de la 0006);
 *  - sin pérdida de datos (conserva filas, índice y cascada), aceptan los dos ámbitos nuevos, siguen rechazando cualquier otro y la comprobación previa ABORTA con el conteo, sin identificadores.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const USER = 'f0000000-0000-4000-8000-0000000000b1';
const EVENT = (n: number) => `f0000000-0000-4000-8000-00000000020${n}`;
const INSERT = 'INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)';

describe('B-4 migración 0035 de SQLite (rate_limit_events admite CO_OWNER_INVITE y OWNER_REQUEST)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function legacyDatabase() {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-b4-'));
    dirs.push(dir);
    const previous = join(dir, 'previas');
    mkdirSync(previous);
    for (const file of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0035')) writeFileSync(join(previous, file), readFileSync(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    return { path, legacy: openSqliteDatabase(path, { migrationsDir: previous }) };
  }

  it('[H-02][H-10] conserva las filas, el índice y la cascada, acepta los dos ámbitos nuevos y rechaza cualquier otro', () => {
    const { path, legacy } = legacyDatabase();
    legacy.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'migrante', 'h', '{}')").run(USER);
    const insert = legacy.prepare(INSERT);
    insert.run(EVENT(1), 'EXPORT', USER, '2026-11-01T10:00:00.000Z');
    insert.run(EVENT(2), 'INVITE', USER, '2026-11-01T11:00:00.000Z');
    insert.run(EVENT(3), 'MICROCHIP_DUPLICATE', USER, '2026-11-01T12:00:00.000Z');
    expect(() => insert.run(EVENT(4), 'CO_OWNER_INVITE', USER, '2026-11-01T13:00:00.000Z')).toThrow(/CHECK constraint failed/);
    legacy.close();

    const db = openSqliteDatabase(path);
    expect(db.prepare('SELECT id, scope, subject_user_id, occurred_at FROM rate_limit_events ORDER BY id').all()).toEqual([
      { id: EVENT(1), scope: 'EXPORT', subject_user_id: USER, occurred_at: '2026-11-01T10:00:00.000Z' },
      { id: EVENT(2), scope: 'INVITE', subject_user_id: USER, occurred_at: '2026-11-01T11:00:00.000Z' },
      { id: EVENT(3), scope: 'MICROCHIP_DUPLICATE', subject_user_id: USER, occurred_at: '2026-11-01T12:00:00.000Z' },
    ]);
    expect(db.prepare("SELECT count(*) FROM schema_migrations WHERE version = '0035_co_ownership_rate_limit_scopes.sql'").pluck().get()).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rate_limit_events' AND name NOT LIKE 'sqlite_%'").pluck().all()).toEqual(['rate_limit_events_subject']);
    db.prepare(INSERT).run(EVENT(4), 'CO_OWNER_INVITE', USER, '2026-11-01T13:00:00.000Z');
    db.prepare(INSERT).run(EVENT(5), 'OWNER_REQUEST', USER, '2026-11-01T14:00:00.000Z');
    expect(() => db.prepare(INSERT).run(EVENT(6), 'OTRO', USER, '2026-11-01T14:00:00.000Z')).toThrow(/CHECK constraint failed/);
    db.prepare('DELETE FROM users WHERE id = ?').run(USER);
    expect(db.prepare('SELECT count(*) FROM rate_limit_events').pluck().get()).toBe(0);
    db.close();
  });

  it('con eventos huérfanos (sin usuario) la migración ABORTA con el conteo, sin identificadores, y no anota la versión', () => {
    const { path, legacy } = legacyDatabase();
    legacy.pragma('foreign_keys = OFF');
    legacy.prepare(INSERT).run(EVENT(1), 'EXPORT', USER, '2026-11-01T10:00:00.000Z');
    legacy.close();
    let message = '';
    try {
      openSqliteDatabase(path);
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('1 evento(s)');
    expect(message).toContain('0035');
    for (const leaked of [USER, EVENT(1), 'f0000000']) expect(message, leaked).not.toContain(leaked);
    const after = openSqliteDatabase(path, { migrationsDir: join(path, '..', 'previas') });
    expect(after.prepare('SELECT count(*) FROM rate_limit_events').pluck().get()).toBe(1);
    expect(after.prepare("SELECT count(*) FROM schema_migrations WHERE version = '0035_co_ownership_rate_limit_scopes.sql'").pluck().get()).toBe(0);
    after.close();
  });
});

describe('B-4 migración 0031 de PostgreSQL (texto)', () => {
  const sql = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0031_co_ownership_rate_limit_scopes.sql', import.meta.url), 'utf8');
  it('[H-02][H-10] comprueba antes de tocar el esquema, ensancha el CHECK con los dos ámbitos nuevos y no borra datos', () => {
    expect(sql).toContain("scope NOT IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE')");
    expect(sql).toContain("CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST'))");
    expect(sql).not.toMatch(/\b(DELETE FROM|DROP TABLE|TRUNCATE)\b/i);
  });
});
