/**
 * Generador de UUID v4 de producción. La entropía solo se lee aquí, en infraestructura.
 *
 * @implements INV-ARCH-002, INV-ARCH-004
 */

import { randomUUID } from 'node:crypto';
import type { IdGeneratorPort } from '../../application/ports/id-generator.port.ts';

/** @implements INV-ARCH-002 */
export class CryptoUuidAdapter implements IdGeneratorPort {
  public nextId(): string {
    return randomUUID();
  }
}
