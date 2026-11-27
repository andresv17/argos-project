/**
 * Límites de escritura del Modo Cuidador (feature 012, Bloque C, #26; R-3 y H-C1, decisión de Neo 2026-11-27): TRES cubos independientes por usuario con ventana móvil de 1 hora en la capa HTTP,
 * con el reloj inyectado (INV-ARCH-001): 120/h registros (`createCareLogEntry`), 60/h rutinas y niveles (`createCareRoutine`, `updateCareRoutine`, `deactivateCareRoutine`, `setCaregiverAccess`,
 * `removeCaregiverAccess`) y 30/h reversiones (`revertCareLogEntry`, cubo propio: no consume el de registros). Al superar el cupo: `429 ERR-RATE-LIMITED` con `Retry-After` en segundos; el intento
 * rechazado no prolonga la ventana. Los casos de uso NO llevan límite. Es un tope de abuso por instancia (como el de la escena), no un contador transaccional.
 *
 * @implements REQ-CAR12-003, REQ-CAR12-004, ERR-RATE-LIMITED, INV-ARCH-001
 */

import { DomainError } from '../../generated/index.ts';
import { CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR, CARE_LOG_WRITES_PER_USER_PER_HOUR, CARE_ROUTINE_WRITES_PER_USER_PER_HOUR } from '../../domain/platform/feature-012-limits.ts';
import { DEFAULT_MAX_TRACKED, setBounded } from './bounded-map.ts';

export type CareRateScope = 'LOG' | 'ROUTINE' | 'REVERT';

const HOUR_MS = 3_600_000;
export const CARE_RATE_LIMITS: Readonly<Record<CareRateScope, { readonly max: number; readonly windowMs: number }>> = {
  LOG: { max: CARE_LOG_WRITES_PER_USER_PER_HOUR, windowMs: HOUR_MS },
  ROUTINE: { max: CARE_ROUTINE_WRITES_PER_USER_PER_HOUR, windowMs: HOUR_MS },
  REVERT: { max: CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR, windowMs: HOUR_MS },
};

/** 429 con los segundos de espera; el manejador de errores los traduce a `Retry-After`. */
export class CareRateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super('ERR-RATE-LIMITED');
    this.name = 'CareRateLimitedError';
  }
}

export class CareRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly now: () => number, private readonly maxTracked: number = DEFAULT_MAX_TRACKED) {}

  /** Registra el evento del usuario o lanza el 429 si ya agotó el cupo de la ventana (los rechazos no prolongan la ventana). */
  consume(scope: CareRateScope, userId: string): void {
    const { max, windowMs } = CARE_RATE_LIMITS[scope];
    const now = this.now();
    if (this.events.size > this.maxTracked) this.sweep(now);
    const key = `${scope}:${userId}`;
    const live = (this.events.get(key) ?? []).filter((at) => at > now - windowMs);
    if (live.length >= max) {
      setBounded(this.events, key, live, this.maxTracked);
      throw new CareRateLimitedError(Math.max(1, Math.min(3600, Math.ceil((live[0]! + windowMs - now) / 1000))));
    }
    live.push(now);
    setBounded(this.events, key, live, this.maxTracked);
  }

  private sweep(now: number): void {
    for (const [key, times] of this.events) {
      const windowMs = CARE_RATE_LIMITS[key.split(':')[0] as CareRateScope].windowMs;
      if (times.every((at) => at <= now - windowMs)) this.events.delete(key);
    }
  }
}
