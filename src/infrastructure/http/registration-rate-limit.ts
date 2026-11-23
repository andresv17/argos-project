/**
 * Límite de registros NUEVOS por IP efectiva (feature 009, EDGE-009-040, REQ-APR9-002, ADR-009-15, D9-25): ventana deslizante en memoria de la instancia con el reloj inyectado
 * (INV-ARCH-001), mismo patrón que `AdminAccessLimiter`. `assertAllowed` solo CONSULTA (no registra, de modo que un intento rechazado no consume cupo ni prolonga la ventana) y
 * `recordCreated` se llama únicamente cuando la cuenta ya se creó: un `409` de username ocupado o un `400` no gastan cupo. Es un tope de abuso por instancia (Cloud Run puede tener
 * varias; TRI-03, ítem operativo, no un contador transaccional). La IP es `request.ip`, que ya respeta `trustProxy` de un salto. Los números salen de `app-config.ts` (`REGISTRATION_LIMIT`).
 *
 * @implements REQ-APR9-002, EDGE-009-040, ERR-ACCOUNT-REGISTRATION-RATE-LIMITED, INV-ARCH-001, INV-ARCH-006
 */

import { DomainError } from '../../generated/index.ts';
import { REGISTRATION_LIMIT } from '../config/app-config.ts';

const MAX_TRACKED_IPS = 10_000;

/** 429 con los segundos de espera; el manejador de errores los traduce a `Retry-After`. */
export class RegistrationRateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    this.name = 'RegistrationRateLimitedError';
  }
}

export class RegistrationRateLimiter {
  private readonly created = new Map<string, number[]>();

  constructor(
    private readonly now: () => number,
    private readonly limit: { readonly maxNewAccounts: number; readonly windowMinutes: number } = REGISTRATION_LIMIT,
  ) {}

  /** Lanza `RegistrationRateLimitedError` si la IP ya creó el máximo de cuentas dentro de la ventana. No registra nada. */
  assertAllowed(ip: string): void {
    const live = this.live(ip);
    if (live.length < this.limit.maxNewAccounts) return;
    const windowMs = this.limit.windowMinutes * 60_000;
    throw new RegistrationRateLimitedError(Math.max(1, Math.ceil((live[0]! + windowMs - this.now()) / 1000)));
  }

  /** Anota una cuenta nueva creada desde la IP. */
  recordCreated(ip: string): void {
    if (this.created.size > MAX_TRACKED_IPS) for (const key of [...this.created.keys()]) this.live(key);
    this.created.set(ip, [...this.live(ip), this.now()]);
  }

  private live(ip: string): number[] {
    const horizon = this.now() - this.limit.windowMinutes * 60_000;
    const live = (this.created.get(ip) ?? []).filter((at) => at > horizon);
    if (live.length === 0) this.created.delete(ip);
    else this.created.set(ip, live);
    return live;
  }
}
