/**
 * Aritmética de calendario pura para la capa de dominio de Argos.
 * Sin reloj global ni objetos Date: la fecha actual llega siempre como argumento,
 * tomada de ClockPort.todayIsoDate() por la capa de aplicación.
 *
 * @implements REQ-PET-002, INV-PET-002, INV-REC-001, INV-ARCH-001, ERR-PET-FUTURE-BIRTHDATE, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE
 */

import { DomainError, type ComputedAge } from '../../generated/index.ts';

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Año bisiesto del calendario gregoriano.
 * @implements REQ-PET-002
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Días del mes (1..12) en el año dado.
 * @implements REQ-PET-002
 */
export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Mes fuera de rango: ${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Indica si el texto es una fecha de calendario real en formato YYYY-MM-DD (rechaza 2025-02-29, 2026-04-31, etc.).
 * @implements REQ-PET-002, INV-ARCH-001
 */
export function isIsoCalendarDate(value: string): boolean {
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= getDaysInMonth(year, month);
}

/**
 * Convierte YYYY-MM-DD en año, mes y día. Lanza ERR-SCHEMA-VALIDATION-FAILED si no es una fecha real.
 * @implements REQ-PET-002, INV-ARCH-001, ERR-SCHEMA-VALIDATION-FAILED
 */
export function parseIsoCalendarDate(isoDate: string, fieldName = 'date'): CalendarDate {
  if (!isIsoCalendarDate(isoDate)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `El campo ${fieldName} (${isoDate}) no es una fecha ISO-8601 YYYY-MM-DD válida.`,
      fieldName,
    );
  }
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/**
 * Número de días desde 1970-01-01 (aritmética entera, algoritmo days_from_civil).
 * @implements REQ-PET-002, INV-ARCH-001
 */
export function toEpochDays(isoDate: string): number {
  const { year, month, day } = parseIsoCalendarDate(isoDate);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * Diferencia con signo en días de calendario: targetDate − baseDate.
 * @implements REQ-PET-002, INV-ARCH-001
 */
export function diffInCalendarDays(targetDate: string, baseDate: string): number {
  return toEpochDays(targetDate) - toEpochDays(baseDate);
}

/**
 * Aniversario mensual número `monthsAfter` de una fecha. Si el día no existe en el mes destino
 * (29-feb, día 31), cae en el último día de ese mes. Siempre se calcula desde el día original.
 * @implements REQ-PET-002
 */
export function monthlyAnniversary(start: CalendarDate, monthsAfter: number): CalendarDate {
  const zeroBased = start.month - 1 + monthsAfter;
  const year = start.year + Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(start.day, getDaysInMonth(year, month)) };
}

/**
 * INV-PET-002: birthDate <= currentDate (ClockPort.todayIsoDate()). Devuelve ambas fechas ya validadas.
 * @implements INV-PET-002, ERR-PET-FUTURE-BIRTHDATE, INV-ARCH-001
 */
export function validateBirthDateNotFuture(
  birthDate: string,
  currentDate: string,
): { readonly birth: CalendarDate; readonly current: CalendarDate } {
  const birth = parseIsoCalendarDate(birthDate, 'birthDate');
  const current = parseIsoCalendarDate(currentDate, 'currentDate');
  if (birthDate > currentDate) {
    throw new DomainError(
      'ERR-PET-FUTURE-BIRTHDATE',
      `La fecha de nacimiento (${birthDate}) no puede ser posterior a la fecha actual (${currentDate}).`,
      'birthDate',
    );
  }
  return { birth, current };
}

/**
 * INV-REC-001: petBirthDate <= eventDate <= currentDate (ClockPort.todayIsoDate()).
 * @implements INV-REC-001, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, INV-ARCH-001
 */
export function validateEventDateWindow(
  eventDate: string,
  petBirthDate: string,
  currentDate: string,
  fieldName = 'recordedAt',
): void {
  parseIsoCalendarDate(eventDate, fieldName);
  parseIsoCalendarDate(petBirthDate, 'birthDate');
  parseIsoCalendarDate(currentDate, 'currentDate');
  if (eventDate < petBirthDate) {
    throw new DomainError(
      'ERR-REC-DATE-BEFORE-BIRTH',
      `La fecha del evento (${eventDate}) es anterior a la fecha de nacimiento de la mascota (${petBirthDate}).`,
      fieldName,
    );
  }
  if (eventDate > currentDate) {
    throw new DomainError(
      'ERR-REC-FUTURE-EVENT-DATE',
      `La fecha del evento (${eventDate}) no puede ser posterior a la fecha actual (${currentDate}).`,
      fieldName,
    );
  }
}

/**
 * REQ-PET-002: edad { years, months, totalDays } entre birthDate y currentDate.
 * years y months cuentan aniversarios mensuales completos (ver monthlyAnniversary);
 * totalDays es la diferencia en días de calendario.
 * Ej.: 2024-02-29 → 2025-02-28 = {1, 0, 365}; 2026-01-31 → 2026-02-28 = {0, 1, 28}.
 *
 * @implements REQ-PET-002, INV-PET-002, INV-ARCH-001, ERR-PET-FUTURE-BIRTHDATE
 */
export function calculatePetAge(birthDate: string, currentDate: string): ComputedAge {
  const { birth, current } = validateBirthDateNotFuture(birthDate, currentDate);

  let completedMonths = (current.year - birth.year) * 12 + (current.month - birth.month);
  if (current.day < monthlyAnniversary(birth, completedMonths).day) {
    completedMonths -= 1;
  }

  return {
    years: Math.floor(completedMonths / 12),
    months: completedMonths % 12,
    totalDays: diffInCalendarDays(currentDate, birthDate),
  };
}
