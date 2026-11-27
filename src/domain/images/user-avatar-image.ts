/**
 * Validación y saneado de la foto de perfil de la cuenta (feature 011, `#78`, REQ-PRF11-001, SC-011-061, SC-011-062; anexo `user-avatar-annex.md` §4 y §4.1). Función pura, sin
 * dependencias: tamaño (antes de decodificar) -> firma por magic bytes -> dimensiones -> saneado por LISTA BLANCA (`stripImageMetadata`, decisión de Neo 2A: sin reencodificar píxeles ni
 * dependencias nuevas) -> dimensiones sobre la SALIDA saneada y sobre TODAS las cabeceras declaradas (canvas VP8X y marcos VP8/VP8L de un WebP; todos los SOF de un JPEG; Trinity H-3).
 * Se devuelve SOLO la versión saneada. El tipo declarado por el cliente no entra aquí: la ruta lo compara con la firma (Trinity H-2).
 *
 * @implements REQ-PRF11-001, SC-011-061, SC-011-062, INV-ARC-001, INV-ARC-002
 */

import { detectMediaType } from '../media/media-signatures.ts';
import { USER_AVATAR_MAX_BYTES, USER_AVATAR_MAX_SIDE, USER_AVATAR_MIN_SIDE } from '../media/user-avatar-limits.ts';
import { readImageDimensions, stripImageMetadata, type StrippableMime } from './image-metadata-stripper.ts';

export type UserAvatarVerdict =
  | { readonly ok: true; readonly mime: StrippableMime; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: 'TOO_LARGE' | 'TYPE' | 'INVALID' };

const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));
const le32 = (b: Uint8Array, at: number): number => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const le24 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const MAX_STEPS = 4096;

interface Dimension {
  readonly width: number;
  readonly height: number;
}

/** Todas las cabeceras de dimensiones declaradas en una imagen YA saneada; `null` si no se pueden recorrer. */
function declaredDimensions(mime: StrippableMime, b: Uint8Array): Dimension[] | null {
  const found: Dimension[] = [];
  if (mime === 'image/png') {
    const d = readImageDimensions(mime, b);
    return d === null ? null : [d];
  }
  if (mime === 'image/jpeg') {
    let at = 2;
    for (let i = 0; i < MAX_STEPS && at + 4 <= b.length; i += 1) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1]!;
      if (marker === 0xd9) break;
      const len = (b[at + 2]! << 8) | b[at + 3]!;
      if (len < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (at + 9 > b.length) return null;
        found.push({ height: (b[at + 5]! << 8) | b[at + 6]!, width: (b[at + 7]! << 8) | b[at + 8]! });
      }
      if (marker === 0xda) {
        let j = at + 2 + len;
        while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && !(b[j + 1]! >= 0xd0 && b[j + 1]! <= 0xd7) && b[j + 1] !== 0xff)) j += 1;
        at = j;
        continue;
      }
      at += 2 + len;
    }
    return found.length === 0 ? null : found;
  }
  let at = 12;
  for (let i = 0; i < MAX_STEPS && at + 8 <= b.length; i += 1) {
    const type = ascii(b, at, 4);
    const size = le32(b, at + 4);
    const data = at + 8;
    if (type === 'VP8X' && data + 10 <= b.length) found.push({ width: le24(b, data + 4) + 1, height: le24(b, data + 7) + 1 });
    else if (type === 'VP8L' && data + 5 <= b.length && b[data] === 0x2f) {
      const bits = le32(b, data + 1);
      found.push({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
    } else if (type === 'VP8 ' && data + 10 <= b.length) found.push({ width: (b[data + 6]! | (b[data + 7]! << 8)) & 0x3fff, height: (b[data + 8]! | (b[data + 9]! << 8)) & 0x3fff });
    at = data + size + (size & 1);
  }
  return found.length === 0 ? null : found;
}

/** Cuadrada, dentro de `[min, max]` y la misma en TODAS las cabeceras declaradas. */
function allSquareInRange(dimensions: readonly Dimension[]): boolean {
  const first = dimensions[0];
  if (first === undefined) return false;
  return dimensions.every((d) => d.width === d.height && d.width === first.width && d.width >= USER_AVATAR_MIN_SIDE && d.width <= USER_AVATAR_MAX_SIDE);
}

/**
 * Valida la subida de la foto de perfil y devuelve la versión saneada (SC-011-061, SC-011-062). `TOO_LARGE` = 413, `TYPE` = 415 (vacío, marcado, firma desconocida o PDF),
 * `INVALID` = 422 (no cuadrada, lado fuera de 64..1024, corrupta o no saneable). Nunca lanza.
 * @implements REQ-PRF11-001, SC-011-061, SC-011-062
 */
export function sanitizeUserAvatar(bytes: Uint8Array): UserAvatarVerdict {
  try {
    if (bytes.length > USER_AVATAR_MAX_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    const detection = detectMediaType(bytes);
    if (!detection.ok || detection.mime === 'application/pdf') return { ok: false, reason: 'TYPE' };
    const mime: StrippableMime = detection.mime;
    const declared = readImageDimensions(mime, bytes);
    if (declared === null || !allSquareInRange([declared])) return { ok: false, reason: 'INVALID' };
    const stripped = stripImageMetadata(mime, bytes);
    if (!stripped.ok || stripped.bytes.length > USER_AVATAR_MAX_BYTES) return { ok: false, reason: 'INVALID' };
    const headers = declaredDimensions(mime, stripped.bytes);
    if (headers === null || !allSquareInRange(headers)) return { ok: false, reason: 'INVALID' };
    return { ok: true, mime, bytes: stripped.bytes };
  } catch {
    return { ok: false, reason: 'INVALID' };
  }
}

/** Tipo de imagen según la FIRMA de los bytes (nunca el tipo almacenado ni el declarado; Trinity H-5); `null` si no es PNG, WebP ni JPEG. */
export function userAvatarMimeOf(bytes: Uint8Array): StrippableMime | null {
  const detection = detectMediaType(bytes);
  return detection.ok && detection.mime !== 'application/pdf' ? detection.mime : null;
}
