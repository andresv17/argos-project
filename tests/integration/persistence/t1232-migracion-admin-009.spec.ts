import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1232 (pruebas rojas, Feature 009, Fase 3, #19; Nivel 2 pre-autorizada por Neo): migración NUEVA (las anteriores están desplegadas y no se editan) con las cuatro tablas del portal de
 * administración: `admin_identities`, `admin_sessions` (solo el SHA-256 del identificador), `admin_oauth_flow_states` y `admin_audit_entries`, con paridad SQLite/Postgres y SIN tocar `users`
 * ni el CHECK de `audit_log.entity_type` (`AuditEntityType`). REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006; SC-009-013, SC-009-048. La paridad estática vive en `schema-parity.spec.ts`.
 */
const MIGRATION = '0019_admin_portal.sql';
const PG_MIGRATION = '0015_admin_portal.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-11-23T10:00:00.000Z';
const LATER = '2026-11-23T10:30:00.000Z';
const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';
const h = (c: string) => c.repeat(64);

/** Base con 0001..0018 (estado de producción tras la Fase 2) y filas de usuario previas. */
function productionDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-adm-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name !== MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run('u1', 'ana', 'hash', JSON.stringify({ id: 'u1', username: 'ana' }));
  return { db, migrationsDir };
}

const upgrade = (db: SqliteDatabase, migrationsDir: string): string[] => {
  copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
  return runMigrations(db, migrationsDir);
};

const migrated = (): SqliteDatabase => {
  const { db, migrationsDir } = productionDatabase();
  upgrade(db, migrationsDir);
  return db;
};

const insertIdentity = (db: SqliteDatabase, adminId = ID_A, sub = 'sub-1', email = 'admin@example.test') =>
  db.prepare('INSERT INTO admin_identities (admin_id, provider, provider_subject, email, created_at) VALUES (?, ?, ?, ?, ?)').run(adminId, 'GOOGLE', sub, email, NOW);

describe('T1232 [REQ-ADM9-006] la migración SQLite 0019 sobre una base en el estado de la Fase 2', () => {
  it('la 0019 existe, es la última de SQLite y se aplica sola sobre 0018', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-1)).toBe(MIGRATION);
    const { db, migrationsDir } = productionDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
  });

  it('crea exactamente las cuatro tablas, todas STRICT, con las columnas acordadas (sin correo en la auditoría ni en las sesiones)', () => {
    const db = migrated();
    const columns = (table: string) => (db.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns('admin_identities')).toEqual(['admin_id', 'provider', 'provider_subject', 'email', 'created_at']);
    expect(columns('admin_sessions')).toEqual(['token_hash', 'admin_id', 'created_at', 'last_activity_at', 'revoked_at']);
    expect(columns('admin_oauth_flow_states')).toEqual(['token_hash', 'state', 'nonce', 'code_verifier', 'created_at', 'expires_at', 'consumed_at']);
    expect(columns('admin_audit_entries')).toEqual(['id', 'admin_id', 'action', 'object_ref', 'occurred_at']);
    for (const table of ['admin_identities', 'admin_sessions', 'admin_oauth_flow_states', 'admin_audit_entries']) {
      expect((db.prepare('SELECT strict FROM pragma_table_list WHERE schema = ? AND name = ?').get('main', table) as { strict: number }).strict, table).toBe(1);
    }
  });

  it('no toca users ni el CHECK de audit_log.entity_type (AuditEntityType intacto) y conserva las filas previas', () => {
    const { db, migrationsDir } = productionDatabase();
    const sqlOf = (table: string) => (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql;
    const before = { users: sqlOf('users'), audit: sqlOf('audit_log'), rows: db.prepare('SELECT * FROM users').all() };
    upgrade(db, migrationsDir);
    expect({ users: sqlOf('users'), audit: sqlOf('audit_log'), rows: db.prepare('SELECT * FROM users').all() }).toEqual(before);
    expect(sqlOf('audit_log')).not.toMatch(/ADMIN/i);
  });

  it('ninguna tabla de administración tiene clave foránea hacia users (el administrador puede no tener cuenta de usuario)', () => {
    const db = migrated();
    for (const table of ['admin_identities', 'admin_sessions', 'admin_oauth_flow_states', 'admin_audit_entries']) {
      const targets = (db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all() as Array<{ target: string }>).map((r) => r.target);
      expect(targets, table).not.toContain('users');
    }
  });

  it('admin_identities: adminId de 36 caracteres, un solo ancla por (provider, sub) y un solo administrador por correo; correo en minúsculas', () => {
    const db = migrated();
    insertIdentity(db);
    expect(() => insertIdentity(db, ID_B, 'sub-1', 'otro@example.test')).toThrow(/constraint failed/);
    expect(() => insertIdentity(db, ID_B, 'sub-2', 'admin@example.test')).toThrow(/constraint failed/);
    expect(() => insertIdentity(db, 'corto', 'sub-3', 'tres@example.test')).toThrow(/constraint failed/);
    expect(() => insertIdentity(db, ID_B, 'sub-4', 'Mayus@example.test')).toThrow(/constraint failed/);
    expect(() => db.prepare('INSERT INTO admin_identities VALUES (?, ?, ?, ?, ?)').run(ID_B, 'GITHUB', 'sub-5', 'cinco@example.test', NOW)).toThrow(/constraint failed/);
    expect(() => db.prepare('INSERT INTO admin_identities VALUES (?, ?, ?, ?, ?)').run(ID_B, 'GOOGLE', '', 'seis@example.test', NOW)).toThrow(/constraint failed/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM admin_identities').get()).toEqual({ n: 1 });
  });

  it('admin_sessions: solo el SHA-256 (64 caracteres), pertenece a una identidad y se borra en cascada con ella', () => {
    const db = migrated();
    insertIdentity(db);
    const insert = db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, created_at, last_activity_at, revoked_at) VALUES (?, ?, ?, ?, ?)');
    insert.run(h('a'), ID_A, NOW, NOW, null);
    expect(() => insert.run('claro', ID_A, NOW, NOW, null)).toThrow(/constraint failed/);
    expect(() => insert.run(h('b'), ID_B, NOW, NOW, null)).toThrow(/constraint failed/);
    expect(() => insert.run(h('c'), ID_A, LATER, NOW, null)).toThrow(/constraint failed/);
    db.prepare('DELETE FROM admin_identities WHERE admin_id = ?').run(ID_A);
    expect(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get()).toEqual({ n: 0 });
  });

  it('admin_oauth_flow_states: hash de 64, state/nonce/verificador obligatorios y vencimiento posterior a la creación', () => {
    const db = migrated();
    const insert = db.prepare('INSERT INTO admin_oauth_flow_states (token_hash, state, nonce, code_verifier, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run(h('a'), 's', 'n', 'v', NOW, LATER, null);
    expect(() => insert.run(h('a'), 's', 'n', 'v', NOW, LATER, null)).toThrow(/constraint failed/);
    expect(() => insert.run('corto', 's', 'n', 'v', NOW, LATER, null)).toThrow(/constraint failed/);
    expect(() => insert.run(h('b'), null, 'n', 'v', NOW, LATER, null)).toThrow(/constraint failed/);
    expect(() => insert.run(h('c'), 's', 'n', 'v', LATER, NOW, null)).toThrow(/constraint failed/);
    expect(() => insert.run(h('d'), '', 'n', 'v', NOW, LATER, null)).toThrow(/constraint failed/);
  });

  it('admin_audit_entries: sin clave foránea (la auditoría sobrevive a la identidad), acción acotada y sin columnas de valores', () => {
    const db = migrated();
    const insert = db.prepare('INSERT INTO admin_audit_entries (id, admin_id, action, object_ref, occurred_at) VALUES (?, ?, ?, ?, ?)');
    insert.run(ID_A, ID_B, 'ADMIN_SESSION_START', null, NOW);
    expect(() => insert.run(ID_B, ID_A, '', null, NOW)).toThrow(/constraint failed/);
    expect(() => insert.run(ID_B, ID_A, 'X'.repeat(65), null, NOW)).toThrow(/constraint failed/);
    expect(() => insert.run('corto', ID_A, 'ADMIN_SESSION_END', null, NOW)).toThrow(/constraint failed/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM admin_audit_entries').get()).toEqual({ n: 1 });
  });

  it('los índices de purga y consulta existen', () => {
    const db = migrated();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'admin_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual([
      'admin_audit_entries_admin_occurred',
      'admin_identities_email',
      'admin_identities_subject',
      'admin_oauth_flow_states_expires',
      'admin_sessions_admin_id',
      'admin_sessions_created',
    ]);
  });
});

describe('T1232 [REQ-ADM9-006] la migración 0015 de Postgres es la equivalente y la última', () => {
  it('existe, es la última y no tiene BEGIN/COMMIT (el migrador abre la transacción)', () => {
    const names = readdirSync(PG_DIR).sort();
    expect(names.at(-1)).toBe(PG_MIGRATION);
    expect(names).toHaveLength(15);
    const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT)\b/i);
    for (const table of ['admin_identities', 'admin_sessions', 'admin_oauth_flow_states', 'admin_audit_entries']) expect(sql).toContain(`CREATE TABLE ${table}`);
    expect(sql).not.toMatch(/ALTER TABLE (users|audit_log)/i);
  });

  it('declara los mismos índices que SQLite', () => {
    const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8');
    for (const index of ['admin_audit_entries_admin_occurred', 'admin_identities_email', 'admin_identities_subject', 'admin_oauth_flow_states_expires', 'admin_sessions_admin_id', 'admin_sessions_created']) {
      expect(sql, index).toContain(`INDEX ${index}`);
    }
  });
});
