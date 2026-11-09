import { afterEach, describe, expect, it } from 'vitest';
import { ImportBackupUseCase, type BackupImportStep } from '../../../src/application/use-cases/backup-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, LUNA } from '../../fixtures/application-harness.ts';
import { UNTIL_COMMIT, V2_UNTIL_INVARIANTS, failure, path, v2 } from '../../fixtures/backup-harness.ts';
import { dumpSqlite, seedSqlite } from '../../fixtures/sqlite-harness.ts';

/** Importación de respaldo (TASK-109) sobre la unidad de trabajo SQLite: C-1, C-5 y la convención de rollback. */
const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setup() {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow);
  const steps: BackupImportStep[] = [];
  const importer = new ImportBackupUseCase({ uow, clock: new FixedClockAdapter() });
  return { db, uow, steps, run: (payload: string) => importer.execute(ANDRES, payload, (s) => steps.push(s)) };
}

describe('TASK-110: importación de respaldo sobre SqliteUnitOfWork', () => {
  it('[INV-PET-005] el sobre canónico se importa sobre SQLite: los datos del usuario se reemplazan y los de otros usuarios no cambian', async () => {
    const { uow, steps, run } = await setup();
    const result = await run(JSON.stringify(v2()));
    const after = await uow.runInTransaction(async (r) => [(await r.pets.listByOwners([ANDRES])).length, await r.pets.findById(LUNA.id)]);
    expect([result.finalState, path(steps).at(-1), after]).toEqual(['COMPLETED', 'COMMIT_SUCCESS>COMPLETED', [v2().pets.length, LUNA]]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] C-1 y C-5: con SQLite, un dato corrupto leído al comprobar IDs ajenos es STORAGE_READ_FAILED, con finalState ROLLED_BACK y sin cambios', async () => {
    const { db, steps, run } = await setup();
    db.prepare('UPDATE pets SET data = ? WHERE id = ?').run('{corrupto', ARGOS.id);
    const before = dumpSqlite(db);
    const error = await failure(run(JSON.stringify(v2())));
    expect([error.code, error.status, error.finalState, path(steps), dumpSqlite(db) === before]).toEqual([
      'ERR-INTERNAL-UNEXPECTED',
      500,
      'ROLLED_BACK',
      [...V2_UNTIL_INVARIANTS, 'STORAGE_READ_FAILED>ROLLED_BACK'],
      true,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] C-1: findPetIdOfRecord de SQLite detecta un registro de otro usuario y la importación no toca nada', async () => {
    const { db, uow, run, steps } = await setup();
    const foreignRecord = { ...v2().records.weights[0]!, id: 'ffffffff-ffff-4fff-8fff-ffffffffff01', petId: LUNA.id };
    await uow.runInTransaction((r) => r.records.add('weights', foreignRecord));
    const before = dumpSqlite(db);
    const error = await failure(run(JSON.stringify(v2((e) => e.records.weights.push({ ...e.records.weights[0]!, id: foreignRecord.id })))));
    expect([error.code, error.finalState, path(steps).at(-1), dumpSqlite(db) === before]).toEqual([
      'ERR-BACKUP-REFERENTIAL-INTEGRITY',
      'ROLLED_BACK',
      'ORPHAN_DUPLICATE_OR_FOREIGN_ID>ROLLED_BACK',
      true,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] un fallo real de SQLite al escribir el snapshot es STORAGE_ERROR (ERR-BACKUP-ATOMIC-ROLLBACK) y la base queda byte a byte igual', async () => {
    const { db, steps, run } = await setup();
    db.exec("CREATE TEMP TRIGGER fallo_disco BEFORE INSERT ON weights BEGIN SELECT RAISE(ABORT, 'disco lleno simulado'); END;");
    const before = dumpSqlite(db);
    const error = await failure(run(JSON.stringify(v2())));
    expect([error.code, error.status, error.finalState, path(steps), dumpSqlite(db) === before]).toEqual([
      'ERR-BACKUP-ATOMIC-ROLLBACK',
      500,
      'ROLLED_BACK',
      [...UNTIL_COMMIT, 'STORAGE_ERROR>ROLLED_BACK'],
      true,
    ]);
  });
});
