import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '../../support/test-harness.ts';
import {
  DomainError,
  ERROR_CATALOG,
  validatePetProfileSchema,
  validateWeightRecordSchema,
  validateBodyMeasurementRecordSchema,
  validateVaccinationRecordSchema,
  validateDewormingRecordSchema,
  validateMedicalVisitRecordSchema,
  validateCustomParameterRecordSchema,
  validateBackupEnvelopeSchema,
} from '../../../src/generated/index.ts';

const canonicalFixturesRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8')
);

describe('Contract Validation: canonical-fixtures.json -> src/generated/ [INV-ARCH-003]', () => {
  it('[INV-ARCH-003][REQ-BACKUP-001][REQ-BACKUP-002] valida el sobre completo validBackupEnvelope con 4 mascotas y 6 módulos', () => {
    const validated = validateBackupEnvelopeSchema(canonicalFixturesRaw.validBackupEnvelope);
    expect(validated.schemaVersion).toBe('1.0.0');
    expect(validated.exportedAt).toBe('2026-11-05T12:00:00.000Z');
    expect(validated.pets).toHaveLength(4);
    expect(validated.pets[0]?.name).toBe('Argos');
    expect(validated.pets[1]?.name).toBe('Kira');
    expect(validated.pets[2]?.name).toBe('Nyx');
    expect(validated.pets[3]?.name).toBe('Milo');
    expect(validated.records.weights).toHaveLength(2);
    expect(validated.records.bodyMeasurements).toHaveLength(1);
    expect(validated.records.vaccinations).toHaveLength(2);
    expect(validated.records.dewormings).toHaveLength(1);
    expect(validated.records.medicalVisits).toHaveLength(1);
    expect(validated.records.customParameters).toHaveLength(1);
  });

  it('[INV-ARCH-003][ERR-SCHEMA-VALIDATION-FAILED][INV-REC-006] rechaza propiedades adicionales no autorizadas (additionalProperties: false)', () => {
    const invalidPet = {
      ...canonicalFixturesRaw.validBackupEnvelope.pets[0],
      unexpectedHackField: 'intrusion',
    };

    let caughtError: DomainError | null = null;
    try {
      validatePetProfileSchema(invalidPet);
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }

    expect(caughtError?.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(caughtError?.status).toBe(422);
    expect(caughtError?.field).toBe('unexpectedHackField');
  });

  it('[INV-ARCH-003][ERR-SCHEMA-VALIDATION-FAILED][INV-REC-006] rechaza strings vacíos o con espacios laterales en PetProfile y registros médicos', () => {
    const untrimmedPet = {
      ...canonicalFixturesRaw.validBackupEnvelope.pets[0],
      name: '  Argos  ',
    };

    let caughtPetError: DomainError | null = null;
    try {
      validatePetProfileSchema(untrimmedPet);
    } catch (err) {
      if (err instanceof DomainError) {
        caughtPetError = err;
      }
    }
    expect(caughtPetError?.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(caughtPetError?.field).toBe('name');

    const untrimmedVaccine = {
      ...canonicalFixturesRaw.validBackupEnvelope.records.vaccinations[0],
      vaccineName: '   ',
    };
    let caughtVaccineError: DomainError | null = null;
    try {
      validateVaccinationRecordSchema(untrimmedVaccine);
    } catch (err) {
      if (err instanceof DomainError) {
        caughtVaccineError = err;
      }
    }
    expect(caughtVaccineError?.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(caughtVaccineError?.field).toBe('vaccineName');
  });

  it('[INV-ARCH-003][ERR-SCHEMA-VALIDATION-FAILED] valida individualmente cada uno de los 6 módulos clínicos del fixture canónico', () => {
    const r = canonicalFixturesRaw.validBackupEnvelope.records;
    const w = validateWeightRecordSchema(r.weights[0]);
    expect(w.weightKg).toBe(32.4);

    const m = validateBodyMeasurementRecordSchema(r.bodyMeasurements[0]);
    expect(m.chestCm).toBe(78.0);

    const v = validateVaccinationRecordSchema(r.vaccinations[0]);
    expect(v.vaccineName).toBe('Séxtuple Canina');

    const d = validateDewormingRecordSchema(r.dewormings[0]);
    expect(d.dewormingType).toBe('EXTERNAL');

    const mv = validateMedicalVisitRecordSchema(r.medicalVisits[0]);
    expect(mv.clinicOrVet).toBe('Dra. Sofía Méndez — VetCare');

    const cp = validateCustomParameterRecordSchema(r.customParameters[0]);
    expect(cp.category).toBe('DIET_CHANGE');
  });

  it('[INV-ARCH-003][ERR-BACKUP-VERSION-UNSUPPORTED][ERR-BACKUP-SCHEMA-INVALID] verifica el catálogo completo de 15 códigos de error en ERROR_CATALOG', () => {
    const errorKeys = Object.keys(ERROR_CATALOG);
    expect(errorKeys).toHaveLength(15);
    expect(ERROR_CATALOG['ERR-PET-QUOTA-EXCEEDED'].status).toBe(409);
    expect(ERROR_CATALOG['ERR-PET-NOT-FOUND'].status).toBe(404);
    expect(ERROR_CATALOG['ERR-BACKUP-MALFORMED-JSON'].status).toBe(400);
  });
});
