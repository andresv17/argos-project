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
import { CO_OWNER_INVITES_PER_USER_PER_DAY, OWNER_REQUESTS_PER_USER_PER_DAY } from '../../domain/platform/feature-012-limits.ts';
import type { AppConfig } from '../config/app-config.ts';

export interface RateLimit {
  readonly maxPerWindow: number;
  readonly windowMinutes: number;
}
/** Los ámbitos de la 012 son opcionales: sin entrada rigen las constantes de `feature-012-limits.ts` (no dependen de `app-config.ts`, tocado por H-01). */
type CoOwnershipScope = 'CO_OWNER_INVITE' | 'OWNER_REQUEST';
export type RateLimits = Readonly<Record<Exclude<RateLimitScope, CoOwnershipScope>, RateLimit>> & Readonly<Partial<Record<CoOwnershipScope, RateLimit>>>;

/** H-02: intentos de invitación por invitador y día; H-10: solicitudes críticas (crear, aprobar, rechazar) por usuario y día. */
const CO_OWNERSHIP_LIMITS: Readonly<Record<CoOwnershipScope, RateLimit>> = {
  CO_OWNER_INVITE: { maxPerWindow: CO_OWNER_INVITES_PER_USER_PER_DAY, windowMinutes: 1440 },
  OWNER_REQUEST: { maxPerWindow: OWNER_REQUESTS_PER_USER_PER_DAY, windowMinutes: 1440 },
};

/** Límites de la configuración validada (EXPORT_*, INVITE_* y MICROCHIP_DUPLICATE_*). @implements INV-ARCH-006 */
export const rateLimitsFrom = (
  config: Pick<
    AppConfig,
    'exportMaxPerWindow' | 'exportWindowMinutes' | 'inviteMaxPerWindow' | 'inviteWindowMinutes' | 'microchipDuplicateMaxPerWindow' | 'microchipDuplicateWindowMinutes'
  >,
): RateLimits => ({
  EXPORT: { maxPerWindow: config.exportMaxPerWindow, windowMinutes: config.exportWindowMinutes },
  INVITE: { maxPerWindow: config.inviteMaxPerWindow, windowMinutes: config.inviteWindowMinutes },
  MICROCHIP_DUPLICATE: { maxPerWindow: config.microchipDuplicateMaxPerWindow, windowMinutes: config.microchipDuplicateWindowMinutes },
});

/** @implements ERR-RATE-LIMITED */
export class SlidingWindowRateLimiterAdapter implements RateLimiterPort {
  constructor(
    private readonly ids: IdGeneratorPort,
    private readonly limits: RateLimits,
  ) {}

  async tryConsume(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<boolean> {
    if (await this.isExhausted(repositories, scope, userId, nowIsoTimestamp)) return false;
    await this.record(repositories, scope, userId, nowIsoTimestamp);
    return true;
  }

  /** @implements REQ-PET4-002 */
  async isExhausted(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<boolean> {
    const { maxPerWindow, windowMinutes } = this.limits[scope] ?? CO_OWNERSHIP_LIMITS[scope as CoOwnershipScope];
    const windowStart = addMillis(nowIsoTimestamp, -windowMinutes * 60_000);
    return (await repositories.rateLimits.countSince(scope, userId, windowStart)) >= maxPerWindow;
  }

  /** @implements REQ-PET4-002, INV-ARCH-002 */
  async record(repositories: RepositorySet, scope: RateLimitScope, userId: string, nowIsoTimestamp: string): Promise<void> {
    await repositories.rateLimits.record({ id: this.ids.nextId(), scope, userId, occurredAt: nowIsoTimestamp });
  }
}
