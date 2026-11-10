import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV2, type WeightRecord } from '../../src/generated/index.ts';
import {
  computeWeightEvolutionSeries,
  deltaPercentFromHundredths,
  toHundredths,
  validateRecord,
} from '../../src/domain/records/record-invariants.ts';

const PROPERTY_SEED = 20261105;
const DAY_MS = 86_400_000;
const BASE_MS = Date.UTC(2020, 0, 1);
const iso = (day: number) => new Date(BASE_MS + day * DAY_MS).toISOString().slice(0, 10);
const envelope: BackupEnvelopeV2 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
).validBackupEnvelopeV2;
const baseWeight = envelope.records.weights[0]!;
const baseVaccination = envelope.records.vaccinations[0]!;
const baseMeasurement = envelope.records.bodyMeasurements[0]!;

function outcome(action: () => unknown): string {
  try {
    action();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

/** Oráculo independiente con BigInt: round-half-away-from-zero(|Δ|·10000 / anterior) = floor((2·|Δ|·10000 + anterior) / (2·anterior)). */
function percentOracle(previous: number, current: number): number {
  const delta = BigInt(current - previous);
  const magnitude = delta < 0n ? -delta : delta;
  const p = BigInt(previous);
  const rounded = Number((2n * magnitude * 10000n + p) / (2n * p));
  return rounded === 0 ? 0 : ((delta < 0n ? -1 : 1) * rounded) / 100;
}

const hundredths = fc.integer({ min: 5, max: 15000 });

describe('propiedades de registros', () => {
  it('[REQ-REC-001] deltaKg es exactamente (b - a) / 100 sobre centésimas y deltaPercent coincide con un oráculo BigInt (EDGE-034, EDGE-035)', () => {
    fc.assert(
      fc.property(hundredths, hundredths, (a, b) => {
        expect(toHundredths(a / 100)).toBe(a);
        const [latest] = computeWeightEvolutionSeries([
          { ...baseWeight, id: 'p1', recordedAt: '2026-10-01', weightKg: a / 100 },
          { ...baseWeight, id: 'p2', recordedAt: '2026-11-01', weightKg: b / 100 },
        ]);
        expect(latest!.deltaKg).toBe((b - a) / 100);
        expect(latest!.deltaPercent).toBe(percentOracle(a, b));
        expect(deltaPercentFromHundredths(a, b)).toBe(percentOracle(a, b));
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[REQ-REC-001] cada entrada de la serie compara con la siguiente en orden INV-SORT-001 y solo la última lleva null', () => {
    const entries = fc.uniqueArray(fc.record({ day: fc.integer({ min: 0, max: 60 }), h: hundredths, id: fc.integer({ min: 0, max: 999 }) }), {
      selector: (e) => e.id,
      maxLength: 12,
    });
    fc.assert(
      fc.property(entries, (raw) => {
        const records: WeightRecord[] = raw.map((e) => ({
          ...baseWeight,
          id: `w-${String(e.id).padStart(3, '0')}`,
          recordedAt: iso(e.day),
          weightKg: e.h / 100,
          createdAt: `${iso(e.day)}T09:00:00.000Z`,
        }));
        const series = computeWeightEvolutionSeries(records);
        expect(series.map((e) => e.record).sort((x, y) => x.id.localeCompare(y.id))).toEqual([...records].sort((x, y) => x.id.localeCompare(y.id)));
        series.forEach((entry, i) => {
          const previous = series[i + 1];
          if (previous === undefined) {
            expect([entry.deltaKg, entry.deltaPercent]).toEqual([null, null]);
          } else {
            expect(entry.record.recordedAt >= previous.record.recordedAt).toBe(true);
            const [p, c] = [toHundredths(previous.record.weightKg), toHundredths(entry.record.weightKg)];
            expect([entry.deltaKg, entry.deltaPercent]).toEqual([(c - p) / 100, percentOracle(p, c)]);
          }
        });
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });

  it('[INV-REC-002][INV-REC-003][ERR-REC-WEIGHT-OUT-OF-RANGE][ERR-REC-MEASUREMENT-OUT-OF-RANGE] se acepta todo valor de centésimas enteras dentro del rango y se rechaza fuera de él', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 30000 }), (h) => {
        const value = h / 100;
        const weight = outcome(() => validateRecord('weights', { ...baseWeight, weightKg: value }, '2022-05-10', '2026-11-05'));
        const neck = outcome(() => validateRecord('bodyMeasurements', { ...baseMeasurement, neckCm: value }, '2022-05-10', '2026-11-05'));
        expect(weight).toBe(h >= 5 && h <= 15000 ? 'OK' : 'ERR-REC-WEIGHT-OUT-OF-RANGE');
        expect(neck).toBe(h >= 100 && h <= 25000 ? 'OK' : 'ERR-REC-MEASUREMENT-OUT-OF-RANGE');
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[ERR-REC-DATE-BEFORE-BIRTH][ERR-REC-FUTURE-EVENT-DATE][INV-REC-004][ERR-REC-INVALID-BOOSTER-DATE] el resultado coincide con un oráculo de ventana y refuerzo para fechas arbitrarias', () => {
    const day = fc.integer({ min: 0, max: 3000 });
    fc.assert(
      fc.property(day, day, day, day, (birth, today, applied, booster) => {
        const actual = outcome(() =>
          validateRecord('vaccinations', { ...baseVaccination, appliedAt: iso(applied), nextBoosterAt: iso(booster) }, iso(birth), iso(today)),
        );
        const expected =
          applied < birth ? 'ERR-REC-DATE-BEFORE-BIRTH' : applied > today ? 'ERR-REC-FUTURE-EVENT-DATE' : booster <= applied ? 'ERR-REC-INVALID-BOOSTER-DATE' : 'OK';
        expect(actual).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });
});
