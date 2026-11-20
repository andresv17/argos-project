/**
 * T525 [US1]: `breedCode` se guarda y se lee igual en SQLite (documento `data`, sin columna nueva), una mascota anterior sin
 * `breedCode` sigue legible y un perfil incoherente no se guarda (INV-RAZ-001, REQ-RAZ-003).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ARGOS as ARGOS_001 } from '../../fixtures/application-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';

const ARGOS = upgradePet(ARGOS_001);
const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
});
async function sqlite(): Promise<SqliteUnitOfWork> {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow);
  return uow;
}
const withBreed = (extra: Record<string, unknown>) => ({ ...ARGOS, ...extra }) as typeof ARGOS & { breedCode?: string | null };

describe('T525 breedCode en SQLite (REQ-RAZ-003, INV-RAZ-001)', () => {
  it('guarda y lee breedCode con su breed derivado, y el listado lo devuelve', async () => {
    const uow = await sqlite();
    const pet = withBreed({ breedCode: 'DOG_BEAGLE', breed: 'Beagle' });
    await uow.runInTransaction((r) => r.pets.save(pet));
    expect(await uow.runInTransaction((r) => r.pets.findById(ARGOS.id))).toEqual({ ...pet, lifeStatus: 'ALIVE', deceasedAt: null, version: 2 }); // 007: campos nuevos; guardar sobre la fila sembrada (versión 1) sin `version` la incrementa
  });

  it('una mascota anterior sin breedCode se guarda y se lee sin él (la vista lo expone nulo)', async () => {
    const uow = await sqlite();
    const read = await uow.runInTransaction((r) => r.pets.findById(ARGOS.id));
    expect(read?.breedCode).toBeUndefined();
    expect(read?.breed).toBe(ARGOS.breed);
  });

  it('un perfil con breedCode de otra especie o breed distinto del rótulo no se guarda', async () => {
    const uow = await sqlite();
    for (const extra of [{ breedCode: 'CAT_SIAMES', breed: 'Siamés' }, { breedCode: 'DOG_BEAGLE', breed: 'Golden' }, { breedCode: 'DOG_NO_EXISTE', breed: 'X' }]) {
      const error = await uow.runInTransaction((r) => r.pets.save(withBreed(extra))).then(() => null, (e: unknown) => e);
      expect(error instanceof DomainError ? error.code : String(error), JSON.stringify(extra)).toBe('ERR-INTERNAL-UNEXPECTED');
    }
    expect((await uow.runInTransaction((r) => r.pets.findById(ARGOS.id)))?.breed).toBe(ARGOS.breed);
  });
});
