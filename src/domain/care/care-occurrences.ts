/**
 * Ocurrencias de cuidado de un día civil de Bogotá: función pura rutina x hora, sin reloj ni I/O (`now` por parámetro).
 * Cada ocurrencia usa la versión de la serie que la cubre por instante; una entrada ligada a la serie sigue contando aunque se registrara contra otra versión.
 *
 * @implements REQ-CAR12-002, SC-012-027, SC-012-028, INV-SORT-001
 */
import { CARE_TIMEZONE, OVERDUE_GRACE_MINUTES } from '../platform/feature-012-limits.ts';
import { bogotaCivilDate, bogotaInstantMs, isoWeekday, MINUTE_MS } from './care-time.ts';

export { bogotaCivilDate };

export interface OccurrenceRoutine {
  readonly id: string;
  readonly seriesId: string;
  readonly kind: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly doseAmount: number | null;
  readonly doseUnit: string | null;
  readonly timesOfDay: readonly string[];
  readonly daysOfWeek: readonly number[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly ongoing: boolean;
  readonly active: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly supersedesRoutineId?: string | null;
}

export interface OccurrenceEntry {
  readonly id: string;
  readonly routineId: string;
  readonly seriesId: string;
  readonly occurrenceDate: string;
  readonly occurrenceTime: string;
  readonly status: 'DONE' | 'SKIPPED';
  readonly late: boolean;
  readonly revertedAt: string | null;
}

export type OccurrenceState = 'PENDING' | 'OVERDUE' | 'DONE' | 'SKIPPED';

export interface CareOccurrence {
  readonly routineId: string;
  readonly seriesId: string;
  readonly kind: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly doseAmount: number | null;
  readonly doseUnit: string | null;
  readonly occurrenceDate: string;
  readonly occurrenceTime: string;
  readonly state: OccurrenceState;
  readonly logEntry: OccurrenceEntry | null;
}

export interface CareOccurrencesResult {
  readonly date: string;
  readonly timezone: string;
  readonly graceMinutes: number;
  readonly items: readonly CareOccurrence[];
}

export function computeCareOccurrences(input: { routines: readonly OccurrenceRoutine[]; entries: readonly OccurrenceEntry[]; date: string; now: string }): CareOccurrencesResult {
  const { routines, entries, date, now } = input;
  const nowMs = Date.parse(now);
  const weekday = isoWeekday(date);
  const raw: Array<{ item: CareOccurrence; ms: number; index: number }> = [];
  let index = 0;
  for (const r of routines) {
    if (!r.daysOfWeek.includes(weekday)) continue;
    if (r.startDate > date) continue;
    if (!r.ongoing && r.endDate !== null && r.endDate < date) continue;
    for (const time of r.timesOfDay) {
      const ms = bogotaInstantMs(date, time);
      // R-2 (Neo): la v1 (sin `supersedesRoutineId`) rige desde `startDate` 00:00 Bogotá, no desde su creación; las v2+ rigen desde su `effectiveFrom`.
      if (r.supersedesRoutineId && ms < Date.parse(r.effectiveFrom)) continue;
      if (r.effectiveTo !== null && ms >= Date.parse(r.effectiveTo)) continue;
      const entry = entries.find((e) => e.revertedAt === null && e.seriesId === r.seriesId && e.occurrenceDate === date && e.occurrenceTime === time) ?? null;
      const overdue = nowMs >= ms + OVERDUE_GRACE_MINUTES * MINUTE_MS;
      const state: OccurrenceState = entry ? entry.status : overdue ? 'OVERDUE' : 'PENDING';
      raw.push({
        ms,
        index: index++,
        item: {
          routineId: r.id,
          seriesId: r.seriesId,
          kind: r.kind,
          title: r.title,
          instructions: state === 'OVERDUE' ? null : r.instructions,
          doseAmount: r.doseAmount,
          doseUnit: r.doseUnit,
          occurrenceDate: date,
          occurrenceTime: time,
          state,
          logEntry: entry,
        },
      });
    }
  }
  raw.sort((a, b) => a.ms - b.ms || a.index - b.index);
  return { date, timezone: CARE_TIMEZONE, graceMinutes: OVERDUE_GRACE_MINUTES, items: raw.map((x) => x.item) };
}
