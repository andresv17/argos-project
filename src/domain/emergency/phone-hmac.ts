/**
 * `phone_hmac` (Feature 012, Bloque D, #32; REQ-QR12-006, INV-QR12-003; `PHONE_HMAC_KEY`): HMAC-SHA-256 (RFC 2104) del teléfono E.164 con una clave PROPIA (distinta de la de sesión y de la de IP), 64 hexadecimales.
 * El teléfono tiene poca entropía: SHA-256 sin clave o una clave débil no se aceptan. Una sola clave vigente, sin versión: la rotación recalcula o borra (anexo §9). Pura: sobre el SHA-256 del dominio
 * (el dominio no importa `node:crypto`); la clave llega por parámetro.
 *
 * @implements REQ-QR12-006, INV-QR12-003, SC-012-122
 */
import { sha256HexOfBytes } from '../audit/sha256.ts';

/** Longitud mínima de la clave en caracteres (una clave de 32 bytes en hexadecimal o base64 la supera). */
export const PHONE_HMAC_KEY_MIN_LENGTH = 32;
const BLOCK_BYTES = 64;

const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

/** HMAC-SHA-256 hexadecimal de `message` con `key` (ambos UTF-8). */
export function phoneHmac(key: string, phoneE164: string): string {
  let keyBytes = new TextEncoder().encode(key);
  if (keyBytes.length > BLOCK_BYTES) keyBytes = hexToBytes(sha256HexOfBytes(keyBytes));
  const inner = new Uint8Array(BLOCK_BYTES).fill(0x36);
  const outer = new Uint8Array(BLOCK_BYTES).fill(0x5c);
  keyBytes.forEach((byte, index) => {
    inner[index] = byte ^ 0x36;
    outer[index] = byte ^ 0x5c;
  });
  const message = new TextEncoder().encode(phoneE164);
  const innerDigest = hexToBytes(sha256HexOfBytes(Uint8Array.from([...inner, ...message])));
  return sha256HexOfBytes(Uint8Array.from([...outer, ...innerDigest]));
}

/** Comparación en tiempo constante de dos cadenas hexadecimales (distinta longitud = distinto). */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
