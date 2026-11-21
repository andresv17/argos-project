/**
 * Identificador opaco de un solo uso del estado del flujo de Google (Feature 008, REQ-SSO8-004, ADR-008-03; SC-008-005).
 * Funciones PURAS: no leen `Date` ni `node:crypto` (Principio II, INV-ARCH-001). La entropía entra por `OneTimeTokenEntropyPort` y el instante
 * llega por parámetro (el `ClockPort` de la capa de aplicación lo suministra). SHA-256 es el SHA-256 puro del dominio.
 *  - Identificador: 32 bytes aleatorios en base64url sin relleno (43 caracteres). En disco solo vive su SHA-256 (hex, 64 caracteres).
 *  - Vigencia: 900 s desde la emisión; vence EXACTAMENTE en `expiresAt` (`expiresAt > ahora` es la condición de uso, igual que en los repositorios).
 *  - Un solo uso por compare-and-set: `consumeOneTimeToken` solo marca el registro cuando el veredicto es VALID; el repositorio repite el CAS en SQL.
 *  - Comparación del hash a tiempo constante.
 *  - `codeChallengeS256` calcula el desafío PKCE (RFC 7636) del verificador.
 *
 * @implements REQ-SSO8-004, REQ-SSO8-001, INV-AUTH-006, INV-AUTH-003, INV-ARCH-001, INV-ARCH-004
 */

import { sha256Hex } from '../audit/sha256.ts';
import { addMillis, toEpochMillis } from './utc-timestamp.ts';

export const ONE_TIME_TOKEN_BYTES = 32;
export const ONE_TIME_TOKEN_TTL_SECONDS = 900;

const ONE_TIME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Fuente de entropía inyectada (puerto): devuelve exactamente `length` bytes criptográficamente aleatorios. */
export interface OneTimeTokenEntropyPort {
  randomBytes(length: number): Uint8Array;
}

/** Registro persistido (solo el hash): lo que el dominio necesita para decidir el uso. */
export interface OneTimeTokenRecord {
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export type OneTimeTokenVerdict = 'VALID' | 'MALFORMED' | 'MISMATCH' | 'CONSUMED' | 'EXPIRED';

export interface IssuedOneTimeToken {
  /** Valor en claro: viaja una sola vez (cookie o parámetro del flujo) y no se guarda. */
  readonly token: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 !== undefined) out += ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 !== undefined) out += ALPHABET[b2 & 0x3f]!;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Genera 32 bytes de la entropía inyectada y los codifica en base64url (43 caracteres). Falla cerrado si la entropía no entrega 32 bytes. */
export function generateOneTimeToken(entropy: OneTimeTokenEntropyPort): string {
  const bytes = entropy.randomBytes(ONE_TIME_TOKEN_BYTES);
  if (bytes.length !== ONE_TIME_TOKEN_BYTES) throw new RangeError('La entropía no entregó los 32 bytes exigidos.');
  return toBase64Url(bytes);
}

export const isWellFormedOneTimeToken = (token: string): boolean => ONE_TIME_TOKEN_PATTERN.test(token);

/** SHA-256 hexadecimal (64 caracteres) del identificador. */
export const hashOneTimeToken = (token: string): string => sha256Hex(token);

/** Desafío PKCE `S256` (RFC 7636): base64url sin relleno del SHA-256 del verificador. */
export const codeChallengeS256 = (codeVerifier: string): string => toBase64Url(hexToBytes(sha256Hex(codeVerifier)));

/** Vencimiento (900 s después de la emisión) de un identificador emitido en `issuedAt`. */
export const oneTimeTokenExpiresAt = (issuedAt: string): string => addMillis(issuedAt, ONE_TIME_TOKEN_TTL_SECONDS * 1000);

export function issueOneTimeToken(entropy: OneTimeTokenEntropyPort, issuedAt: string): IssuedOneTimeToken {
  const token = generateOneTimeToken(entropy);
  return { token, tokenHash: hashOneTimeToken(token), expiresAt: oneTimeTokenExpiresAt(issuedAt) };
}

/**
 * Comparación de cadenas que no se detiene en la primera diferencia: recorre el máximo de ambas longitudes y acumula la diferencia.
 * Las longitudes distintas dan false (los hashes comparados son siempre de 64 caracteres).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Veredicto del uso del identificador presentado contra el registro, sin modificar nada. */
export function evaluateOneTimeToken(record: OneTimeTokenRecord, presented: string, now: string): OneTimeTokenVerdict {
  if (!isWellFormedOneTimeToken(presented)) return 'MALFORMED';
  if (!constantTimeEqual(hashOneTimeToken(presented), record.tokenHash)) return 'MISMATCH';
  if (record.consumedAt !== null) return 'CONSUMED';
  if (toEpochMillis(now) >= toEpochMillis(record.expiresAt)) return 'EXPIRED';
  return 'VALID';
}

/** Compare-and-set puro: marca `consumedAt` solo si el veredicto es VALID; devuelve un registro nuevo (el original no se muta). */
export function consumeOneTimeToken(record: OneTimeTokenRecord, presented: string, now: string): { readonly outcome: OneTimeTokenVerdict; readonly record: OneTimeTokenRecord } {
  const outcome = evaluateOneTimeToken(record, presented, now);
  return { outcome, record: outcome === 'VALID' ? { ...record, consumedAt: now } : record };
}
