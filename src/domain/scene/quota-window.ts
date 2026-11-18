/**
 * Cuota mensual de generaciones (REQ-ESC6-011, D6-03; data-model.md §3). La ventana `YYYY-MM` entra ya resuelta como dato: sale de `ClockPort.todayIsoDate()` en
 * `APP_TIMEZONE` (reloj inyectado); aquí no hay `Date` ni `Intl` (INV-ESC6-001). La ventana y el máximo se FIJAN en el intento (T1) y T2 los usa tal cual
 * (EDGE-ESC6-031); solo una publicación incrementa lo consumido (INV-ESC6-004).
 *
 * @implements REQ-ESC6-011, INV-ESC6-001, INV-ESC6-004, EDGE-ESC6-007, EDGE-ESC6-031, SC-ESC6-057, SC-ESC6-074
 */

import { isIsoCalendarDate, shiftIsoTimestamp } from '../shared/date-utils.ts';

const WINDOW = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Ventana `YYYY-MM` de la fecha local `YYYY-MM-DD` de `APP_TIMEZONE`. */
export function quotaWindowOf(todayIsoDate: string): string {
  if (!isIsoCalendarDate(todayIsoDate)) throw new RangeError('La fecha local no es YYYY-MM-DD válida.');
  return todayIsoDate.slice(0, 7);
}

/** Ventana siguiente (cruza el año). */
export function nextQuotaWindow(window: string): string {
  const match = WINDOW.exec(window);
  if (match === null) throw new RangeError('La ventana no es YYYY-MM válida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 12 ? `${String(year + 1).padStart(4, '0')}-01` : `${match[1]}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * `quota.resetsAt`: inicio de la ventana siguiente (día 1, 00:00 en `APP_TIMEZONE`) como UTC canónico. `utcOffsetMinutes` es el desfase de la zona respecto de UTC
 * (p. ej. -300 para America/Bogota) y lo aporta la composición, no el dominio.
 */
export function windowResetsAt(window: string, utcOffsetMinutes: number): string {
  return shiftIsoTimestamp(`${nextQuotaWindow(window)}-01T00:00:00.000Z`, -utcOffsetMinutes * 60_000);
}

export interface RemainingQuotaInput {
  readonly max: number;
  readonly consumed: number;
  /** Ventana en que se contó `consumed` (`home_scenes.quota_window`). */
  readonly consumedWindow: string;
  /** Ventana vigente de la lectura. */
  readonly currentWindow: string;
}

/** `R = max(0, Q - consumidas de la ventana vigente)`; lo consumido en otra ventana cuenta 0. */
export function remainingQuota(input: RemainingQuotaInput): number {
  const used = input.consumedWindow === input.currentWindow ? input.consumed : 0;
  return Math.max(0, input.max - used);
}

export interface PublicationInput {
  readonly consumed: number;
  readonly window: string;
  /** Ventana y máximo fijados en T1 (`scene_attempts.quota_window`, `quota_max`). */
  readonly attemptWindow: string;
  readonly attemptMax: number;
}

export interface PublicationResult {
  readonly allowed: boolean;
  readonly consumed: number;
  readonly window: string;
}

/** T2: ¿cabe la publicación en la ventana del intento? Con otra ventana almacenada el contador reinicia en 1; sin cupo no cambia nada. */
export function applyPublication(input: PublicationInput): PublicationResult {
  const used = input.window === input.attemptWindow ? input.consumed : 0;
  if (used >= input.attemptMax) return { allowed: false, consumed: input.consumed, window: input.window };
  return { allowed: true, consumed: used + 1, window: input.attemptWindow };
}
