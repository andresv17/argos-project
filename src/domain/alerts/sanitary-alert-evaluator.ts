/**
 * Pure deterministic evaluator for Sanitary Alert State Machine (STATE-ALERT-001).
 * Evaluates UP_TO_DATE (> 15d), DUE_SOON (0..15d), OVERDUE (< 0d), and SUPERSEDED.
 *
 * @implements STATE-ALERT-001, REQ-REC-003, REQ-REC-004, REQ-UI-003, INV-ARCH-001, INV-ARCH-004
 */

import {
  SANITARY_ALERT_MACHINE_SPEC,
  type ActiveSanitaryAlertsSummary,
  type AlertStateMetadata,
  type DewormingEntryView,
  type DewormingRecord,
  type VaccinationEntryView,
  type VaccinationRecord,
} from '../../generated/index.ts';
import { diffInCalendarDays } from '../shared/date-utils.ts';
import { sortHistoricalRecords } from '../sorting/deterministic-sorter.ts';

/**
 * Evaluates the sanitary alert state for a single target date (nextBoosterAt or nextSuggestedDoseAt)
 * against currentDate (from ClockPort.todayIsoDate()) and whether a newer record supersedes it.
 *
 * @implements STATE-ALERT-001, INV-ARCH-001
 */
export function evaluateSanitaryAlertState(
  targetDate: string,
  currentDate: string,
  hasNewerRecordOfSameKey: boolean
): AlertStateMetadata {
  const daysRemaining = diffInCalendarDays(targetDate, currentDate);

  if (hasNewerRecordOfSameKey) {
    const spec = SANITARY_ALERT_MACHINE_SPEC.SUPERSEDED;
    return {
      status: 'SUPERSEDED',
      uiBadge: spec.uiBadge,
      label: spec.label,
      isActiveAlert: spec.isActiveAlert,
      daysRemaining,
    };
  }

  if (daysRemaining < 0) {
    const spec = SANITARY_ALERT_MACHINE_SPEC.OVERDUE;
    return {
      status: 'OVERDUE',
      uiBadge: spec.uiBadge,
      label: spec.label,
      isActiveAlert: spec.isActiveAlert,
      daysRemaining,
    };
  }

  if (daysRemaining <= 15) {
    const spec = SANITARY_ALERT_MACHINE_SPEC.DUE_SOON;
    return {
      status: 'DUE_SOON',
      uiBadge: spec.uiBadge,
      label: spec.label,
      isActiveAlert: spec.isActiveAlert,
      daysRemaining,
    };
  }

  const spec = SANITARY_ALERT_MACHINE_SPEC.UP_TO_DATE;
  return {
    status: 'UP_TO_DATE',
    uiBadge: spec.uiBadge,
    label: spec.label,
    isActiveAlert: spec.isActiveAlert,
    daysRemaining,
  };
}

/**
 * Normalizes vaccine name for grouping superseded records per pet.
 */
export function normalizeVaccineKey(vaccineName: string): string {
  return vaccineName.trim().toLowerCase();
}

/**
 * Evaluates a collection of vaccination records for a single pet, sorting them deterministically
 * (INV-SORT-001) and marking older records of the same normalized vaccineName as SUPERSEDED.
 *
 * @implements STATE-ALERT-001, REQ-REC-003
 */
export function evaluateVaccinationAlerts(
  records: readonly VaccinationRecord[],
  currentDate: string
): VaccinationEntryView[] {
  const sorted = sortHistoricalRecords(records);
  const seenKeys = new Set<string>();

  return sorted.map((record) => {
    const key = normalizeVaccineKey(record.vaccineName);
    const hasNewer = seenKeys.has(key);
    seenKeys.add(key);

    return {
      ...record,
      alert: evaluateSanitaryAlertState(record.nextBoosterAt, currentDate, hasNewer),
    };
  });
}

/**
 * Evaluates a collection of deworming records for a single pet, sorting them deterministically
 * (INV-SORT-001) and marking older records of the same dewormingType (INTERNAL / EXTERNAL) as SUPERSEDED.
 *
 * @implements STATE-ALERT-001, REQ-REC-004
 */
export function evaluateDewormingAlerts(
  records: readonly DewormingRecord[],
  currentDate: string
): DewormingEntryView[] {
  const sorted = sortHistoricalRecords(records);
  const seenTypes = new Set<string>();

  return sorted.map((record) => {
    const key = record.dewormingType;
    const hasNewer = seenTypes.has(key);
    seenTypes.add(key);

    return {
      ...record,
      alert: evaluateSanitaryAlertState(record.nextSuggestedDoseAt, currentDate, hasNewer),
    };
  });
}

/**
 * Computes the summary counts of active sanitary alerts (excluding SUPERSEDED records) for a pet.
 *
 * @implements STATE-ALERT-001, REQ-PET-003, REQ-UI-001, REQ-UI-003
 */
export function summarizeSanitaryAlerts(
  vaccinations: readonly VaccinationEntryView[],
  dewormings: readonly DewormingEntryView[]
): ActiveSanitaryAlertsSummary {
  let overdueCount = 0;
  let dueSoonCount = 0;
  let upToDateCount = 0;

  const allAlerts = [
    ...vaccinations.map((v) => v.alert),
    ...dewormings.map((d) => d.alert),
  ];

  for (const alert of allAlerts) {
    if (alert.status === 'OVERDUE') {
      overdueCount += 1;
    } else if (alert.status === 'DUE_SOON') {
      dueSoonCount += 1;
    } else if (alert.status === 'UP_TO_DATE') {
      upToDateCount += 1;
    }
  }

  return {
    overdueCount,
    dueSoonCount,
    upToDateCount,
    totalActiveAlerts: overdueCount + dueSoonCount,
  };
}
