/**
 * `fileDigest` del respaldo (REQ-BACKUP2-002, STATE-BACKUP-001): SHA-256 hexadecimal en minúscula de los bytes
 * realmente leídos. La previsualización lo devuelve y la importación definitiva debe presentarlo en la cabecera
 * `X-Argos-Import-Confirm` para probar que es el mismo archivo. Puro y sin entorno: usa el SHA-256 del dominio.
 *
 * @implements REQ-BACKUP2-002, STATE-BACKUP-001, INV-BACKUP-001, INV-ARCH-001, INV-ARCH-004
 */

import { sha256HexOfBytes } from '../audit/sha256.ts';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** SHA-256 hexadecimal minúscula de los bytes del archivo. */
export function computeFileDigest(bytes: Uint8Array): string {
  return sha256HexOfBytes(bytes);
}

/** Forma `Sha256Hex` del contrato: 64 caracteres hexadecimales en minúscula (las mayúsculas no se aceptan). */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

/** La confirmación coincide con el digest de los bytes: bien formada y exactamente igual. */
export function fileDigestMatches(confirmation: unknown, digest: string): boolean {
  return isSha256Hex(confirmation) && confirmation === digest;
}
