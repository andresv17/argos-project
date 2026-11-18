/**
 * Generador de UUID v4 para el navegador detrás de `IdGeneratorPort`.
 * La entropía solo se lee en `src/infrastructure/adapters/` (INV-ARCH-002).
 *
 * @implements INV-ARCH-002, INV-ARCH-004
 */

import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';

/** @implements INV-ARCH-002 */
export class BrowserUuidAdapter implements IdGeneratorPort {
  public nextId(): string {
    return globalThis.crypto.randomUUID();
  }
}
