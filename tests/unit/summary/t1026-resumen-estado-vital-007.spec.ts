/**
 * T1026 (007, REQ-FAL7-008, REQ-FAL7-010, SC-007-016, SC-007-031) `ClinicalSummary` 1.1.0 aditivo: `lifeStatus` visible en el perfil y `deceasedAt`
 * solo con el disclosure opt-in del creador (desmarcado por defecto); la edad de una fallecida se calcula hasta `deceasedAt` (REQ-FAL7-007);
 * el documento sigue validando contra el esquema cerrado y `summaryVersion` no cambia.
 *
 * @implements REQ-FAL7-008, REQ-FAL7-010
 */
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary, type SummaryPetInput } from '../../../src/domain/summary/clinical-summary.ts';
import { validateClinicalSummary } from '../../../src/generated/v33/index.ts';
import type { PetProfile } from '../../../src/domain/pet/pet-invariants.ts';
import { ARGOS, canonicalState } from '../../fixtures/application-harness.ts';
import { upgradePet, upgradeRecords } from '../../fixtures/storage-upgrade.ts';

const GENERATED_AT = '2026-11-18T23:30:00.000Z';
const records = upgradeRecords(canonicalState().records);
const empty = { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] } as unknown as SummaryPetInput['records'];
void records;
const deceased = (): PetProfile => ({ ...upgradePet(ARGOS), lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' }) as PetProfile;
const alive = (): PetProfile => ({ ...upgradePet(ARGOS), lifeStatus: 'ALIVE', deceasedAt: null }) as PetProfile;
const input = (pet: PetProfile): SummaryPetInput => ({ pet, records: empty, files: [] });
const OFF = { includeMicrochip: false, includeClinicalFiles: false } as const;

describe('T1026: estado de vida en el ClinicalSummary (REQ-FAL7-008, SC-007-016)', () => {
  it('[REQ-FAL7-008][SC-007-016] lifeStatus es visible (DECEASED y ALIVE) y el resumen valida contra el esquema cerrado 1.1.0', () => {
    const dead = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF);
    expect(dead.pets[0]!.profile.lifeStatus).toBe('DECEASED');
    expect(validateClinicalSummary(dead)).toBe(true);
    const live = buildClinicalSummary('PET', [input(alive())], GENERATED_AT, OFF);
    expect(live.pets[0]!.profile.lifeStatus).toBe('ALIVE');
    expect(validateClinicalSummary(live)).toBe(true);
    expect(live.summaryVersion).toBe('1.0.0');
  });

  it('[REQ-FAL7-008][SC-007-016] sin el disclosure opt-in deceasedAt esta AUSENTE (no null) y la fecha no aparece en el JSON', () => {
    const summary = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF);
    expect('deceasedAt' in summary.pets[0]!.profile).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('2026-06-10');
  });

  it('[REQ-FAL7-008][SC-007-016] con includeDeceasedAt la fecha viaja solo para fallecidas; una viva no la lleva aunque el creador marque la casilla', () => {
    const summary = buildClinicalSummary('HOUSEHOLD', [input(deceased()), input({ ...alive(), id: '99999999-9999-4999-8999-999999999990', name: 'Zeta' })], GENERATED_AT, { ...OFF, includeDeceasedAt: true });
    expect(summary.pets[0]!.profile.deceasedAt).toBe('2026-06-10');
    expect('deceasedAt' in summary.pets[1]!.profile).toBe(false);
    expect(validateClinicalSummary(summary)).toBe(true);
  });

  it('[REQ-FAL7-007][SC-007-016] la edad de una fallecida se calcula hasta deceasedAt (no hasta generatedAt), incluso sin publicar la fecha', () => {
    const dead = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF).pets[0]!.profile;
    const live = buildClinicalSummary('PET', [input(alive())], GENERATED_AT, OFF).pets[0]!.profile;
    expect(dead.age).toEqual({ years: 4, months: 1, totalDays: 1492 });
    expect(live.age.totalDays).toBeGreaterThan(dead.age.totalDays);
  });

  it('[REQ-FAL7-010] una ficha sin los campos (anterior a la 007) se publica ALIVE sin fecha', () => {
    const legacy = { ...upgradePet(ARGOS) } as PetProfile;
    delete (legacy as { lifeStatus?: unknown }).lifeStatus;
    const profile = buildClinicalSummary('PET', [input(legacy)], GENERATED_AT, { ...OFF, includeDeceasedAt: true }).pets[0]!.profile;
    expect(profile.lifeStatus).toBe('ALIVE');
    expect('deceasedAt' in profile).toBe(false);
  });
});
