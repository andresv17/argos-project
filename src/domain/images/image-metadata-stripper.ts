/**
 * Normalizador de metadatos de imagen por LISTA BLANCA, sin dependencia npm (feature 006, T848; REQ-ESC6-027, REQ-ESC6-035; INV-ESC6-015; plan.md §5.4; N2-01 = B).
 * `stripImageMetadata` es una función pura del dominio (el adaptador de `infrastructure` solo la reexporta; los casos de uso de `application` la reciben inyectada o la importan de aquí), no un puerto: reescribe el contenedor conservando solo los segmentos permitidos y sin tocar los
 * píxeles (JPEG: SOI, DQT, DHT, SOF*, DRI, SOS con sus datos, EOI y APP14 Adobe; PNG: IHDR, PLTE, tRNS, IDAT, IEND; WebP: VP8, VP8L, VP8X sin indicadores
 * EXIF/XMP/ICC y ALPH). Trunca todo byte posterior al marcador final, verifica el CRC del PNG y que las longitudes cierren exactamente, rechaza PNG y WebP animados
 * y cualquier archivo ilegible (`ok: false` = «ausente»). El recorrido tiene tope de iteraciones y nunca decodifica ni duplica el archivo antes de validar tamaños.
 * NO recodifica ni redimensiona (brecha aceptada para el tramo fake; obligatorio antes del driver real, N2-01 = A). `validateGeneratedImage` valida la SALIDA del
 * proveedor por firma (REQ-ESC6-035) reescribiéndola por lista blanca (H-ORA-F6-A): se conservan C2PA y XMP (N2-03 = A) y se descartan tEXt, EXIF y el resto.
 *
 * @implements REQ-ESC6-027, REQ-ESC6-035, INV-ESC6-015, EDGE-ESC6-004, EDGE-ESC6-023, EDGE-ESC6-028, EDGE-ESC6-029, ERR-SCENE-INVALID-IMAGE, SC-ESC6-041, SC-ESC6-083, SC-ESC6-084, SC-ESC6-085
 */

export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_SIDE = 8192;
/** Tope agregado de referencias por llamada: 32 MiB. */
export const MAX_REFERENCE_AGGREGATE_BYTES = 32 * 1024 * 1024;
const MAX_ITERATIONS = 20_000;

export type StrippableMime = 'image/png' | 'image/webp' | 'image/jpeg';
export type StripResult = { readonly ok: true; readonly mime: StrippableMime; readonly bytes: Uint8Array } | { readonly ok: false };
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));
const startsWith = (b: Uint8Array, prefix: readonly number[]): boolean => b.length >= prefix.length && prefix.every((x, i) => b[i] === x);
const be32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const le32 = (b: Uint8Array, at: number): number => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const le24 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let crc = 0xffffffff;
  for (const x of b) crc = CRC_TABLE[(crc ^ x) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const withinLimits = (d: ImageDimensions | null): d is ImageDimensions =>
  d !== null && d.width > 0 && d.height > 0 && d.width <= MAX_IMAGE_SIDE && d.height <= MAX_IMAGE_SIDE && d.width * d.height <= MAX_IMAGE_PIXELS;

// ---------- Dimensiones sin decodificar ----------
function pngDimensions(b: Uint8Array): ImageDimensions | null {
  if (!startsWith(b, PNG_SIGNATURE) || b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: be32(b, 16), height: be32(b, 20) };
}

function jpegDimensions(b: Uint8Array): ImageDimensions | null {
  let at = 2;
  for (let i = 0; i < MAX_ITERATIONS && at + 4 <= b.length; i += 1) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) { at += 1; continue; }
    const len = (b[at + 2]! << 8) | b[at + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return at + 9 <= b.length ? { height: (b[at + 5]! << 8) | b[at + 6]!, width: (b[at + 7]! << 8) | b[at + 8]! } : null;
    }
    if (marker === 0xda || marker === 0xd9 || len < 2) return null;
    at += 2 + len;
  }
  return null;
}

function webpDimensions(b: Uint8Array): ImageDimensions | null {
  let at = 12;
  for (let i = 0; i < MAX_ITERATIONS && at + 8 <= b.length; i += 1) {
    const type = ascii(b, at, 4);
    const size = le32(b, at + 4);
    const data = at + 8;
    if (type === 'VP8X' && data + 10 <= b.length) return { width: le24(b, data + 4) + 1, height: le24(b, data + 7) + 1 };
    if (type === 'VP8L' && data + 5 <= b.length && b[data] === 0x2f) {
      const bits = le32(b, data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (type === 'VP8 ' && data + 10 <= b.length) return { width: (b[data + 6]! | (b[data + 7]! << 8)) & 0x3fff, height: (b[data + 8]! | (b[data + 9]! << 8)) & 0x3fff };
    at = data + size + (size & 1);
  }
  return null;
}

/** Dimensiones leídas de IHDR, SOF o VP8X/VP8L/VP8 sin decodificar; `null` si no se pueden leer. */
export function readImageDimensions(mime: StrippableMime, bytes: Uint8Array): ImageDimensions | null {
  return mime === 'image/png' ? pngDimensions(bytes) : mime === 'image/jpeg' ? jpegDimensions(bytes) : webpDimensions(bytes);
}

// ---------- PNG ----------
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
const PNG_ANIMATION = new Set(['acTL', 'fcTL', 'fdAT']);

function stripPng(b: Uint8Array): Uint8Array | null {
  if (!startsWith(b, PNG_SIGNATURE)) return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let at = 8;
  let first = true;
  for (let i = 0; i < MAX_ITERATIONS && at + 12 <= b.length; i += 1) {
    const len = be32(b, at);
    if (len > 0x7fffffff || at + 12 + len > b.length) return null;
    const type = ascii(b, at + 4, 4);
    if (crc32(b.subarray(at + 4, at + 8 + len)) !== be32(b, at + 8 + len)) return null;
    if (first) {
      if (type !== 'IHDR' || len !== 13 || !withinLimits(pngDimensions(b))) return null;
      first = false;
    }
    if (PNG_ANIMATION.has(type)) return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(at, at + 12 + len));
    else if ((type.charCodeAt(0) & 0x20) === 0) return null; // crítico desconocido: no se puede descartar con seguridad
    if (type === 'IEND') return concat(parts); // todo byte posterior se trunca
    at += 12 + len;
  }
  return null;
}

// ---------- JPEG ----------
const isSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let at = 2;
  let sawSof = false;
  let sawSos = false;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    if (at + 2 > b.length || b[at] !== 0xff) return null;
    const marker = b[at + 1]!;
    if (marker === 0xff) { at += 1; continue; }
    if (marker === 0xd9) {
      if (!sawSof || !sawSos) return null;
      parts.push(b.subarray(at, at + 2));
      return concat(parts); // todo byte posterior a EOI se trunca
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || at + 4 > b.length) return null;
    const len = (b[at + 2]! << 8) | b[at + 3]!;
    if (len < 2 || at + 2 + len > b.length) return null;
    const end = at + 2 + len;
    if (isSof(marker)) {
      if (len < 8 || !withinLimits({ height: (b[at + 5]! << 8) | b[at + 6]!, width: (b[at + 7]! << 8) | b[at + 8]! })) return null;
      sawSof = true;
      parts.push(b.subarray(at, end));
    } else if (marker === 0xdb || marker === 0xc4 || marker === 0xdd) {
      parts.push(b.subarray(at, end));
    } else if (marker === 0xee && ascii(b, at + 4, 5) === 'Adobe') {
      parts.push(b.subarray(at, end));
    } else if (marker === 0xda) {
      let j = end;
      while (j < b.length) {
        if (b[j] !== 0xff) { j += 1; continue; }
        const next = b[j + 1];
        if (next === 0x00 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) { j += 2; continue; }
        if (next === 0xff) { j += 1; continue; }
        break;
      }
      if (j >= b.length) return null;
      sawSos = true;
      parts.push(b.subarray(at, j));
      at = j;
      continue;
    }
    at = end;
  }
  return null;
}

// ---------- WebP ----------
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH']);

function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 20 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const riffSize = le32(b, 4);
  if (riffSize < 12 || riffSize + 8 > b.length) return null;
  const end = riffSize + 8; // todo byte posterior al RIFF se trunca
  const parts: Uint8Array[] = [];
  let images = 0;
  let at = 12;
  for (let i = 0; i < MAX_ITERATIONS && at < end; i += 1) {
    if (at + 8 > end) return null;
    const type = ascii(b, at, 4);
    const size = le32(b, at + 4);
    const next = at + 8 + size + (size & 1);
    if (next > end) return null;
    if (type === 'ANIM' || type === 'ANMF') return null;
    if (WEBP_KEEP.has(type)) {
      let chunk = b.slice(at, next);
      if (type === 'VP8X') {
        if (size < 10 || (chunk[8]! & 0x02) !== 0) return null; // animado
        chunk[8] = chunk[8]! & ~(0x20 | 0x08 | 0x04); // ICC, EXIF y XMP a cero
      }
      if (type === 'VP8 ' || type === 'VP8L') images += 1;
      parts.push(chunk);
    }
    at = next;
  }
  if (at !== end || images !== 1) return null;
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(head.buffer).setUint32(4, 4 + body.length, true);
  head.set(new TextEncoder().encode('WEBP'), 8);
  const out = concat([head, body]);
  return withinLimits(webpDimensions(out)) ? out : null;
}

/** Reescribe el contenedor con lista blanca; `ok: false` = la imagen se trata como ausente (nunca se lanza). */
export function stripImageMetadata(mime: StrippableMime, bytes: Uint8Array): StripResult {
  try {
    const out = mime === 'image/png' ? stripPng(bytes) : mime === 'image/jpeg' ? stripJpeg(bytes) : mime === 'image/webp' ? stripWebp(bytes) : null;
    return out === null ? { ok: false } : { ok: true, mime, bytes: out };
  } catch {
    return { ok: false };
  }
}

/** Referencias que caben en el tope agregado: se conserva el mayor prefijo por prioridad; el resto se omite y el intento queda degradado (EDGE-ESC6-028). */
export function fitReferencesWithinBudget(sizes: readonly number[], limit: number = MAX_REFERENCE_AGGREGATE_BYTES): { readonly kept: number; readonly degraded: boolean } {
  let total = 0;
  let kept = 0;
  for (const size of sizes) {
    if (total + size > limit) break;
    total += size;
    kept += 1;
  }
  return { kept, degraded: kept < sizes.length };
}

export type OutputVerdict =
  | { readonly ok: true; readonly mime: 'image/png' | 'image/webp' | 'image/jpeg'; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly code: 'ERR-SCENE-INVALID-IMAGE' };
const INVALID: OutputVerdict = { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' };

const XMP_KEYWORD = 'XML:com.adobe.xmp';
const MAX_XMP_BYTES = 64 * 1024;
const OUTPUT_PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'caBX']);
const OUTPUT_WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'XMP ', 'C2PA']);

/** iTXt cuya keyword es exactamente «XML:com.adobe.xmp» (terminada en NUL) y de a lo sumo 64 KiB. */
const isXmpItxt = (b: Uint8Array, dataAt: number, len: number): boolean =>
  len <= MAX_XMP_BYTES && len > XMP_KEYWORD.length && ascii(b, dataAt, XMP_KEYWORD.length) === XMP_KEYWORD && b[dataAt + XMP_KEYWORD.length] === 0;

/** PNG de salida: lista blanca (IHDR, PLTE, tRNS, IDAT, IEND, caBX y iTXt XMP), CRC y longitudes verificados, truncado tras IEND. */
function filterOutputPng(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let first = true;
  let sawIdat = false;
  for (let at = 8, i = 0; i < MAX_ITERATIONS && at + 12 <= b.length; i += 1) {
    const len = be32(b, at);
    if (len > 0x7fffffff || at + 12 + len > b.length) return null;
    const type = ascii(b, at + 4, 4);
    if (crc32(b.subarray(at + 4, at + 8 + len)) !== be32(b, at + 8 + len)) return null;
    if (first) {
      if (type !== 'IHDR' || len !== 13 || !withinLimits(pngDimensions(b))) return null;
      first = false;
    }
    if (PNG_ANIMATION.has(type)) return null;
    if (type === 'IDAT') sawIdat = true;
    if (OUTPUT_PNG_KEEP.has(type) || (type === 'iTXt' && isXmpItxt(b, at + 8, len))) parts.push(b.subarray(at, at + 12 + len));
    else if ((type.charCodeAt(0) & 0x20) === 0) return null; // crítico desconocido
    if (type === 'IEND') return sawIdat ? concat(parts) : null;
    at += 12 + len;
  }
  return null;
}

/** WebP de salida: lista blanca (VP8 , VP8L, VP8X sin indicadores EXIF/ICC, ALPH, XMP , C2PA), RIFF exacto y truncado de lo posterior. */
function filterOutputWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 20 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const riffSize = le32(b, 4);
  if (riffSize < 12 || riffSize + 8 > b.length) return null;
  const end = riffSize + 8;
  const parts: Uint8Array[] = [];
  let images = 0;
  let at = 12;
  for (let i = 0; i < MAX_ITERATIONS && at < end; i += 1) {
    if (at + 8 > end) return null;
    const type = ascii(b, at, 4);
    const size = le32(b, at + 4);
    const next = at + 8 + size + (size & 1);
    if (next > end) return null;
    if (type === 'ANIM' || type === 'ANMF') return null;
    if (OUTPUT_WEBP_KEEP.has(type)) {
      const kept = b.slice(at, next);
      if (type === 'VP8X') {
        if (size < 10 || (kept[8]! & 0x02) !== 0) return null;
        kept[8] = kept[8]! & ~(0x20 | 0x08); // ICC y EXIF a cero; XMP se conserva
      }
      if (type === 'VP8 ' || type === 'VP8L') images += 1;
      parts.push(kept);
    }
    at = next;
  }
  if (at !== end || images !== 1) return null;
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(head.buffer).setUint32(4, 4 + body.length, true);
  head.set(new TextEncoder().encode('WEBP'), 8);
  return concat([head, body]);
}

/**
 * Valida la salida del proveedor por FIRMA y la REESCRIBE por lista blanca (H-ORA-F6-A, REQ-ESC6-035, INV-ESC6-007): devuelve los bytes que se publican. Solo PNG o WebP
 * de un cuadro o JPEG (enmienda Nivel 2 de REQ-ESC6-035: reescritura por la lista blanca de `stripJpeg`, sin EXIF ni comentarios), tipo declarado igual a la firma, tamaño y megapíxeles. Se conservan C2PA y XMP (N2-03 = A); nunca tEXt, EXIF ni lo posterior al final.
 */
export function validateGeneratedImage(declaredMime: string, bytes: Uint8Array, maxBytes: number): OutputVerdict {
  try {
    if (bytes.length === 0 || bytes.length > maxBytes) return INVALID;
    if (startsWith(bytes, PNG_SIGNATURE)) {
      if (declaredMime !== 'image/png') return INVALID;
      const out = filterOutputPng(bytes);
      return out === null ? INVALID : { ok: true, mime: 'image/png', bytes: out };
    }
    if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      if (declaredMime !== 'image/webp') return INVALID;
      const out = filterOutputWebp(bytes);
      return out === null || !withinLimits(webpDimensions(out)) ? INVALID : { ok: true, mime: 'image/webp', bytes: out };
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      if (declaredMime !== 'image/jpeg') return INVALID;
      const out = stripJpeg(bytes);
      return out === null || out.length > maxBytes || !withinLimits(jpegDimensions(out)) ? INVALID : { ok: true, mime: 'image/jpeg', bytes: out };
    }
    return INVALID;
  } catch {
    return INVALID;
  }
}
