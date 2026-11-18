/**
 * Generador del token del enlace veterinario (feature 005, T752): 32 bytes de `node:crypto` (`randomBytes`) en base64url sin relleno = 43 caracteres y
 * 256 bits de entropía; no deriva de ids, fechas ni datos de la mascota. El puerto SOLO genera: el hash `SHA-256` es una función del dominio
 * (`hashToken`, MIF-005-09) y la comparación en tiempo constante también.
 *
 * @implements REQ-VET-003, INV-005-005, INV-ARCH-002
 */
import { randomBytes } from 'node:crypto';
import type { ShareTokenGeneratorPort } from '../../application/ports/share-link.port.ts';

export class CryptoTokenGenerator implements ShareTokenGeneratorPort {
  nextShareToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
