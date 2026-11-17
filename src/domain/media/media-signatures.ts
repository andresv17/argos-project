/**
 * Detector de tipo por firma (magic bytes) para archivos y fotos de la mascota. Código propio, sin dependencias, puro:
 * ni `fs`, ni `fetch`, ni SDK (NFR-ALM-004). El `Content-Type` y la extensión que declara el cliente no se usan nunca.
 *
 * - Lista cerrada (INV-ARC-001, D-06 C): JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF`(0..3) + `WEBP`(8..11), sin leer el
 *   tamaño ni el encabezado interno (K-09); PDF `%PDF-` completo en los primeros 1024 bytes. DOCX, XLSX, TXT y el resto: `UNKNOWN`
 *   (sin inspección de ZIP, TECHDEBT-004-01).
 * - Prohibidos (INV-ARC-002): si los primeros 2048 bytes, tras quitar BOM UTF-8 y espacios iniciales, comienzan con `<svg`, `<?xml`,
 *   `<!doctype`, `<html` o `<script` (sin distinguir mayúsculas) se rechaza como `FORBIDDEN_MARKUP`, antes de mirar las firmas.
 * - `kind = PHOTO` acepta JPEG, PNG y WebP; `kind = FILE` acepta además PDF; el avatar acepta JPEG, PNG y WebP.
 *
 * @implements INV-ARC-001, INV-ARC-002, REQ-ARC-001, NFR-ALM-004
 */

import type { MediaKind, MediaMime } from '../../generated/v31/index.ts';

export type { MediaKind, MediaMime };

export type MediaDetection = { readonly ok: true; readonly mime: MediaMime } | { readonly ok: false; readonly reason: 'EMPTY' | 'FORBIDDEN_MARKUP' | 'UNKNOWN' };

const MARKUP_WINDOW = 2048;
const PDF_WINDOW = 1024;
const FORBIDDEN_PREFIXES = ['<svg', '<?xml', '<!doctype', '<html', '<script'] as const;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const startsWith = (data: Uint8Array, magic: readonly number[], offset = 0): boolean => data.length >= offset + magic.length && magic.every((value, i) => data[offset + i] === value);
const isAsciiWhitespace = (byte: number): boolean => byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);

/** true si la ventana inicial, sin BOM UTF-8 ni espacios, comienza con marcado prohibido (SVG, XML, HTML, script). */
function startsWithForbiddenMarkup(data: Uint8Array): boolean {
  const window = data.subarray(0, MARKUP_WINDOW);
  let index = 0;
  for (;;) {
    if (startsWith(window, [0xef, 0xbb, 0xbf], index)) index += 3;
    else if (index < window.length && isAsciiWhitespace(window[index]!)) index += 1;
    else break;
  }
  const head = Array.from(window.subarray(index, index + 16), (byte) => String.fromCharCode(byte)).join('').toLowerCase();
  return FORBIDDEN_PREFIXES.some((prefix) => head.startsWith(prefix));
}

function hasPdfMagicInWindow(data: Uint8Array): boolean {
  const limit = Math.min(data.length, PDF_WINDOW) - PDF_MAGIC.length;
  for (let offset = 0; offset <= limit; offset += 1) if (startsWith(data, PDF_MAGIC, offset)) return true;
  return false;
}

/** Tipo del contenido por firma. Nunca consulta nombre ni tipo declarado. @implements INV-ARC-001, INV-ARC-002 */
export function detectMediaType(data: Uint8Array): MediaDetection {
  if (data.length === 0) return { ok: false, reason: 'EMPTY' };
  if (startsWithForbiddenMarkup(data)) return { ok: false, reason: 'FORBIDDEN_MARKUP' };
  if (startsWith(data, [0xff, 0xd8, 0xff])) return { ok: true, mime: 'image/jpeg' };
  if (startsWith(data, PNG_MAGIC)) return { ok: true, mime: 'image/png' };
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) return { ok: true, mime: 'image/webp' };
  if (hasPdfMagicInWindow(data)) return { ok: true, mime: 'application/pdf' };
  return { ok: false, reason: 'UNKNOWN' };
}

/** PHOTO: JPEG, PNG y WebP; FILE: además PDF (INV-ARC-001). */
export function isAllowedForKind(mime: MediaMime, kind: MediaKind): boolean {
  return mime !== 'application/pdf' || kind === 'FILE';
}

/** El avatar acepta solo JPEG, PNG y WebP (INV-ARC-001). */
export function isAvatarMime(mime: MediaMime): boolean {
  return mime !== 'application/pdf';
}

const EXTENSIONS: Readonly<Record<MediaMime, 'jpg' | 'png' | 'webp' | 'pdf'>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Extensión canónica del tipo detectado (REQ-ARC-004). */
export function canonicalExtension(mime: MediaMime): 'jpg' | 'png' | 'webp' | 'pdf' {
  return EXTENSIONS[mime];
}
