/**
 * Deterministic chronological sorting for all historical records in Argos.
 * Sort order: eventDate DESC, tie-breaker 1: createdAt DESC, tie-breaker 2: id ASC.
 *
 * @implements INV-SORT-001, INV-ARCH-001, INV-ARCH-004
 */

export interface SortableHistoricalRecord {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * Extracts the canonical event date string (YYYY-MM-DD) from any of the 6 clinical record types.
 * @implements INV-SORT-001
 */
export function getRecordEventDate(
  record:
    | { readonly recordedAt: string }
    | { readonly appliedAt: string }
    | { readonly visitDate: string }
): string {
  if ('recordedAt' in record) {
    return record.recordedAt;
  }
  if ('appliedAt' in record) {
    return record.appliedAt;
  }
  return record.visitDate;
}

/**
 * Pure comparator implementing INV-SORT-001:
 * 1. Event date (recordedAt / appliedAt / visitDate) DESC
 * 2. createdAt timestamp DESC
 * 3. id ASC
 *
 * @implements INV-SORT-001
 */
export function compareHistoricalRecords<
  T extends SortableHistoricalRecord &
    (
      | { readonly recordedAt: string }
      | { readonly appliedAt: string }
      | { readonly visitDate: string }
    ),
>(a: T, b: T): number {
  const dateA = getRecordEventDate(a);
  const dateB = getRecordEventDate(b);

  if (dateA !== dateB) {
    return dateA > dateB ? -1 : 1;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt ? -1 : 1;
  }

  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }

  return 0;
}

/**
 * Returns a new deterministically sorted array of historical records without mutating the input array.
 *
 * @implements INV-SORT-001
 */
export function sortHistoricalRecords<
  T extends SortableHistoricalRecord &
    (
      | { readonly recordedAt: string }
      | { readonly appliedAt: string }
      | { readonly visitDate: string }
    ),
>(records: readonly T[]): T[] {
  return [...records].sort(compareHistoricalRecords);
}
