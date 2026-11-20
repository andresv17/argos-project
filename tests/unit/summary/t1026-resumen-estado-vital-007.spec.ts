/**
 * T1026 (007, REQ-FAL7-008, REQ-FAL7-010, SC-007-016, SC-007-031) `ClinicalSummary` 1.1.0 aditivo: `lifeStatus` visible en el perfil y `deceasedAt`
 * solo con el disclosure opt-in del creador (desmarcado por defecto); la edad de una fallecida se calcula hasta `deceasedAt` (REQ-FAL7-007);
 * el documento sigue validando contra el esquema cerrado y `summaryVersion` no cambia.
 *
 * @implements REQ-FAL7-008, REQ-FAL7-010
 */
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary, type SummaryPetInput } from '../../../src/domain/summary/clinical-summary.ts';
import { validateClinicalSummary, validateCreateShareLinkInput, validateShareLinkView } from '../../../src/generated/v33/index.ts';
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

  it('[REQ-FAL7-007][SC-007-016][EDGE-007-027] la edad de una fallecida se calcula hasta deceasedAt y sin opt-in omite totalDays (mantiene years y months)', () => {
    const dead = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF).pets[0]!.profile;
    const live = buildClinicalSummary('PET', [input(alive())], GENERATED_AT, OFF).pets[0]!.profile;
    expect(dead.age).toEqual({ years: 4, months: 1 });
    expect('totalDays' in dead.age).toBe(false);
    expect(live.age.totalDays).toBeGreaterThan(0);
    expect(validateClinicalSummary(buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF))).toBe(true);
  });

  it('[EDGE-007-027][SC-007-016] con includeDeceasedAt la edad de la fallecida conserva totalDays calculado hasta deceasedAt', () => {
    const dead = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, { ...OFF, includeDeceasedAt: true }).pets[0]!.profile;
    expect(dead.age).toEqual({ years: 4, months: 1, totalDays: 1492 });
  });

  it('[EDGE-007-027][SC-007-016] prueba negativa: sin opt-in birthDate + age.totalDays NO reconstruye deceasedAt', () => {
    const profile = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, OFF).pets[0]!.profile;
    const reconstructed = profile.age.totalDays === undefined ? null : new Date(Date.parse(`${profile.birthDate}T00:00:00Z`) + profile.age.totalDays * 86_400_000).toISOString().slice(0, 10);
    expect(reconstructed).toBeNull();
    expect(reconstructed).not.toBe('2026-06-10');
  });

  it('[REQ-FAL7-010] una ficha sin los campos (anterior a la 007) se publica ALIVE sin fecha', () => {
    const legacy = { ...upgradePet(ARGOS) } as PetProfile;
    delete (legacy as { lifeStatus?: unknown }).lifeStatus;
    const profile = buildClinicalSummary('PET', [input(legacy)], GENERATED_AT, { ...OFF, includeDeceasedAt: true }).pets[0]!.profile;
    expect(profile.lifeStatus).toBe('ALIVE');
    expect('deceasedAt' in profile).toBe(false);
  });

  it('[REQ-FAL7-008][SC-007-016] la disclosure lleva deceasedAtIncluded: true solo con el opt-in; sin el opt-in la clave esta ausente (equivale a false)', () => {
    const on = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, { ...OFF, includeDeceasedAt: true });
    expect(on.disclosure).toEqual({ microchipIncluded: false, clinicalFilesIncluded: false, deceasedAtIncluded: true });
    expect(validateClinicalSummary(on)).toBe(true);
    for (const options of [OFF, { ...OFF, includeDeceasedAt: false }]) {
      const off = buildClinicalSummary('PET', [input(deceased())], GENERATED_AT, options);
      expect(off.disclosure).toEqual({ microchipIncluded: false, clinicalFilesIncluded: false });
      expect(validateClinicalSummary(off)).toBe(true);
    }
  });

  it('[SC-007-016] contrato share-link 1.1.0: CreateShareLinkInput acepta includeDeceasedAt booleano, lo rechaza no booleano y sigue cerrado; ShareLinkView lo admite opcional', () => {
    expect(validateCreateShareLinkInput({ includeDeceasedAt: true })).toBe(true);
    expect(validateCreateShareLinkInput({})).toBe(true);
    expect(validateCreateShareLinkInput({ includeDeceasedAt: 'true' })).toBe(false);
    expect(validateCreateShareLinkInput({ includeDeceasedAt: true, extra: 1 })).toBe(false);
    const view = { id: '11111111-1111-4111-8111-111111111111', scope: 'PET', petId: '22222222-2222-4222-8222-222222222222', householdId: null, status: 'ACTIVE', createdAt: GENERATED_AT, expiresAt: '2026-11-25T23:30:00.000Z', revokedAt: null, includeMicrochip: false, includeClinicalFiles: false };
    expect(validateShareLinkView(view)).toBe(true);
    expect(validateShareLinkView({ ...view, includeDeceasedAt: true })).toBe(true);
  });
});
