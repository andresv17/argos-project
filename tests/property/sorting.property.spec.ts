import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculatePetAge, diffInCalendarDays } from '../../src/domain/shared/date-utils.ts';
import { sortHistoricalRecords, sortPetsForListing } from '../../src/domain/sorting/deterministic-sorter.ts';

const PROPERTY_SEED = 20261105;
const DAY_MS = 86_400_000;
const MIN_DAY = Date.UTC(1990, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(2035, 11, 31) / DAY_MS;

// Oráculos independientes del código bajo prueba: usan Date.UTC (permitido en tests/).
const isoDate = (epochDay: number): string => new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
const daysInMonth = (year: number, month0: number): number => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
const oracleAge = (birth: string, today: string) => {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  let months = 0;
  for (;;) {
    const next = months + 1;
    const y = by + Math.floor((bm - 1 + next) / 12);
    const m0 = (bm - 1 + next) % 12;
    if (Date.UTC(y, m0, Math.min(bd, daysInMonth(y, m0))) > todayMs) break;
    months = next;
  }
  const totalDays = (todayMs - Date.parse(`${birth}T00:00:00.000Z`)) / DAY_MS;
  return { years: Math.floor(months / 12), months: months % 12, totalDays };
};

const dayArb = fc.integer({ min: MIN_DAY, max: MAX_DAY });
const canonicalTimestampArb = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) })
  .map((ms) => new Date(ms).toISOString());
// Pocos IDs para forzar empates en los demás campos; uniqueArray garantiza IDs únicos como en el sistema real.
const uuidArb = fc.integer({ min: 1, max: 8 }).map((n) => `11111111-1111-4111-8111-1111111111${String(n).padStart(2, '0')}`);
const permutationOf = <T>(items: readonly T[]) =>
  fc.array(fc.integer(), { minLength: items.length, maxLength: items.length }).map((keys) =>
    items.map((item, i) => ({ item, key: keys[i] ?? 0 })).sort((a, b) => a.key - b.key).map(({ item }) => item),
  );

describe('propiedades de edad, orden de historiales y orden de mascotas', () => {
  it('[REQ-PET-002] la edad coincide con un oráculo independiente para cualquier par birthDate <= hoy', () => {
    fc.assert(
      fc.property(dayArb, fc.integer({ min: 0, max: 20 * 366 }), (birthDay, offset) => {
        const birth = isoDate(birthDay);
        const today = isoDate(Math.min(birthDay + offset, MAX_DAY));
        const age = calculatePetAge(birth, today);
        expect(age).toEqual(oracleAge(birth, today));
        expect(age.months).toBeGreaterThanOrEqual(0);
        expect(age.months).toBeLessThanOrEqual(11);
      }),
      { seed: PROPERTY_SEED, numRuns: 1000 },
    );
  });

  it('[REQ-PET-002][INV-ARCH-001] la edad nunca disminuye al avanzar un día y totalDays aumenta en 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_DAY, max: MAX_DAY - 1 }), fc.integer({ min: 0, max: 5 * 366 }), (birthDay, offset) => {
        const birth = isoDate(birthDay);
        const todayDay = Math.min(birthDay + offset, MAX_DAY - 1);
        const before = calculatePetAge(birth, isoDate(todayDay));
        const after = calculatePetAge(birth, isoDate(todayDay + 1));
        expect(after.years * 12 + after.months).toBeGreaterThanOrEqual(before.years * 12 + before.months);
        expect(after.totalDays).toBe(before.totalDays + 1);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[REQ-PET-002] diffInCalendarDays coincide con la diferencia de Date.UTC en días', () => {
    fc.assert(
      fc.property(dayArb, dayArb, (a, b) => {
        expect(diffInCalendarDays(isoDate(a), isoDate(b))).toBe(a - b);
      }),
      { seed: PROPERTY_SEED, numRuns: 1000 },
    );
  });

  it('[INV-SORT-001] el orden de historiales es idempotente, no depende del orden de entrada y es total', () => {
    const recordArb = fc.record({
      id: uuidArb,
      recordedAt: fc.integer({ min: MIN_DAY, max: MIN_DAY + 3 }).map(isoDate),
      createdAt: fc.oneof(canonicalTimestampArb, fc.constant('2026-11-05T12:00:00.000Z')),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(recordArb, { maxLength: 8, selector: (r) => r.id }).chain((records) => fc.tuple(fc.constant(records), permutationOf(records))),
        ([records, shuffled]) => {
          const sorted = sortHistoricalRecords(records);
          expect(sortHistoricalRecords(sorted)).toEqual(sorted);
          expect(sortHistoricalRecords(shuffled)).toEqual(sorted);
          for (let i = 0; i + 1 < sorted.length; i += 1) {
            const [cur, next] = [sorted[i]!, sorted[i + 1]!];
            if (cur.recordedAt !== next.recordedAt) expect(cur.recordedAt > next.recordedAt).toBe(true);
            else if (cur.createdAt !== next.createdAt) expect(cur.createdAt > next.createdAt).toBe(true);
            else expect(cur.id <= next.id).toBe(true);
          }
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[INV-SORT-001] con createdAt canónico, el orden de texto equivale al orden cronológico', () => {
    fc.assert(
      fc.property(canonicalTimestampArb, canonicalTimestampArb, (a, b) => {
        expect(a < b).toBe(Date.parse(a) < Date.parse(b));
      }),
      { seed: PROPERTY_SEED, numRuns: 1000 },
    );
  });

  it('[REQ-PET-005] el orden de mascotas no depende del orden de entrada y respeta name es/base, createdAt e id', () => {
    const petArb = fc.record({
      id: uuidArb,
      name: fc.constantFrom('Luna', 'luna', 'LÚNA', 'Ñandú', 'Nzuri', 'Ágata', 'agata', 'Bruno', 'Zeus'),
      createdAt: fc.constantFrom('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(petArb, { maxLength: 8, selector: (p) => p.id }).chain((pets) => fc.tuple(fc.constant(pets), permutationOf(pets))),
        ([pets, shuffled]) => {
          const sorted = sortPetsForListing(pets);
          expect(sortPetsForListing(shuffled)).toEqual(sorted);
          for (let i = 0; i + 1 < sorted.length; i += 1) {
            const [cur, next] = [sorted[i]!, sorted[i + 1]!];
            const byName = cur.name.localeCompare(next.name, 'es', { sensitivity: 'base' });
            if (byName !== 0) expect(byName).toBeLessThan(0);
            else if (cur.createdAt !== next.createdAt) expect(cur.createdAt < next.createdAt).toBe(true);
            else expect(cur.id <= next.id).toBe(true);
          }
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });
});
