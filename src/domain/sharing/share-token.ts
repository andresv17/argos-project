/**
 * Token de capacidad del enlace veterinario (feature 005, REQ-VET-003): formato, `hashToken` y comparación en tiempo constante.
 * `hashToken` calcula el `SHA-256` EN EL DOMINIO (MIF-005-09): función determinista, sin E/S ni estado, que no necesita puerto. Usa el SHA-256 PURO del dominio
 * (`audit/sha256.ts`, FIPS 180-4) y no `createHash` de `node:crypto`: la regla de capas INV-ARCH-004 (`layer-dependencies.spec.ts`) prohíbe todo import `node:` en
 * `src/domain`; las pruebas verifican que el resultado coincide con `node:crypto` (T752). La comparación de hashes es en tiempo constante (acumula la
 * diferencia de TODOS los caracteres, sin salida anticipada). Solo la GENERACIÓN aleatoria vive en infraestructura (`ShareTokenGeneratorPort`, `randomBytes`).
 * La ruta pública NO valida el formato en el borde: un token mal formado tiene hash y se resuelve igual que uno inexistente (INV-005-007).
 *
 * @implements REQ-VET-003, INV-005-005, INV-005-007, INV-ARCH-004
 */
import { sha256Hex } from '../audit/sha256.ts';

/** 32 bytes aleatorios en base64url sin relleno = 43 caracteres. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Solo para generación y pruebas: el borde público nunca lo usa para decidir una respuesta distinta. */
export const isWellFormedShareToken = (token: string): boolean => SHARE_TOKEN_PATTERN.test(token);

/** `SHA-256` hexadecimal (64 caracteres) del texto recibido, sea cual sea su forma (vacío, larguísimo, no ASCII). */
export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** Comparación en tiempo constante de dos hashes hexadecimales; de distinta longitud devuelve false sin lanzar. */
export function hashesEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}
