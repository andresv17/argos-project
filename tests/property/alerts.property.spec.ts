import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { VaccinationRecord } from '../../src/generated/index.ts';
import {
  ALERT_GUARDS,
  evaluateSanitaryAlertState,
  evaluateVaccinationAlerts,
  normalizeVaccineKey,
  summarizeSanitaryAlerts,
} from '../../src/domain/alerts/sanitary-alert-evaluator.ts';

const PROPERTY_SEED = 20261105;
const TODAY = '2026-11-05';
const DAY_MS = 86_400_000;

const isoFromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const todayMs = Date.UTC(2026, 10, 5);

/** Fecha a una distancia de -400..400 días de hoy; el oráculo usa Date.UTC, no date-utils. */
const offsetArb = fc.integer({ min: -400, max: 400 });

const recordArb = fc.record({
  petId: fc.constantFrom('11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102'),
  vaccineName: fc.constantFrom('Rabia', ' rabia', 'RABIA ', 'Moquillo', 'moquillo'),
  appliedOffset: fc.integer({ min: -700, max: 0 }),
  boosterAfter: fc.integer({ min: 1, max: 400 }),
  createdSecond: fc.integer({ min: 0, max: 59 }),
});

type RecordSpec = typeof recordArb extends fc.Arbitrary<infer T> ? T : never;

function buildRecords(specs: RecordSpec[]): VaccinationRecord[] {
  return specs.map((s, i) => {
    const appliedAt = isoFromUtc(todayMs + s.appliedOffset * DAY_MS);
    return {
      id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
      petId: s.petId,
      vaccineName: s.vaccineName,
      appliedAt,
      nextBoosterAt: isoFromUtc(todayMs + (s.appliedOffset + s.boosterAfter) * DAY_MS),
      batchOrClinic: null,
      notes: null,
      createdAt: `${appliedAt}T10:00:${String(s.createdSecond).padStart(2, '0')}.000Z`,
    };
  });
}

/** Oráculo del más reciente por (petId, clave): mayor appliedAt, luego mayor createdAt, luego menor id. */
function newestIds(records: readonly VaccinationRecord[]): Set<string> {
  const best = new Map<string, VaccinationRecord>();
  for (const r of records) {
    const key = `${r.petId}|${normalizeVaccineKey(r.vaccineName)}`;
    const current = best.get(key);
    const newer =
      current === undefined ||
      r.appliedAt > current.appliedAt ||
      (r.appliedAt === current.appliedAt && (r.createdAt > current.createdAt || (r.createdAt === current.createdAt && r.id < current.id)));
    if (newer) best.set(key, r);
  }
  return new Set([...best.values()].map((r) => r.id));
}

describe('propiedades de STATE-ALERT-001', () => {
  it('[STATE-ALERT-001] el estado coincide con un oráculo independiente para cualquier fecha y bandera', () => {
    fc.assert(
      fc.property(offsetArb, fc.boolean(), (offset, superseded) => {
        const target = isoFromUtc(todayMs + offset * DAY_MS);
        const alert = evaluateSanitaryAlertState(target, TODAY, superseded);
        const expected = superseded ? 'SUPERSEDED' : offset < 0 ? 'OVERDUE' : offset <= 15 ? 'DUE_SOON' : 'UP_TO_DATE';
        expect(alert.status).toBe(expected);
        expect(alert.daysRemaining).toBe(offset);
        expect(alert.isActiveAlert).toBe(expected === 'OVERDUE' || expected === 'DUE_SOON');
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[STATE-ALERT-001] cada guard es la expresión del contrato y exactamente uno es verdadero en cualquier contexto', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.boolean(), (daysRemaining, hasNewerRecordOfSameKey) => {
        const context = { daysRemaining, hasNewerRecordOfSameKey };
        const contract = {
          SUPERSEDED: hasNewerRecordOfSameKey === true,
          OVERDUE: hasNewerRecordOfSameKey === false && daysRemaining < 0,
          DUE_SOON: hasNewerRecordOfSameKey === false && daysRemaining >= 0 && daysRemaining <= 15,
          UP_TO_DATE: hasNewerRecordOfSameKey === false && daysRemaining > 15,
        };
        const actual = Object.fromEntries(Object.entries(ALERT_GUARDS).map(([state, guard]) => [state, guard(context)]));
        expect(actual).toEqual(contract);
        expect(Object.values(actual).filter(Boolean).length).toBe(1);
      }),
      { seed: PROPERTY_SEED, numRuns: 500 },
    );
  });

  it('[STATE-ALERT-001] solo el registro más reciente de cada mascota y clave se evalúa por fecha; el orden de entrada no importa', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { minLength: 1, maxLength: 12 }), (specs) => {
        const records = buildRecords(specs);
        const newest = newestIds(records);
        const views = evaluateVaccinationAlerts(records, TODAY);
        expect(views.length).toBe(records.length);
        for (const { record, alert } of views) {
          expect(alert.status === 'SUPERSEDED').toBe(!newest.has(record.id));
        }
        const reversed = evaluateVaccinationAlerts([...records].reverse(), TODAY);
        expect(reversed.map((v) => [v.record.id, v.alert.status])).toEqual(views.map((v) => [v.record.id, v.alert.status]));
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[STATE-ALERT-001] el resumen cuenta cada estado no SUPERSEDED y totalActiveAlerts = OVERDUE + DUE_SOON', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 12 }), (specs) => {
        const views = evaluateVaccinationAlerts(buildRecords(specs), TODAY);
        const count = (status: string) => views.filter((v) => v.alert.status === status).length;
        expect(summarizeSanitaryAlerts(views, [])).toEqual({
          overdueCount: count('OVERDUE'),
          dueSoonCount: count('DUE_SOON'),
          upToDateCount: count('UP_TO_DATE'),
          totalActiveAlerts: count('OVERDUE') + count('DUE_SOON'),
        });
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });
});
