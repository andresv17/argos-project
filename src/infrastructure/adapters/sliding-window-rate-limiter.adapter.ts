/**
 * Limitador de frecuencia de ventana deslizante sobre `rate_limit_events` (ADR-002-12).
 * Cuenta los eventos del actor y del ámbito con `occurredAt > ahora - ventana`; un evento deja de contar justo al
 * cumplirse la ventana. Si el cupo está agotado devuelve false sin registrar. Los identificadores de evento salen del
 * generador inyectado (INV-ARCH-002) y el instante, del reloj de la petición (INV-ARCH-001).
 *
 * @implements ERR-RATE-LIMITED, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004
 */

import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';
import type { RateLimitScope, RateLimiterPort } from '../../application/ports/rate-limiter.port.ts';
import type { RepositorySet } from '../../application/ports/repositories.port.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import type { AppConfig } from '../config/app-config.ts';

export interface RateLimit {
  readonly maxPerWindow: number;
  readonly windowMinutes: number;
}
export type RateLimits = Readonly<Record<RateLimitScope, RateLimit>>;

/** Límites de la configuración validada (EXPORT_* e INVITE_*). @implements INV-ARCH-006 */
export const rateLimitsFrom = (config: Pick<AppConfig, 'exportMaxPerWindow' | 'exportWindowMinutes' | 'inviteMaxPerWindow' | 'inviteWindowMinutes'>): RateLimits => ({
  EXPORT: { maxPerWindow: config.exportMaxPerWindow, windowMinutes: config.exportWindowMinutes },
  INVITE: { maxPerWindow: config.inviteMaxPerWindow, windowMinutes: config.inviteWindowMinutes },
});

/** @implements ERR-RATE-LIMITED */
export class SlidingWindowRateLimiterAdapter implements RateLimiterPort {
  constructor(
    private readonly ids: IdGeneratorPort,
    private readonly limits: RateLimits,
  ) {}

  async tryConsume(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<boolean> {
    const { maxPerWindow, windowMinutes } = this.limits[scope];
    const windowStart = addMillis(nowIsoTimestamp, -windowMinutes * 60_000);
    if ((await repositories.rateLimits.countSince(scope, userId, windowStart)) >= maxPerWindow) return false;
    await repositories.rateLimits.record({ id: this.ids.nextId(), scope, userId, occurredAt: nowIsoTimestamp });
    return true;
  }
}
