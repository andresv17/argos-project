/**
 * Límite de tasa del autocompletado de colaboradores (feature 008, REQ-INV8-003, EDGE-008-044): ventana deslizante en memoria de la instancia, con el reloj
 * inyectado (INV-ARCH-001), contada por separado por usuario y por IP efectiva normalizada; si cualquiera agota su cupo responde `ERR-RATE-LIMITED` (429) y el
 * intento rechazado no prolonga la ventana. Es un tope de abuso por instancia (como el de la escena, REQ-ESC6-034), no un contador transaccional.
 *
 * @implements REQ-EDG10-001, REQ-EDG10-003, SC-010-016, REQ-INV8-003, ERR-RATE-LIMITED, INV-ARCH-001
 */

import { ipLimitKey } from '../../domain/sharing/ip-limit-key.ts';
import type { InviteeSearchLimiterPort } from '../../application/ports/invitee-search-limiter.port.ts';
import { DomainError } from '../../generated/index.ts';
import type { InviteeSearchLimits } from '../config/invitee-search-config.ts';
import { DEFAULT_MAX_TRACKED, setBounded } from './bounded-map.ts';


export class InviteeSearchRateLimiter implements InviteeSearchLimiterPort {
  private readonly events = new Map<string, number[]>();
  private readonly windowMs: number;

  constructor(private readonly now: () => number, private readonly limits: InviteeSearchLimits, private readonly maxTracked: number = DEFAULT_MAX_TRACKED) {
    this.windowMs = limits.windowMinutes * 60_000;
  }

  consume(userId: string, normalizedClientIp: string): void {
    const now = this.now();
    if (this.events.size > this.maxTracked) this.sweep(now);
    const keys = [`U:${userId}`, `I:${ipLimitKey(normalizedClientIp)}`];
    const lives = keys.map((key) => (this.events.get(key) ?? []).filter((at) => at > now - this.windowMs));
    if (lives.some((live) => live.length >= this.limits.maxPerWindow)) throw new DomainError('ERR-RATE-LIMITED');
    keys.forEach((key, i) => setBounded(this.events, key, [...lives[i]!, now], this.maxTracked));
  }

  private sweep(now: number): void {
    for (const [key, times] of this.events) if (times.every((at) => at <= now - this.windowMs)) this.events.delete(key);
  }
}
