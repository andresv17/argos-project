/**
 * Aviso de umbral de solicitudes `PENDING` (feature 009, T1289, EDGE-009-040, REQ-APR9-005, D9-25): cuando `PENDING` supera `PENDING_WARNING_THRESHOLD` (50, solo en `app-config.ts`)
 * el operador recibe el aviso. `pendingBacklogNotice` es la forma que embebe el contador de `/admin` (T1247/T1250) y `warnPendingBacklog` el aviso de registro del operador: solo
 * conteos, nunca usernames ni correos (NFR-009-004). No añade ninguna clave a `MaintenanceCounts` (contrato de 5 claves congelado).
 *
 * @implements REQ-APR9-005, EDGE-009-040, INV-ARCH-006
 */

import { PENDING_WARNING_THRESHOLD } from '../config/app-config.ts';

export interface PendingBacklogNotice {
  readonly pendingCount: number;
  readonly threshold: number;
  /** `true` solo con MÁS de `threshold` solicitudes pendientes. */
  readonly exceeded: boolean;
}

export interface WarnLogger {
  warn(fields: { pendingCount: number; threshold: number }, message: string): void;
}

export function pendingBacklogNotice(pendingCount: number, threshold: number = PENDING_WARNING_THRESHOLD): PendingBacklogNotice {
  return { pendingCount, threshold, exceeded: pendingCount > threshold };
}

/** Escribe la advertencia del operador si `PENDING` supera el umbral; devuelve el aviso calculado. */
export function warnPendingBacklog(log: WarnLogger, pendingCount: number): PendingBacklogNotice {
  const notice = pendingBacklogNotice(pendingCount);
  if (notice.exceeded) log.warn({ pendingCount: notice.pendingCount, threshold: notice.threshold }, 'solicitudes PENDING por encima del umbral: revisar /admin');
  return notice;
}
