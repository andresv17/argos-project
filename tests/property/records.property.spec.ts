import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV3, type WeightRecord } from '../../src/generated/index.ts';
import { computeWeightEvolutionSeries, validateRecord, validateRecordInput } from '../../src/domain/records/record-invariants.ts';
import { SPECIES_WEIGHT_LIMITS, gramsToKg, weightKgToGrams } from '../../src/domain/records/weight-limits.ts';
import { SPECIES } from '../../src/domain/pet/species.ts';

const PROPERTY_SEED = 20261105;
const DAY_MS = 86_400_000;
const BASE_MS = Date.UTC(2020, 0, 1);
const iso = (day: number) => new Date(BASE_MS + day * DAY_MS).toISOString().slice(0, 10);
const envelope: BackupEnvelopeV3 = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
).validBackupEnvelopeV2;
const baseWeight = envelope.records.weights[0]!;
/** T255: el fixture de la 001 se lleva a la forma 002 (category, veterinarianName y veterinarianLicense). */
const baseVaccination = { ...envelope.records.vaccinations[0]!, category: 'VACCINE', veterinarianName: null, veterinarianLicense: null } as unknown as BackupEnvelopeV3['records']['vaccinations'][number];
const baseMeasurement = envelope.records.bodyMeasurements[0]!;
/** Tabla de INV-REC2-002 leída del contrato 002: el oráculo no comparte código con la implementación. */
const CONTRACT_LIMITS: Record<string, { minKg: number; maxKg: number; decimals: number }> = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/002-plataforma-v21/contracts/schemas/medical-records.schema.json'), 'utf8'),
).$defs.SpeciesWeightLimits.const;

function outcome(action: () => unknown): string {
  try {
    action();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

const grams = fc.integer({ min: 1, max: 150000 });

describe('propiedades de registros', () => {
  it('[REQ-REC2-001][SC-013] deltaKg es exactamente (b - a) / 1000 sobre gramos enteros y, para pesos en centésimas, (b - a) / 100 sin redondeo', () => {
    fc.assert(
      fc.property(grams, grams, (a, b) => {
        expect(weightKgToGrams(a / 1000)).toBe(a);
        expect(gramsToKg(a)).toBe(a / 1000);
        const [latest] = computeWeightEvolutionSeries([
          { ...baseWeight, id: 'p1', recordedAt: '2026-10-01', weightKg: a / 1000 },
          { ...baseWeight, id: 'p2', recordedAt: '2026-11-01', weightKg: b / 1000 },
        ]);
        expect(latest!.deltaKg).toBe((b - a) / 1000);
        expect(Object.keys(latest!).sort()).toEqual(['deltaKg', 'record']);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 15000 }), fc.integer({ min: 5, max: 15000 }), (a, b) => {
        const [latest] = computeWeightEvolutionSeries([
          { ...baseWeight, id: 'p1', recordedAt: '2026-10-01', weightKg: a / 100 },
          { ...baseWeight, id: 'p2', recordedAt: '2026-11-01', weightKg: b / 100 },
        ]);
        expect(latest!.deltaKg).toBe((b - a) / 100);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[REQ-REC2-001] cada entrada de la serie compara con la siguiente en orden INV-SORT-001 y solo la última lleva null', () => {
    const entries = fc.uniqueArray(fc.record({ day: fc.integer({ min: 0, max: 60 }), g: grams, id: fc.integer({ min: 0, max: 999 }) }), {
      selector: (e) => e.id,
      maxLength: 12,
    });
    fc.assert(
      fc.property(entries, (raw) => {
        const records: WeightRecord[] = raw.map((e) => ({
          ...baseWeight,
          id: `w-${String(e.id).padStart(3, '0')}`,
          recordedAt: iso(e.day),
          weightKg: e.g / 1000,
          createdAt: `${iso(e.day)}T09:00:00.000Z`,
        }));
        const series = computeWeightEvolutionSeries(records);
        expect(series.map((e) => e.record).sort((x, y) => x.id.localeCompare(y.id))).toEqual([...records].sort((x, y) => x.id.localeCompare(y.id)));
        series.forEach((entry, i) => {
          const previous = series[i + 1];
          if (previous === undefined) {
            expect(entry.deltaKg).toBeNull();
          } else {
            expect(entry.record.recordedAt >= previous.record.recordedAt).toBe(true);
            expect(entry.deltaKg).toBe((weightKgToGrams(entry.record.weightKg) - weightKgToGrams(previous.record.weightKg)) / 1000);
          }
        });
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });

  it('[INV-REC2-002][SC-013][ERR-REC-WEIGHT-OUT-OF-RANGE] cada especie acepta exactamente los gramos de su tabla (mínimo inclusivo, máximo inclusivo, múltiplos de su unidad) y rechaza el resto', () => {
    expect(Object.keys(SPECIES_WEIGHT_LIMITS).sort()).toEqual([...SPECIES].sort());
    fc.assert(
      fc.property(fc.constantFrom(...SPECIES), fc.integer({ min: -2000, max: 160000 }), (species, g) => {
        const limit = CONTRACT_LIMITS[species]!;
        const unit = 10 ** (3 - limit.decimals);
        const accepted = g >= limit.minKg * 1000 && g <= limit.maxKg * 1000 && g % unit === 0;
        const value = g / 1000;
        expect(outcome(() => validateRecordInput('weights', { recordedAt: '2026-11-01', weightKg: value }, '2022-05-10', '2026-11-05', species))).toBe(
          accepted ? 'OK' : 'ERR-REC-WEIGHT-OUT-OF-RANGE',
        );
        expect(outcome(() => validateRecord('weights', { ...baseWeight, weightKg: value }, '2022-05-10', '2026-11-05', species))).toBe(
          accepted ? 'OK' : 'ERR-REC-WEIGHT-OUT-OF-RANGE',
        );
      }),
      { seed: PROPERTY_SEED, numRuns: 1500 },
    );
  });

  it('[INV-REC2-002][SC-013] los límites exactos: 0.05 inclusivo para CANINE y FELINE, 0.001 inclusivo para las seis restantes y, debajo de cada mínimo, rechazo', () => {
    const at = (species: string, kg: number) =>
      outcome(() => validateRecordInput('weights', { recordedAt: '2026-11-01', weightKg: kg }, '2022-05-10', '2026-11-05', species as never));
    for (const species of ['CANINE', 'FELINE']) {
      expect([0.049, 0.04, 0.001, 0.05, 0.051, 0.06, 150, 150.01].map((kg) => at(species, kg))).toEqual([
        'ERR-REC-WEIGHT-OUT-OF-RANGE', 'ERR-REC-WEIGHT-OUT-OF-RANGE', 'ERR-REC-WEIGHT-OUT-OF-RANGE', 'OK', 'ERR-REC-WEIGHT-OUT-OF-RANGE', 'OK', 'OK', 'ERR-REC-WEIGHT-OUT-OF-RANGE',
      ]);
    }
    for (const species of ['RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER']) {
      expect([0, 0.0005, 0.001, 0.0015, 0.049, 0.051, 150, 150.001].map((kg) => at(species, kg))).toEqual([
        'ERR-REC-WEIGHT-OUT-OF-RANGE', 'ERR-REC-WEIGHT-OUT-OF-RANGE', 'OK', 'ERR-REC-WEIGHT-OUT-OF-RANGE', 'OK', 'OK', 'OK', 'ERR-REC-WEIGHT-OUT-OF-RANGE',
      ]);
    }
  });

  it('[INV-REC-003][ERR-REC-MEASUREMENT-OUT-OF-RANGE] las medidas conservan su rango de 1.00 a 250.00 cm en centésimas enteras', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 30000 }), (h) => {
        const neck = outcome(() => validateRecord('bodyMeasurements', { ...baseMeasurement, neckCm: h / 100 }, '2022-05-10', '2026-11-05'));
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

  it('[REQ-REC2-002][INV-REC-004][SC-015] una vacuna 002 es válida si y solo si lote ≤ 120, veterinario ≤ 120, colegiado ≤ 60 y la próxima fecha es nula o posterior (oráculo de longitudes y fechas)', () => {
    const len = fc.integer({ min: 0, max: 130 });
    fc.assert(
      fc.property(len, len, fc.integer({ min: 0, max: 70 }), fc.option(fc.integer({ min: -3, max: 3 }), { nil: null }), (batch, vet, license, nextDelta) => {
        const applied = iso(2000);
        const record = {
          ...baseVaccination,
          category: 'VACCINE',
          appliedAt: applied,
          nextBoosterAt: nextDelta === null ? null : iso(2000 + nextDelta),
          batchOrClinic: batch === 0 ? null : 'b'.repeat(batch),
          veterinarianName: vet === 0 ? null : 'v'.repeat(vet),
          veterinarianLicense: license === 0 ? null : 'l'.repeat(license),
        };
        let actual = 'OK';
        try {
          validateRecord('vaccinations', record, '2019-01-01', '2026-11-05');
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          actual = error.code;
        }
        const expected = batch > 120 || vet > 120 || license > 60 ? 'ERR-SCHEMA-VALIDATION-FAILED' : nextDelta !== null && nextDelta <= 0 ? 'ERR-REC-INVALID-BOOSTER-DATE' : 'OK';
        expect(actual).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });
});
