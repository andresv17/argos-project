/**
 * Motores de pruebas de concurrencia (T600, T601, T613): DOS conexiones al mismo almacenamiento, SQLite (archivo con dos conexiones;
 * la segunda con `busy_timeout = 0`, de modo que un `BEGIN IMMEDIATE` contra la transacción abierta de la primera falla de inmediato con
 * SQLITE_BUSY y el cliente reintenta, como lo haría una segunda instancia) y PostgreSQL 17 real (una sola base con dos transacciones
 * de dos clientes del pool; se OMITE sin TEST_DATABASE_URL). «A» es la transacción que se retiene a mitad de camino con `hold(...)`;
 * «B» es la que llega mientras A sigue abierta.
 *
 * Los ids deterministas de B parten de otra secuencia: dos conexiones jamás repiten un id de entidad ni de auditoría.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { DeterministicIdAdapter } from '../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { canonicalState, createDeps } from './application-harness.ts';
import { seedSqlite } from './sqlite-harness.ts';
import { SpyPasswordHasher } from './test-doubles.ts';
import { allPostgresMigrationsSql } from './postgres-migrations.ts';

export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const REPOSITORIES_PATH = '../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
/** Esquema completo de PostgreSQL (baseline y migraciones posteriores) para las pruebas con base real. */
export const POSTGRES_SCHEMA_SQL = allPostgresMigrationsSql();

/** `prefix` son 8 dígitos hexadecimales: cada conexión y cada tipo de id tiene su propia secuencia. */
const ids = (prefix: string) => Array.from({ length: 200 }, (_, i) => `${prefix}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

export interface Gate {
  readonly promise: Promise<void>;
  open(): void;
}
export function gate(): Gate {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

/** Unidad de trabajo que, tras ejecutar el trabajo y ANTES de confirmar, avisa y espera: la transacción queda abierta con sus candados. */
export function holdBeforeCommit(uow: UnitOfWorkPort, entered: () => void, hold: Promise<void>): UnitOfWorkPort {
  return {
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>, options?: Parameters<UnitOfWorkPort['runInTransaction']>[1]) =>
      uow.runInTransaction(async (repositories) => {
        const result = await work(repositories);
        entered();
        await hold;
        return result;
      }, options),
  };
}

export interface ClientB<T> {
  readonly result: Promise<T>;
  /** Veces que el trabajo de B llegó a ejecutarse (lecturas incluidas): con el candado bien tomado es 0 mientras A retiene el suyo. */
  workStarts(): number;
  busyRejections(): number;
}

/** Cuenta cuántas veces arranca el trabajo de la transacción (después de tomar el candado de la conexión). */
function countingWork(uow: UnitOfWorkPort): { readonly uow: UnitOfWorkPort; starts(): number } {
  let starts = 0;
  return {
    uow: {
      runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>, options?: Parameters<UnitOfWorkPort['runInTransaction']>[1]) =>
        uow.runInTransaction((repositories) => {
          starts += 1;
          return work(repositories);
        }, options),
    },
    starts: () => starts,
  };
}

export interface ConcurrentEngine {
  readonly name: 'SQLite' | 'PostgreSQL';
  /** Dependencias de la conexión A (ids de A), con la unidad de trabajo base. */
  depsA(uow?: UnitOfWorkPort): ApplicationDeps;
  /** Unidades de trabajo de las dos conexiones. */
  readonly uowA: UnitOfWorkPort;
  readonly uowB: UnitOfWorkPort;
  /** Ejecuta `call` como cliente B: en SQLite reintenta ante SQLITE_BUSY (cuenta los rechazos); en PostgreSQL espera el candado. */
  asClientB<T>(call: (deps: ApplicationDeps) => Promise<T>): ClientB<T>;
  /** Filas de auditoría de la entidad: [mutationType, entityType], en orden. */
  audit(entityId: string): Promise<string[][]>;
  dispose(): Promise<void>;
}

function depsWithIds(uow: UnitOfWorkPort, entityPrefix: string, auditPrefix: string): ApplicationDeps {
  return { ...createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()), ids: new DeterministicIdAdapter(ids(entityPrefix)), auditIds: new DeterministicIdAdapter(ids(auditPrefix)) };
}

/** Dependencias de la conexión A construidas UNA vez por motor: reloj, ids y auditIds compartidos entre todas las llamadas a depsA(uow), para que la secuencia determinista no se reinicie (audit_log_pkey). */
function stableDepsA(base: UnitOfWorkPort): (uow?: UnitOfWorkPort) => ApplicationDeps {
  const shared = depsWithIds(base, 'aaaaaaa1', 'aaaaaaa2');
  return (uow = base) => ({ ...shared, uow });
}

const isBusy = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SQLITE_BUSY';

export async function createSqliteConcurrentEngine(): Promise<ConcurrentEngine> {
  const cache = join(process.cwd(), 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-concurrencia-'));
  const path = join(dir, 'argos.sqlite');
  const dbA: SqliteDatabase = openSqliteDatabase(path);
  const uowA = new SqliteUnitOfWork(dbA);
  await seedSqlite(uowA, canonicalState());
  const dbB: SqliteDatabase = openSqliteDatabase(path);
  dbB.pragma('busy_timeout = 0');
  const uowB = new SqliteUnitOfWork(dbB);
  return {
    name: 'SQLite',
    uowA,
    uowB,
    depsA: stableDepsA(uowA),
    asClientB(call) {
      let busy = 0;
      const counting = countingWork(uowB);
      const deps = depsWithIds(counting.uow, 'ccccccc1', 'ccccccc2');
      const result = (async () => {
        for (;;) {
          try {
            return await call(deps);
          } catch (error) {
            if (!isBusy(error)) throw error;
            busy += 1;
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
      })();
      return { result, workStarts: counting.starts, busyRejections: () => busy };
    },
    audit: async (entityId) =>
      (dbA.prepare("SELECT mutation_type, entity_type FROM audit_log WHERE entity_id = ? AND mutation_type <> 'MIGRATION' ORDER BY timestamp, id").all(entityId) as Array<{ mutation_type: string; entity_type: string }>).map((r) => [r.mutation_type, r.entity_type]),
    async dispose() {
      dbA.close();
      dbB.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function createPostgresConcurrentEngine(): Promise<ConcurrentEngine> {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 6 });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uowA = new PostgresUnitOfWork(pool, createPostgresRepositories);
  const uowB = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uowA, canonicalState());
  return {
    name: 'PostgreSQL',
    uowA,
    uowB,
    depsA: stableDepsA(uowA),
    asClientB(call) {
      const counting = countingWork(uowB);
      return { result: call(depsWithIds(counting.uow, 'ccccccc1', 'ccccccc2')), workStarts: counting.starts, busyRejections: () => 0 };
    },
    audit: async (entityId) =>
      (await pool.query('SELECT mutation_type, entity_type FROM audit_log WHERE entity_id = $1 ORDER BY timestamp, id', [entityId])).rows.map((r) => [String(r['mutation_type']), String(r['entity_type'])]),
    async dispose() {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
}
