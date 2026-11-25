/**
 * Límite de tasa por usuario de las seis operaciones de la escena que cambian estado o cuestan (feature 006, REQ-ESC6-034, SC-ESC6-079): generar 6 por hora
 * (hogar y propietario comparten contador), foto del hogar 10 por hora (subir y borrar) y consentimiento 10 por hora (consentir y retirar). Ventana deslizante en
 * memoria de la instancia con el reloj inyectado (INV-ARCH-001); el exceso es `429 ERR-RATE-LIMITED` con `Retry-After` en segundos. Es un tope de abuso por instancia,
 * no un contador transaccional: el control duro del gasto son la cuota por hogar y los topes de intentos de `REQ-ESC6-034`, que viven en la transacción.
 *
 * @implements REQ-EDG10-003, SC-010-016, REQ-ESC6-034, ERR-RATE-LIMITED, INV-ARCH-001
 */

import { DomainError } from '../../generated/index.ts';
import { DEFAULT_MAX_TRACKED, setBounded } from './bounded-map.ts';

export type SceneRateScope = 'GENERATE' | 'PHOTO' | 'CONSENT';

const HOUR_MS = 3_600_000;
export const SCENE_RATE_LIMITS: Readonly<Record<SceneRateScope, { readonly max: number; readonly windowMs: number }>> = {
  GENERATE: { max: 6, windowMs: HOUR_MS },
  PHOTO: { max: 10, windowMs: HOUR_MS },
  CONSENT: { max: 10, windowMs: HOUR_MS },
};

/** 429 con los segundos de espera; el manejador de errores los traduce a `Retry-After`. */
export class SceneRouteRateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super('ERR-RATE-LIMITED');
    this.name = 'SceneRouteRateLimitedError';
  }
}


export class SceneRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly now: () => number, private readonly maxTracked: number = DEFAULT_MAX_TRACKED) {}

  /** Registra el evento del usuario o lanza el 429 si ya agotó el cupo de la ventana (los rechazos no prolongan la ventana). */
  consume(scope: SceneRateScope, userId: string): void {
    const { max, windowMs } = SCENE_RATE_LIMITS[scope];
    const now = this.now();
    if (this.events.size > this.maxTracked) this.sweep(now);
    const key = `${scope}:${userId}`;
    const live = (this.events.get(key) ?? []).filter((at) => at > now - windowMs);
    if (live.length >= max) {
      setBounded(this.events, key, live, this.maxTracked);
      throw new SceneRouteRateLimitedError(Math.max(1, Math.ceil((live[0]! + windowMs - now) / 1000)));
    }
    live.push(now);
    setBounded(this.events, key, live, this.maxTracked);
  }

  /** Reinicio de limites (D9-31): descarta todos los contadores del usuario (GENERATE, PHOTO y CONSENT). No toca a otros usuarios. */
  clearUser(userId: string): void {
    for (const scope of Object.keys(SCENE_RATE_LIMITS)) this.events.delete(`${scope}:${userId}`);
  }

  /** Descarta los usuarios sin eventos vivos para que el mapa no crezca sin tope. */
  private sweep(now: number): void {
    for (const [key, times] of this.events) {
      const windowMs = SCENE_RATE_LIMITS[key.split(':')[0] as SceneRateScope].windowMs;
      if (times.every((at) => at <= now - windowMs)) this.events.delete(key);
    }
  }
}
