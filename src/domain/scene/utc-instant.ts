/**
 * Aritmética de instantes UTC canónicos (`YYYY-MM-DDTHH:mm:ss.sssZ`) sin `Date` ni reloj: milisegundos desde 1970 por `days_from_civil` (INV-ESC6-001, INV-ARCH-001).
 *
 * @implements INV-ESC6-001, INV-ARCH-001
 */

import { toEpochDays } from '../shared/date-utils.ts';

const CANONICAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

/** Milisegundos desde 1970-01-01T00:00:00.000Z del instante UTC canónico. */
export function epochMillis(timestamp: string): number {
  const match = CANONICAL.exec(timestamp);
  if (match === null) throw new RangeError('El instante no es UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ.');
  const [, date, hours, minutes, seconds, millis] = match as unknown as [string, string, string, string, string, string];
  return toEpochDays(date) * 86_400_000 + ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis);
}
