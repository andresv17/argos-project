/**
 * Motores de pruebas de identidad y microchip (T546, T552): los mismos casos de uso sobre memoria, SQLite en memoria y PostgreSQL 17
 * real (esquema desechable propio; se OMITE sin TEST_DATABASE_URL). Cada motor siembra el mismo estado y expone la unidad de trabajo,
 * las dependencias con un espía sobre la verificación de contraseña y la lectura de los fallos de inicio de sesión.
 */
import { randomUUID } from 'node:crypto';
import type { RepositorySet, UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork, type MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { canonicalState, createDeps, USERS } from './application-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from './concurrent-engines.ts';
import { seedSqlite } from './sqlite-harness.ts';
import { FAKE_HASH_PREFIX, SpyPasswordHasher } from './test-doubles.ts';

const REPOSITORIES_PATH = '../../src/infrastructure/persistence/postgres/postgres-repositories.ts';

export type EngineName = 'memoria' | 'SQLite' | 'PostgreSQL';

export interface IdentityEngine {
  readonly name: EngineName;
  readonly uow: UnitOfWorkPort;
  readonly deps: ApplicationDeps;
  readonly clock: FixedClockAdapter;
  readonly hasher: SpyPasswordHasher;
  /** Base SQLite (solo en el motor SQLite) para leer el esquema. */
  readonly sqlite: SqliteDatabase | null;
  /** Consulta SQL cruda (solo SQLite y PostgreSQL; memoria devuelve null). */
  rawQuery(sql: string, values?: unknown[]): Promise<Array<Record<string, unknown>> | null>;
  read<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T>;
  dispose(): Promise<void>;
}

export const ENGINE_NAMES: readonly EngineName[] = ['memoria', 'SQLite', 'PostgreSQL'];
export const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';

/** Cuenta de prueba con hash falso de su contraseña (la verificación del espía es la igualdad con `FAKE_HASH_PREFIX + clave`). */
export function account(id: string, username: string, password: string, email: string | null = null): UserAccount {
  return { id, username, displayName: `Nombre ${username}`, createdAt: '2026-01-01T00:00:00.000Z', email, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: `${FAKE_HASH_PREFIX}${password}` };
}

export const idOf = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Estado canónico (andres, maria.v, carlos_88, lucia.r) más las cuentas extra dadas. */
export function stateWith(extraUsers: readonly UserAccount[], mutate?: (state: MemoryState) => void): MemoryState {
  const state = canonicalState();
  state.users = [...state.users, ...extraUsers];
  mutate?.(state);
  return state;
}

export async function openEngine(name: EngineName, state: MemoryState): Promise<IdentityEngine> {
  const clock = new FixedClockAdapter();
  const hasher = new SpyPasswordHasher();
  if (name === 'memoria') {
    const uow = new InMemoryUnitOfWork(state);
    return { name, uow, deps: createDeps(uow, clock, hasher), clock, hasher, sqlite: null, rawQuery: async () => null, read: (work) => uow.runInTransaction(work), dispose: async () => undefined };
  }
  if (name === 'SQLite') {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow, state);
    return {
      name,
      uow,
      deps: createDeps(uow, clock, hasher),
      clock,
      hasher,
      sqlite: db,
      rawQuery: async (sql, values = []) => db.prepare(sql).all(...(values as never[])) as Array<Record<string, unknown>>,
      read: (work) => uow.runInTransaction(work),
      dispose: async () => void (db.open && db.close()),
    };
  }
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uow, state);
  return {
    name,
    uow,
    deps: createDeps(uow, clock, hasher),
    clock,
    hasher,
    sqlite: null,
    rawQuery: async (sql, values = []) => (await pool.query(sql, values)).rows as Array<Record<string, unknown>>,
    read: (work) => uow.runInTransaction(work),
    dispose: async () => {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
}

export const CANONICAL_USER_IDS = USERS.map((u) => u.id);
