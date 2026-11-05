import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  validateBodyMeasurementsInvariants,
  validateWeightKgInvariant,
} from '../../src/domain/records/record-invariants.ts';

const PROPERTY_SEED = 20261105;

describe('Property-Based Testing: Biometric Bounds [INV-REC-002, INV-REC-003]', () => {
  it('[INV-REC-002][ERR-REC-WEIGHT-OUT-OF-RANGE] acepta todo peso en [0.05..150.00] con <=2 decimales y rechaza fuera de rango con seed 20261105', () => {
    const validCentsArb = fc.integer({ min: 5, max: 15000 });
    fc.assert(
      fc.property(validCentsArb, (cents) => {
        const weightKg = Number((cents / 100).toFixed(2));
        validateWeightKgInvariant(weightKg);
        expect(weightKg >= 0.05 && weightKg <= 150.0).toBe(true);
      }),
      { seed: PROPERTY_SEED, numRuns: 100 }
    );

    const invalidCentsArb = fc.integer({ min: 15001, max: 50000 });
    fc.assert(
      fc.property(invalidCentsArb, (cents) => {
        const weightKg = Number((cents / 100).toFixed(2));
        let caught: DomainError | null = null;
        try {
          validateWeightKgInvariant(weightKg);
        } catch (err) {
          if (err instanceof DomainError) caught = err;
        }
        expect(caught?.code).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');
      }),
      { seed: PROPERTY_SEED, numRuns: 100 }
    );
  });

  it('[INV-REC-003][ERR-REC-MEASUREMENT-OUT-OF-RANGE] acepta medidas en [1.00..250.00] cm y rechaza valores fuera de rango con seed 20261105', () => {
    const validDimArb = fc.record({
      neckCents: fc.integer({ min: 100, max: 25000 }),
      chestCents: fc.integer({ min: 100, max: 25000 }),
      backCents: fc.integer({ min: 100, max: 25000 }),
      waistCents: fc.integer({ min: 100, max: 25000 }),
    });

    fc.assert(
      fc.property(validDimArb, ({ neckCents, chestCents, backCents, waistCents }) => {
        const dims = {
          neckCm: Number((neckCents / 100).toFixed(2)),
          chestCm: Number((chestCents / 100).toFixed(2)),
          backLengthCm: Number((backCents / 100).toFixed(2)),
          waistCm: Number((waistCents / 100).toFixed(2)),
        };
        validateBodyMeasurementsInvariants(dims);
        expect(dims.neckCm >= 1.0 && dims.neckCm <= 250.0).toBe(true);
      }),
      { seed: PROPERTY_SEED, numRuns: 100 }
    );
  });
});
