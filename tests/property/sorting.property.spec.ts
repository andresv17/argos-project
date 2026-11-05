import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sortHistoricalRecords } from '../../src/domain/sorting/deterministic-sorter.ts';

const PROPERTY_SEED = 20261105;

describe('Property-Based Testing: Deterministic Sorting [INV-SORT-001]', () => {
  it('[INV-SORT-001] garantiza idempotencia, invariancia ante permutaciones y orden total con seed fija 20261105', () => {
    const recordArb = fc.record({
      id: fc.constantFrom(
        '11111111-1111-4111-8111-111111111101',
        '11111111-1111-4111-8111-111111111102',
        '11111111-1111-4111-8111-111111111103',
        '11111111-1111-4111-8111-111111111104'
      ),
      recordedAt: fc.constantFrom(
        '2025-01-10',
        '2025-06-15',
        '2026-03-20',
        '2026-11-01',
        '2026-11-05'
      ),
      createdAt: fc.constantFrom(
        '2026-01-01T08:00:00.000Z',
        '2026-06-01T10:00:00.000Z',
        '2026-11-05T12:00:00.000Z'
      ),
    });

    const listArb = fc.array(recordArb, { minLength: 0, maxLength: 20 });

    fc.assert(
      fc.property(listArb, (records) => {
        const sortedOnce = sortHistoricalRecords(records);
        const sortedTwice = sortHistoricalRecords(sortedOnce);
        const reversedInputSorted = sortHistoricalRecords([...records].reverse());

        expect(sortedOnce).toEqual(sortedTwice);
        expect(sortedOnce).toEqual(reversedInputSorted);

        for (let i = 0; i < sortedOnce.length - 1; i++) {
          const curr = sortedOnce[i]!;
          const next = sortedOnce[i + 1]!;
          if (curr.recordedAt !== next.recordedAt) {
            expect(curr.recordedAt > next.recordedAt).toBe(true);
          } else if (curr.createdAt !== next.createdAt) {
            expect(curr.createdAt > next.createdAt).toBe(true);
          } else {
            expect(curr.id <= next.id).toBe(true);
          }
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 100 }
    );
  });
});
