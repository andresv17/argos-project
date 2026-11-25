import { deflateSync } from 'node:zlib';

/**
 * Fixtures de la sección «Acerca de» (Feature 010, T1428, [GH:#33]): imágenes mínimas pero estructuralmente válidas (JPEG, PNG y WebP) con metadatos
 * incrustados (EXIF con GPS, tEXt, XMP, comentarios) para comprobar INV-ACE10-001 (la foto pública no conserva EXIF) y EDGE-010-007, y cargas hostiles
 * (SVG, HTML, polyglot) que deben rechazarse por firma (INV-ARC-002). Los constructores replican los de `t847-normalizador-imagenes-escena-006.spec.ts`
 * (006) sin importarlos: aquel archivo es una prueba, no una librería.
 */
export const enc = (s: string): number[] => [...new TextEncoder().encode(s)];
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: number[]): number => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Marca reconocible que NO debe sobrevivir en ningún objeto publicado. */
export const GPS_MARK = 'GPSLatitude=4.7110N;GPSLongitude=-74.0721W';
export const XMP_MARK = 'xmp-autor-secreto';
export const COMMENT_MARK = 'comentario-privado';
export const FORBIDDEN_MARKS = [GPS_MARK, XMP_MARK, COMMENT_MARK, 'Exif'] as const;

const seg = (marker: number, data: number[]): number[] => [0xff, marker, ...[(data.length + 2) >> 8, (data.length + 2) & 255], ...data];
const sof = (w: number, h: number): number[] => seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);

/** JPEG válido de 1x1 con APP1 EXIF (GPS), APP1 XMP y un comentario. */
export function jpegWithExif(): Uint8Array {
  const middle = [seg(0xe0, enc('JFIF\0')), seg(0xe1, enc(`Exif\0\0${GPS_MARK}`)), seg(0xe1, enc(`http://ns.adobe.com/xap/1.0/\0${XMP_MARK}`)), seg(0xfe, enc(COMMENT_MARK))];
  return Uint8Array.from([0xff, 0xd8, ...middle.flat(), ...seg(0xdb, new Array(65).fill(1)), ...sof(1, 1), ...seg(0xc4, new Array(17).fill(0)), ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
}

const pngChunk = (type: string, data: number[]): number[] => [...u32(data.length), ...enc(type), ...data, ...u32(crc32([...enc(type), ...data]))];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IDAT = [...deflateSync(Uint8Array.from([0, 1, 2, 3]))];

/** PNG válido de 1x1 con eXIf (GPS), tEXt (comentario) e iTXt (XMP). */
export function pngWithMetadata(): Uint8Array {
  const ihdr = [...u32(1), ...u32(1), 8, 2, 0, 0, 0];
  return Uint8Array.from([
    ...SIG,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('eXIf', enc(`Exif\0\0${GPS_MARK}`)),
    ...pngChunk('tEXt', enc(`Comment\0${COMMENT_MARK}`)),
    ...pngChunk('iTXt', enc(`XML:com.adobe.xmp\0\0\0\0\0${XMP_MARK}`)),
    ...pngChunk('IDAT', IDAT),
    ...pngChunk('IEND', []),
  ]);
}

const wchunk = (fourcc: string, data: number[]): number[] => [...enc(fourcc), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];
const vp8x = (flags: number, w: number, h: number): number[] => wchunk('VP8X', [flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255]);
const vp8l = (w: number, h: number): number[] => {
  const bits = (w - 1) | ((h - 1) << 14);
  return wchunk('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255, 9, 9, 9]);
};

/** WebP (VP8X + VP8L) 2x2 con los indicadores EXIF y XMP activos y sus trozos. */
export function webpWithMetadata(): Uint8Array {
  const body = [...enc('WEBP'), ...vp8x(0x20 | 0x08, 2, 2), ...vp8l(2, 2), ...wchunk('EXIF', enc(`Exif\0\0${GPS_MARK}`)), ...wchunk('XMP ', enc(`<x:xmpmeta>${XMP_MARK}</x:xmpmeta>`))];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body]);
}

/** Cargas que NO son foto aunque lleven extensión o tipo de imagen: se rechazan por firma (INV-ARC-002, EDGE-010-007). */
export const HOSTILE_PAYLOADS: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array }> = [
  { name: 'SVG con script', bytes: Uint8Array.from(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) },
  { name: 'HTML', bytes: Uint8Array.from(enc('<!doctype html><html><body><script>alert(1)</script></body></html>')) },
  { name: 'XML con BOM', bytes: Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('<?xml version="1.0"?><svg onload="alert(1)"/>')]) },
  { name: 'PDF', bytes: Uint8Array.from([...enc('%PDF-1.4\n'), ...new Array(64).fill(0x20)]) },
  { name: 'texto plano', bytes: Uint8Array.from(enc('esto no es una imagen')) },
  { name: 'vacío', bytes: new Uint8Array(0) },
  { name: 'PNG truncado (firma sin trozos)', bytes: Uint8Array.from(SIG) },
];

export const hasBytes = (haystack: Uint8Array, needle: string): boolean => Buffer.from(haystack).includes(Buffer.from(needle));

/** Cuerpo Markdown de exactamente `length` caracteres (UTF-16), con `ñ` repetida: ~2 bytes UTF-8 por carácter. */
export const markdownOfLength = (length: number): string => 'ñ'.repeat(length);

/** Entradas hostiles de Markdown (EDGE-010-007, D10-07): ninguna debe sobrevivir como HTML activo, esquema ejecutable ni imagen remota. */
export const HOSTILE_MARKDOWN: ReadonlyArray<{ readonly name: string; readonly source: string }> = [
  { name: 'script en línea', source: 'Hola <script>alert(1)</script> mundo' },
  { name: 'img con onerror', source: '<img src=x onerror="alert(1)">' },
  { name: 'iframe', source: '<iframe src="https://evil.example"></iframe>' },
  { name: 'enlace javascript:', source: '[clic](javascript:alert(1))' },
  { name: 'enlace JaVaScRiPt: con mayúsculas', source: '[clic](JaVaScRiPt:alert(1))' },
  { name: 'enlace javascript: con tabulación', source: '[clic](java\tscript:alert(1))' },
  { name: 'enlace javascript: con entidad', source: '[clic](&#106;avascript:alert(1))' },
  { name: 'enlace vbscript:', source: '[clic](vbscript:msgbox(1))' },
  { name: 'enlace data:text/html', source: '[clic](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)' },
  { name: 'enlace entre ángulos', source: '[clic](<javascript:alert(1)>)' },
  { name: 'imagen remota https', source: '![pixel](https://tracker.example/p.png)' },
  { name: 'imagen remota sin esquema', source: '![pixel](//tracker.example/p.png)' },
  { name: 'imagen data:', source: '![pixel](data:image/svg+xml;base64,PHN2Zy8+)' },
  { name: 'imagen por referencia', source: '![pixel][r]\n\n[r]: https://tracker.example/p.png' },
  { name: 'atributo de evento en HTML', source: '<a href="https://ok.example" onclick="alert(1)">x</a>' },
  { name: 'svg en línea', source: '<svg onload=alert(1)></svg>' },
];
