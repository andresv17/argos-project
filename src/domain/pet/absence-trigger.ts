/**
 * Disparador objetivo de la disputa por ausencia (Feature 012, Bloque A, REQ-OWN12-009, N2-R1, H-09, P-5): función PURA sobre las solicitudes de la mascota; `now` y la última actividad del `target` entran por
 * parámetro (sin reloj ni I/O). Reglas (todas verificables en BD):
 * - Solo cuentan `TRANSFER_PRINCIPAL`, `CHANGE_PRINCIPAL` e `INVITE_CO_OWNER` creadas en los últimos `ABSENCE_WINDOW_DAYS` (60) y expiradas POR TTL (`EXPIRED` sin `stale_reason`, o `PENDING` con `expires_at <= now`,
 *   que se materializa antes de contar). Una `CANCELLED`, una `REJECTED` o una `EXPIRED/STALE` no cuentan. `DELETE_PET` se ignora por completo en el conteo, en la secuencia y en «sin voto del target».
 * - El `target` figura en el `approver_set` de cada una y NO votó ni rechazó. Un `REJECTED` del `target` en la ventana, o un voto suyo en CUALQUIER solicitud de la ventana (también una `DELETE_PET`), descarta el
 *   disparador: es prueba de vida.
 * - Secuenciales, no paralelas: la `created_at` de cada solicitud contada es >= la `expires_at` de la anterior contada; dos simultáneas no cuentan como dos. Hacen falta `ABSENCE_MIN_EXPIRED_REQUESTS` (2).
 * - Inactividad (P-5 + H-09, aplica la condición MÁS ESTRICTA): el `target` no tuvo sesión activa desde la creación de la solicitud contada más antigua Y durante al menos `ABSENCE_MIN_INACTIVE_DAYS` (14) días
 *   continuos hasta `now`. «Sesión activa» = cualquier petición autenticada o renovación de sesión del `target` (`sessions.last_activity_at`); sin registro de actividad cuenta como inactivo.
 * Devuelve los ids que SELLAN la apertura (`trigger_request_ids`, orden cronológico).
 *
 * @implements REQ-OWN12-009, INV-OWN12-006, EDGE-012-056, SC-012-091, SC-012-114, SC-012-115
 */

import { addMillis, toEpochMillis } from '../auth/utc-timestamp.ts';
import { ABSENCE_MIN_EXPIRED_REQUESTS, ABSENCE_MIN_INACTIVE_DAYS, ABSENCE_WINDOW_DAYS, DAY_MS } from '../platform/feature-012-limits.ts';
import type { OwnerApproval, OwnerRequestAction, OwnerRequestStatus } from './co-ownership.ts';

/** Solicitud tal como la lee el disparador. */
export interface AbsenceTriggerRequest {
  readonly id: string;
  readonly action: OwnerRequestAction;
  readonly status: OwnerRequestStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly approverSet: readonly string[];
  readonly approvals: readonly OwnerApproval[];
  readonly rejectedBy: string | null;
  readonly staleReason: string | null;
}

export type AbsenceTriggerResult =
  | { readonly eligible: true; readonly triggerRequestIds: readonly string[]; readonly oldestCreatedAt: string }
  | { readonly eligible: false };

const COUNTED_ACTIONS: ReadonlySet<OwnerRequestAction> = new Set<OwnerRequestAction>(['TRANSFER_PRINCIPAL', 'CHANGE_PRINCIPAL', 'INVITE_CO_OWNER']);

/** ¿Venció por TTL (y no por obsolescencia, cancelación ni rechazo)? */
const expiredByTtl = (request: AbsenceTriggerRequest, now: string): boolean =>
  (request.status === 'EXPIRED' && request.staleReason === null) || (request.status === 'PENDING' && request.expiresAt <= now);

export function evaluateAbsenceTrigger(input: { readonly targetUserId: string; readonly now: string; readonly requests: readonly AbsenceTriggerRequest[]; readonly targetLastActiveAt: string | null }): AbsenceTriggerResult {
  const { targetUserId, now, targetLastActiveAt } = input;
  const windowStart = addMillis(now, -ABSENCE_WINDOW_DAYS * DAY_MS);
  const inWindow = input.requests.filter((request) => request.createdAt >= windowStart);
  // Prueba de vida: un voto o un rechazo del target en CUALQUIER solicitud de la ventana (también una DELETE_PET) descarta el disparador.
  if (inWindow.some((request) => request.rejectedBy === targetUserId || request.approvals.some((approval) => approval.u === targetUserId))) return { eligible: false };
  const qualifying = inWindow
    .filter((request) => COUNTED_ACTIONS.has(request.action) && expiredByTtl(request, now) && request.approverSet.includes(targetUserId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  // Cadena secuencial voraz y estable: la siguiente solicitud contada nace en o después del vencimiento de la anterior.
  const chain: AbsenceTriggerRequest[] = [];
  for (const request of qualifying) {
    const last = chain.at(-1);
    if (last === undefined || request.createdAt >= last.expiresAt) chain.push(request);
  }
  if (chain.length < ABSENCE_MIN_EXPIRED_REQUESTS) return { eligible: false };
  const oldestCreatedAt = chain[0]!.createdAt;
  // La más estricta de las dos condiciones: la última actividad debe ser anterior (o igual) a la creación de la más antigua Y a `now - 14 días`.
  const inactiveSince = addMillis(now, -ABSENCE_MIN_INACTIVE_DAYS * DAY_MS);
  const limit = oldestCreatedAt < inactiveSince ? oldestCreatedAt : inactiveSince;
  if (targetLastActiveAt !== null && targetLastActiveAt > limit) return { eligible: false };
  return { eligible: true, triggerRequestIds: chain.map((request) => request.id), oldestCreatedAt };
}

/** Suma `days` días HÁBILES (lunes a viernes, UTC) a un instante ISO; el SLA de arbitraje (`DISPUTE_SLA_BUSINESS_DAYS`) no cuenta festivos. */
export function addBusinessDays(iso: string, days: number): string {
  let current = iso;
  let remaining = days;
  while (remaining > 0) {
    current = addMillis(current, DAY_MS);
    const weekday = (Math.floor(toEpochMillis(current) / DAY_MS) + 4) % 7; // 0 = domingo; el 1970-01-01 fue jueves (4); sin objetos Date en el dominio
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return current;
}
