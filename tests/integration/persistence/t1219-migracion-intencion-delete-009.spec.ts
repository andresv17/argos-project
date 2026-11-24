import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1219 (009, deuda #17, `D9-17` = A, Nivel 2): migración SQLite 0018 que amplía `oauth_flow_states` con la intención `DELETE` (reautenticación reciente para eliminar la
 * cuenta). La 0017 ya se aplicó en producción (008), así que NO se edita en sitio: se reconstruye la tabla con una migración nueva y se conservan las filas previas.
 * REQ-DEL9-001, INV-DEL9-001, ADR-009-04; SC-009-044. La paridad con Postgres (0014) vive en `schema-parity.spec.ts`.
 */
const MIGRATION = '0018_oauth_flow_delete_intent.sql';
const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CREATED = '2026-11-23T10:00:00.000Z';
const EXPIRES = '2026-11-23T10:15:00.000Z';
const h = (c: string) => c.repeat(64);

/** Base con 0001..0017 (estado de producción de 008) y tres estados de flujo previos: LOGIN, LINK y USERNAME. */
function productionDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-del-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run('u1', 'ana', 'hash', JSON.stringify({ id: 'u1', username: 'ana' }));
  const insert = db.prepare(
    'INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, pending_subject, pending_email, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run(h('a'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, CREATED, EXPIRES, null);
  insert.run(h('b'), 'AUTHORIZATION', 'LINK', 's2', 'n2', 'v2', 'u1', h('9'), null, null, CREATED, EXPIRES, CREATED);
  insert.run(h('c'), 'USERNAME', 'LOGIN', null, null, null, null, null, 'sub-9', 'x@example.test', CREATED, EXPIRES, null);
  return { db, migrationsDir };
}

const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(db, migrationsDir);
};

const INSERT =
  'INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, pending_subject, pending_email, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

describe('[T1219][REQ-DEL9-001] migración 0018 sobre una base en el estado de producción de 008', () => {
  it('la 0018 existe (la 0019 de la Fase 3, la 0020 de la Fase 4 y la 0021 de la Fase 5a son posteriores) y se aplica sola sobre 0017', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-4)).toBe(MIGRATION);
    const { db, migrationsDir } = productionDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
  });

  it('las filas previas (LOGIN, LINK, USERNAME) sobreviven a la reconstrucción con todas sus columnas', () => {
    const { db, migrationsDir } = productionDatabase();
    const before = db.prepare('SELECT * FROM oauth_flow_states ORDER BY token_hash').all();
    upgrade(db, migrationsDir);
    expect(db.prepare('SELECT * FROM oauth_flow_states ORDER BY token_hash').all()).toEqual(before);
    expect(before).toHaveLength(3);
  });

  it('los índices oauth_flow_states_expires y oauth_flow_states_user_id se recrean y la tabla sigue STRICT', () => {
    const { db, migrationsDir } = productionDatabase();
    upgrade(db, migrationsDir);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'oauth_flow_states' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name").all();
    expect(indexes).toEqual([{ name: 'oauth_flow_states_expires' }, { name: 'oauth_flow_states_user_id' }]);
    expect(db.prepare("SELECT strict FROM pragma_table_list('oauth_flow_states')").get()).toEqual({ strict: 1 });
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'oauth_flow_states_old%'").get()).toEqual({ n: 0 });
  });

  it('la intención DELETE se admite SOLO con usuario y sesión de origen, sin pending_email, y su sub pendiente solo aparece en DELETE', () => {
    const { db, migrationsDir } = productionDatabase();
    upgrade(db, migrationsDir);
    const run = db.prepare(INSERT);
    run.run(h('d'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', 'u1', h('8'), null, null, CREATED, EXPIRES, null);
    run.run(h('e'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', 'u1', h('8'), 'sub-1', null, CREATED, EXPIRES, CREATED);
    expect(() => run.run(h('f'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', null, h('8'), null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('0'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', 'u1', null, null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('1'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', 'u1', h('8'), null, 'x@example.test', CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('2'), 'USERNAME', 'DELETE', null, null, null, 'u1', h('8'), 'sub-9', 'x@example.test', CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('3'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, 'sub-1', null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('4'), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', h('8'), 'sub-1', null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('5'), 'AUTHORIZATION', 'REAUTH', 's', 'n', 'v', 'u1', h('8'), null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
  });

  it('las reglas de 008 siguen en pie: LINK exige usuario y sesión de origen, LOGIN no los lleva, el hash mide 64 y el vencimiento es posterior a la creación', () => {
    const { db, migrationsDir } = productionDatabase();
    upgrade(db, migrationsDir);
    const run = db.prepare(INSERT);
    expect(() => run.run(h('6'), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', null, null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('7'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, h('3'), null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('8'), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', 'corto', null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run('corto', 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
    expect(() => run.run(h('9'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, EXPIRES, CREATED, null)).toThrow(/CHECK/);
    expect(() => run.run(h('1'), 'USERNAME', 'LOGIN', null, null, null, null, null, null, null, CREATED, EXPIRES, null)).toThrow(/CHECK/);
  });

  it('[H-8-04] [REQ-DEL9-001] borrar la cuenta elimina también los estados de flujo DELETE (clave foránea con cascada intacta)', () => {
    const { db, migrationsDir } = productionDatabase();
    upgrade(db, migrationsDir);
    db.prepare(INSERT).run(h('d'), 'AUTHORIZATION', 'DELETE', 's', 'n', 'v', 'u1', h('8'), 'sub-1', null, CREATED, EXPIRES, CREATED);
    expect(db.prepare("SELECT count(*) AS n FROM oauth_flow_states WHERE user_id = 'u1'").get()).toEqual({ n: 2 });
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare('SELECT count(*) AS n FROM oauth_flow_states WHERE user_id IS NOT NULL').get()).toEqual({ n: 0 });
  });

  it('el identificador sigue siendo único (clave primaria) y la purga por vencimiento sigue funcionando', () => {
    const { db, migrationsDir } = productionDatabase();
    upgrade(db, migrationsDir);
    expect(() => db.prepare(INSERT).run(h('a'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, CREATED, EXPIRES, null)).toThrow(/UNIQUE|PRIMARY/);
    expect(db.prepare('DELETE FROM oauth_flow_states WHERE expires_at <= ?').run('2026-11-23T10:15:00.000Z').changes).toBe(3);
  });
});
