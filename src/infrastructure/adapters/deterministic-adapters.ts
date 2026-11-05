/**
 * Deterministic Clock and ID Generator Adapters for Infrastructure and Testing.
 *
 * @implements INV-ARCH-001, INV-ARCH-002, INV-ARCH-004
 */

import type { ClockPort } from '../../application/ports/clock.port.ts';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';

/**
 * Fixed, deterministic ClockPort implementation for reproducible unit, property, and integration tests.
 *
 * @implements INV-ARCH-001
 */
export class FixedClockAdapter implements ClockPort {
  private currentIsoDate: string;
  private currentIsoTimestamp: string;

  constructor(
    todayIsoDate = '2026-11-05',
    nowIsoTimestamp = '2026-11-05T12:00:00.000Z'
  ) {
    this.currentIsoDate = todayIsoDate;
    this.currentIsoTimestamp = nowIsoTimestamp;
  }

  public todayIsoDate(): string {
    return this.currentIsoDate;
  }

  public nowIsoTimestamp(): string {
    return this.currentIsoTimestamp;
  }

  public setClock(todayIsoDate: string, nowIsoTimestamp: string): void {
    this.currentIsoDate = todayIsoDate;
    this.currentIsoTimestamp = nowIsoTimestamp;
  }
}

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
 * Deterministic UUID v4 sequence generator for reproducible tests.
 *
 * @implements INV-ARCH-002
 */
export class DeterministicIdAdapter implements IdGeneratorPort {
  private readonly sequence: readonly string[];
  private cursor = 0;

  constructor(sequence?: readonly string[]) {
    this.sequence = sequence ?? [];
  }

  public nextId(): string {
    if (this.cursor < this.sequence.length) {
      const id = this.sequence[this.cursor]!;
      this.cursor += 1;
      return id;
    }
    this.cursor += 1;
    const hex = this.cursor.toString(16).padStart(12, '0');
    return `99999999-9999-4999-8999-${hex}`;
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
