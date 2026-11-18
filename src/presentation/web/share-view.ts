/**
 * Textos y formatos puros del enlace veterinario (feature 005, S4 y S5 de `/sati`): fechas en español sin objetos `Date` (la presentación no mide el tiempo) y
 * mensajes de los errores del catálogo 005. Las fechas de calendario (`YYYY-MM-DD`) salen tal cual, sin conversión de zona (PN-10); los instantes UTC se rotulan «(UTC)».
 *
 * @implements REQ-VET-001, REQ-VET-004, REQ-SUM-004, SC-005-031
 */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** `2026-11-18` o `2026-11-18T14:32:00.000Z` -> «18 nov 2026». */
export function formatCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? '???'} ${year}`;
}

/** `2026-11-18T14:32:00.000Z` -> «18 nov 2026, 14:32 (UTC)». */
export function formatUtcStamp(isoTimestamp: string): string {
  return `${formatCalendarDate(isoTimestamp)}, ${isoTimestamp.slice(11, 16)} (UTC)`;
}

/** Fecha de calendario de `ahora + días` (aritmética de épocas sobre la fecha UTC; sin `Date`). */
export function addDaysToDate(isoTimestamp: string, days: number): string {
  const [y, m, d] = isoTimestamp.slice(0, 10).split('-').map(Number) as [number, number, number];
  const shifted = m <= 2 ? y - 1 : y;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const epochDays = era * 146097 + yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear - 719468 + days;
  const z = epochDays + 719468;
  const era2 = Math.floor(z / 146097);
  const doe = z - era2 * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era2 * 400 + (month <= 2 ? 1 : 0);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** «Vence el 25 nov 2026» para una creación hoy con `days` de caducidad. */
export function expiryText(nowIso: string, days: number): string {
  return `Vence el ${formatCalendarDate(addDaysToDate(nowIso, days))}`;
}

/**
 * Cabecera HTTP `Date` («Wed, 18 Nov 2026 12:00:00 GMT») -> instante UTC canónico. La interfaz no lee el reloj del navegador: el «ahora» de los textos «Vence el…»
 * es el del servidor. Devuelve null si la cabecera falta o no tiene esa forma.
 */
export function parseHttpDate(value: string | null): string | null {
  const m = /^[A-Za-z]{3}, (\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value ?? '');
  if (m === null) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2]!.toLowerCase()) + 1;
  if (month === 0) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

/** Decimales con coma: 32.85 -> «32,85». */
export const decimalEs = (value: number): string => String(value).replace('.', ',');

export const STATUS_LABEL = { ACTIVE: 'Activo', REVOKED: 'Revocado', EXPIRED: 'Vencido' } as const;
/** Texto de una clave de una tabla de rótulos; nulo si no hay clave. Solo busca el texto: nunca decide clases, orden ni filtros (INV-SIN-002). */
export function labelOf<K extends string>(table: Readonly<Record<K, string>>, key: K | null): string | null {
  return key === null ? null : table[key];
}
export const PARAMETER_CATEGORY_LABEL = { DIET_CHANGE: 'Cambio de dieta', ALLERGY: 'Alergia', SURGERY: 'Cirugía', BEHAVIOR: 'Comportamiento', OTHER: 'Otro' } as const;
export const DEWORMING_TYPE_LABEL = { INTERNAL: 'Interna', EXTERNAL: 'Externa' } as const;
export const SPECIES_LABEL: Readonly<Record<string, string>> = {
  CANINE: 'Perro', FELINE: 'Gato', RABBIT: 'Conejo', BIRD: 'Ave', RODENT: 'Roedor', REPTILE: 'Reptil', FISH: 'Pez', OTHER: 'Otra',
};
export const SEX_LABEL: Readonly<Record<string, string>> = { MALE: 'Macho', FEMALE: 'Hembra', UNKNOWN: 'Sin determinar' };

/** Mensajes de los errores propios del enlace (catálogo 005); el resto sale del mensaje genérico. */
export function shareProblemMessage(code: string): string {
  switch (code) {
    case 'ERR-SHARE-LINK-LIMIT':
      return 'Se alcanzó el máximo de 20 enlaces activos para este alcance. Revoca alguno para crear otro.';
    case 'ERR-ACC-FORBIDDEN':
      return 'Tu rol no permite compartir esta información con un veterinario.';
    case 'ERR-SHARE-NOT-FOUND':
    case 'ERR-PET-NOT-FOUND':
    case 'ERR-HOUSE-NOT-FOUND':
      return 'No encontramos eso. Recarga la página e inténtalo de nuevo.';
    default:
      return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
}

