/**
 * T770 / T771 / T773 / T774 / T779a [US5 consumido por US4] dominio `buildClinicalSummary` (REQ-SUM-001..003, REQ-SUM-008, INV-005-004, REQ-SIN-003):
 * construcción por allow-list contra el esquema cerrado `clinical-summary.schema.json`, determinismo byte a byte tras reordenar filas, edad con la fecha
 * UTC de `generatedAt` (PN-10), microchip y archivos solo con las casillas, y exclusiones (álbum, avatar, ids, nombres, claves, licencia).
 */
import { describe, expect, it } from 'vitest';
import { buildClinicalSummary, type SummaryPetInput } from '../../../src/domain/summary/clinical-summary.ts';
import { validateClinicalSummary } from '../../../src/generated/v33/index.ts';
import { ARGOS, LUNA, canonicalState } from '../../fixtures/application-harness.ts';
import { upgradePet, upgradeRecords } from '../../fixtures/storage-upgrade.ts';
import type { PetRecordCollections } from '../../../src/domain/pet/pet-invariants.ts';

const GENERATED_AT = '2026-11-18T23:30:00.000Z';
const state = canonicalState();
const records = upgradeRecords(state.records);
const forPet = (petId: string): PetRecordCollections => ({
  weights: records.weights.filter((r) => r.petId === petId),
  bodyMeasurements: records.bodyMeasurements.filter((r) => r.petId === petId),
  vaccinations: records.vaccinations.filter((r) => r.petId === petId),
  dewormings: records.dewormings.filter((r) => r.petId === petId),
  medicalVisits: records.medicalVisits.filter((r) => r.petId === petId),
  customParameters: records.customParameters.filter((r) => r.petId === petId),
});
const input = (pet = upgradePet(ARGOS)): SummaryPetInput => ({ pet, records: forPet(pet.id), files: [] });
const OFF = { includeMicrochip: false, includeClinicalFiles: false } as const;
const FILE = { id: '99999999-9999-4999-8999-999999999901', mime: 'application/pdf' as const, sizeBytes: 2048, createdAt: '2026-11-10T10:00:00.000Z' };

describe('T770 buildClinicalSummary por allow-list (REQ-SUM-001, REQ-SUM-003)', () => {
  it('[REQ-SUM-001][SC-005-027] el resumen de Argos valida contra clinical-summary.schema.json (esquema cerrado) y trae versión, alcance, procedencia e interpretación nula', () => {
    const summary = buildClinicalSummary('PET', [input()], GENERATED_AT, OFF);
    expect(validateClinicalSummary(summary)).toBe(true);
    expect(summary).toMatchObject({ summaryVersion: '1.0.0', generatedAt: GENERATED_AT, scope: 'PET', dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED', automaticInterpretation: 'NONE', disclosure: { microchipIncluded: false, clinicalFilesIncluded: false } });
    expect(summary.pets).toHaveLength(1);
    expect(summary.pets[0]!.profile).toMatchObject({ name: 'Argos', species: 'CANINE', breed: 'Pastor Alemán', birthDate: '2022-05-10', sex: 'MALE' });
    expect(summary.pets[0]!.weights.map((w) => w.weightKg)).toEqual([32.85, 32.4]);
  });

  it('[REQ-SUM-003][D5-14] sin la casilla el microchip está AUSENTE (no null); con la casilla aparece solo el de cada mascota', () => {
    const pet = { ...upgradePet(ARGOS), microchipId: '982000123456789' };
    const without = buildClinicalSummary('PET', [input(pet)], GENERATED_AT, OFF);
    expect('microchipId' in without.pets[0]!.profile).toBe(false);
    expect(JSON.stringify(without)).not.toContain('982000123456789');
    const withChip = buildClinicalSummary('PET', [input(pet)], GENERATED_AT, { includeMicrochip: true, includeClinicalFiles: false });
    expect(withChip.pets[0]!.profile.microchipId).toBe('982000123456789');
    expect(withChip.disclosure.microchipIncluded).toBe(true);
    expect(validateClinicalSummary(withChip)).toBe(true);
  });

  it('[REQ-SUM-003][D5-21] clinicalFiles es [] salvo con la casilla; con ella lista id, mime, tamaño y fecha de subida SIN nombre ni clave', () => {
    const base = { ...input(), files: [FILE, { ...FILE, id: '99999999-9999-4999-8999-999999999902', createdAt: '2026-11-12T10:00:00.000Z' }] };
    expect(buildClinicalSummary('PET', [base], GENERATED_AT, OFF).pets[0]!.clinicalFiles).toEqual([]);
    const on = buildClinicalSummary('PET', [base], GENERATED_AT, { includeMicrochip: false, includeClinicalFiles: true });
    expect(on.pets[0]!.clinicalFiles.map((f) => f.id)).toEqual(['99999999-9999-4999-8999-999999999902', FILE.id]);
    expect(Object.keys(on.pets[0]!.clinicalFiles[0]!).sort()).toEqual(['createdAt', 'id', 'mime', 'sizeBytes']);
    expect(on.disclosure.clinicalFilesIncluded).toBe(true);
    expect(validateClinicalSummary(on)).toBe(true);
  });

  it('[REQ-SUM-001][D5-19] el alcance HOUSEHOLD lista varias mascotas ordenadas por (nombre ASC, id ASC)', () => {
    const summary = buildClinicalSummary('HOUSEHOLD', [input(upgradePet(LUNA)), input(), input(upgradePet(state.pets.find((p) => p.name === 'Kira')!))], GENERATED_AT, OFF);
    expect(summary.scope).toBe('HOUSEHOLD');
    expect(summary.pets.map((p) => p.profile.name)).toEqual(['Argos', 'Kira', 'Luna']);
    expect(validateClinicalSummary(summary)).toBe(true);
  });
});

describe('T771 / T773 determinismo y fechas (REQ-SUM-002, SC-005-028, PN-10, EDGE-005-29)', () => {
  it('[REQ-SUM-002][SC-005-028] mismos datos y reloj -> mismo JSON byte a byte aunque se reordenen las filas de entrada', () => {
    const a = input();
    const reversed: SummaryPetInput = { ...a, records: { weights: [...a.records.weights].reverse(), bodyMeasurements: [...a.records.bodyMeasurements].reverse(), vaccinations: [...a.records.vaccinations].reverse(), dewormings: [...a.records.dewormings].reverse(), medicalVisits: [...a.records.medicalVisits].reverse(), customParameters: [...a.records.customParameters].reverse() } };
    expect(JSON.stringify(buildClinicalSummary('PET', [reversed], GENERATED_AT, OFF))).toBe(JSON.stringify(buildClinicalSummary('PET', [a], GENERATED_AT, OFF)));
  });

  it('[REQ-SUM-002] las listas salen por (fecha DESC, id interno DESC) y el id interno no se emite', () => {
    const summary = buildClinicalSummary('PET', [input()], GENERATED_AT, OFF);
    expect(summary.pets[0]!.weights.map((w) => w.recordedAt)).toEqual(['2026-11-01', '2026-10-01']);
    expect(JSON.stringify(summary)).not.toContain('22222222-2222-4222-8222-222222222201');
  });

  it('[PN-10][EDGE-005-29] las fechas de calendario salen sin conversión y la edad usa la fecha UTC de generatedAt, también cerca de medianoche', () => {
    const pet = { ...upgradePet(ARGOS), birthDate: '2024-11-19' };
    const day = (at: string) => buildClinicalSummary('PET', [input(pet)], at, OFF).pets[0]!.profile;
    expect(day('2026-11-18T23:59:59.999Z').age).toMatchObject({ years: 1, months: 11 });
    expect(day('2026-11-19T00:00:00.000Z').age).toMatchObject({ years: 2, months: 0 });
    expect(day('2026-11-19T00:00:00.000Z').birthDate).toBe('2024-11-19');
  });

  it('[REQ-SUM-002] sin aleatoriedad ni reloj: dos construcciones consecutivas producen el mismo texto', () => {
    const first = JSON.stringify(buildClinicalSummary('PET', [input()], GENERATED_AT, OFF));
    expect(JSON.stringify(buildClinicalSummary('PET', [input()], GENERATED_AT, OFF))).toBe(first);
  });
});

describe('T774 exclusiones (REQ-SUM-003, INV-005-004, SC-005-029, SC-005-030)', () => {
  const SENTINELS = ['SENTINEL-OWNER-ID', 'SENTINEL-AVATAR', 'SENTINEL-LICENSE', 'SENTINEL-FIELD', 'SENTINEL-EMAIL', 'SENTINEL-OBJECT-KEY'];

  it('[INV-005-004][SC-005-029] un campo nuevo en la mascota o en un registro NO se filtra al resumen (allow-list, no deny-list)', () => {
    const pet = { ...upgradePet(ARGOS), ownerUserId: 'SENTINEL-OWNER-ID', avatarUrl: 'SENTINEL-AVATAR', brandNewField: 'SENTINEL-FIELD', email: 'SENTINEL-EMAIL' } as unknown as SummaryPetInput['pet'];
    const withExtras: SummaryPetInput = {
      pet,
      records: {
        ...forPet(ARGOS.id),
        vaccinations: forPet(ARGOS.id).vaccinations.map((v) => ({ ...v, veterinarianLicense: 'SENTINEL-LICENSE', secretColumn: 'SENTINEL-FIELD' }) as typeof v),
        weights: forPet(ARGOS.id).weights.map((w) => ({ ...w, objectKey: 'SENTINEL-OBJECT-KEY' }) as typeof w),
      },
      files: [{ ...FILE, objectKey: 'SENTINEL-OBJECT-KEY', originalName: 'SENTINEL-NAME.pdf' } as typeof FILE],
    };
    const text = JSON.stringify(buildClinicalSummary('PET', [withExtras], GENERATED_AT, { includeMicrochip: true, includeClinicalFiles: true }));
    for (const sentinel of [...SENTINELS, 'SENTINEL-NAME']) expect(text).not.toContain(sentinel);
    for (const key of ['ownerUserId', 'avatarUrl', 'petId', 'householdId', 'veterinarianLicense', 'revision', 'brandNewField', 'secretColumn', 'objectKey', 'originalName']) expect(text).not.toContain(`"${key}"`);
    expect(validateClinicalSummary(JSON.parse(text))).toBe(true);
  });

  it('[REQ-SUM-003] no hay referencia a fotos ni a avatar, ni a ids de usuario u hogar, ni nombres de miembros', () => {
    const text = JSON.stringify(buildClinicalSummary('HOUSEHOLD', [input(), input(upgradePet(LUNA))], GENERATED_AT, OFF));
    for (const forbidden of ['avatar', 'photo', 'PHOTO', 'ownerUserId', 'householdId', 'aaaaaaaa-aaaa-4aaa', 'bbbbbbbb-bbbb', 'Casa Vallejo', 'username', 'email', 'pets/']) expect(text).not.toContain(forbidden);
  });
});

describe('T779a REQ-SIN-003 síntomas como datos reportados (REQ-SUM-008)', () => {
  it('REQ-SIN-003: el resumen lista los síntomas como datos reportados sin alertas, valoración ni interpretación', () => {
    const pet = upgradePet(ARGOS);
    const symptom = { id: '77777777-7777-4777-8777-777777777799', petId: pet.id, recordedAt: '2026-11-10', category: 'SYMPTOM', title: 'Vómito persistente', description: 'Tres veces en el día', notes: null, createdAt: '2026-11-10T10:00:00.000Z', symptomType: 'VOMIT', severity: 'SEVERE' } as unknown as PetRecordCollections['customParameters'][number];
    const data: SummaryPetInput = { pet, records: { ...forPet(pet.id), customParameters: [...forPet(pet.id).customParameters, symptom] }, files: [] };
    const summary = buildClinicalSummary('PET', [data], GENERATED_AT, OFF);
    expect(summary.automaticInterpretation).toBe('NONE');
    expect(summary.pets[0]!.symptoms).toEqual([{ recordedAt: '2026-11-10', symptomType: 'VOMIT', severity: 'SEVERE', title: 'Vómito persistente', description: 'Tres veces en el día', notes: null }]);
    expect(summary.pets[0]!.otherParameters.map((p) => p.category)).not.toContain('SYMPTOM');
    expect(JSON.stringify(summary)).not.toMatch(/alert|warning|anormal|normal|urgente|grave/i);
    expect(validateClinicalSummary(summary)).toBe(true);
  });
});
