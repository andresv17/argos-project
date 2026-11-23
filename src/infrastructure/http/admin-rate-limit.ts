/**
 * Límite de FALLOS del flujo de Google de administración por IP efectiva (feature 009, EDGE-009-035, REQ-ADM9-004, ADR-009-15, D9-25): ventana deslizante en memoria de la instancia con el
 * reloj inyectado (INV-ARCH-001). Solo cuentan los fallos del callback; el inicio y el callback COMPRUEBAN el bloqueo antes de actuar. Nunca es por cuenta (un administrador bloqueado desde una
 * IP sigue pudiendo entrar desde otra) ni se aplica a las sesiones de administración válidas. Los números salen de `app-config.ts` (`ADMIN_ACCESS_LIMIT`).
 *
 * @implements REQ-ADM9-004, EDGE-009-010, EDGE-009-035, ERR-ADMIN-RATE-LIMITED, INV-ARCH-001, INV-ARCH-006
 */

import { DomainError } from '../../generated/v35/index.ts';
import { ADMIN_ACCESS_LIMIT, ADMIN_START_LIMIT } from '../config/app-config.ts';

const MAX_TRACKED_IPS = 10_000;

/** 429 con los segundos de espera; el manejador de errores los traduce a `Retry-After`. */
export class AdminRateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super('ERR-ADMIN-RATE-LIMITED');
    this.name = 'AdminRateLimitedError';
  }
}

export class AdminAccessLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly starts = new Map<string, number[]>();

  constructor(
    private readonly now: () => number,
    private readonly limit: { readonly maxFailures: number; readonly windowMinutes: number } = ADMIN_ACCESS_LIMIT,
    private readonly startLimit: { readonly maxStarts: number; readonly windowMinutes: number } = ADMIN_START_LIMIT,
  ) {}

  /** Lanza `AdminRateLimitedError` si la IP ya alcanzó el máximo de fallos dentro de la ventana. */
  assertNotBlocked(ip: string): void {
    const live = this.live(ip);
    if (live.length < this.limit.maxFailures) return;
    const windowMs = this.limit.windowMinutes * 60_000;
    throw new AdminRateLimitedError(Math.max(1, Math.ceil((live[0]! + windowMs - this.now()) / 1000)));
  }

  /** Registra un fallo del callback desde la IP. */
  recordFailure(ip: string): void {
    if (this.failures.size > MAX_TRACKED_IPS) this.sweep();
    this.failures.set(ip, [...this.live(ip), this.now()]);
  }

  /** Cuenta un inicio del flujo desde la IP; lanza `AdminRateLimitedError` si ya alcanzó el tope de inicios en la ventana (el inicio rechazado no suma). */
  consumeStart(ip: string): void {
    if (this.starts.size > MAX_TRACKED_IPS) for (const key of [...this.starts.keys()]) this.liveStarts(key);
    const live = this.liveStarts(ip);
    if (live.length >= this.startLimit.maxStarts) {
      const windowMs = this.startLimit.windowMinutes * 60_000;
      throw new AdminRateLimitedError(Math.max(1, Math.ceil((live[0]! + windowMs - this.now()) / 1000)));
    }
    this.starts.set(ip, [...live, this.now()]);
  }

  private liveStarts(ip: string): number[] {
    const horizon = this.now() - this.startLimit.windowMinutes * 60_000;
    const live = (this.starts.get(ip) ?? []).filter((at) => at > horizon);
    if (live.length === 0) this.starts.delete(ip);
    else this.starts.set(ip, live);
    return live;
  }

  private live(ip: string): number[] {
    const horizon = this.now() - this.limit.windowMinutes * 60_000;
    const live = (this.failures.get(ip) ?? []).filter((at) => at > horizon);
    if (live.length === 0) this.failures.delete(ip);
    else this.failures.set(ip, live);
    return live;
  }

  private sweep(): void {
    for (const ip of [...this.failures.keys()]) this.live(ip);
  }
}
