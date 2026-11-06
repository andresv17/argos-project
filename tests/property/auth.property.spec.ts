import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateLoginAttempt, openSession, sessionStateAt } from '../../src/domain/auth/auth-policies.ts';
import { fromEpochMillis, toEpochMillis } from '../../src/domain/auth/utc-timestamp.ts';

const PROPERTY_SEED = 20261105;
const BASE = Date.UTC(2026, 10, 5, 12);
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

describe('TASK-106: propiedades de autenticación', () => {
  it('[INV-AUTH-005][ERR-AUTH-TOO-MANY-ATTEMPTS] el resultado de cada intento coincide con un oráculo de ventana deslizante', () => {
    const attemptArb = fc.record({ gapMs: fc.integer({ min: 0, max: 6 * MINUTE }), correct: fc.boolean() });
    fc.assert(
      fc.property(fc.array(attemptArb, { minLength: 1, maxLength: 40 }), (attempts) => {
        let failures: string[] = [];
        let oracleFailures: number[] = [];
        let now = BASE;
        for (const { gapMs, correct } of attempts) {
          now += gapMs;
          const inWindow = oracleFailures.filter((t) => now - t <= 15 * MINUTE && t <= now).length;
          const expected = inWindow >= 5 ? 'LOGIN_LOCKED' : correct ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE';
          if (expected === 'LOGIN_SUCCESS') oracleFailures = [];
          if (expected === 'LOGIN_FAILURE') oracleFailures.push(now);
          let verified = 0;
          const outcome = evaluateLoginAttempt(failures, iso(now), () => {
            verified += 1;
            return correct;
          });
          expect([outcome.event, verified]).toEqual([expected, expected === 'LOGIN_LOCKED' ? 0 : 1]);
          failures = outcome.failures;
          expect(failures.map((t) => Date.parse(t))).toEqual(oracleFailures);
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[INV-AUTH-004][STATE-AUTH-SESSION-001] una sesión está AUTHENTICATED si y solo si han pasado menos de 7 días', () => {
    const sevenDays = 7 * 24 * 60 * MINUTE;
    fc.assert(
      fc.property(fc.integer({ min: -2_000_000_000_000, max: 4_000_000_000_000 }), fc.integer({ min: 0, max: 2 * sevenDays }), (created, elapsed) => {
        const session = openSession('u', iso(created));
        expect(Date.parse(session.expiresAt) - created).toBe(sevenDays);
        expect(sessionStateAt(session, iso(created + elapsed))).toBe(elapsed < sevenDays ? 'AUTHENTICATED' : 'EXPIRED');
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-AUTH-004] toEpochMillis y fromEpochMillis coinciden con Date para cualquier instante entre los años 0 y 9999', () => {
    fc.assert(
      fc.property(fc.integer({ min: -62_167_219_200_000, max: 253_402_300_799_999 }), (ms) => {
        const text = iso(ms);
        expect(fromEpochMillis(ms)).toBe(text);
        expect(toEpochMillis(text)).toBe(ms);
      }),
      { seed: PROPERTY_SEED, numRuns: 1000 },
    );
  });
});
