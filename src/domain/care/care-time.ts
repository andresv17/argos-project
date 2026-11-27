/**
 * Aritmética horaria pura de America/Bogota (UTC-5 fijo, D12-12) para el Modo Cuidador. Sin reloj: `now` llega por parámetro.
 *
 * @implements REQ-CAR12-002, REQ-CAR12-003, INV-ARCH-006
 */
import { toEpochDays } from '../shared/date-utils.ts';
import { CARE_UTC_OFFSET_HOURS } from '../platform/feature-012-limits.ts';

const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

const DAY_MS = 86_400_000;

/** Fecha civil `YYYY-MM-DD` desde días de época (algoritmo civil_from_days, sin objetos Date). */
function civilFromEpochDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Día civil `YYYY-MM-DD` de Bogotá para un instante ISO. */
export function bogotaCivilDate(iso: string): string {
  return civilFromEpochDays(Math.floor((Date.parse(iso) + CARE_UTC_OFFSET_HOURS * HOUR_MS) / DAY_MS));
}

/** Instante (ms UTC) de `YYYY-MM-DD` + `HH:MM` hora de Bogotá. */
export function bogotaInstantMs(date: string, time: string): number {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return toEpochDays(date) * DAY_MS + (hh - CARE_UTC_OFFSET_HOURS) * HOUR_MS + mm * MINUTE_MS;
}

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una fecha civil. */
export function isoWeekday(date: string): number {
  // 1970-01-01 fue jueves (4).
  return ((((toEpochDays(date) + 3) % 7) + 7) % 7) + 1;
}
