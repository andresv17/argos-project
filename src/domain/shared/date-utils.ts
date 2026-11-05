/**
 * Pure calendar arithmetic and age calculation functions for Argos Domain Layer.
 * Strictly prohibits invoking global entropy or system clocks [INV-ARCH-001].
 *
 * @implements REQ-PET-002, INV-PET-002, INV-REC-001, INV-ARCH-001, ERR-PET-FUTURE-BIRTHDATE, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE
 */

import {
  DomainError,
  isValidIsoCalendarDate,
  type ComputedAge,
} from '../../generated/index.ts';

interface ParsedCalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * Checks if a calendar year is a Gregorian leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the exact number of days in a 1-indexed calendar month (1..12).
 */
export function getDaysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 30;
}

/**
 * Parses and validates an ISO-8601 calendar date string (YYYY-MM-DD).
 * @implements INV-ARCH-001, ERR-SCHEMA-VALIDATION-FAILED
 */
export function parseIsoCalendarDate(isoDate: string, fieldName = 'date'): ParsedCalendarDate {
  if (!isValidIsoCalendarDate(isoDate)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `El campo ${fieldName} (${isoDate}) no es una fecha ISO-8601 YYYY-MM-DD válida.`,
      fieldName
    );
  }
  const parts = isoDate.split('-');
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

/**
 * Converts a Gregorian calendar date (year, month, day) to an exact integer Julian Day Number (Rata Die)
 * without using JavaScript Date objects [INV-ARCH-001].
 */
export function toRataDieDays(isoDate: string): number {
  const { year, month, day } = parseIsoCalendarDate(isoDate);
  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 12 : month;
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
}

/**
 * Calculates the signed difference in calendar days: targetDate - baseDate.
 * If targetDate is after baseDate, returns a positive integer.
 * If targetDate is before baseDate, returns a negative integer.
 *
 * @implements REQ-PET-002, STATE-ALERT-001, INV-ARCH-001
 */
export function diffInCalendarDays(targetDate: string, baseDate: string): number {
  return toRataDieDays(targetDate) - toRataDieDays(baseDate);
}

/**
 * Validates that a pet's birthDate is not in the future relative to currentDate (ClockPort.todayIsoDate()).
 *
 * @implements INV-PET-002, ERR-PET-FUTURE-BIRTHDATE, INV-ARCH-001
 */
export function validateBirthDateNotFuture(birthDate: string, currentDate: string): void {
  parseIsoCalendarDate(birthDate, 'birthDate');
  parseIsoCalendarDate(currentDate, 'currentDate');
  if (birthDate > currentDate) {
    throw new DomainError(
      'ERR-PET-FUTURE-BIRTHDATE',
      `La fecha de nacimiento (${birthDate}) no puede ser posterior a la fecha actual (${currentDate}).`,
      'birthDate'
    );
  }
}

/**
 * Validates that an occurred clinical/biometric event date satisfies:
 * petBirthDate <= eventDate <= currentDate (ClockPort.todayIsoDate()).
 *
 * @implements INV-REC-001, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, INV-ARCH-001
 */
export function validateEventDateWindow(
  eventDate: string,
  petBirthDate: string,
  currentDate: string,
  fieldName = 'recordedAt'
): void {
  parseIsoCalendarDate(eventDate, fieldName);
  parseIsoCalendarDate(petBirthDate, 'birthDate');
  parseIsoCalendarDate(currentDate, 'currentDate');

  if (eventDate < petBirthDate) {
    throw new DomainError(
      'ERR-REC-DATE-BEFORE-BIRTH',
      `La fecha del evento (${eventDate}) es anterior a la fecha de nacimiento de la mascota (${petBirthDate}).`,
      fieldName
    );
  }

  if (eventDate > currentDate) {
    throw new DomainError(
      'ERR-REC-FUTURE-EVENT-DATE',
      `La fecha del evento (${eventDate}) no puede ser posterior a la fecha actual (${currentDate}).`,
      fieldName
    );
  }
}

/**
 * Calculates the exact deterministic age of a pet in years, months (0..11), and totalDays
 * comparing birthDate against currentDate (from ClockPort.todayIsoDate()).
 *
 * @implements REQ-PET-002, INV-PET-002, INV-ARCH-001, ERR-PET-FUTURE-BIRTHDATE
 */
export function calculatePetAge(birthDate: string, currentDate: string): ComputedAge {
  validateBirthDateNotFuture(birthDate, currentDate);

  const birth = parseIsoCalendarDate(birthDate, 'birthDate');
  const current = parseIsoCalendarDate(currentDate, 'currentDate');
  const totalDays = diffInCalendarDays(currentDate, birthDate);

  let years = current.year - birth.year;
  let months = current.month - birth.month;

  if (current.day < birth.day) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return {
    years,
    months,
    totalDays,
  };
}
