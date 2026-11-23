import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { STATE_ACCT9_001 } from '../../../src/generated/v35/machines/account-registration.machine.ts';
import { DEFAULT_MIGRATIONS_DIR, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1242 (pruebas rojas, Feature 009, Fase 4, #18) / T1243 (migración, Nivel 2 pre-autorizada por Neo): máquina cerrada STATE-ACCT9-001 y migración aditiva de `users.account_status`
 * con filas previas (cuentas existentes `ACTIVE`, paridad SQLite/Postgres). REQ-APR9-001, REQ-APR9-003, REQ-APR9-004, REQ-APR9-007, EDGE-009-001; SC-009-005.
 * La paridad estática vive en `schema-parity.spec.ts`; la viva (PG17) en `schema-parity.spec.ts` con TEST_DATABASE_URL.
 *
 * Parte 1 (máquina): el módulo `src/domain/account/account-status.ts` lo implementó T1246 (MIF-03, un solo archivo); las pruebas ya no llevan `it.fails` y pasan.
 */
const MIGRATION = '0020_account_status.sql';
const PG_MIGRATION = '0016_account_status.sql';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-11-23T10:00:00.000Z';

const opened: SqliteDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- Parte 1: la máquina cerrada (ROJO hasta T1246)
type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';
interface AccountStatusModule {
  ACCOUNT_STATUSES: readonly AccountStatus[];
  /** `APPROVE` y `REJECT` son los únicos eventos; devuelve el estado siguiente o `null` si la transición no existe. */
  nextAccountStatus: (from: AccountStatus, event: 'APPROVE' | 'REJECT') => AccountStatus | null;
  canTransitionAccountStatus: (from: AccountStatus, to: AccountStatus) => boolean;
}
// Ruta en variable: el módulo aún no existe (T1246) y `tsc` no debe resolverlo estáticamente.
const MODULE_PATH = '../../../src/domain/account/account-status.ts';
const load = async (): Promise<AccountStatusModule> => (await import(/* @vite-ignore */ MODULE_PATH)) as AccountStatusModule;
const STATES = ['PENDING', 'ACTIVE', 'REJECTED'] as const;

describe('T1242 [STATE-ACCT9-001][REQ-APR9-003] la máquina cerrada de estado de cuenta (T1246)', () => {
  it('el contrato compilado declara los tres estados y solo PENDING -> ACTIVE | REJECTED', () => {
    expect(Object.keys(STATE_ACCT9_001.states).sort()).toEqual([...STATES].sort());
    expect(STATE_ACCT9_001.initialState).toBe('PENDING');
    expect(STATE_ACCT9_001.transitions.map((t) => `${t.from}->${t.to}:${t.event}`).sort()).toEqual(['PENDING->ACTIVE:APPROVE', 'PENDING->REJECTED:REJECT']);
  });

  it('los estados del dominio son exactamente los del contrato', async () => {
    expect([...(await load()).ACCOUNT_STATUSES].sort()).toEqual([...STATES].sort());
  });

  it('PENDING aprueba a ACTIVE y rechaza a REJECTED', async () => {
    const m = await load();
    expect(m.nextAccountStatus('PENDING', 'APPROVE')).toBe('ACTIVE');
    expect(m.nextAccountStatus('PENDING', 'REJECT')).toBe('REJECTED');
    expect(m.canTransitionAccountStatus('PENDING', 'ACTIVE')).toBe(true);
    expect(m.canTransitionAccountStatus('PENDING', 'REJECTED')).toBe(true);
  });

  it('no existe REJECTED -> PENDING ni REJECTED -> ACTIVE (el reintento solo tras la purga, REQ-APR9-004)', async () => {
    const m = await load();
    expect(m.canTransitionAccountStatus('REJECTED', 'PENDING')).toBe(false);
    expect(m.canTransitionAccountStatus('REJECTED', 'ACTIVE')).toBe(false);
    expect(m.nextAccountStatus('REJECTED', 'APPROVE')).toBeNull();
    expect(m.nextAccountStatus('REJECTED', 'REJECT')).toBeNull();
  });

  it('ACTIVE es terminal para esta máquina y no hay autotransiciones: toda transición fuera de las dos declaradas es inválida', async () => {
    const m = await load();
    const allowed = new Set(['PENDING->ACTIVE', 'PENDING->REJECTED']);
    for (const from of STATES) for (const to of STATES) expect(m.canTransitionAccountStatus(from, to), `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
    expect(m.nextAccountStatus('ACTIVE', 'APPROVE')).toBeNull();
    expect(m.nextAccountStatus('ACTIVE', 'REJECT')).toBeNull();
  });

  it('cada rechazo declarado en rejectedTransitions del contrato es inválido en el dominio', async () => {
    const m = await load();
    for (const r of STATE_ACCT9_001.rejectedTransitions) expect(m.canTransitionAccountStatus(r.from as AccountStatus, r.to as AccountStatus), `${r.from}->${r.to}`).toBe(false);
  });
});

// ---------------------------------------------------------------- Parte 2: la migración con filas previas (T1243)
function productionDatabase(): { db: SqliteDatabase; migrationsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'argos-acct-'));
  dirs.push(dir);
  const migrationsDir = join(dir, 'migraciones');
  mkdirSync(migrationsDir);
  for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name !== MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
  opened.push(db);
  for (const [id, name] of [['u1', 'ana'], ['u2', 'beto']] as const) db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run(id, name, 'hash', JSON.stringify({ id, username: name }));
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
const insertUser = (db: SqliteDatabase, id: string, status: string, decidedAt: string | null = null, decidedBy: string | null = null) =>
  db.prepare('INSERT INTO users (id, username, password_hash, data, account_status, decided_at, decided_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, `user-${id}`, 'hash', '{}', status, decidedAt, decidedBy);

describe('T1243 [REQ-APR9-004][SC-009-005][EDGE-009-001] la migración SQLite 0020 sobre una base con cuentas previas', () => {
  it('la 0020 existe, es la última de SQLite y se aplica sola sobre 0019', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-1)).toBe(MIGRATION);
    const { db, migrationsDir } = productionDatabase();
    expect(upgrade(db, migrationsDir)).toEqual([MIGRATION]);
  });

  it('las cuentas existentes quedan ACTIVE, sin fecha ni autor de decisión, y conservan sus datos', () => {
    const { db, migrationsDir } = productionDatabase();
    const before = db.prepare('SELECT id, username, password_hash, data FROM users ORDER BY id').all();
    upgrade(db, migrationsDir);
    expect(db.prepare('SELECT id, account_status, decided_at, decided_by FROM users ORDER BY id').all()).toEqual([
      { id: 'u1', account_status: 'ACTIVE', decided_at: null, decided_by: null },
      { id: 'u2', account_status: 'ACTIVE', decided_at: null, decided_by: null },
    ]);
    expect(db.prepare('SELECT id, username, password_hash, data FROM users ORDER BY id').all()).toEqual(before);
  });

  it('agrega exactamente tres columnas a users (account_status NOT NULL, decided_at y decided_by anulables) y no toca otras tablas', () => {
    const { db, migrationsDir } = productionDatabase();
    const cols = () => db.prepare("SELECT name, \"notnull\" AS nn, dflt_value AS d FROM pragma_table_info('users') ORDER BY cid").all() as Array<{ name: string; nn: number; d: string | null }>;
    const names = cols().map((c) => c.name);
    const tables = () => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name <> 'users' AND name <> 'schema_migrations' ORDER BY name").all();
    const otherBefore = tables();
    upgrade(db, migrationsDir);
    const after = cols();
    expect(after.map((c) => c.name)).toEqual([...names, 'account_status', 'decided_at', 'decided_by']);
    expect(after.find((c) => c.name === 'account_status')).toMatchObject({ nn: 1, d: "'ACTIVE'" });
    expect(after.find((c) => c.name === 'decided_at')).toMatchObject({ nn: 0, d: null });
    expect(after.find((c) => c.name === 'decided_by')).toMatchObject({ nn: 0, d: null });
    expect(tables()).toEqual(otherBefore);
  });

  it('el estado es un enum cerrado y la decisión es coherente (PENDING sin decisión, REJECTED con fecha, autor solo con fecha)', () => {
    const db = migrated();
    expect(() => insertUser(db, 'a', 'SUSPENDED')).toThrow(/CHECK/);
    expect(() => insertUser(db, 'b', 'PENDING', NOW)).toThrow(/CHECK/);
    expect(() => insertUser(db, 'c', 'REJECTED', null)).toThrow(/CHECK/);
    expect(() => insertUser(db, 'd', 'ACTIVE', null, ADMIN_ID)).toThrow(/CHECK/);
    expect(() => insertUser(db, 'e', 'REJECTED', NOW, 'corto')).toThrow(/CHECK/);
    insertUser(db, 'f', 'PENDING');
    insertUser(db, 'g', 'ACTIVE', NOW, ADMIN_ID);
    insertUser(db, 'h', 'REJECTED', NOW, ADMIN_ID);
    expect(db.prepare('SELECT id, account_status FROM users WHERE id IN (?, ?, ?) ORDER BY id').all('f', 'g', 'h')).toEqual([{ id: 'f', account_status: 'PENDING' }, { id: 'g', account_status: 'ACTIVE' }, { id: 'h', account_status: 'REJECTED' }]);
  });

  it('una fila insertada sin mencionar el estado (código previo a la 009) nace ACTIVE por el defecto de columna', () => {
    const db = migrated();
    db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run('n1', 'nuevo', 'hash', '{}');
    expect(db.prepare('SELECT account_status FROM users WHERE id = ?').get('n1')).toEqual({ account_status: 'ACTIVE' });
  });
});

describe('T1243 [REQ-APR9-004] la migración 0016 de Postgres es la equivalente y la última', () => {
  it('existe, es la última, no tiene BEGIN/COMMIT y es aditiva (solo ALTER TABLE users, sin DROP ni reescritura)', () => {
    expect(readdirSync(PG_DIR).sort().at(-1)).toBe(PG_MIGRATION);
    const sql = readFileSync(new URL(PG_MIGRATION, PG_DIR), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT|DROP|UPDATE|DELETE)\b/i);
    expect(sql).toMatch(/ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE'/);
    expect(sql).toMatch(/ADD COLUMN decided_at TEXT;/);
    expect(sql).toMatch(/ADD COLUMN decided_by TEXT;/);
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) expect(stmt).toMatch(/^ALTER TABLE users /);
  });
});
