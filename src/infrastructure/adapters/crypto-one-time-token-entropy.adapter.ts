/**
 * Entropía de producción del identificador opaco de un solo uso del acceso con Google (Feature 008, REQ-SSO8-004, ADR-008-03): `node:crypto` solo vive en la
 * infraestructura; el dominio recibe la fuente por el puerto `OneTimeTokenEntropyPort` (Principio II).
 *
 * @implements REQ-SSO8-004, INV-ARCH-001, INV-ARCH-004, INV-AUTH-003
 */

import { randomBytes } from 'node:crypto';
import type { OneTimeTokenEntropyPort } from '../../domain/auth/one-time-token.ts';

/** @implements REQ-SSO8-004, INV-ARCH-004 */
export class CryptoOneTimeTokenEntropyAdapter implements OneTimeTokenEntropyPort {
  public nextEntropyBytes(length: number): Uint8Array {
    return new Uint8Array(randomBytes(length));
  }
}
