/**
 * T535 [US2]: `symptomType` y `severity` se guardan y se leen igual en SQLite (documento `data`, sin columna nueva), un parámetro anterior
 * a la 004 sigue legible con ambos nulos y un registro incoherente no se guarda (INV-SIN-001, REQ-SIN-001).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';

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
const record = (extra: Record<string, unknown>) => ({
  id: 'b1000000-0000-4000-8000-000000000001',
  petId: ARGOS.id,
  recordedAt: '2026-11-05',
  category: 'SYMPTOM',
  title: 'Vómito',
  description: 'Dos veces.',
  notes: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  symptomType: 'VOMIT',
  severity: 'MODERATE',
  ...extra,
}) as never;

describe('T535 síntomas en SQLite (REQ-SIN-001, INV-SIN-001)', () => {
  it('guarda y lee symptomType y severity; el listado de la mascota lo devuelve', async () => {
    const uow = await sqlite();
    await uow.runInTransaction((r) => r.records.add('customParameters', record({})));
    const listed = await uow.runInTransaction(async (r) => (await r.records.listForPet(ARGOS.id)).customParameters);
    expect(listed.find((c) => c.id === 'b1000000-0000-4000-8000-000000000001')).toMatchObject({ category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MODERATE' });
  });

  it('un parámetro anterior a la 004 (sin symptomType ni severity) sigue legible', async () => {
    const uow = await sqlite();
    const listed = await uow.runInTransaction(async (r) => (await r.records.listForPet(ARGOS.id)).customParameters);
    expect(listed.length).toBeGreaterThan(0);
    for (const c of listed) expect(c.category).not.toBe('SYMPTOM');
  });

  it('un registro incoherente (SYMPTOM sin tipo, tipo desconocido o ALLERGY con tipo) no se guarda', async () => {
    const uow = await sqlite();
    for (const extra of [{ symptomType: null, severity: null }, { symptomType: 'FEVER' }, { category: 'ALLERGY' }, { severity: 'GRAVE' }]) {
      const error = await uow.runInTransaction((r) => r.records.add('customParameters', record(extra))).then(() => null, (e: unknown) => e);
      expect(error instanceof DomainError ? error.code : String(error), JSON.stringify(extra)).toBe('ERR-INTERNAL-UNEXPECTED');
    }
  });

  it('reemplazar un síntoma conserva la forma y editar su intensidad persiste', async () => {
    const uow = await sqlite();
    await uow.runInTransaction((r) => r.records.add('customParameters', record({})));
    await uow.runInTransaction((r) => r.records.replace('customParameters', record({ severity: 'SEVERE' })));
    const listed = await uow.runInTransaction(async (r) => (await r.records.listForPet(ARGOS.id)).customParameters);
    expect(listed.find((c) => c.id === 'b1000000-0000-4000-8000-000000000001')).toMatchObject({ severity: 'SEVERE' });
  });
});
