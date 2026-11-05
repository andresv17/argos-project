import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateSanitaryAlertState } from '../../src/domain/alerts/sanitary-alert-evaluator.ts';
import { diffInCalendarDays } from '../../src/domain/shared/date-utils.ts';

const PROPERTY_SEED = 20261105;
const FIXED_TODAY = '2026-11-05';

describe('Property-Based Testing: Sanitary Alert State Machine [STATE-ALERT-001]', () => {
  it('[STATE-ALERT-001] particiona exhaustivamente el espacio de fechas en SUPERSEDED, OVERDUE (<0), DUE_SOON (0..15) y UP_TO_DATE (>15) con seed 20261105', () => {
    const targetDateArb = fc.record({
      year: fc.integer({ min: 2025, max: 2027 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      superseded: fc.boolean(),
    });

    fc.assert(
      fc.property(targetDateArb, ({ year, month, day, superseded }) => {
        const isoTarget = `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const expectedDiff = diffInCalendarDays(isoTarget, FIXED_TODAY);
        const result = evaluateSanitaryAlertState(isoTarget, FIXED_TODAY, superseded);

        expect(result.daysRemaining).toBe(expectedDiff);

        if (superseded) {
          expect(result.status).toBe('SUPERSEDED');
          expect(result.isActiveAlert).toBe(false);
          expect(result.uiBadge).toBe('NEUTRAL_GRAY');
        } else if (expectedDiff < 0) {
          expect(result.status).toBe('OVERDUE');
          expect(result.isActiveAlert).toBe(true);
          expect(result.uiBadge).toBe('DANGER_RED');
        } else if (expectedDiff <= 15) {
          expect(result.status).toBe('DUE_SOON');
          expect(result.isActiveAlert).toBe(true);
          expect(result.uiBadge).toBe('WARNING_AMBER');
        } else {
          expect(result.status).toBe('UP_TO_DATE');
          expect(result.isActiveAlert).toBe(false);
          expect(result.uiBadge).toBe('SUCCESS_GREEN');
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 150 }
    );
  });
});
