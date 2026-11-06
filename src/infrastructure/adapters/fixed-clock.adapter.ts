/**
 * ClockPort fijo y determinista para pruebas unitarias, de propiedades e integración.
 *
 * @implements INV-ARCH-001
 */

import type { ClockPort } from '../../application/ports/clock.port.ts';
import { isIsoCalendarDate } from '../../domain/shared/date-utils.ts';
import { isCanonicalUtcTimestamp } from '../../domain/sorting/deterministic-sorter.ts';

export const DEFAULT_FIXED_TODAY = '2026-11-05';
export const DEFAULT_FIXED_NOW = '2026-11-05T12:00:00.000Z';

/**
 * Reloj fijo. Rechaza en construcción y en setClock una fecha que no sea YYYY-MM-DD real
 * o un timestamp que no sea UTC canónico.
 * @implements INV-ARCH-001
 */
export class FixedClockAdapter implements ClockPort {
  private currentIsoDate: string;
  private currentIsoTimestamp: string;

  constructor(todayIsoDate: string = DEFAULT_FIXED_TODAY, nowIsoTimestamp: string = DEFAULT_FIXED_NOW) {
    FixedClockAdapter.check(todayIsoDate, nowIsoTimestamp);
    this.currentIsoDate = todayIsoDate;
    this.currentIsoTimestamp = nowIsoTimestamp;
  }

  public todayIsoDate(): string {
    return this.currentIsoDate;
  }

  public nowIsoTimestamp(): string {
    return this.currentIsoTimestamp;
  }

  public setClock(todayIsoDate: string, nowIsoTimestamp: string): void {
    FixedClockAdapter.check(todayIsoDate, nowIsoTimestamp);
    this.currentIsoDate = todayIsoDate;
    this.currentIsoTimestamp = nowIsoTimestamp;
  }

  private static check(todayIsoDate: string, nowIsoTimestamp: string): void {
    if (!isIsoCalendarDate(todayIsoDate)) {
      throw new RangeError(`FixedClockAdapter: todayIsoDate no es YYYY-MM-DD válido: ${todayIsoDate}`);
    }
    if (!isCanonicalUtcTimestamp(nowIsoTimestamp)) {
      throw new RangeError(`FixedClockAdapter: nowIsoTimestamp no es UTC canónico: ${nowIsoTimestamp}`);
    }
  }
}
