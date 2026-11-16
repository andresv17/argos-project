/**
 * T426 (REQ-PG-002, INV-ARCH-005, SC-004 de la 002): el inyector determinista envuelve los repositorios de PostgreSQL y un fallo
 * en la escritura N produce ROLLBACK sin dejar escrituras parciales. Pruebas con un doble transaccional del cliente (las
 * escrituras quedan pendientes hasta el COMMIT y se descartan con el ROLLBACK); sin Postgres. El envoltorio
 * (tests/fixtures/pg-fault-injection.ts) se importa de forma dinámica para que cada prueba falle por separado (pruebas primero).
 * La prueba contra Postgres real se OMITE sin TEST_DATABASE_URL (se aplaza a T431).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { DeterministicFaultInjector, InjectedWriteFailure } from '../../../src/infrastructure/persistence/fault-injector.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { norm } from '../../fixtures/pg-fake-client.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const FIXTURE_PATH = '../../fixtures/pg-fault-injection.ts';
const BASELINE = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0001_baseline.sql', import.meta.url), 'utf8');

interface FaultModule {
  faultInjectingRepositories(
    injector: DeterministicFaultInjector,
    createRepositories: (client: PoolClientLike) => RepositorySet,
  ): (client: PoolClientLike) => RepositorySet;
}
const loadFixture = async (): Promise<FaultModule> => (await import(/* @vite-ignore */ FIXTURE_PATH)) as FaultModule;

const WRITE = /^(INSERT|UPDATE|DELETE)\b/;

/** Doble transaccional: lo escrito entre BEGIN y COMMIT pasa a `committed`; un ROLLBACK lo descarta. */
function transactionalClient() {
  const statements: string[] = [];
  const committed: string[] = [];
  let pending: string[] = [];
  const client: PoolClientLike & { statements: string[]; committed: string[] } = {
    statements,
    committed,
    release: () => undefined,
    async query(text: string) {
      const sql = norm(text);
      statements.push(sql);
      if (sql === 'BEGIN') pending = [];
      else if (sql === 'COMMIT') committed.push(...pending);
      else if (sql === 'ROLLBACK') pending = [];
      else if (WRITE.test(sql)) pending.push(sql);
      return { rows: [], rowCount: 1 };
    },
  };
  return client;
}
const poolOf = (client: PoolClientLike): PoolLike => {
  const pool: PoolLike = { connect: async () => client, query: client.query.bind(client), on: () => pool, end: async () => undefined };
  return pool;
};

const PET = upgradePet(ARGOS);
const replaceWork = (uow: PostgresUnitOfWork) =>
  uow.runInTransaction(async (r) => {
    await r.records.deleteForPet(PET.id);
    await r.pets.delete(PET.id);
    await r.pets.save(PET);
    await r.pets.findById(PET.id);
    await r.records.deleteForPet(PET.id);
  });

async function uowOnPool(pool: PoolLike, injector: DeterministicFaultInjector) {
  const { faultInjectingRepositories } = await loadFixture();
  return new PostgresUnitOfWork(pool, faultInjectingRepositories(injector, createPostgresRepositories));
}
const uowWith = (client: PoolClientLike, injector: DeterministicFaultInjector) => uowOnPool(poolOf(client), injector);

describe('envoltorio de fallos sobre los repositorios de PostgreSQL (SC-004)', () => {
  it('sin fallo solo cuenta: las escrituras salen en orden y las lecturas (find/list/count) no cuentan', async () => {
    const injector = new DeterministicFaultInjector(null);
    const client = transactionalClient();
    await replaceWork(await uowWith(client, injector));
    expect(injector.operations).toEqual(['records.deleteForPet', 'pets.delete', 'pets.save', 'records.deleteForPet']);
    expect(client.statements.at(-1)).toBe('COMMIT');
    expect(client.committed.length).toBeGreaterThan(0);
  });

  it('el contador se reinicia en cada transacción: el N es relativo a la transacción en curso', async () => {
    const injector = new DeterministicFaultInjector(2);
    const client = transactionalClient();
    const uow = await uowWith(client, injector);
    for (let round = 0; round < 2; round += 1) {
      const error = await replaceWork(uow).catch((e: unknown) => e);
      expect(error instanceof InjectedWriteFailure && error.writeNumber).toBe(2);
    }
  });
});

describe('fallo en la escritura N con PostgresUnitOfWork (REQ-PG-002, INV-ARCH-005)', () => {
  it('para cada N: se lanza el error inyectado, hay ROLLBACK sin COMMIT y no queda ninguna escritura confirmada', async () => {
    const count = new DeterministicFaultInjector(null);
    await replaceWork(await uowWith(transactionalClient(), count));
    const total = count.operations.length;
    expect(total).toBe(4);
    const outcomes: Array<[number, boolean, string, boolean, number]> = [];
    for (let n = 1; n <= total; n += 1) {
      const client = transactionalClient();
      const error = await replaceWork(await uowWith(client, new DeterministicFaultInjector(n))).catch((e: unknown) => e);
      outcomes.push([n, error instanceof InjectedWriteFailure && error.writeNumber === n, client.statements.at(-1) ?? '', client.statements.includes('COMMIT'), client.committed.length]);
    }
    expect(outcomes).toEqual(Array.from({ length: total }, (_, i) => [i + 1, true, 'ROLLBACK', false, 0]));
  });

  it('la escritura N nunca llega al cliente y las anteriores sí (SQL emitido = N-1 escrituras)', async () => {
    const full = transactionalClient();
    await replaceWork(await uowWith(full, new DeterministicFaultInjector(null)));
    const writes = full.statements.filter((s) => WRITE.test(s));
    for (let n = 1; n <= 4; n += 1) {
      const client = transactionalClient();
      await replaceWork(await uowWith(client, new DeterministicFaultInjector(n))).catch(() => undefined);
      const emitted = client.statements.filter((s) => WRITE.test(s));
      expect(emitted).toEqual(writes.slice(0, emitted.length));
      expect(emitted.length).toBeLessThan(writes.length);
    }
  });

  it('es repetible: dos corridas con el mismo N producen exactamente la misma secuencia de sentencias', async () => {
    const run = async () => {
      const client = transactionalClient();
      await replaceWork(await uowWith(client, new DeterministicFaultInjector(3))).catch(() => undefined);
      return client.statements;
    };
    expect(await run()).toEqual(await run());
  });

  it('el error original sale sin traducir (no es un DomainError) y el cliente se libera una vez al pool', async () => {
    const client = transactionalClient();
    let released = 0;
    client.release = () => {
      released += 1;
    };
    const error = await replaceWork(await uowWith(client, new DeterministicFaultInjector(1))).catch((e: unknown) => e);
    expect([error instanceof InjectedWriteFailure, released]).toEqual([true, 1]);
  });
});

const TABLES = ['users', 'pets', 'weights', 'vaccinations', 'households', 'household_members', 'pet_assignments', 'audit_log'];

describe.skipIf(!TEST_DATABASE_URL)('fallo en la escritura N sobre PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', { timeout: 60_000 }, () => {
  it('para cada N el ROLLBACK deja las tablas idénticas', async () => {
    const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 2 });
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const table of TABLES) out[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY 1`)).rows;
      return JSON.stringify(out);
    };
    try {
      await pool.query(BASELINE);
      await seedSqlite(new PostgresUnitOfWork(pool, createPostgresRepositories));
      const before = await snapshot();
      for (let n = 1; n <= 4; n += 1) {
        const error = await replaceWork(await uowOnPool(pool, new DeterministicFaultInjector(n))).catch((e: unknown) => e);
        expect(error instanceof InjectedWriteFailure).toBe(true);
        expect(await snapshot()).toBe(before);
      }
    } finally {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    }
  });
});
