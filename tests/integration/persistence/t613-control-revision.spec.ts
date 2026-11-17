/**
 * T613 [P] [US2] control de revisión (D-16 A; SC-CAT-035, EDGE-021; REQ-BOR-005, INV-REG-003) en memoria, SQLite y PostgreSQL 17 real
 * (se OMITE sin TEST_DATABASE_URL):
 *  - dos PATCH con el mismo If-Match: uno responde con `revision + 1` y el otro 409 ERR-REC-CONFLICT, sin cambios ni fila de auditoría;
 *  - un PATCH sin If-Match se rechaza con ERR-SCHEMA-VALIDATION-FAILED (campo If-Match);
 *  - una edición sin cambios efectivos no incrementa `revision` ni audita;
 *  - el alta nace con `revision = 0` y la lectura la devuelve;
 *  - importar un respaldo sobre un `id` existente deja una `revision` MAYOR que la previa (nunca retrocede) y una fila nueva queda en 0;
 *  - con dos conexiones intercaladas (SQLite y PostgreSQL) dos PATCH con el mismo If-Match: uno gana y el otro recibe el 409.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { AddWeightRecordUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../../src/generated/v31/index.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, createDeps, envelope } from '../../fixtures/application-harness.ts';
import { digestOf, validBackupState } from '../../fixtures/backup-harness.ts';
import {
  POSTGRES_SCHEMA_SQL,
  TEST_DATABASE_URL,
  createPostgresConcurrentEngine,
  createSqliteConcurrentEngine,
  gate,
  holdBeforeCommit,
  type ConcurrentEngine,
} from '../../fixtures/concurrent-engines.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const WEIGHT = envelope.records.weights.filter((w) => w.petId === ARGOS.id).at(-1)!;
const EDIT = { collection: 'weights', weightKg: 33 };

interface Engine {
  readonly deps: ApplicationDeps;
  audit(entityId: string): Promise<string[][]>;
  dispose(): Promise<void>;
}
type MakeEngine = () => Promise<Engine>;

const memory: MakeEngine = async () => {
  const uow = new InMemoryUnitOfWork(validBackupState());
  return {
    deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()),
    audit: async (id) => uow.snapshot().auditLog.filter((r) => r.entityId === id).map((r) => [r.mutationType, r.entityType]),
    dispose: async () => undefined,
  };
};
const sqlite: MakeEngine = async () => {
  const db: SqliteDatabase = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, validBackupState());
  return {
    deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()),
    audit: async (id) => (db.prepare("SELECT mutation_type, entity_type FROM audit_log WHERE entity_id = ? AND mutation_type <> 'MIGRATION' ORDER BY timestamp, id").all(id) as Array<{ mutation_type: string; entity_type: string }>).map((r) => [r.mutation_type, r.entity_type]),
    dispose: async () => void (db.open && db.close()),
  };
};
const postgres: MakeEngine = async () => {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uow, validBackupState());
  return {
    deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()),
    audit: async (id) => (await pool.query('SELECT mutation_type, entity_type FROM audit_log WHERE entity_id = $1 ORDER BY timestamp, id', [id])).rows.map((r) => [String(r['mutation_type']), String(r['entity_type'])]),
    dispose: async () => {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

/** Código y campo del error (de la 002 o de la 3.1.0) o `OK`. */
async function outcome(promise: Promise<unknown>): Promise<{ code: string; status: number | null; field: string | null }> {
  try {
    await promise;
    return { code: 'OK', status: null, field: null };
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return { code: error.code, status: error.status, field: error.field };
    throw error;
  }
}

const weightOf = async (deps: ApplicationDeps, id: string) =>
  (await deps.uow.runInTransaction((r) => r.records.listForPet(ARGOS.id))).weights.find((w) => w.id === id) as (typeof WEIGHT & { revision: number }) | undefined;

function define(make: MakeEngine) {
  const open = async () => {
    const engine = await make();
    disposers.push(engine.dispose);
    return engine;
  };

  it('[SC-CAT-035][REQ-BOR-005] un registro nuevo nace con revision 0 y la lectura la devuelve; los sembrados también la traen', async () => {
    const { deps } = await open();
    const created = (await new AddWeightRecordUseCase(deps).execute(ANDRES, ARGOS.id, { weightKg: 20.5, recordedAt: '2026-11-01' })) as unknown as { record: { id: string; revision: number } };
    expect(created.record.revision).toBe(0);
    expect((await weightOf(deps, created.record.id))!.revision).toBe(0);
    expect((await weightOf(deps, WEIGHT.id))!.revision).toBe(0);
  });

  it('[SC-CAT-035][EDGE-021] dos PATCH con el mismo If-Match: el primero responde con revision + 1 y el segundo 409 ERR-REC-CONFLICT, sin cambios ni fila de auditoría', async () => {
    const { deps, audit } = await open();
    const update = new UpdateRecordUseCase(deps);
    const first = (await update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, EDIT, 0)) as unknown as { revision: number; weightKg: number };
    expect([first.revision, first.weightKg]).toEqual([1, 33]);
    expect(await audit(WEIGHT.id)).toEqual([['UPDATE', 'WEIGHT_RECORD']]);
    expect(await outcome(update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', weightKg: 34 }, 0))).toEqual({ code: 'ERR-REC-CONFLICT', status: 409, field: null });
    const stored = (await weightOf(deps, WEIGHT.id))!;
    expect([stored.revision, stored.weightKg]).toEqual([1, 33]);
    expect(await audit(WEIGHT.id)).toEqual([['UPDATE', 'WEIGHT_RECORD']]);
    // Con la revisión nueva, la edición vuelve a aplicarse y suma otra.
    const third = (await update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', weightKg: 34 }, 1)) as unknown as { revision: number };
    expect(third.revision).toBe(2);
  });

  it('[SC-CAT-035][REQ-BOR-005] un PATCH sin If-Match se rechaza con ERR-SCHEMA-VALIDATION-FAILED (campo If-Match) y no cambia nada', async () => {
    const { deps, audit } = await open();
    expect(await outcome(new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, EDIT, null))).toEqual({ code: 'ERR-SCHEMA-VALIDATION-FAILED', status: 422, field: 'If-Match' });
    expect((await weightOf(deps, WEIGHT.id))!.revision).toBe(0);
    expect(await audit(WEIGHT.id)).toEqual([]);
  });

  it('[SC-CAT-035][REQ-BOR-003] una edición sin cambios efectivos no incrementa revision ni escribe fila de auditoría', async () => {
    const { deps, audit } = await open();
    const same = (await new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', weightKg: WEIGHT.weightKg }, 0)) as unknown as { revision: number };
    expect(same.revision).toBe(0);
    expect((await weightOf(deps, WEIGHT.id))!.revision).toBe(0);
    expect(await audit(WEIGHT.id)).toEqual([]);
  });

  it('[SC-CAT-035][REQ-BOR-005][REQ-IMP-001] importar un respaldo sobre un id existente deja una revision mayor que la previa; una fila que no existía queda en 0', async () => {
    const { deps } = await open();
    const update = new UpdateRecordUseCase(deps);
    await update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, EDIT, 0);
    await update.execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', weightKg: 34 }, 1);
    expect((await weightOf(deps, WEIGHT.id))!.revision).toBe(2);
    const { json } = await new ExportBackupUseCase(deps).execute(ANDRES);
    expect(json).not.toContain('"revision"'); // el respaldo no exporta revision
    // Un registro que ya no existe al importar queda nuevo (0); el que existe sube.
    await deps.uow.runInTransaction(async (r) => void (await r.records.remove('weights', ARGOS.id, envelope.records.weights.filter((w) => w.petId === ARGOS.id)[0]!.id)));
    await new ImportBackupUseCase(deps).execute(ANDRES, json, digestOf(json));
    expect((await weightOf(deps, WEIGHT.id))!.revision).toBe(3);
    const restoredId = envelope.records.weights.filter((w) => w.petId === ARGOS.id)[0]!.id;
    expect((await weightOf(deps, restoredId))!.revision).toBe(0);
  });
}

describe('T613 control de revisión (memoria)', () => define(memory));
describe('T613 control de revisión (SQLite)', () => define(sqlite));
describe.skipIf(!TEST_DATABASE_URL)('T613 control de revisión (PostgreSQL 17 real)', { timeout: 60_000 }, () => define(postgres));

function defineConcurrent(create: () => Promise<ConcurrentEngine>) {
  it('[SC-CAT-035][INV-REG-003][EDGE-021] dos PATCH concurrentes con el mismo If-Match en dos conexiones: uno gana (revision + 1) y el otro recibe 409 ERR-REC-CONFLICT con una sola fila UPDATE', async () => {
    const engine = await create();
    disposers.push(() => engine.dispose());
    const entered = gate();
    const hold = gate();
    const a = outcome(new UpdateRecordUseCase(engine.depsA(holdBeforeCommit(engine.uowA, entered.open, hold.promise))).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, EDIT, 0));
    await entered.promise;
    const b = engine.asClientB((deps) => outcome(new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', weightKg: 34 }, 0)));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(b.workStarts(), 'B no lee nada mientras A retiene el candado').toBe(0);
    hold.open();
    expect(await a).toMatchObject({ code: 'OK' });
    expect(await b.result).toMatchObject({ code: 'ERR-REC-CONFLICT', status: 409 });
    expect(await engine.audit(WEIGHT.id)).toEqual([['UPDATE', 'WEIGHT_RECORD']]);
    const stored = (await engine.uowA.runInTransaction((r) => r.records.listForPet(ARGOS.id))).weights.find((w) => w.id === WEIGHT.id) as unknown as { revision: number; weightKg: number };
    expect([stored.revision, stored.weightKg]).toEqual([1, 33]);
  });
}

describe('T613 dos PATCH concurrentes (SQLite, dos conexiones)', () => defineConcurrent(createSqliteConcurrentEngine));
describe.skipIf(!TEST_DATABASE_URL)('T613 dos PATCH concurrentes (PostgreSQL 17 real, dos conexiones)', { timeout: 60_000 }, () => defineConcurrent(createPostgresConcurrentEngine));
