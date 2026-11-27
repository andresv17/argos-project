/**
 * Aritmética horaria pura de America/Bogota (UTC-5 fijo, D12-12) para el Modo Cuidador. Sin reloj: `now` llega por parámetro.
 *
 * @implements REQ-CAR12-002, REQ-CAR12-003, INV-ARCH-006
 */
import { CARE_UTC_OFFSET_HOURS } from '../platform/feature-012-limits.ts';

const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

/** Día civil `YYYY-MM-DD` de Bogotá para un instante ISO. */
export function bogotaCivilDate(iso: string): string {
  return new Date(Date.parse(iso) + CARE_UTC_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** Instante (ms UTC) de `YYYY-MM-DD` + `HH:MM` hora de Bogotá. */
export function bogotaInstantMs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, hh - CARE_UTC_OFFSET_HOURS, mm);
}

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una fecha civil. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
