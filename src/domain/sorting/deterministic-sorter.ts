/**
 * Orden determinista de Argos.
 * - Historiales (INV-SORT-001): fecha de evento DESC, createdAt DESC, id ASC.
 * - Listado de mascotas (REQ-PET-005): name ASC (localeCompare 'es', sensibilidad 'base'), createdAt ASC, id ASC.
 * createdAt debe ser UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ para que la comparación de texto sea cronológica.
 *
 * @implements INV-SORT-001, REQ-PET-005, INV-ARCH-001, INV-ARCH-004
 */

import { DomainError } from '../../generated/index.ts';
import { speciesFilterGroup } from '../pet/species.ts';
import { isIsoCalendarDate } from '../shared/date-utils.ts';

const CANONICAL_UTC = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const PET_NAME_LOCALE = 'es';
const PET_NAME_OPTIONS: Intl.CollatorOptions = { sensitivity: 'base' };

export interface SortableHistoricalRecord {
  readonly id: string;
  readonly createdAt: string;
}

export type EventDated =
  | { readonly recordedAt: string }
  | { readonly appliedAt: string }
  | { readonly visitDate: string };

export interface SortablePet {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface FilterablePet {
  readonly name: string;
  readonly species: string;
}

export interface PetListFilter {
  readonly q?: string;
  readonly species?: string;
  /** Grupo del filtro de REQ-PET2-002: Todos, Perros (CANINE), Gatos (FELINE) y Otros (las otras seis especies). */
  readonly group?: 'ALL' | 'CANINE' | 'FELINE' | 'OTHERS';
}

/**
 * Indica si el valor es un timestamp UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ con fecha real.
 * @implements INV-SORT-001
 */
export function isCanonicalUtcTimestamp(value: string): boolean {
  const date = CANONICAL_UTC.exec(value)?.[1];
  return date !== undefined && isIsoCalendarDate(date);
}

/**
 * Lanza ERR-SCHEMA-VALIDATION-FAILED si createdAt no es UTC canónico.
 * @implements INV-SORT-001, ERR-SCHEMA-VALIDATION-FAILED
 */
export function assertCanonicalCreatedAt(value: string, fieldName = 'createdAt'): void {
  if (!isCanonicalUtcTimestamp(value)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `El campo ${fieldName} (${value}) no es un timestamp UTC canónico YYYY-MM-DDTHH:mm:ss.sssZ.`,
      fieldName,
    );
  }
}

/**
 * Fecha de evento (YYYY-MM-DD) de cualquiera de los 6 tipos de registro.
 * @implements INV-SORT-001
 */
export function getRecordEventDate(record: EventDated): string {
  if ('recordedAt' in record) return record.recordedAt;
  if ('appliedAt' in record) return record.appliedAt;
  return record.visitDate;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Comparador de INV-SORT-001: fecha de evento DESC, createdAt DESC, id ASC.
 * @implements INV-SORT-001
 */
export function compareHistoricalRecords<T extends SortableHistoricalRecord & EventDated>(a: T, b: T): number {
  return (
    compareText(getRecordEventDate(b), getRecordEventDate(a)) ||
    compareText(b.createdAt, a.createdAt) ||
    compareText(a.id, b.id)
  );
}

/**
 * Copia ordenada por INV-SORT-001. No modifica la entrada. Exige createdAt canónico en todos los registros.
 * @implements INV-SORT-001
 */
export function sortHistoricalRecords<T extends SortableHistoricalRecord & EventDated>(records: readonly T[]): T[] {
  for (const record of records) assertCanonicalCreatedAt(record.createdAt);
  return [...records].sort(compareHistoricalRecords);
}

/**
 * Comparador de REQ-PET-005: name ASC con localeCompare('es', { sensitivity: 'base' }), createdAt ASC, id ASC.
 * @implements REQ-PET-005, INV-SORT-001
 */
export function comparePetsForListing<T extends SortablePet>(a: T, b: T): number {
  return (
    a.name.localeCompare(b.name, PET_NAME_LOCALE, PET_NAME_OPTIONS) ||
    compareText(a.createdAt, b.createdAt) ||
    compareText(a.id, b.id)
  );
}

/**
 * Copia ordenada por REQ-PET-005. No modifica la entrada. Exige createdAt canónico en todas las mascotas.
 * @implements REQ-PET-005, INV-SORT-001
 */
export function sortPetsForListing<T extends SortablePet>(pets: readonly T[]): T[] {
  for (const pet of pets) assertCanonicalCreatedAt(pet.createdAt);
  return [...pets].sort(comparePetsForListing);
}

/**
 * Normalización del filtro de texto de REQ-PET-005: NFD, sin marcas combinantes (\p{M}), en minúsculas.
 * @implements REQ-PET-005
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Filtro opcional de REQ-PET2-002: subcadena en name sin distinguir mayúsculas ni tildes, grupo de especie (Perros, Gatos,
 * Otros) y, como alias heredado, species exacta. Un q ausente, vacío o solo con espacios no filtra.
 * @implements REQ-PET2-002, REQ-PET-005
 */
export function matchesPetListFilter(pet: FilterablePet, filter: PetListFilter = {}): boolean {
  if (filter.species !== undefined && pet.species !== filter.species) return false;
  if (filter.group !== undefined && filter.group !== 'ALL' && speciesFilterGroup(pet.species) !== filter.group) return false;
  return normalizeForSearch(pet.name).includes(normalizeForSearch(filter.q?.trim() ?? ''));
}
