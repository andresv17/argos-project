/**
 * Prueba de contrato negativa de O1 (007, /rama): la regla if/else de `ClinicalSummary` prohibe `pets[].profile.deceasedAt`
 * sin `disclosure.deceasedAtIncluded: true`; la garantia de privacidad vive tambien en el esquema y no solo en el constructor.
 *
 * @implements REQ-FAL7-008, REQ-FAL7-009, INV-005-004
 */
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary, type SummaryPetInput } from '../../../src/domain/summary/clinical-summary.ts';
import { validateClinicalSummary } from '../../../src/generated/v33/index.ts';
import type { PetProfile } from '../../../src/domain/pet/pet-invariants.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';

const GENERATED_AT = '2026-11-18T23:30:00.000Z';
const empty = { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] } as unknown as SummaryPetInput['records'];
const deceased = { ...upgradePet(ARGOS), lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' } as PetProfile;
const base = buildClinicalSummary('PET', [{ pet: deceased, records: empty, files: [] }], GENERATED_AT, { includeMicrochip: false, includeClinicalFiles: false, includeDeceasedAt: true });

/** Clona el resumen valido y fija deceasedAt del perfil y la bandera de disclosure (undefined = clave ausente). */
const variant = (deceasedAt: string | null, flag: boolean | undefined): unknown => {
  const doc = JSON.parse(JSON.stringify(base)) as { pets: { profile: Record<string, unknown> }[]; disclosure: Record<string, unknown> };
  doc.pets[0]!.profile.deceasedAt = deceasedAt;
  if (flag === undefined) delete doc.disclosure.deceasedAtIncluded;
  else doc.disclosure.deceasedAtIncluded = flag;
  return doc;
};

describe('O1: regla condicional deceasedAt <-> disclosure.deceasedAtIncluded en ClinicalSummary (REQ-FAL7-008, REQ-FAL7-009, INV-005-004)', () => {
  it('[REQ-FAL7-008][INV-005-004] el documento base del constructor con opt-in es valido (linea base de las variantes)', () => {
    expect(validateClinicalSummary(base)).toBe(true);
  });

  it('[REQ-FAL7-008][INV-005-004] deceasedAt con fecha y deceasedAtIncluded ausente es INVALIDO', () => {
    expect(validateClinicalSummary(variant('2026-06-10', undefined))).toBe(false);
  });

  it('[REQ-FAL7-008][INV-005-004] deceasedAt con fecha y deceasedAtIncluded false es INVALIDO', () => {
    expect(validateClinicalSummary(variant('2026-06-10', false))).toBe(false);
  });

  it('[REQ-FAL7-009][INV-005-004] deceasedAt null (clave presente) sin opt-in tambien es INVALIDO: la presencia de la clave basta', () => {
    expect(validateClinicalSummary(variant(null, undefined))).toBe(false);
    expect(validateClinicalSummary(variant(null, false))).toBe(false);
  });

  it('[REQ-FAL7-008][INV-005-004] deceasedAt con fecha y deceasedAtIncluded true es VALIDO', () => {
    expect(validateClinicalSummary(variant('2026-06-10', true))).toBe(true);
  });

  it('[REQ-FAL7-009][INV-005-004] deceasedAt null con deceasedAtIncluded true es VALIDO', () => {
    expect(validateClinicalSummary(variant(null, true))).toBe(true);
  });
});
