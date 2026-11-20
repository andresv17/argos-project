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

const alive = { ...upgradePet(ARGOS), lifeStatus: 'ALIVE' } as PetProfile;
const optsOff = { includeMicrochip: false, includeClinicalFiles: false, includeDeceasedAt: false };

/** Parte de un resumen real del constructor SIN opt-in (age sin totalDays) y le inyecta totalDays a mano; flag undefined = clave ausente. */
const withTotalDays = (pet: PetProfile, flag: boolean | undefined): unknown => {
  const doc = JSON.parse(JSON.stringify(buildClinicalSummary('PET', [{ pet, records: empty, files: [] }], GENERATED_AT, optsOff))) as {
    pets: { profile: { age: Record<string, unknown>; deceasedAt?: unknown } }[];
    disclosure: Record<string, unknown>;
  };
  delete doc.pets[0]!.profile.deceasedAt;
  doc.pets[0]!.profile.age.totalDays = 1492;
  if (flag === undefined) delete doc.disclosure.deceasedAtIncluded;
  else doc.disclosure.deceasedAtIncluded = flag;
  return doc;
};

describe('O1: regla then de age.totalDays para DECEASED en ClinicalSummary (REQ-FAL7-008, REQ-FAL7-009, INV-005-004)', () => {
  it('[REQ-FAL7-008][INV-005-004] una fallecida con age.totalDays inyectado y sin deceasedAtIncluded true es INVALIDA', () => {
    expect(validateClinicalSummary(withTotalDays(deceased, undefined))).toBe(false);
    expect(validateClinicalSummary(withTotalDays(deceased, false))).toBe(false);
  });

  it('[REQ-FAL7-009][INV-005-004] la misma fallecida con age.totalDays y deceasedAtIncluded true es VALIDA', () => {
    expect(validateClinicalSummary(withTotalDays(deceased, true))).toBe(true);
  });

  it('[REQ-FAL7-008][INV-005-004] una ALIVE con age.totalDays es VALIDA (la regla solo restringe a DECEASED)', () => {
    expect(validateClinicalSummary(withTotalDays(alive, undefined))).toBe(true);
  });
});
