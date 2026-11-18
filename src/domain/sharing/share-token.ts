/**
 * Token de capacidad del enlace veterinario (feature 005, REQ-VET-003): formato, `hashToken` y comparación en tiempo constante.
 * `hashToken` calcula el `SHA-256` EN EL DOMINIO con `createHash` de `node:crypto` (MIF-005-09): es una función determinista de la biblioteca estándar,
 * sin E/S ni estado, y no necesita puerto; la regla de dominio puro prohíbe `fs`, `fetch`, SDK y `process.env`, no esta función. Solo la GENERACIÓN
 * aleatoria del token vive en infraestructura (`ShareTokenGeneratorPort`, `randomBytes`). La ruta pública NO valida el formato en el borde: un token
 * mal formado tiene hash y se resuelve igual que uno inexistente (INV-005-007).
 *
 * @implements REQ-VET-003, INV-005-005, INV-005-007
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** 32 bytes aleatorios en base64url sin relleno = 43 caracteres. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Solo para generación y pruebas: el borde público nunca lo usa para decidir una respuesta distinta. */
export const isWellFormedShareToken = (token: string): boolean => SHARE_TOKEN_PATTERN.test(token);

/** `SHA-256` hexadecimal (64 caracteres) del texto recibido, sea cual sea su forma (vacío, larguísimo, no ASCII). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparación en tiempo constante de dos hashes hexadecimales; de distinta longitud devuelve false sin lanzar. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
