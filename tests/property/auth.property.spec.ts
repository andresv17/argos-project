import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateLoginAttempt } from '../../src/domain/auth/auth-policies.ts';
import { isPasswordCompliant } from '../../src/domain/auth/password-policy.ts';
import { openSession, renewSession, sessionStateAt, type SessionRecord } from '../../src/domain/auth/session-policy.ts';
import { fromEpochMillis, toEpochMillis } from '../../src/domain/auth/utc-timestamp.ts';

const PROPERTY_SEED = 20261105;
const BASE = Date.UTC(2026, 10, 5, 12);
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

describe('propiedades de autenticación', () => {
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

  it('[INV-AUTH2-002][STATE-AUTH-SESSION-001][SC-009] una sesión sin actividad está AUTHENTICATED si y solo si han pasado menos de 30 min', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_000_000_000_000, max: 4_000_000_000_000 }), fc.integer({ min: 0, max: 3 * 30 * MINUTE }), (created, elapsed) => {
        const session = openSession('u', iso(created));
        expect(sessionStateAt(session, iso(created + elapsed))).toBe(elapsed < 30 * MINUTE ? 'AUTHENTICATED' : 'EXPIRED_IDLE');
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-AUTH2-002][STATE-AUTH-SESSION-001][SC-009] con peticiones intercaladas la sesión coincide con un oráculo de ventana deslizante de 30 min y tope de 24 h', () => {
    const day = 24 * 60 * MINUTE;
    const gapArb = fc.integer({ min: 0, max: 50 * MINUTE });
    fc.assert(
      fc.property(fc.array(gapArb, { minLength: 1, maxLength: 120 }), (gaps) => {
        let session: SessionRecord = openSession('u', iso(BASE));
        let lastActivity = BASE;
        let now = BASE;
        for (const gap of gaps) {
          now += gap;
          const live = now < BASE + day && now < lastActivity + 30 * MINUTE;
          const expectedState = live ? 'AUTHENTICATED' : now >= BASE + day ? 'EXPIRED' : 'EXPIRED_IDLE';
          expect(sessionStateAt(session, iso(now))).toBe(expectedState);
          if (!live) {
            expect(() => renewSession(session, iso(now))).toThrow(/ERR-AUTH-UNAUTHENTICATED/);
            return;
          }
          session = renewSession(session, iso(now));
          lastActivity = now;
          expect(Date.parse(session.lastActivityAt)).toBe(now);
          expect(session.createdAt).toBe(iso(BASE));
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-AUTH2-001][ERR-AUTH-WEAK-PASSWORD][SC-010] isPasswordCompliant coincide con un oráculo independiente sobre cadenas Unicode arbitrarias', () => {
    const symbols = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
    const upper = new Set(['B', 'Ñ']);
    const oracle = (p: string) => {
      const chars = Array.from(p);
      return chars.length >= 10 && chars.length <= 128 && chars.some((c) => upper.has(c)) && chars.some((c) => c >= '0' && c <= '9') && chars.some((c) => symbols.has(c));
    };
    const alphabet = fc.constantFrom('a', 'B', 'Ñ', 'z', '7', '0', '!', '~', ' ', '😀', 'é', '٣', '_');
    fc.assert(
      fc.property(fc.array(alphabet, { minLength: 0, maxLength: 140 }).map((x) => x.join('')), (password) => {
        expect(isPasswordCompliant(password)).toBe(oracle(password));
      }),
      { seed: PROPERTY_SEED, numRuns: 600 },
    );
  });

  it('[INV-AUTH2-002] toEpochMillis y fromEpochMillis coinciden con Date para cualquier instante entre los años 0 y 9999', () => {
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
