import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1116 (008, [GH:#16]): migración SQLite 0017 (`users.email_verified_at`, `auth_identities`, `oauth_flow_states`). Se parte de una base en 0016 con filas previas y se aplica
 * la 0017 como en el arranque (REQ-SSO8-003, EDGE-008-036, EDGE-008-023, H-8-04). La paridad con Postgres vive en `schema-parity.spec.ts`.
 */
const MIGRATION = '0017_google_sso.sql';
const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Base con las migraciones 0001..0016 (las posteriores a la 0017, p. ej. la 0018 de 009, quedan fuera: esta suite fija el estado que dejó 008) y dos cuentas heredadas con correo (nunca verificado). */
function legacyDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-sso-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name < MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  const user = db.prepare('INSERT INTO users (id, username, password_hash, data, email) VALUES (?, ?, ?, ?, ?)');
  user.run('u1', 'ana', 'hash', JSON.stringify({ id: 'u1', username: 'ana' }), 'ana@example.test');
  user.run('u2', 'bruno', 'hash', JSON.stringify({ id: 'u2', username: 'bruno' }), 'ana@example.test');
  user.run('u3', 'carla', 'hash', JSON.stringify({ id: 'u3', username: 'carla' }), null);
  return { db, migrationsDir };
}

const upgrade = (migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(opened[0]!, migrationsDir);
};

describe('[T1116][EDGE-008-036] migración 0017 con filas previas', () => {
  it('la 0017 existe en SQLite (ya no es la última: la 0018 de 009 amplía oauth_flow_states, T1219)', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()).toContain(MIGRATION);
  });

  it('toda cuenta antigua conserva su correo y queda con email_verified_at = NULL (nada se marca como verificado)', () => {
    const { db, migrationsDir } = legacyDatabase();
    expect(upgrade(migrationsDir)).toEqual([MIGRATION]);
    expect(db.prepare('SELECT id, email, email_verified_at FROM users ORDER BY id').all()).toEqual([
      { id: 'u1', email: 'ana@example.test', email_verified_at: null },
      { id: 'u2', email: 'ana@example.test', email_verified_at: null },
      { id: 'u3', email: null, email_verified_at: null },
    ]);
    expect(db.prepare('SELECT count(*) AS n FROM auth_identities').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM oauth_flow_states').get()).toEqual({ n: 0 });
  });

  it('el correo sigue sin ser único mientras no esté verificado, pero un correo verificado tiene un solo titular (sin distinguir mayúsculas)', () => {
    const { db, migrationsDir } = legacyDatabase();
    upgrade(migrationsDir);
    db.prepare("UPDATE users SET email_verified_at = '2026-11-21T10:00:00.000Z' WHERE id = 'u1'").run();
    expect(() => db.prepare("UPDATE users SET email_verified_at = '2026-11-21T10:00:00.000Z', email = 'ANA@example.test' WHERE id = 'u2'").run()).toThrow(/UNIQUE/);
    db.prepare("UPDATE users SET email = NULL WHERE id = 'u2'").run();
    db.prepare("UPDATE users SET email_verified_at = NULL WHERE id = 'u1'").run();
    db.prepare("UPDATE users SET email_verified_at = '2026-11-21T10:00:00.000Z', email = 'ANA@example.test' WHERE id = 'u2'").run();
  });

  it('auth_identities: (provider, provider_subject) es único, el proveedor es cerrado y el subject no es vacío', () => {
    const { db, migrationsDir } = legacyDatabase();
    upgrade(migrationsDir);
    const insert = db.prepare('INSERT INTO auth_identities (provider, provider_subject, user_id, created_at) VALUES (?, ?, ?, ?)');
    insert.run('GOOGLE', 'sub-1', 'u1', '2026-11-21T10:00:00.000Z');
    expect(() => insert.run('GOOGLE', 'sub-1', 'u2', '2026-11-21T10:00:00.000Z')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insert.run('FACEBOOK', 'sub-2', 'u2', '2026-11-21T10:00:00.000Z')).toThrow(/CHECK/);
    expect(() => insert.run('GOOGLE', '', 'u2', '2026-11-21T10:00:00.000Z')).toThrow(/CHECK/);
    expect(() => insert.run('GOOGLE', 'sub-3', 'no-existe', '2026-11-21T10:00:00.000Z')).toThrow(/FOREIGN KEY/);
  });

  it('[H-8-04] borrar la cuenta elimina sus identidades y los estados del flujo también en SQLite', () => {
    const { db, migrationsDir } = legacyDatabase();
    upgrade(migrationsDir);
    db.prepare("INSERT INTO auth_identities VALUES ('GOOGLE', 'sub-1', 'u1', '2026-11-21T10:00:00.000Z')").run();
    const flow = db.prepare(
      `INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, created_at, expires_at) VALUES (?, 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', '${'c'.repeat(64)}', '2026-11-21T10:00:00.000Z', '2026-11-21T10:15:00.000Z')`,
    );
    flow.run('a'.repeat(64));
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    expect(db.prepare('SELECT count(*) AS n FROM auth_identities').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM oauth_flow_states').get()).toEqual({ n: 0 });
  });

  it('oauth_flow_states: la forma de cada fase y de cada intención se hace cumplir con CHECK', () => {
    const { db, migrationsDir } = legacyDatabase();
    upgrade(migrationsDir);
    const insert = db.prepare(
      'INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, pending_subject, pending_email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const created = '2026-11-21T10:00:00.000Z';
    const expires = '2026-11-21T10:15:00.000Z';
    const h = (c: string) => c.repeat(64);
    const ORIGIN = h('9');
    insert.run(h('a'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, created, expires);
    insert.run(h('b'), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', ORIGIN, null, null, created, expires);
    insert.run(h('c'), 'USERNAME', 'LOGIN', null, null, null, null, null, 'sub-9', 'x@example.test', created, expires);
    expect(() => insert.run('corto', 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('d'), 'AUTHORIZATION', 'LOGIN', null, 'n', 'v', null, null, null, null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('e'), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', null, ORIGIN, null, null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('f'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', 'u1', null, null, null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('g'), 'USERNAME', 'LOGIN', null, null, null, null, null, null, null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('h'), 'USERNAME', 'LINK', null, null, null, 'u1', ORIGIN, 'sub-9', 'x@example.test', created, expires)).toThrow(/CHECK/);
    expect(() => insert.run(h('i'), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, null, null, null, expires, created)).toThrow(/CHECK/);
    expect(() => insert.run(h('j'), 'DONE', 'LOGIN', 's', 'n', 'v', null, null, null, null, created, expires)).toThrow(/CHECK/);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] origin_session_hash: LINK sin hash, hash en LOGIN y hash de longitud distinta de 64 los rechaza la base de datos', () => {
    const { db, migrationsDir } = legacyDatabase();
    upgrade(migrationsDir);
    const insert = db.prepare(
      'INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const created = '2026-11-21T10:00:00.000Z';
    const expires = '2026-11-21T10:15:00.000Z';
    expect(() => insert.run('1'.repeat(64), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', null, created, expires)).toThrow(/CHECK/);
    expect(() => insert.run('2'.repeat(64), 'AUTHORIZATION', 'LOGIN', 's', 'n', 'v', null, '3'.repeat(64), created, expires)).toThrow(/CHECK/);
    expect(() => insert.run('4'.repeat(64), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', 'corto', created, expires)).toThrow(/CHECK/);
    expect(() => insert.run('5'.repeat(64), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', '6'.repeat(65), created, expires)).toThrow(/CHECK/);
    insert.run('7'.repeat(64), 'AUTHORIZATION', 'LINK', 's', 'n', 'v', 'u1', '8'.repeat(64), created, expires);
    // Sin clave foránea: la sesión de origen puede desaparecer sin arrastrar el estado.
    expect(db.prepare("SELECT count(*) AS n FROM pragma_foreign_key_list('oauth_flow_states') WHERE \"from\" = 'origin_session_hash'").get()).toEqual({ n: 0 });
  });
});
