/**
 * Edad estimada (REQ-PET2-001, ADR-002-16): el cliente envía años y meses aproximados y el servidor los convierte a
 * `birthDate` restando ambos a la fecha de ClockPort, con `birthDateIsEstimate = true`.
 * Regla del último día del mes (la misma de REQ-PET-002): si el día no existe en el mes destino (29 de febrero, día 31),
 * se usa el último día de ese mes. La edad se muestra siempre en años reales, sin años humanos equivalentes.
 * Sin reloj global: la fecha actual llega como argumento (INV-ARCH-001).
 *
 * @implements REQ-PET2-001, REQ-PET-002, INV-ARCH-001
 */

import type { EstimatedAge } from '../../generated/index.ts';
import { monthlyAnniversary, parseIsoCalendarDate } from '../shared/date-utils.ts';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * `currentDate` menos `years` años y `months` meses, como fecha ISO YYYY-MM-DD.
 * @implements REQ-PET2-001, REQ-PET-002
 */
export function estimatedAgeToBirthDate(currentDate: string, age: EstimatedAge): string {
  const current = parseIsoCalendarDate(currentDate, 'currentDate');
  const { year, month, day } = monthlyAnniversary(current, -(age.years * 12 + age.months));
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
