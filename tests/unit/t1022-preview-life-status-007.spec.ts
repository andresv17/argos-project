import { describe, expect, it } from 'vitest';
import { ExportBackupUseCase, PreviewBackupImportUseCase } from '../../src/application/use-cases/backup-use-cases.ts';
import type { PetProfile } from '../../src/generated/index.ts';
import { ANDRES, createHarness } from '../fixtures/application-harness.ts';
import { v3, validBackupState } from '../fixtures/backup-harness.ts';

/**
 * T1022 (007, REQ-FAL7-009, SC-007-030): la previsualización de la importación por reemplazo lista `lifeStatusChanges`
 * ({petId, from, to}) de las mascotas que CONSERVAN su `id` y cambiarían de estado vital (p. ej. DECEASED a ALIVE);
 * ausente si no hay cambios; sin datos personales (solo id y estados) y sin escribir nada.
 *
 * @implements REQ-FAL7-009
 */
/** Archivo 3.2.0 canónico: lo que exporta la 007 sobre el estado de referencia, con el estado vital que dicte `lifeFor`. */
const FILE_32 = async (lifeFor: (pet: Record<string, unknown>, index: number) => Record<string, unknown>): Promise<string> => {
  const exported = await new ExportBackupUseCase(createHarness(validBackupState()).deps).execute(ANDRES);
  const envelope = exported.envelope as unknown as { pets: Record<string, unknown>[] };
  return JSON.stringify({ ...envelope, pets: envelope.pets.map((pet, index) => ({ ...pet, ...lifeFor(pet, index) })) });
};
const ALIVE = { lifeStatus: 'ALIVE', deceasedAt: null };
const DECEASED = { lifeStatus: 'DECEASED', deceasedAt: '2026-10-01' };

function stateWithDeceased(ids: readonly string[]) {
  const state = validBackupState();
  state.pets = state.pets.map((pet): PetProfile => (ids.includes(pet.id) ? ({ ...pet, lifeStatus: 'DECEASED', deceasedAt: '2026-10-01' } as PetProfile) : pet));
  return state;
}
const ownPetIds = () => validBackupState().pets.filter((p) => p.ownerUserId === ANDRES).map((p) => p.id);

describe('T1022: lifeStatusChanges en la previsualización (REQ-FAL7-009, SC-007-030)', () => {
  it('[REQ-FAL7-009][SC-007-030] una fallecida actual que el archivo trae viva aparece como {petId, from: DECEASED, to: ALIVE} y la previsualización no escribe', async () => {
    const [first] = ownPetIds();
    const h = createHarness(stateWithDeceased([first!]));
    const before = JSON.stringify(h.uow.snapshot());
    const result = await new PreviewBackupImportUseCase(h.deps).execute(ANDRES, await FILE_32(() => ALIVE));
    expect(result.lifeStatusChanges).toEqual([{ petId: first, from: 'DECEASED', to: 'ALIVE' }]);
    expect(JSON.stringify(h.uow.snapshot())).toBe(before);
  });

  it('[REQ-FAL7-009][SC-007-030] el sentido inverso (viva actual, fallecida en el archivo) también se lista, ordenado por petId', async () => {
    const h = createHarness(validBackupState());
    const result = await new PreviewBackupImportUseCase(h.deps).execute(ANDRES, await FILE_32((_pet, index) => (index < 2 ? DECEASED : ALIVE)));
    const changed = (result.lifeStatusChanges ?? []).map((c) => c.petId);
    expect(changed).toEqual([...changed].sort());
    expect(result.lifeStatusChanges).toEqual(
      (await FILE_IDS(2)).map((petId) => ({ petId, from: 'ALIVE', to: 'DECEASED' })).sort((a, b) => (a.petId < b.petId ? -1 : 1)),
    );
  });

  it('[REQ-FAL7-009][SC-007-030] sin diferencias de estado la lista se omite (la forma 002 no cambia)', async () => {
    const h = createHarness(validBackupState());
    const result = await new PreviewBackupImportUseCase(h.deps).execute(ANDRES, await FILE_32(() => ALIVE));
    expect(Object.keys(result)).not.toContain('lifeStatusChanges');
  });

  it('[REQ-FAL7-009][EDGE-007-006] un respaldo 3.0.0 (sin estado vital) sobre una fallecida actual se lee como ALIVE y la lista', async () => {
    const [first] = ownPetIds();
    const h = createHarness(stateWithDeceased([first!]));
    const result = await new PreviewBackupImportUseCase(h.deps).execute(ANDRES, JSON.stringify(v3()));
    expect(result.lifeStatusChanges).toEqual([{ petId: first, from: 'DECEASED', to: 'ALIVE' }]);
  });

  it('[REQ-FAL7-009][REQ-FAL7-010] las entradas solo llevan petId, from y to (sin fecha ni nombre)', async () => {
    const [first] = ownPetIds();
    const h = createHarness(stateWithDeceased([first!]));
    const result = await new PreviewBackupImportUseCase(h.deps).execute(ANDRES, await FILE_32(() => ALIVE));
    expect(Object.keys(result.lifeStatusChanges![0]!).sort()).toEqual(['from', 'petId', 'to']);
  });
});

/** Los `index` primeros ids del archivo exportado (mismo orden que usa FILE_32). */
async function FILE_IDS(count: number): Promise<string[]> {
  const exported = await new ExportBackupUseCase(createHarness(validBackupState()).deps).execute(ANDRES);
  return exported.envelope.pets.slice(0, count).map((pet) => pet.id);
}
