import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  validateCreateWeightInput,
  type BackupEnvelopeV3,
  type PetProfile,
  type WeightRecord,
} from '../../src/generated/index.ts';
import {
  RECORD_MODULES,
  computeWeightEvolutionSeries,
  hasAtMostTwoDecimals,
  validateBodyMeasurementRecordDomain,
  validateCustomParameterRecordDomain,
  validateDewormingRecordDomain,
  validateMedicalVisitRecordDomain,
  validateNonEmptyTrimmedField,
  validateRecord,
  validateRecordInput,
  validateVaccinationRecordDomain,
  validateWeightRecordDomain,
  type RecordModule,
} from '../../src/domain/records/record-invariants.ts';
import { SPECIES_WEIGHT_LIMITS, assertWeightWithinSpeciesLimits, gramsToKg, weightKgToGrams } from '../../src/domain/records/weight-limits.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';

const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));
const envelope: BackupEnvelopeV3 = fixtures.validBackupEnvelopeV2;
const edge = (prefix: string) => fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId.startsWith(prefix));
const TODAY = new FixedClockAdapter().todayIsoDate();
const MODULES = Object.keys(RECORD_MODULES) as RecordModule[];
/** Argos es CANINE (DOG en la 001): el peso de sus registros se valida con la tabla de CANINE. */
const ARGOS_SPECIES = 'CANINE' as const;

const birthOf = (petId: string) => (envelope.pets as PetProfile[]).find((p) => p.id === petId)!.birthDate;
const baseRecord = (module: RecordModule): Record<string, unknown> => ({ ...envelope.records[module][0]! });
const baseInput = (module: RecordModule): Record<string, unknown> => {
  const { id: _id, petId: _petId, createdAt: _createdAt, ...input } = baseRecord(module);
  return input;
};
const birthFor = (module: RecordModule) => birthOf(envelope.records[module][0]!.petId);
const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);

function errorOf(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

const recordCode = (module: RecordModule, patch: Record<string, unknown>, birth = birthFor(module)) => {
  try {
    validateRecord(module, { ...baseRecord(module), ...patch }, birth, TODAY, ARGOS_SPECIES);
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
};
const inputCode = (module: RecordModule, patch: Record<string, unknown>) => {
  try {
    validateRecordInput(module, { ...baseInput(module), ...patch }, birthFor(module), TODAY, ARGOS_SPECIES);
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
};

const weight = (id: string, recordedAt: string, weightKg: number, createdAt = `${recordedAt}T09:00:00.000Z`): WeightRecord => ({
  id,
  petId: '11111111-1111-4111-8111-111111111101',
  recordedAt,
  weightKg,
  notes: null,
  createdAt,
});

describe('los 6 módulos con los registros canónicos (src/domain/records/record-invariants.ts)', () => {
  it('[REQ-REC-001][REQ-REC-002][REQ-REC-003][REQ-REC-004][REQ-REC-005][REQ-REC-006] el primer registro canónico de cada módulo es válido como registro y como entrada', () => {
    expect(MODULES).toEqual(Object.keys(envelope.records));
    for (const module of MODULES) {
      expect(validateRecord(module, baseRecord(module), birthFor(module), TODAY, ARGOS_SPECIES)).toEqual(envelope.records[module][0]);
      expect(validateRecordInput(module, baseInput(module), birthFor(module), TODAY, ARGOS_SPECIES)).toEqual(baseInput(module));
    }
  });

  it('[REQ-REC-001][REQ-REC-002][REQ-REC-003][REQ-REC-004][REQ-REC-005][REQ-REC-006] los envoltorios por módulo devuelven el mismo registro que validateRecord', () => {
    const r = envelope.records;
    expect(validateWeightRecordDomain(r.weights[0]!, birthFor('weights'), TODAY, ARGOS_SPECIES)).toBe(r.weights[0]);
    expect(validateBodyMeasurementRecordDomain(r.bodyMeasurements[0]!, birthFor('bodyMeasurements'), TODAY)).toBe(r.bodyMeasurements[0]);
    expect(validateVaccinationRecordDomain(r.vaccinations[0]!, birthFor('vaccinations'), TODAY)).toBe(r.vaccinations[0]);
    expect(validateDewormingRecordDomain(r.dewormings[0]!, birthFor('dewormings'), TODAY)).toBe(r.dewormings[0]);
    expect(validateMedicalVisitRecordDomain(r.medicalVisits[0]!, birthFor('medicalVisits'), TODAY)).toBe(r.medicalVisits[0]);
    expect(validateCustomParameterRecordDomain(r.customParameters[0]!, birthFor('customParameters'), TODAY)).toBe(r.customParameters[0]);
    const future = { ...r.weights[0]!, recordedAt: addDays(TODAY, 1) };
    expect(errorOf(() => validateWeightRecordDomain(future, birthFor('weights'), TODAY, ARGOS_SPECIES)).code).toBe('ERR-REC-FUTURE-EVENT-DATE');
  });

  it('[REQ-REC-001] cada módulo usa los esquemas y el campo de fecha de su contrato', () => {
    expect(MODULES.map((m) => [m, RECORD_MODULES[m].record.name, RECORD_MODULES[m].input.name, RECORD_MODULES[m].eventDateField, RECORD_MODULES[m].nextDate?.field ?? null])).toEqual([
      ['weights', 'WeightRecord', 'CreateWeightInput', 'recordedAt', null],
      ['bodyMeasurements', 'BodyMeasurementRecord', 'CreateBodyMeasurementInput', 'recordedAt', null],
      ['vaccinations', 'VaccinationRecord', 'CreateVaccinationInput', 'appliedAt', 'nextBoosterAt'],
      ['dewormings', 'DewormingRecord', 'CreateDewormingInput', 'appliedAt', 'nextSuggestedDoseAt'],
      ['medicalVisits', 'MedicalVisitRecord', 'CreateMedicalVisitInput', 'visitDate', null],
      ['customParameters', 'CustomParameterRecord', 'CreateCustomParameterInput', 'recordedAt', null],
    ]);
  });

  it('[REQ-REC-001][INV-REC-006] los fallos sin anotación nombran el esquema y el campo, o la raíz si el registro no es un objeto', () => {
    const empty = errorOf(() => validateRecord('vaccinations', { ...baseRecord('vaccinations'), vaccineName: '' }, birthFor('vaccinations'), TODAY));
    expect([empty.message, empty.field]).toEqual([
      '[ERR-SCHEMA-VALIDATION-FAILED] VaccinationRecord: vaccineName must NOT have fewer than 1 characters.',
      'vaccineName',
    ]);
    const root = errorOf(() => validateRecord('weights', null, birthFor('weights'), TODAY, ARGOS_SPECIES));
    expect([root.code, root.message, root.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', '[ERR-SCHEMA-VALIDATION-FAILED] WeightRecord: (raíz) must be object.', null]);
  });
});

describe('peso y medidas (INV-REC-002, INV-REC-003)', () => {
  it('[REQ-REC2-001][INV-REC2-002][ERR-REC-WEIGHT-OUT-OF-RANGE] CANINE acepta 0.05 y 150.00 exactos y rechaza 0.04, 150.01 y el peso negativo de EDGE-002', () => {
    const negative = edge('EDGE-002-').payload.weightKg as number;
    expect(edge('EDGE-002-').expectedError).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');
    const results = [0.05, 150, 0.04, 150.01, negative].map((w) => [w, recordCode('weights', { weightKg: w }), inputCode('weights', { weightKg: w })]);
    expect(results).toEqual([
      [0.05, 'OK', 'OK'],
      [150, 'OK', 'OK'],
      [0.04, 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg', 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg'],
      [150.01, 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg', 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg'],
      [-2.5, 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg', 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg'],
    ]);
  });

  it('[REQ-REC2-001][INV-REC2-002][ERR-REC-WEIGHT-OUT-OF-RANGE] CANINE y FELINE admiten 2 decimales; el resto de especies admite 3 y un mínimo de 0.001', () => {
    const run = (species: 'CANINE' | 'FELINE' | 'RABBIT' | 'BIRD' | 'OTHER', kg: number) => {
      try {
        validateRecordInput('weights', { recordedAt: '2026-11-01', weightKg: kg }, birthFor('weights'), TODAY, species);
        return 'OK';
      } catch (error) {
        if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
        throw error;
      }
    };
    expect(['CANINE', 'FELINE'].map((sp) => run(sp as 'CANINE', 12.345))).toEqual(['ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg', 'ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg']);
    expect(['RABBIT', 'BIRD', 'OTHER'].map((sp) => run(sp as 'RABBIT', 1.275))).toEqual(['OK', 'OK', 'OK']);
    expect(['RABBIT', 'BIRD', 'OTHER'].map((sp) => run(sp as 'RABBIT', 0.028))).toEqual(['OK', 'OK', 'OK']);
    expect(run('CANINE', 0.028)).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(run('FELINE', 0.001)).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(run('RABBIT', 0.0005)).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(run('RABBIT', 150)).toBe('OK');
    expect(run('RABBIT', 150.001)).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
  });

  it('[INV-REC2-002][ERR-REC-WEIGHT-OUT-OF-RANGE] más decimales de los de la especie se rechaza: 32.85001 ya en el esquema y 32.85 + 1e-13, que el dominio cierra aunque el esquema lo tolere', () => {
    const residual = 32.85 + 1e-13;
    expect(validateCreateWeightInput({ recordedAt: '2026-11-01', weightKg: 32.85001 })).toBe(false);
    expect(recordCode('weights', { weightKg: 12.345 })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(recordCode('weights', { weightKg: 32.85001 })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(recordCode('weights', { weightKg: residual })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(inputCode('weights', { weightKg: residual })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    const err = errorOf(() => validateRecord('weights', { ...baseRecord('weights'), weightKg: residual }, birthFor('weights'), TODAY, 'CANINE'));
    expect(err.status).toBe(422);
    expect(err.field).toBe('weightKg');
  });

  it('[INV-REC2-002] weight-limits: la tabla por especie, la conversión exacta a gramos y el error con el campo', () => {
    expect(SPECIES_WEIGHT_LIMITS['CANINE']).toMatchObject({ minGrams: 50, maxGrams: 150000, decimals: 2 });
    expect(SPECIES_WEIGHT_LIMITS['FELINE']).toMatchObject({ minGrams: 50, maxGrams: 150000, decimals: 2 });
    for (const species of ['RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'] as const) {
      expect(SPECIES_WEIGHT_LIMITS[species]).toMatchObject({ minGrams: 1, maxGrams: 150000, decimals: 3, maxIsProvisional: true });
    }
    expect([0.001, 0.028, 1.275, 12.4, 150, 0.1, 0.29, 4.35].map(weightKgToGrams)).toEqual([1, 28, 1275, 12400, 150000, 100, 290, 4350]);
    expect([1, 28, 1275, 150000].map(gramsToKg)).toEqual([0.001, 0.028, 1.275, 150]);
    expect(assertWeightWithinSpeciesLimits('RABBIT', 1.275)).toBe(1275);
    const err = errorOf(() => assertWeightWithinSpeciesLimits('FELINE', 0.049));
    expect([err.code, err.field, err.status]).toEqual(['ERR-REC-WEIGHT-OUT-OF-RANGE', 'weightKg', 422]);
  });

  it('[REQ-REC-002][INV-REC-003][ERR-REC-MEASUREMENT-OUT-OF-RANGE] cada una de las 4 medidas acepta 1.00 y 250.00 y rechaza 0.99, 250.01 y 3 decimales con su campo', () => {
    for (const field of ['neckCm', 'chestCm', 'backLengthCm', 'waistCm']) {
      expect([1, 250, 0.99, 250.01, 46.555, 46.5 + 1e-13].map((v) => recordCode('bodyMeasurements', { [field]: v }))).toEqual([
        'OK',
        'OK',
        `ERR-REC-MEASUREMENT-OUT-OF-RANGE@${field}`,
        `ERR-REC-MEASUREMENT-OUT-OF-RANGE@${field}`,
        `ERR-REC-MEASUREMENT-OUT-OF-RANGE@${field}`,
        `ERR-REC-MEASUREMENT-OUT-OF-RANGE@${field}`,
      ]);
      expect(inputCode('bodyMeasurements', { [field]: 250.01 })).toBe(`ERR-REC-MEASUREMENT-OUT-OF-RANGE@${field}`);
    }
  });

  it('[REQ-REC-001][INV-REC-002]: un tipo erróneo en weightKg da el código anotado; ausente o propiedad extra, ERR-SCHEMA-VALIDATION-FAILED', () => {
    const { weightKg: _w, ...withoutWeight } = baseInput('weights');
    expect(recordCode('weights', { weightKg: '32.85' })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(errorOf(() => validateRecordInput('weights', withoutWeight, birthFor('weights'), TODAY, ARGOS_SPECIES)).message).toBe(
      "[ERR-SCHEMA-VALIDATION-FAILED] CreateWeightInput: weightKg must have required property 'weightKg'.",
    );
    expect(errorOf(() => validateRecordInput('weights', withoutWeight, birthFor('weights'), TODAY, ARGOS_SPECIES)).field).toBe('weightKg');
    expect(inputCode('weights', { id: '22222222-2222-4222-8222-222222222201' })).toBe('ERR-SCHEMA-VALIDATION-FAILED@id');
    expect(errorOf(() => validateRecord('weights', { ...baseRecord('weights'), unit: 'kg' }, birthFor('weights'), TODAY, ARGOS_SPECIES)).message).toBe(
      '[ERR-SCHEMA-VALIDATION-FAILED] WeightRecord: unit must NOT have additional properties.',
    );
  });

  it('[REQ-REC-001][INV-REC-002][ERR-REC-DATE-BEFORE-BIRTH]: el esquema va antes que el dominio (peso fuera de rango y fecha anterior al nacimiento da el error de peso)', () => {
    expect(recordCode('weights', { weightKg: 0.01, recordedAt: '2022-05-09' })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(recordCode('weights', { weightKg: 32.85 + 1e-13, recordedAt: '2022-05-09' })).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE@weightKg');
    expect(recordCode('weights', { recordedAt: '2022-05-09' })).toBe('ERR-REC-DATE-BEFORE-BIRTH@recordedAt');
  });
});

describe('ventana temporal y fechas siguientes (INV-REC-001, INV-REC-004, INV-REC-005)', () => {
  it('[ERR-REC-DATE-BEFORE-BIRTH][ERR-REC-FUTURE-EVENT-DATE] en los 6 módulos la ventana incluye nacimiento y hoy, y excluye un día antes y un día después', () => {
    const rows = MODULES.map((module) => {
      const field = RECORD_MODULES[module].eventDateField;
      const birth = birthFor(module);
      return [
        module,
        recordCode(module, { [field]: birth }),
        recordCode(module, { [field]: addDays(birth, -1) }),
        recordCode(module, { [field]: TODAY }),
        recordCode(module, { [field]: addDays(TODAY, 1) }),
        inputCode(module, { [field]: addDays(TODAY, 1) }),
      ];
    });
    expect(rows).toEqual(
      MODULES.map((module) => {
        const field = RECORD_MODULES[module].eventDateField;
        return [module, 'OK', `ERR-REC-DATE-BEFORE-BIRTH@${field}`, 'OK', `ERR-REC-FUTURE-EVENT-DATE@${field}`, `ERR-REC-FUTURE-EVENT-DATE@${field}`];
      }),
    );
  });

  it('[ERR-REC-DATE-BEFORE-BIRTH] EDGE-004: un peso del 2023-12-01 para una mascota nacida el 2024-02-14', () => {
    const { payload, expectedError } = edge('EDGE-004-');
    expect(recordCode('weights', { recordedAt: payload.recordedAt }, payload.petBirthDate)).toBe(`${expectedError}@recordedAt`);
  });

  it('[REQ-REC-003][INV-REC-004][ERR-REC-INVALID-BOOSTER-DATE] el refuerzo el mismo día (EDGE-003) o antes se rechaza; al día siguiente se acepta', () => {
    const { payload, expectedError } = edge('EDGE-003-');
    expect(recordCode('vaccinations', payload)).toBe(`${expectedError}@nextBoosterAt`);
    expect(recordCode('vaccinations', { appliedAt: '2026-11-01', nextBoosterAt: '2026-10-31' })).toBe('ERR-REC-INVALID-BOOSTER-DATE@nextBoosterAt');
    expect(recordCode('vaccinations', { appliedAt: '2026-11-01', nextBoosterAt: '2026-11-02' })).toBe('OK');
    expect(inputCode('vaccinations', payload)).toBe('ERR-REC-INVALID-BOOSTER-DATE@nextBoosterAt');
    expect(errorOf(() => validateRecord('vaccinations', { ...baseRecord('vaccinations'), ...payload }, birthFor('vaccinations'), TODAY)).message).toBe(
      '[ERR-REC-INVALID-BOOSTER-DATE] nextBoosterAt (2026-11-01) debe ser estrictamente posterior a appliedAt (2026-11-01).',
    );
  });

  it('[REQ-REC-004][INV-REC-005][ERR-REC-INVALID-NEXT-DOSE-DATE] la próxima dosis el mismo día o antes se rechaza; al día siguiente se acepta', () => {
    expect(recordCode('dewormings', { appliedAt: '2026-11-01', nextSuggestedDoseAt: '2026-11-01' })).toBe('ERR-REC-INVALID-NEXT-DOSE-DATE@nextSuggestedDoseAt');
    expect(recordCode('dewormings', { appliedAt: '2026-11-01', nextSuggestedDoseAt: '2025-12-01' })).toBe('ERR-REC-INVALID-NEXT-DOSE-DATE@nextSuggestedDoseAt');
    expect(recordCode('dewormings', { appliedAt: '2026-11-01', nextSuggestedDoseAt: '2026-11-02' })).toBe('OK');
    expect(inputCode('dewormings', { appliedAt: '2026-11-01', nextSuggestedDoseAt: '2026-11-01' })).toBe('ERR-REC-INVALID-NEXT-DOSE-DATE@nextSuggestedDoseAt');
  });

  it('[INV-REC-004][ERR-REC-FUTURE-EVENT-DATE] la ventana temporal se comprueba antes que la fecha siguiente', () => {
    expect(recordCode('vaccinations', { appliedAt: addDays(TODAY, 1), nextBoosterAt: addDays(TODAY, 1) })).toBe('ERR-REC-FUTURE-EVENT-DATE@appliedAt');
    expect(recordCode('dewormings', { appliedAt: '2023-08-19', nextSuggestedDoseAt: '2023-08-19' })).toBe('ERR-REC-DATE-BEFORE-BIRTH@appliedAt');
  });

  it('[REQ-REC-003][REQ-REC-004] las fechas siguientes con formato inválido son ERR-SCHEMA-VALIDATION-FAILED', () => {
    expect(recordCode('vaccinations', { nextBoosterAt: '2026-02-30' })).toBe('ERR-SCHEMA-VALIDATION-FAILED@nextBoosterAt');
    expect(recordCode('dewormings', { nextSuggestedDoseAt: '2026/12/01' })).toBe('ERR-SCHEMA-VALIDATION-FAILED@nextSuggestedDoseAt');
  });
});

describe('textos obligatorios y enumerados (INV-REC-006)', () => {
  const TEXTS: Array<[RecordModule, string, number]> = [
    ['vaccinations', 'vaccineName', 100],
    ['dewormings', 'productBrand', 100],
    ['medicalVisits', 'reason', 200],
    ['medicalVisits', 'diagnosis', 500],
    ['medicalVisits', 'treatment', 500],
    ['medicalVisits', 'clinicOrVet', 120],
    ['customParameters', 'title', 120],
    ['customParameters', 'description', 1000],
  ];

  it('[INV-REC-006][REQ-REC-005][REQ-REC-006] cada texto obligatorio acepta su longitud máxima y rechaza vacío, espacios extremos y un carácter de más', () => {
    for (const [module, field, max] of TEXTS) {
      expect(['x'.repeat(max), '', ' ', ' Rabia', 'Rabia ', 'x'.repeat(max + 1)].map((v) => recordCode(module, { [field]: v }))).toEqual([
        'OK',
        ...Array(5).fill(`ERR-SCHEMA-VALIDATION-FAILED@${field}`),
      ]);
      expect(inputCode(module, { [field]: '' })).toBe(`ERR-SCHEMA-VALIDATION-FAILED@${field}`);
    }
  });

  it('[REQ-REC-004][REQ-REC-006] dewormingType y category solo admiten sus valores del contrato', () => {
    expect(['INTERNAL', 'EXTERNAL', 'ORAL'].map((t) => recordCode('dewormings', { dewormingType: t }))).toEqual([
      'OK',
      'OK',
      'ERR-SCHEMA-VALIDATION-FAILED@dewormingType',
    ]);
    expect(['DIET_CHANGE', 'ALLERGY', 'SURGERY', 'BEHAVIOR', 'OTHER', 'diet_change'].map((c) => recordCode('customParameters', { category: c }))).toEqual([
      'OK',
      'OK',
      'OK',
      'OK',
      'OK',
      'ERR-SCHEMA-VALIDATION-FAILED@category',
    ]);
  });

  it('[INV-REC-006] validateNonEmptyTrimmedField: acepta hasta maxLength sin espacios extremos y rechaza lo demás', () => {
    expect(['A', 'Argos'].map((v) => validateNonEmptyTrimmedField(v, 'name', 5))).toEqual(['A', 'Argos']);
    expect(['', ' Argo', 'Argo ', 'Argoss'].map((v) => errorOf(() => validateNonEmptyTrimmedField(v, 'name', 5)).field)).toEqual([
      'name',
      'name',
      'name',
      'name',
    ]);
    expect(errorOf(() => validateNonEmptyTrimmedField('', 'breed', 60)).message).toBe(
      "[ERR-SCHEMA-VALIDATION-FAILED] El campo obligatorio 'breed' no puede estar vacío, tener espacios extremos ni exceder 60 caracteres.",
    );
  });
});

describe('evolución de peso (REQ-REC-001, EDGE-034, EDGE-035)', () => {
  it('[REQ-REC-001] EDGE-034: deltaKg exacto en centésimas, 32.40 → 32.85 = 0.45 y 32.85 → 32.40 = -0.45', () => {
    const expected = edge('EDGE-034-').expectedResult.deltaKg;
    const up = computeWeightEvolutionSeries([weight('a1', '2026-10-01', 32.4), weight('a2', '2026-11-01', 32.85)]);
    const down = computeWeightEvolutionSeries([weight('b1', '2026-10-01', 32.85), weight('b2', '2026-11-01', 32.4)]);
    expect(up[0]!.deltaKg).toBe(expected['3240->3285']);
    expect(down[0]!.deltaKg).toBe(expected['3285->3240']);
    expect(32.85 - 32.4).not.toBe(0.45);
  });

  it('[REQ-REC2-001] la 002 retira deltaPercent: cada entrada de la serie lleva solo record y deltaKg', () => {
    const series = computeWeightEvolutionSeries([weight('a1', '2026-10-01', 32.4), weight('a2', '2026-11-01', 32.85), weight('a0', '2026-09-01', 3)]);
    expect(series.map((entry) => Object.keys(entry).sort())).toEqual([['deltaKg', 'record'], ['deltaKg', 'record'], ['deltaKg', 'record']]);
  });

  it('[REQ-REC2-001] la serie va en orden INV-SORT-001 y la primera medición cronológica lleva deltaKg null', () => {
    const series = computeWeightEvolutionSeries([
      weight('w1', '2026-09-01', 8),
      weight('w3', '2026-11-01', 7.99),
      weight('w2', '2026-10-01', 8.01),
    ]);
    expect(series).toEqual([
      { record: weight('w3', '2026-11-01', 7.99), deltaKg: -0.02 },
      { record: weight('w2', '2026-10-01', 8.01), deltaKg: 0.01 },
      { record: weight('w1', '2026-09-01', 8), deltaKg: null },
    ]);
    expect(computeWeightEvolutionSeries([])).toEqual([]);
  });

  it('[REQ-REC2-001] deltaKg exacto en milésimas para especies pequeñas: 1.250 → 1.275 = 0.025 y 0.028 → 0.001 = -0.027', () => {
    const [first, second] = computeWeightEvolutionSeries([weight('r1', '2026-05-01', 1.25), weight('r2', '2026-06-01', 1.275)]);
    expect([first!.deltaKg, second!.deltaKg]).toEqual([0.025, null]);
    const down = computeWeightEvolutionSeries([weight('b1', '2026-06-01', 0.028), weight('b2', '2026-07-01', 0.001)]);
    expect(down[0]!.deltaKg).toBe(-0.027);
    expect(1.275 - 1.25).not.toBe(0.025);
  });

  it('[REQ-REC2-001] con la misma fecha desempata por createdAt y luego id; pesos iguales dan delta 0', () => {
    const series = computeWeightEvolutionSeries([
      weight('w-b', '2026-11-01', 10, '2026-11-01T08:00:00.000Z'),
      weight('w-a', '2026-11-01', 10, '2026-11-01T08:00:00.000Z'),
      weight('w-c', '2026-11-01', 10.5, '2026-11-01T09:00:00.000Z'),
    ]);
    expect(series.map((e) => [e.record.id, e.deltaKg])).toEqual([
      ['w-c', 0.5],
      ['w-a', 0],
      ['w-b', null],
    ]);
    expect(Object.is(series[1]!.deltaKg, -0)).toBe(false);
  });

  it('[REQ-REC2-001][INV-REC-003] weightKgToGrams y hasAtMostTwoDecimals trabajan sobre la representación decimal, no sobre flotantes', () => {
    expect([0.05, 0.29, 32.85, 150, 1.15, 4.35].map(weightKgToGrams)).toEqual([50, 290, 32850, 150000, 1150, 4350]);
    expect([0.29 * 100, 1.15 * 100, 4.35 * 100].map(Number.isInteger)).toEqual([false, false, false]);
    expect([32.85, 0.05, 150, 32.855, 32.85001].map(hasAtMostTwoDecimals)).toEqual([true, true, true, false, false]);
  });
});
