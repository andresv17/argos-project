/**
 * Tokens de sesión de producción (constitución §3.2, REQ-AUTH-002): 32 bytes aleatorios en base64url (43 caracteres).
 * El token solo viaja en la cookie; el repositorio SQLite guarda su SHA-256 (INV-AUTH-003).
 *
 * @implements INV-ARCH-002, INV-ARCH-004, INV-AUTH-003
 */

import { randomBytes } from 'node:crypto';
import type { SecureTokenPort } from '../../application/ports/secure-token.port.ts';

export const SESSION_TOKEN_BYTES = 32;

/** @implements INV-ARCH-002, INV-AUTH-003 */
export class CryptoSecureTokenAdapter implements SecureTokenPort {
  public nextSessionToken(): string {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  }
}
