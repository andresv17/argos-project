/**
 * T601 [US2] candado de mascota y de propietario en la unidad de trabajo (REQ-BOR-005, INV-REG-003, SC-CAT-028):
 *  - SQLite: `BEGIN IMMEDIATE` toma el candado de escritura al abrir la transacción, ANTES de cualquier lectura: una segunda conexión
 *    recibe SQLITE_BUSY mientras la primera está abierta.
 *  - PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL): `SELECT … FOR UPDATE` sobre la fila de la mascota es lo primero que lee cada
 *    mutación de registros, aunque el candado asesor global ya serialice a los escritores (cinturón y tirantes: el candado de fila es el del
 *    contrato y sigue valiendo si el global se relaja); si otra sesión retiene la fila de la mascota, la mutación espera. El candado del
 *    propietario (`users … FOR UPDATE`) se toma ANTES que el de la mascota (orden usuario → mascota, sin ciclos).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { lockOwnerThenPet } from '../../../src/application/use-cases/use-case-support.ts';
import { AddWeightRecordUseCase, DeleteRecordUseCase, UpdateRecordUseCase } from '../../../src/application/use-cases/record-use-cases.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, canonicalState, createDeps, envelope } from '../../fixtures/application-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL, gate } from '../../fixtures/concurrent-engines.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const WEIGHT = envelope.records.weights.filter((w) => w.petId === ARGOS.id).at(-1)!;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('T601 SQLite: BEGIN IMMEDIATE toma el candado antes de leer (REQ-BOR-005)', () => {
  it('[REQ-BOR-005][INV-REG-003] con una transacción abierta, una segunda conexión recibe SQLITE_BUSY al abrir la suya', async () => {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-t601-'));
    const dbA = openSqliteDatabase(join(dir, 'argos.sqlite'));
    const uowA = new SqliteUnitOfWork(dbA);
    await seedSqlite(uowA, canonicalState());
    const dbB = openSqliteDatabase(join(dir, 'argos.sqlite'));
    dbB.pragma('busy_timeout = 0');
    cleanups.push(() => {
      dbA.close();
      dbB.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const entered = gate();
    const hold = gate();
    const pending = uowA.runInTransaction(async () => {
      entered.open();
      await hold.promise;
    });
    await entered.promise;
    expect(() => dbB.exec('BEGIN IMMEDIATE')).toThrowError(expect.objectContaining({ code: 'SQLITE_BUSY' }));
    hold.open();
    await pending;
    dbB.exec('BEGIN IMMEDIATE'); // confirmada la primera, la segunda ya puede
    dbB.exec('ROLLBACK');
  });
});

describe('T601 memoria: lockOwnerThenPet es inocuo (las transacciones ya van en serie)', () => {
  it('[REQ-BOR-005] sobre memoria no falla y deja el estado intacto', async () => {
    const uow = new InMemoryUnitOfWork(canonicalState());
    const before = JSON.stringify(uow.snapshot());
    await uow.runInTransaction((r) => lockOwnerThenPet(r, ARGOS.id));
    expect(JSON.stringify(uow.snapshot())).toBe(before);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T601 PostgreSQL real: SELECT … FOR UPDATE de la mascota y del propietario (REQ-BOR-005)', { timeout: 60_000 }, () => {
  interface Rig {
    readonly uow: PostgresUnitOfWork;
    readonly recorded: string[];
    readonly raw: PoolClientLike;
    readonly depsOf: () => ReturnType<typeof createDeps>;
  }

  async function rig(): Promise<Rig> {
    const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
    const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 6 });
    await pool.query(POSTGRES_SCHEMA_SQL);
    const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
    await seedSqlite(new PostgresUnitOfWork(pool, createPostgresRepositories), canonicalState());
    const recorded: string[] = [];
    const recordingPool: PoolLike = {
      ...pool,
      on: (event, handler) => pool.on(event, handler),
      end: () => pool.end(),
      query: (text, values) => pool.query(text, values),
      connect: async () => {
        const client = await pool.connect();
        return { release: (error) => client.release(error), query: (text, values) => (recorded.push(text), client.query(text, values)) };
      },
    };
    const raw = await pool.connect();
    cleanups.push(async () => {
      await raw.query('ROLLBACK').catch(() => undefined);
      raw.release();
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    });
    const uow = new PostgresUnitOfWork(recordingPool, createPostgresRepositories);
    return { uow, recorded, raw, depsOf: () => createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()) };
  }

  const dataStatements = (recorded: readonly string[]) => recorded.filter((sql) => !/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock)/.test(sql));
  const forUpdate = (table: string) => new RegExp(`FROM ${table}\\b[^;]*FOR UPDATE`);

  it('[REQ-BOR-005][SC-CAT-028] lo primero que lee DeleteRecordUseCase, UpdateRecordUseCase y AddWeightRecordUseCase es la fila de la mascota con FOR UPDATE', async () => {
    const { uow, recorded, depsOf } = await rig();
    const deps = depsOf();
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['alta', () => new AddWeightRecordUseCase(deps).execute(ANDRES, ARGOS.id, { weightKg: 20.5, recordedAt: '2026-11-01' })],
      ['edición', () => new UpdateRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id, { collection: 'weights', notes: 'x' })],
      ['borrado', () => new DeleteRecordUseCase(deps).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id)],
    ];
    expect(uow).toBeDefined();
    for (const [label, run] of cases) {
      recorded.length = 0;
      await run();
      expect(dataStatements(recorded)[0], `${label}: primera lectura`).toMatch(forUpdate('pets'));
    }
  });

  it('[REQ-BOR-005] orden usuario → mascota: el candado del propietario (users FOR UPDATE) va ANTES que el de la mascota (pets FOR UPDATE)', async () => {
    const { uow, recorded } = await rig();
    recorded.length = 0;
    await uow.runInTransaction((r) => lockOwnerThenPet(r, ARGOS.id));
    const statements = dataStatements(recorded);
    const owner = statements.findIndex((sql) => forUpdate('users').test(sql));
    const pet = statements.findIndex((sql) => forUpdate('pets').test(sql));
    expect(owner, 'toma el candado del propietario').toBeGreaterThanOrEqual(0);
    expect(pet, 'toma el candado de la mascota').toBeGreaterThan(owner);
  });

  it('[REQ-BOR-005][INV-REG-003] si otra sesión retiene la fila de la mascota con FOR UPDATE, la mutación espera hasta que la libere y entonces se aplica', async () => {
    const { uow, raw, depsOf } = await rig();
    expect(uow).toBeDefined();
    await raw.query('BEGIN');
    await raw.query('SELECT id FROM pets WHERE id = $1 FOR UPDATE', [ARGOS.id]);
    let done = false;
    const pending = new DeleteRecordUseCase(depsOf()).execute(ANDRES, ARGOS.id, 'weights', WEIGHT.id).then(() => (done = true));
    await pause(300);
    expect(done, 'la mutación espera el candado de la mascota').toBe(false);
    await raw.query('COMMIT');
    await pending;
    expect(done).toBe(true);
  });

  it('[REQ-BOR-005] si otra sesión retiene la fila del propietario con FOR UPDATE, lockOwnerThenPet espera hasta que la libere', async () => {
    const { uow, raw } = await rig();
    await raw.query('BEGIN');
    await raw.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [ANDRES]);
    let done = false;
    const pending = uow.runInTransaction((r) => lockOwnerThenPet(r, ARGOS.id)).then(() => (done = true));
    await pause(300);
    expect(done, 'espera el candado del propietario').toBe(false);
    await raw.query('COMMIT');
    await pending;
    expect(done).toBe(true);
  });
});
