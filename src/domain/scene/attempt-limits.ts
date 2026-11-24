/**
 * Límites de intentos INICIADOS (REQ-ESC6-034, H-TRI-006-02): un fallo cuesta 0 de cuota pero el proveedor puede cobrarlo, así que se cuentan los intentos y no
 * solo los exitosos. (1) enfriamiento de 60 s entre intentos de una escena; (2) como máximo 3 intentos `FAILED` por escena en 24 h; (3) como máximo 12 intentos
 * iniciados por usuario actor en 24 h. Solo contadores (N2-03 = A: sin bloqueo por huella). Recibe cuentas e instantes como datos; sin reloj (INV-ESC6-001).
 * El exceso se rechaza con `429 ERR-RATE-LIMITED` y `Retry-After` (`blockedReason = COOLDOWN`).
 *
 * @implements REQ-LIM9-001, REQ-LIM9-002, EDGE-009-043, REQ-ESC6-034, INV-ESC6-001, INV-ESC6-004, EDGE-ESC6-029, SC-ESC6-072, SC-ESC6-078, SC-ESC6-079
 */

import { epochMillis } from './utc-instant.ts';

export const ATTEMPT_COOLDOWN_SECONDS = 60;
export const MAX_FAILED_ATTEMPTS_PER_SCENE = 3;
export const MAX_STARTED_ATTEMPTS_PER_ACTOR = 12;
export const ATTEMPT_WINDOW_SECONDS = 86_400;

export interface AttemptLimitsInput {
  /** Instante de la operación (UTC canónico). */
  readonly now: string;
  /** Inicio del intento más reciente de la escena, o `null`. */
  readonly lastStartedAt: string | null;
  /** Intentos `FAILED` de la escena con inicio en las últimas 24 h. */
  readonly failedInWindow: number;
  readonly oldestFailedStartedAt: string | null;
  /** Intentos iniciados por el actor (todas las escenas) en las últimas 24 h. */
  readonly startedByActor: number;
  readonly oldestActorStartedAt: string | null;
  /**
   * Tope diario de intentos CERRADOS sin llamada al proveedor por escena (EDGE-009-043, `D9-25`): responde con el código de `FAILED_LIMIT`. El valor (`max`) viene de
   * `app-config.ts` (única fuente); si se omite, el tope no se evalúa.
   */
  readonly closedWithoutCall?: { readonly count: number; readonly oldestAt: string | null; readonly max: number };
}

export type AttemptLimitsResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'COOLDOWN' | 'FAILED_LIMIT' | 'ACTOR_LIMIT'; readonly retryAfterSeconds: number };

const secondsUntil = (target: number, now: number): number => Math.max(1, Math.ceil((target - now) / 1000));

/** Segundos hasta que el intento más antiguo salga de la ventana de 24 h (ventana completa si se desconoce). */
function windowRetry(oldest: string | null, now: number): number {
  return oldest === null ? ATTEMPT_WINDOW_SECONDS : secondsUntil(epochMillis(oldest) + ATTEMPT_WINDOW_SECONDS * 1000, now);
}

export function evaluateAttemptLimits(input: AttemptLimitsInput): AttemptLimitsResult {
  const now = epochMillis(input.now);
  if (input.lastStartedAt !== null) {
    const readyAt = epochMillis(input.lastStartedAt) + ATTEMPT_COOLDOWN_SECONDS * 1000;
    if (now < readyAt) return { allowed: false, reason: 'COOLDOWN', retryAfterSeconds: secondsUntil(readyAt, now) };
  }
  if (input.failedInWindow >= MAX_FAILED_ATTEMPTS_PER_SCENE) {
    return { allowed: false, reason: 'FAILED_LIMIT', retryAfterSeconds: windowRetry(input.oldestFailedStartedAt, now) };
  }
  if (input.closedWithoutCall !== undefined && input.closedWithoutCall.count >= input.closedWithoutCall.max) {
    return { allowed: false, reason: 'FAILED_LIMIT', retryAfterSeconds: windowRetry(input.closedWithoutCall.oldestAt, now) };
  }
  if (input.startedByActor >= MAX_STARTED_ATTEMPTS_PER_ACTOR) {
    return { allowed: false, reason: 'ACTOR_LIMIT', retryAfterSeconds: windowRetry(input.oldestActorStartedAt, now) };
  }
  return { allowed: true };
}
