import { deflateSync } from 'node:zlib';

/**
 * Fixtures de la foto de perfil de usuario (Feature 011, T1554, [GH:#78]; D11-13 = C): imágenes estructuralmente válidas de LADO ARBITRARIO (cuadradas o no) con
 * metadatos incrustados (EXIF con GPS, tEXt/iTXt, XMP, comentarios) para comprobar SC-011-061/062 (firma, tamaño, dimensiones 64..1024 y reencodificación sin
 * metadatos). Replican los constructores de `about-fixtures.ts` (que fija 1x1 / 2x2) sin importarlos con dimensiones fijas.
 */
import { GPS_MARK, XMP_MARK, COMMENT_MARK, enc } from './about-fixtures.ts';

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

const seg = (marker: number, data: number[]): number[] => [0xff, marker, ...[(data.length + 2) >> 8, (data.length + 2) & 255], ...data];
const sof = (w: number, h: number): number[] => seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);

/** JPEG con APP1 EXIF (GPS), APP1 XMP y comentario, de `w` x `h`. */
export function jpegOf(w: number, h: number): Uint8Array {
  const middle = [seg(0xe0, enc('JFIF\0')), seg(0xe1, enc(`Exif\0\0${GPS_MARK}`)), seg(0xe1, enc(`http://ns.adobe.com/xap/1.0/\0${XMP_MARK}`)), seg(0xfe, enc(COMMENT_MARK))];
  return Uint8Array.from([0xff, 0xd8, ...middle.flat(), ...seg(0xdb, new Array(65).fill(1)), ...sof(w, h), ...seg(0xc4, new Array(17).fill(0)), ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
}

const pngChunk = (type: string, data: number[]): number[] => [...u32(data.length), ...enc(type), ...data, ...u32(crc32([...enc(type), ...data]))];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IDAT = [...deflateSync(Uint8Array.from([0, 1, 2, 3]))];

/** PNG con eXIf (GPS), tEXt (comentario) e iTXt (XMP), de `w` x `h` (los píxeles no se decodifican en la prueba). */
export function pngOf(w: number, h: number): Uint8Array {
  return Uint8Array.from([
    ...SIG,
    ...pngChunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0]),
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

/** WebP (VP8X + VP8L) con los indicadores EXIF y XMP activos y sus trozos, de `w` x `h`. */
export function webpOf(w: number, h: number): Uint8Array {
  const body = [...enc('WEBP'), ...vp8x(0x20 | 0x08, w, h), ...vp8l(w, h), ...wchunk('EXIF', enc(`Exif\0\0${GPS_MARK}`)), ...wchunk('XMP ', enc(`<x:xmpmeta>${XMP_MARK}</x:xmpmeta>`))];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body]);
}

/** Rellena un objeto válido hasta superar `size` bytes añadiendo un comentario final (para el tope de 524 288 bytes). */
export function paddedJpeg(w: number, h: number, size: number): Uint8Array {
  const base = jpegOf(w, h);
  const out = new Uint8Array(Math.max(size, base.length));
  out.set(base);
  return out;
}

export const MARKS = [GPS_MARK, XMP_MARK, COMMENT_MARK, 'Exif'] as const;
export const hasMark = (bytes: Uint8Array): boolean => MARKS.some((m) => Buffer.from(bytes).includes(Buffer.from(m)));
export const USER_AVATAR_SIDE = 512;

/** JPEG con DOS cabeceras SOF (la segunda, p. ej., la de una miniatura o un segundo marco): cada una debe estar en 64..1024 y ser cuadrada (Trinity H-3). */
export function jpegTwoSof(first: number, second: number): Uint8Array {
  const base = jpegOf(first, first);
  const marker = base.findIndex((b, i) => b === 0xff && base[i + 1] === 0xc0);
  const extra = sof(second, second);
  const end = marker + 2 + ((base[marker + 2]! << 8) | base[marker + 3]!);
  return Uint8Array.from([...base.slice(0, end), ...extra, ...base.slice(end)]);
}

/** WebP con canvas VP8X de `canvas` x `canvas` y marco VP8L interno de `frame` x `frame` (el canvas y el marco deben estar ambos en 64..1024). */
export function webpCanvasFrame(canvas: number, frame: number): Uint8Array {
  const body = [...enc('WEBP'), ...vp8x(0x20 | 0x08, canvas, canvas), ...vp8l(frame, frame), ...wchunk('EXIF', enc(`Exif\0\0${GPS_MARK}`)), ...wchunk('XMP ', enc(`<x:xmpmeta>${XMP_MARK}</x:xmpmeta>`))];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body]);
}

/** Lista blanca (decisión de Neo 2A): nombres de trozos/segmentos de METADATOS que NO pueden quedar en lo guardado, según la firma. Vacío = limpio y con firma válida. */
export function metadataLeft(bytes: Uint8Array): string[] {
  const left: string[] = [];
  const view = Buffer.from(bytes);
  if (view.subarray(0, 8).equals(Buffer.from(SIG))) {
    for (let i = 8; i + 8 <= view.length; ) {
      const len = view.readUInt32BE(i);
      const type = view.toString('latin1', i + 4, i + 8);
      if (['tEXt', 'iTXt', 'zTXt', 'eXIf', 'iCCP'].includes(type)) left.push(type);
      i += 12 + len;
    }
  } else if (view[0] === 0xff && view[1] === 0xd8) {
    for (let i = 2; i + 4 <= view.length && view[i] === 0xff; ) {
      const marker = view[i + 1]!;
      if ([0xe1, 0xe2, 0xed, 0xfe].includes(marker)) left.push(`0xFF${marker.toString(16).toUpperCase()}`);
      if (marker === 0xda) break;
      i += 2 + view.readUInt16BE(i + 2);
    }
  } else if (view.toString('latin1', 0, 4) === 'RIFF' && view.toString('latin1', 8, 12) === 'WEBP') {
    for (let i = 12; i + 8 <= view.length; ) {
      const type = view.toString('latin1', i, i + 4);
      if (['EXIF', 'XMP ', 'ICCP'].includes(type)) left.push(type);
      const len = view.readUInt32LE(i + 4);
      i += 8 + len + (len % 2);
    }
  } else left.push('SIN-FIRMA');
  return left;
}
