import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  resolveFieldErrorCode,
  validateBackupEnvelopeV2,
  validateBodyMeasurementRecord,
  validateCreateBodyMeasurementInput,
  validateCreateWeightInput,
  validateWeightRecord,
  type BackupEnvelopeV2,
} from '../../../src/generated/index.ts';

/**
 * DEUDA-VAL-001 (TASK-108): prueba de frontera. Los validadores generados son los que usa la frontera de la API
 * (constitución §3.4); deben rechazar weightKg y las medidas con más de 2 decimales con el código del campo.
 */
const PROPERTY_SEED = 20261105;
const envelope: BackupEnvelopeV2 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8'),
).validBackupEnvelopeV2;

interface Validator {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; keyword: string }> | null;
}

const MEASUREMENTS = ['neckCm', 'chestCm', 'backLengthCm', 'waistCm'] as const;
const weightInput = (weightKg: number) => ({ recordedAt: '2026-11-01', weightKg });
const weightRecord = (weightKg: number) => ({ ...envelope.records.weights[0]!, weightKg });
const measureInput = (field: string, value: number) => ({ recordedAt: '2026-11-01', neckCm: 46.5, chestCm: 78, backLengthCm: 65, waistCm: 58.5, [field]: value });
const measureRecord = (field: string, value: number) => ({ ...envelope.records.bodyMeasurements[0]!, [field]: value });

/** Código que devuelve la frontera según la spec §5.1 regla 4, o OK. */
function boundaryCode(schemaName: string, validate: Validator, payload: unknown): string {
  if (validate(payload)) return 'OK';
  const error = validate.errors![0]!;
  return `${error.keyword}:${resolveFieldErrorCode(schemaName, error.instancePath) ?? 'ERR-SCHEMA-VALIDATION-FAILED'}@${error.instancePath}`;
}

describe('TASK-108: frontera de 2 decimales (DEUDA-VAL-001, scripts/codegen.mjs multipleOfPrecision)', () => {
  it('[INV-REC-002][ERR-REC-WEIGHT-OUT-OF-RANGE] la frontera rechaza 32.85001, 32.855 y 32.8500001 en weightKg con el código del campo, como entrada y como registro', () => {
    for (const value of [32.85001, 32.855, 32.8500001, 0.051, 149.999]) {
      expect(boundaryCode('CreateWeightInput', validateCreateWeightInput as Validator, weightInput(value))).toBe('multipleOf:ERR-REC-WEIGHT-OUT-OF-RANGE@/weightKg');
      expect(boundaryCode('WeightRecord', validateWeightRecord as Validator, weightRecord(value))).toBe('multipleOf:ERR-REC-WEIGHT-OUT-OF-RANGE@/weightKg');
    }
  });

  it('[INV-REC-003][ERR-REC-MEASUREMENT-OUT-OF-RANGE] la frontera rechaza 46.50001 en cada una de las 4 medidas con el código del campo', () => {
    for (const field of MEASUREMENTS) {
      expect(boundaryCode('CreateBodyMeasurementInput', validateCreateBodyMeasurementInput as Validator, measureInput(field, 46.50001))).toBe(
        `multipleOf:ERR-REC-MEASUREMENT-OUT-OF-RANGE@/${field}`,
      );
      expect(boundaryCode('BodyMeasurementRecord', validateBodyMeasurementRecord as Validator, measureRecord(field, 46.50001))).toBe(
        `multipleOf:ERR-REC-MEASUREMENT-OUT-OF-RANGE@/${field}`,
      );
    }
  });

  it('[INV-REC-002][INV-REC-003] la frontera acepta todas las centésimas de [0.05, 150.00] en weightKg y de [1.00, 250.00] en cada medida', () => {
    const rejectedWeights: number[] = [];
    for (let h = 5; h <= 15000; h += 1) {
      if (!validateCreateWeightInput(weightInput(h / 100)) || !validateWeightRecord(weightRecord(h / 100))) rejectedWeights.push(h / 100);
    }
    const rejectedMeasures: string[] = [];
    for (const field of MEASUREMENTS) {
      for (let h = 100; h <= 25000; h += 1) {
        if (!validateCreateBodyMeasurementInput(measureInput(field, h / 100))) rejectedMeasures.push(`${field}=${h / 100}`);
      }
    }
    expect([rejectedWeights, rejectedMeasures]).toEqual([[], []]);
  });

  it('[INV-REC-002][ERR-REC-WEIGHT-OUT-OF-RANGE] toda desviación de al menos 1e-11 sobre una centésima válida se rechaza en la frontera', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 14999 }), fc.double({ min: 1e-11, max: 0.0099, noNaN: true }), (h, deviation) => {
        const value = h / 100 + deviation;
        expect(boundaryCode('CreateWeightInput', validateCreateWeightInput as Validator, weightInput(value))).toBe('multipleOf:ERR-REC-WEIGHT-OUT-OF-RANGE@/weightKg');
      }),
      { seed: PROPERTY_SEED, numRuns: 1000 },
    );
  });

  it('[INV-REC-002] la frontera todavía tolera desviaciones menores de 1e-12 (p. ej. 32.85 + 1e-13); las rechaza el dominio', () => {
    expect(validateCreateWeightInput(weightInput(32.85 + 1e-13))).toBe(true);
    expect(validateCreateBodyMeasurementInput(measureInput('neckCm', 46.5 + 1e-13))).toBe(true);
  });

  it('[INV-REC-002] el sobre de respaldo v2 también rechaza un peso con más de 2 decimales', () => {
    expect(validateBackupEnvelopeV2(envelope)).toBe(true);
    const tampered = { ...envelope, records: { ...envelope.records, weights: [weightRecord(32.85001)] } };
    expect(validateBackupEnvelopeV2(tampered)).toBe(false);
    expect((validateBackupEnvelopeV2 as Validator).errors!.map((e) => `${e.keyword}@${e.instancePath}`)).toContain('multipleOf@/records/weights/0/weightKg');
  });
});
