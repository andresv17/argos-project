import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CATALOG,
  validateBackupEnvelopeV1Legacy,
  validateBackupEnvelopeV2,
  validateBodyMeasurementRecord,
  validateCustomParameterRecord,
  validateDewormingRecord,
  validateHousehold,
  validateHouseholdMember,
  validateMedicalVisitRecord,
  validatePetProfile,
  validateUserPublicProfile,
  validateVaccinationRecord,
  validateWeightRecord,
} from '../../../src/generated/index.ts';

/**
 * contracts/examples/canonical-fixtures.json contra los validadores generados en src/generated/ (reescritura de
 * DEUDA-TEST-001 sobre la API generada v2: validateX en vez de validateXSchema, sobre v2 y v1 heredado, catálogo v2.1.1).
 */
const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/errors/error-catalog.json'), 'utf8'));

interface Validator {
  (data: unknown): boolean;
  errors?: Array<{ instancePath: string; keyword: string; params: Record<string, unknown> }> | null;
}
/** Primer error de Ajv como "palabra clave en ruta (propiedad)". */
function firstError(validate: Validator, value: unknown): string {
  if (validate(value)) return 'válido';
  const e = validate.errors![0]!;
  const property = (e.params['additionalProperty'] ?? e.params['missingProperty'] ?? '') as string;
  return `${e.keyword} ${e.instancePath || '/'}${property ? ` (${property})` : ''}`;
}

describe('contracts/examples/canonical-fixtures.json -> src/generated/', () => {
  it('[INV-ARCH-003][REQ-BACKUP-001][REQ-BACKUP-002] el sobre v2 canónico es válido: 5 mascotas de Andrés y los 6 módulos; el sobre v1 heredado también', () => {
    const v2 = fixtures.validBackupEnvelopeV2;
    const counts = Object.fromEntries(Object.entries(v2.records).map(([module, list]) => [module, (list as unknown[]).length]));
    expect([
      validateBackupEnvelopeV2(v2),
      v2.schemaVersion,
      v2.pets.map((p: { name: string }) => p.name),
      counts,
      validateBackupEnvelopeV1Legacy(fixtures.validLegacyBackupEnvelopeV1),
      fixtures.validLegacyBackupEnvelopeV1.schemaVersion,
    ]).toEqual([
      true,
      '2.0.0',
      ['Argos', 'Kira', 'Nyx', 'Milo', 'Toby'],
      { weights: 2, bodyMeasurements: 1, vaccinations: 2, dewormings: 1, medicalVisits: 1, customParameters: 1 },
      true,
      '1.0.0',
    ]);
  });

  it('[REQ-PET-001][REQ-HOUSE-001] usuarios, hogar, membresías y mascotas de otro usuario del fixture cumplen sus esquemas', () => {
    expect([
      fixtures.users.map((u: unknown) => validateUserPublicProfile(u)),
      validateHousehold(fixtures.household),
      fixtures.householdMembers.map((m: unknown) => validateHouseholdMember(m)),
      fixtures.otherUserPets.map((p: unknown) => validatePetProfile(p)),
    ]).toEqual([[true, true, true, true], true, [true, true, true], [true]]);
  });

  it('[REQ-PET-001] rechaza propiedades no autorizadas (additionalProperties: false) y textos con espacios laterales o vacíos', () => {
    const pet = fixtures.validBackupEnvelopeV2.pets[0];
    const vaccine = fixtures.validBackupEnvelopeV2.records.vaccinations[0];
    expect([
      firstError(validatePetProfile, { ...pet, unexpectedHackField: 'intrusion' }),
      firstError(validatePetProfile, { ...pet, name: '  Argos  ' }),
      firstError(validateVaccinationRecord, { ...vaccine, vaccineName: '   ' }),
      firstError(validatePetProfile, { ...pet, avatarUrl: 'javascript:alert(1)' }),
    ]).toEqual(['additionalProperties / (unexpectedHackField)', 'pattern /name', 'pattern /vaccineName', expect.stringMatching(/^(pattern|anyOf|oneOf) \/avatarUrl/)]);
  });

  it('[REQ-REC-001][REQ-REC-002][REQ-REC-003][REQ-REC-004][REQ-REC-005][REQ-REC-006] cada registro de los 6 módulos del sobre canónico cumple su esquema', () => {
    const r = fixtures.validBackupEnvelopeV2.records;
    const checks: Array<[Validator, unknown[]]> = [
      [validateWeightRecord, r.weights],
      [validateBodyMeasurementRecord, r.bodyMeasurements],
      [validateVaccinationRecord, r.vaccinations],
      [validateDewormingRecord, r.dewormings],
      [validateMedicalVisitRecord, r.medicalVisits],
      [validateCustomParameterRecord, r.customParameters],
    ];
    expect(checks.map(([validate, list]) => list.every((x) => validate(x)))).toEqual([true, true, true, true, true, true]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] ERROR_CATALOG generado coincide con error-catalog.json: los 30 códigos vigentes y ninguno más', () => {
    expect([Object.keys(ERROR_CATALOG).sort(), ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].status]).toEqual([Object.keys(catalog.errors).sort(), 500]);
    expect(Object.keys(ERROR_CATALOG)).toHaveLength(30);
  });
});
