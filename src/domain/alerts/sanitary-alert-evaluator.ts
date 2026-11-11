/**
 * Evaluador puro de alertas sanitarias (STATE-ALERT-001, contrato v2.0.1).
 * Devuelve el primer estado cuyo guard es verdadero, en el orden evaluationOrder del contrato generado.
 * No hay estado inicial ni transitorio. daysRemaining = diffInCalendarDays(targetDate, ClockPort.todayIsoDate()).
 * Un registro queda SUPERSEDED si hay otro posterior (orden INV-SORT-001) de la misma mascota con la misma clave:
 * vaccineName.trim().toLowerCase() en vacunas, dewormingType en desparasitaciones.
 *
 * @implements STATE-ALERT-001, INV-ARCH-001, INV-ARCH-004
 */

import {
  STATE_ALERT_001,
  type DewormingRecord,
  type StateAlert001State,
  type VaccinationRecord,
  type components,
} from '../../generated/index.ts';
import { diffInCalendarDays } from '../shared/date-utils.ts';
import { sortHistoricalRecords } from '../sorting/deterministic-sorter.ts';

export type AlertStateMetadata = components['schemas']['AlertStateMetadata'];
export type ActiveSanitaryAlertsSummary = components['schemas']['ActiveSanitaryAlertsSummary'];
export type VaccinationEntryView = components['schemas']['VaccinationEntryView'];
export type DewormingEntryView = components['schemas']['DewormingEntryView'];

export interface AlertGuardContext {
  readonly daysRemaining: number;
  readonly hasNewerRecordOfSameKey: boolean;
}

/** Guards de cada estado, transcritos de contracts/state-machines/sanitary-alert.machine.json. */
export const ALERT_GUARDS: Readonly<Record<StateAlert001State, (context: AlertGuardContext) => boolean>> = {
  SUPERSEDED: (c) => c.hasNewerRecordOfSameKey,
  OVERDUE: (c) => !c.hasNewerRecordOfSameKey && c.daysRemaining < 0,
  DUE_SOON: (c) => !c.hasNewerRecordOfSameKey && c.daysRemaining >= 0 && c.daysRemaining <= 15,
  UP_TO_DATE: (c) => !c.hasNewerRecordOfSameKey && c.daysRemaining > 15,
};

/**
 * Primer estado de evaluationOrder cuyo guard es verdadero.
 * @implements STATE-ALERT-001
 */
export function resolveAlertState(
  context: AlertGuardContext,
  evaluationOrder: readonly StateAlert001State[] = STATE_ALERT_001.evaluationOrder,
): StateAlert001State {
  const state = evaluationOrder.find((candidate) => ALERT_GUARDS[candidate](context));
  if (state === undefined) {
    throw new RangeError(`Ningún guard de STATE-ALERT-001 es verdadero para ${JSON.stringify(context)}.`);
  }
  return state;
}

/**
 * Estado de alerta de una fecha objetivo frente a la fecha actual de ClockPort.
 * @implements STATE-ALERT-001, INV-ARCH-001
 */
export function evaluateSanitaryAlertState(
  targetDate: string,
  currentDate: string,
  hasNewerRecordOfSameKey: boolean,
): AlertStateMetadata {
  const daysRemaining = diffInCalendarDays(targetDate, currentDate);
  const status = resolveAlertState({ daysRemaining, hasNewerRecordOfSameKey });
  const spec = STATE_ALERT_001.states[status];
  return {
    status,
    uiBadge: spec.uiBadge,
    label: spec.label,
    isActiveAlert: spec.isActiveAlert,
    daysRemaining,
  };
}

/** Clave de agrupación de vacunas: nombre sin espacios extremos y en minúsculas. */
export function normalizeVaccineKey(vaccineName: string): string {
  return vaccineName.trim().toLowerCase();
}

function evaluateByKey<T extends VaccinationRecord | DewormingRecord>(
  records: readonly T[],
  currentDate: string,
  keyOf: (record: T) => string,
  targetOf: (record: T) => string | null,
): Array<{ record: T; alert: AlertStateMetadata | null }> {
  const seen = new Set<string>();
  return sortHistoricalRecords(records).map((record) => {
    const key = `${record.petId}\u0000${keyOf(record)}`;
    const hasNewer = seen.has(key);
    seen.add(key);
    // Sin próxima fecha el registro queda fuera de la evaluación (alert nula) salvo que lo reemplace uno posterior.
    // T255 PENDIENTE: SUPERSEDED calculado e inmutabilidad de reemplazados de REQ-REC2-002/003.
    const target = targetOf(record);
    return { record, alert: target === null && !hasNewer ? null : evaluateSanitaryAlertState(target ?? currentDate, currentDate, hasNewer) };
  });
}

/**
 * Vacunas en orden INV-SORT-001, cada una con su alerta (REQ-REC-003).
 * @implements STATE-ALERT-001
 */
export function evaluateVaccinationAlerts(
  records: readonly VaccinationRecord[],
  currentDate: string,
): VaccinationEntryView[] {
  return evaluateByKey(records, currentDate, (r) => normalizeVaccineKey(r.vaccineName), (r) => r.nextBoosterAt);
}

/**
 * Desparasitaciones en orden INV-SORT-001, cada una con su alerta (REQ-REC-004).
 * @implements STATE-ALERT-001
 */
export function evaluateDewormingAlerts(
  records: readonly DewormingRecord[],
  currentDate: string,
): DewormingEntryView[] {
  return evaluateByKey(records, currentDate, (r) => r.dewormingType, (r) => r.nextSuggestedDoseAt);
}

/**
 * Conteo de alertas; SUPERSEDED no cuenta. totalActiveAlerts = OVERDUE + DUE_SOON (isActiveAlert).
 * @implements STATE-ALERT-001
 */
export function summarizeSanitaryAlerts(
  vaccinations: readonly VaccinationEntryView[],
  dewormings: readonly DewormingEntryView[],
): ActiveSanitaryAlertsSummary {
  const summary = { overdueCount: 0, dueSoonCount: 0, upToDateCount: 0, totalActiveAlerts: 0 };
  for (const { alert } of [...vaccinations, ...dewormings]) {
    if (alert === null) continue;
    if (alert.status === 'OVERDUE') summary.overdueCount += 1;
    if (alert.status === 'DUE_SOON') summary.dueSoonCount += 1;
    if (alert.status === 'UP_TO_DATE') summary.upToDateCount += 1;
    if (alert.isActiveAlert) summary.totalActiveAlerts += 1;
  }
  return summary;
}
