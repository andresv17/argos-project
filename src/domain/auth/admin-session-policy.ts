/**
 * Vigencia de la sesión de ADMINISTRACIÓN (Feature 009, #19; Enmienda constitucional 009-A, D9-19): 30 min absolutos desde la creación y 10 min de inactividad, lo que ocurra
 * primero. Funciones PURAS: el reloj llega por parámetro (INV-ARCH-001). La sesión vale mientras `ahora < createdAt + 30 min`, `ahora < lastActivityAt + 10 min` y no esté revocada.
 * Solo las acciones de mutación renuevan `lastActivityAt`; `GET /api/admin/session` no (sin keep-alive por sondeo). No existe `domain/admin` ni tipo de valor propio (MIF-03).
 *
 * @implements REQ-ADM9-002, INV-ADM9-002, INV-ARCH-001, INV-ARCH-004
 */

import { MS_PER_MINUTE, addMillis, toEpochMillis } from './utc-timestamp.ts';

export const ADMIN_SESSION_ABSOLUTE_MINUTES = 30;
export const ADMIN_SESSION_IDLE_MINUTES = 10;
export const ADMIN_SESSION_MAX_AGE_SECONDS = ADMIN_SESSION_ABSOLUTE_MINUTES * 60;

export interface AdminSessionTimes {
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly revokedAt: string | null;
}

export type AdminSessionState = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXPIRED_IDLE';

/** Fin absoluto y fin por inactividad (este último nunca supera al absoluto). */
export function adminSessionExpiry(session: Pick<AdminSessionTimes, 'createdAt' | 'lastActivityAt'>): { readonly expiresAt: string; readonly idleExpiresAt: string } {
  const expiresAt = addMillis(session.createdAt, ADMIN_SESSION_ABSOLUTE_MINUTES * MS_PER_MINUTE);
  const idle = addMillis(session.lastActivityAt, ADMIN_SESSION_IDLE_MINUTES * MS_PER_MINUTE);
  return { expiresAt, idleExpiresAt: toEpochMillis(idle) < toEpochMillis(expiresAt) ? idle : expiresAt };
}

/** Estado de la sesión en `now` (prioridad: revocada, tope absoluto, inactividad). */
export function adminSessionStateAt(session: AdminSessionTimes, now: string): AdminSessionState {
  if (session.revokedAt !== null) return 'REVOKED';
  const { expiresAt, idleExpiresAt } = adminSessionExpiry(session);
  const nowMs = toEpochMillis(now);
  if (nowMs >= toEpochMillis(expiresAt)) return 'EXPIRED';
  if (nowMs >= toEpochMillis(idleExpiresAt)) return 'EXPIRED_IDLE';
  return 'ACTIVE';
}

/** Corte de purga: las sesiones creadas hasta este instante ya no pueden estar vigentes. */
export const adminSessionPurgeCutoff = (now: string): string => addMillis(now, -ADMIN_SESSION_ABSOLUTE_MINUTES * MS_PER_MINUTE);
