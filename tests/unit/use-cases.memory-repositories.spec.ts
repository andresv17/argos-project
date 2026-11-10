import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork, emptyMemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { ARGOS, canonicalState } from '../fixtures/application-harness.ts';
import { defineRepositoryContractSuite } from '../fixtures/repository-contract-suite.ts';

defineRepositoryContractSuite('memoria', () => new InMemoryUnitOfWork());

describe('particularidades de InMemoryUnitOfWork (src/infrastructure/persistence/memory/in-memory-unit-of-work.ts)', () => {
  it('[INV-ARCH-005] si beforeCommit lanza, la transacción se descarta y la siguiente funciona normalmente', async () => {
    let failNext = true;
    const uow = new InMemoryUnitOfWork(emptyMemoryState(), {
      beforeCommit: () => {
        if (failNext) {
          failNext = false;
          throw new Error('fallo de commit');
        }
      },
    });
    let message = 'sin error';
    try {
      await uow.runInTransaction((r) => r.pets.save(ARGOS));
    } catch (error) {
      message = (error as Error).message;
    }
    expect([message, uow.snapshot().pets]).toEqual(['fallo de commit', []]);
    await uow.runInTransaction((r) => r.pets.save(ARGOS));
    expect(uow.snapshot().pets).toEqual([ARGOS]);
  });

  it('[INV-ARCH-005] el estado inicial y snapshot() son copias: modificarlos no altera el estado confirmado', async () => {
    const initial = canonicalState();
    const uow = new InMemoryUnitOfWork(initial);
    initial.pets.length = 0;
    uow.snapshot().users.length = 0;
    expect(uow.snapshot()).toEqual(canonicalState());
  });
});
