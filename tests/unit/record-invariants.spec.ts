import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  computeWeightEvolutionSeries,
  validateBodyMeasurementRecordDomain,
  validateBodyMeasurementsInvariants,
  validateCustomParameterRecordDomain,
  validateDewormingNextDoseDate,
  validateDewormingRecordDomain,
  validateMedicalVisitRecordDomain,
  validateVaccinationBoosterDate,
  validateVaccinationRecordDomain,
  validateWeightKgInvariant,
  validateWeightRecordDomain,
} from '../../src/domain/records/record-invariants.ts';

const FIXED_TODAY = '2026-11-05';
const PET_BIRTH = '2022-05-10';
const PET_ID = '11111111-1111-4111-8111-111111111101';

describe('Domain: Clinical & Biometric Record Invariants (6 Modules) [REQ-REC-001..006, INV-REC-002..006]', () => {
  it('[REQ-REC-001][INV-REC-002][ERR-REC-WEIGHT-OUT-OF-RANGE] valida límites exactos de peso [0.05..150.00 kg] y máximo 2 decimales (EDGE-002)', () => {
    // Límites exactos permitidos
    validateWeightKgInvariant(0.05);
    validateWeightKgInvariant(150.0);
    validateWeightKgInvariant(32.85);

    // Peso negativo (EDGE-002)
    let negError: DomainError | null = null;
    try {
      validateWeightKgInvariant(-2.5);
    } catch (err) {
      if (err instanceof DomainError) negError = err;
    }
    expect(negError?.code).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');
    expect(negError?.status).toBe(422);

    // Inferior al mínimo (< 0.05)
    let lowError: DomainError | null = null;
    try {
      validateWeightKgInvariant(0.04);
    } catch (err) {
      if (err instanceof DomainError) lowError = err;
    }
    expect(lowError?.code).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');

    // Superior al máximo (> 150.00)
    let highError: DomainError | null = null;
    try {
      validateWeightKgInvariant(150.01);
    } catch (err) {
      if (err instanceof DomainError) highError = err;
    }
    expect(highError?.code).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');

    // Más de 2 decimales
    let precisionError: DomainError | null = null;
    try {
      validateWeightKgInvariant(12.345);
    } catch (err) {
      if (err instanceof DomainError) precisionError = err;
    }
    expect(precisionError?.code).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');
  });

  it('[REQ-REC-001] calcula la serie de evolución de peso y deltaKg respecto a la medición inmediata anterior', () => {
    const weights = [
      {
        id: '22222222-2222-4222-8222-222222222201',
        petId: PET_ID,
        recordedAt: '2026-10-01',
        weightKg: 32.4,
        notes: 'Octubre',
        createdAt: '2026-10-01T09:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222202',
        petId: PET_ID,
        recordedAt: '2026-11-01',
        weightKg: 32.85,
        notes: 'Noviembre',
        createdAt: '2026-11-01T09:00:00.000Z',
      },
    ];

    const series = computeWeightEvolutionSeries(weights);
    expect(series).toHaveLength(2);
    expect(series[0]?.recordedAt).toBe('2026-11-01');
    expect(series[0]?.deltaKg).toBe(0.45);
    expect(series[1]?.recordedAt).toBe('2026-10-01');
    expect(series[1]?.deltaKg).toBeNull();
  });

  it('[REQ-REC-002][INV-REC-003][ERR-REC-MEASUREMENT-OUT-OF-RANGE] valida las 4 dimensiones corporales en [1.00..250.00 cm]', () => {
    validateBodyMeasurementsInvariants({
      neckCm: 1.0,
      chestCm: 250.0,
      backLengthCm: 65.25,
      waistCm: 48.5,
    });

    let belowMinError: DomainError | null = null;
    try {
      validateBodyMeasurementsInvariants({
        neckCm: 0.99,
        chestCm: 50,
        backLengthCm: 50,
        waistCm: 50,
      });
    } catch (err) {
      if (err instanceof DomainError) belowMinError = err;
    }
    expect(belowMinError?.code).toBe('ERR-REC-MEASUREMENT-OUT-OF-RANGE');
    expect(belowMinError?.field).toBe('neckCm');

    let aboveMaxError: DomainError | null = null;
    try {
      validateBodyMeasurementsInvariants({
        neckCm: 30,
        chestCm: 250.01,
        backLengthCm: 50,
        waistCm: 50,
      });
    } catch (err) {
      if (err instanceof DomainError) aboveMaxError = err;
    }
    expect(aboveMaxError?.code).toBe('ERR-REC-MEASUREMENT-OUT-OF-RANGE');
    expect(aboveMaxError?.field).toBe('chestCm');
  });

  it('[REQ-REC-003][INV-REC-004][ERR-REC-INVALID-BOOSTER-DATE] exige que nextBoosterAt sea estrictamente posterior a appliedAt (EDGE-003)', () => {
    validateVaccinationBoosterDate('2026-11-01', '2026-11-02');

    let sameDayError: DomainError | null = null;
    try {
      validateVaccinationBoosterDate('2026-11-01', '2026-11-01');
    } catch (err) {
      if (err instanceof DomainError) sameDayError = err;
    }
    expect(sameDayError?.code).toBe('ERR-REC-INVALID-BOOSTER-DATE');
    expect(sameDayError?.status).toBe(422);

    let earlierError: DomainError | null = null;
    try {
      validateVaccinationBoosterDate('2026-11-05', '2026-10-01');
    } catch (err) {
      if (err instanceof DomainError) earlierError = err;
    }
    expect(earlierError?.code).toBe('ERR-REC-INVALID-BOOSTER-DATE');
  });

  it('[REQ-REC-004][INV-REC-005][ERR-REC-INVALID-NEXT-DOSE-DATE] exige que nextSuggestedDoseAt sea estrictamente posterior a appliedAt', () => {
    validateDewormingNextDoseDate('2026-11-01', '2026-12-01');

    let sameDayError: DomainError | null = null;
    try {
      validateDewormingNextDoseDate('2026-11-01', '2026-11-01');
    } catch (err) {
      if (err instanceof DomainError) sameDayError = err;
    }
    expect(sameDayError?.code).toBe('ERR-REC-INVALID-NEXT-DOSE-DATE');
    expect(sameDayError?.status).toBe(422);
  });

  it('[REQ-REC-005][REQ-REC-006][INV-REC-006][ERR-SCHEMA-VALIDATION-FAILED] valida dominios completos de los 6 módulos clínicos', () => {
    const validWeight = validateWeightRecordDomain(
      {
        id: '22222222-2222-4222-8222-222222222201',
        petId: PET_ID,
        recordedAt: '2026-10-01',
        weightKg: 32.4,
        notes: null,
        createdAt: '2026-10-01T09:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validWeight.weightKg).toBe(32.4);

    const validMeasurement = validateBodyMeasurementRecordDomain(
      {
        id: '33333333-3333-4333-8333-333333333301',
        petId: PET_ID,
        recordedAt: '2026-11-01',
        neckCm: 45,
        chestCm: 75,
        backLengthCm: 62,
        waistCm: 55,
        notes: null,
        createdAt: '2026-11-01T09:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validMeasurement.neckCm).toBe(45);

    const validVaccination = validateVaccinationRecordDomain(
      {
        id: '44444444-4444-4444-8444-444444444401',
        petId: PET_ID,
        vaccineName: 'Séxtuple Canina',
        appliedAt: '2025-11-12',
        nextBoosterAt: '2026-11-12',
        batchOrClinic: null,
        notes: null,
        createdAt: '2025-11-12T10:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validVaccination.vaccineName).toBe('Séxtuple Canina');

    const validDeworming = validateDewormingRecordDomain(
      {
        id: '55555555-5555-4555-8555-555555555501',
        petId: PET_ID,
        productBrand: 'Milbemax',
        dewormingType: 'INTERNAL',
        appliedAt: '2026-10-01',
        nextSuggestedDoseAt: '2026-12-01',
        notes: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validDeworming.dewormingType).toBe('INTERNAL');

    const validVisit = validateMedicalVisitRecordDomain(
      {
        id: '66666666-6666-4666-8666-666666666601',
        petId: PET_ID,
        visitDate: '2026-09-15',
        reason: 'Chequeo general',
        diagnosis: 'Sano',
        treatment: 'Ninguno',
        clinicOrVet: 'Clínica Central',
        observations: null,
        createdAt: '2026-09-15T10:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validVisit.diagnosis).toBe('Sano');

    const validCustom = validateCustomParameterRecordDomain(
      {
        id: '77777777-7777-4777-8777-777777777701',
        petId: PET_ID,
        recordedAt: '2026-10-15',
        category: 'BEHAVIOR',
        title: 'Entrenamiento de obediencia',
        description: 'Completó sesiones de socialización.',
        notes: null,
        createdAt: '2026-10-15T10:00:00.000Z',
      },
      PET_BIRTH,
      FIXED_TODAY
    );
    expect(validCustom.category).toBe('BEHAVIOR');
  });
});
