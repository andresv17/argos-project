/**
 * Mantenimiento de retención (ADR-002-14): purga sesiones expiradas o revocadas con más de 7 días, tokens de
 * confirmación vencidos, membresías e invitaciones terminales con más de 90 días y auditoría con más de 24 meses.
 * Devuelve solo conteos; no es una mutación del usuario, por eso no escribe fila de auditoría ni registra identificadores.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-001
 */

import { monthlyAnniversary, parseIsoCalendarDate } from '../../domain/shared/date-utils.ts';
import type { MaintenanceCounts, MaintenanceCutoffs } from '../ports/unit-of-work.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

const AUDIT_RETENTION_MONTHS = 24;

/** Umbral de auditoría: mismo día y hora, 24 meses de calendario antes (fin de mes si el día no existe). Sin objetos Date. */
export function maintenanceCutoffs(nowIsoTimestamp: string): MaintenanceCutoffs {
  const { year, month, day } = monthlyAnniversary(parseIsoCalendarDate(nowIsoTimestamp.slice(0, 10), 'now'), -AUDIT_RETENTION_MONTHS);
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return { now: nowIsoTimestamp, auditBefore: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}${nowIsoTimestamp.slice(10)}` };
}

const NO_PURGE: MaintenanceCounts = { sessionsPurged: 0, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 0 };

/** Ejecuta una pasada de mantenimiento con el reloj de la aplicación; sin almacenamiento con purga devuelve ceros. */
export async function runMaintenance(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<MaintenanceCounts> {
  if (deps.uow.purgeExpired === undefined) return NO_PURGE;
  return deps.uow.purgeExpired(maintenanceCutoffs(deps.clock.nowIsoTimestamp()));
}
