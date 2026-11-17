/**
 * Adaptador HMAC-SHA256 del seudónimo de auditoría (REQ-AUD-001, T1). Usa `node:crypto` (permitido en infraestructura).
 * La clave llega por parámetro en hexadecimal (>= 32 bytes); si es inválida el error no incluye la clave ni el mensaje.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-005, INV-ARCH-006
 */

import { createHmac } from 'node:crypto';
import type { AuditPseudonymPort } from '../../application/ports/audit-pseudonym.port.ts';

/** >= 32 bytes en hexadecimal: 64 o más caracteres hexadecimales, en número par. */
const KEY_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/;

export class HmacAuditPseudonymAdapter implements AuditPseudonymPort {
  hmacUserId(userId: string, key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Clave HMAC de auditoría inválida');
    return createHmac('sha256', Buffer.from(key, 'hex')).update(userId, 'utf8').digest('hex');
  }
}
