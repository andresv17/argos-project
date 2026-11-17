/**
 * Aritmética pura sobre timestamps UTC canónicos YYYY-MM-DDTHH:mm:ss.sssZ, sin leer el reloj del sistema.
 * La usan la vigencia de sesión (INV-AUTH-004) y la ventana de bloqueo (INV-AUTH-005).
 *
 * @implements INV-AUTH-004, INV-AUTH-005, INV-ARCH-001, INV-ARCH-004
 */

import { toEpochDays } from '../shared/date-utils.ts';
import { assertCanonicalCreatedAt } from '../sorting/deterministic-sorter.ts';

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/** Milisegundos desde 1970-01-01T00:00:00.000Z de un timestamp canónico. */
export function toEpochMillis(timestamp: string, fieldName = 'timestamp'): number {
  assertCanonicalCreatedAt(timestamp, fieldName);
  const [hours, minutes, seconds, millis] = timestamp.slice(11, 23).split(/[:.]/).map(Number) as [number, number, number, number];
  return toEpochDays(timestamp.slice(0, 10)) * MS_PER_DAY + ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Timestamp canónico de unos milisegundos desde la época (días civiles de Howard Hinnant). */
export function fromEpochMillis(epochMillis: number): string {
  const days = Math.floor(epochMillis / MS_PER_DAY);
  const msOfDay = epochMillis - days * MS_PER_DAY;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (value: number, size: number) => String(value).padStart(size, '0');
  const hours = Math.floor(msOfDay / 3_600_000);
  const minutes = Math.floor((msOfDay % 3_600_000) / MS_PER_MINUTE);
  const seconds = Math.floor((msOfDay % MS_PER_MINUTE) / 1000);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(msOfDay % 1000, 3)}Z`;
}

/** Suma (o resta, si es negativo) milisegundos a un timestamp canónico. */
export function addMillis(timestamp: string, deltaMillis: number): string {
  return fromEpochMillis(toEpochMillis(timestamp) + deltaMillis);
}
