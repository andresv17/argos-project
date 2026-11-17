import { describe, expect, it } from 'vitest';
import { DeterministicFaultInjector, InjectedWriteFailure } from '../../src/infrastructure/persistence/fault-injector.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { ANDRES, ARGOS, canonicalState } from '../fixtures/application-harness.ts';
import { dumpSqlite, seedSqlite } from '../fixtures/sqlite-harness.ts';

/**
 * T277 (STATE-BACKUP-001, SC-004, ERR-BACKUP-ATOMIC-ROLLBACK): el inyector determinista cuenta las escrituras de cada
 * transacción, falla la elegida y la transacción se descarta entera, en memoria y en SQLite.
 *
 * @implements STATE-BACKUP-001, SC-004, ERR-BACKUP-ATOMIC-ROLLBACK, ERR-INTERNAL-UNEXPECTED
 */
const replaceWork = (uow: { runInTransaction: InMemoryUnitOfWork['runInTransaction'] }) =>
  uow.runInTransaction(async (r) => {
    const owned = await r.pets.listByOwners([ANDRES]);
    for (const pet of owned) {
      await r.records.deleteForPet(pet.id);
      await r.pets.delete(pet.id);
    }
    await r.pets.save(ARGOS);
  });

describe('inyector de fallos determinista (SC-004)', () => {
  it('[SC-004] en memoria: sin fallo solo cuenta; las lecturas no cuentan y las escrituras salen en orden', async () => {
    const injector = new DeterministicFaultInjector(null);
    await replaceWork(new InMemoryUnitOfWork(canonicalState(), { faultInjector: injector }));
    expect(injector.operations.slice(0, 2)).toEqual(['records.deleteForPet', 'pets.delete']);
    expect([injector.operations.length, injector.operations.at(-1), injector.operations.some((o) => /find|list|count/.test(o))]).toEqual([11, 'pets.save', false]);
  });

  it('[SC-004][ERR-BACKUP-ATOMIC-ROLLBACK] en memoria: fallar la escritura N descarta todo, para cada N, y es repetible', async () => {
    const total = new DeterministicFaultInjector(null);
    await replaceWork(new InMemoryUnitOfWork(canonicalState(), { faultInjector: total }));
    const outcomes: Array<[number, boolean, boolean]> = [];
    for (let n = 1; n <= total.operations.length; n += 1) {
      const uow = new InMemoryUnitOfWork(canonicalState(), { faultInjector: new DeterministicFaultInjector(n) });
      const before = JSON.stringify(uow.snapshot());
      const error = await replaceWork(uow).catch((e: unknown) => e);
      outcomes.push([n, error instanceof InjectedWriteFailure && error.writeNumber === n, JSON.stringify(uow.snapshot()) === before]);
    }
    expect(outcomes).toEqual(Array.from({ length: total.operations.length }, (_, i) => [i + 1, true, true]));
  });

  it('[SC-004][ERR-BACKUP-ATOMIC-ROLLBACK] en SQLite: la escritura elegida falla, el ROLLBACK deja el volcado idéntico y sin el inyector la misma transacción confirma', async () => {
    const db = openSqliteDatabase(':memory:');
    const injector = new DeterministicFaultInjector(3);
    const uow = new SqliteUnitOfWork(db, injector);
    await seedSqlite(new SqliteUnitOfWork(db));
    const before = dumpSqlite(db);
    const error = await replaceWork(uow).catch((e: unknown) => e);
    expect([error instanceof InjectedWriteFailure && error.operation, dumpSqlite(db) === before]).toEqual([injector.operations[2], true]);
    await replaceWork(new SqliteUnitOfWork(db));
    expect(dumpSqlite(db) === before).toBe(false);
    db.close();
  });
});
