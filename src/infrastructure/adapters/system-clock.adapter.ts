/**
 * Reloj de producción (constitución §3.1, plan §4, F6).
 * - `todayIsoDate()`: fecha calendario en `APP_TIMEZONE` (por defecto America/Bogota), calculada con
 *   `Intl.DateTimeFormat`, no con la zona del proceso. A las 19:00 en Bogotá (00:00 UTC del día siguiente) sigue
 *   devolviendo el día local.
 * - `nowIsoTimestamp()`: instante en UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ`.
 * El reloj global solo se lee aquí, en infraestructura (INV-ARCH-001); `now` se inyecta para las pruebas.
 *
 * @implements INV-ARCH-001, INV-ARCH-004
 */

import type { ClockPort } from '../../application/ports/clock.port.ts';

export const DEFAULT_APP_TIMEZONE = 'America/Bogota';

/** true si `timeZone` es una zona IANA que admite Intl. */
export function isSupportedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone.trim() !== '';
  } catch {
    return false;
  }
}

/** @implements INV-ARCH-001, INV-ARCH-004 */
export class SystemClockAdapter implements ClockPort {
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(
    public readonly timeZone: string = DEFAULT_APP_TIMEZONE,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!isSupportedTimeZone(timeZone)) throw new RangeError(`SystemClockAdapter: zona horaria no válida: ${timeZone}`);
    this.dateFormat = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'gregory', numberingSystem: 'latn' });
  }

  public todayIsoDate(): string {
    const parts = Object.fromEntries(this.dateFormat.formatToParts(this.now()).map((p) => [p.type, p.value]));
    return `${parts['year']}-${parts['month']}-${parts['day']}`;
  }

  public nowIsoTimestamp(): string {
    return this.now().toISOString();
  }
}
