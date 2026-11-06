/**
 * Adaptadores de producción de reloj e IDs. Los deterministas viven en fixed-clock.adapter.ts y
 * deterministic-id.adapter.ts (TASK-104) y se re-exportan aquí para los importadores existentes.
 *
 * @implements INV-ARCH-001, INV-ARCH-002, INV-ARCH-004
 */

import type { ClockPort } from '../../application/ports/clock.port.ts';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';

export { FixedClockAdapter } from './fixed-clock.adapter.ts';
export { DeterministicIdAdapter } from './deterministic-id.adapter.ts';

/**
 * Production system clock adapter isolating global Date calls strictly within Infrastructure [INV-ARCH-001].
 *
 * @implements INV-ARCH-001
 */
export class SystemClockAdapter implements ClockPort {
  public todayIsoDate(): string {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public nowIsoTimestamp(): string {
    return new Date().toISOString();
  }
}

/**
 * Production UUID v4 generator isolating crypto.randomUUID strictly within Infrastructure [INV-ARCH-002].
 *
 * @implements INV-ARCH-002
 */
export class CryptoUuidAdapter implements IdGeneratorPort {
  public nextId(): string {
    return crypto.randomUUID();
  }
}
