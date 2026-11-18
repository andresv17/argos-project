import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  MAX_REFERENCE_AGGREGATE_BYTES,
  fitReferencesWithinBudget,
  readImageDimensions,
  stripImageMetadata,
  validateGeneratedImage,
} from '../../src/infrastructure/adapters/image-metadata-stripper.ts';

/**
 * T847 (006, Fase 5): normalizador `stripImageMetadata` por LISTA BLANCA sin dependencia npm (N2-01 = B; PNG, WebP y JPEG de entrada; CRC, longitudes exactas, animados
 * rechazados, polyglot, GPS en APP1, trozos privados), límites de megapíxeles y de 32 MiB agregados, y validación de la salida por firma (T848). La recodificación y el
 * redimensionado NO se prueban aquí. REQ-ESC6-027, REQ-ESC6-035; INV-ESC6-015; EDGE-ESC6-023, EDGE-ESC6-004, EDGE-ESC6-029; ERR-SCENE-INVALID-IMAGE;
 * SC-ESC6-041, SC-ESC6-062, SC-ESC6-067, SC-ESC6-072, SC-ESC6-083, SC-ESC6-084, SC-ESC6-085.
 */
const enc = (s: string): number[] => [...new TextEncoder().encode(s)];
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
const pngChunk = (type: string, data: number[], badCrc = false): number[] => [...u32(data.length), ...enc(type), ...data, ...u32(badCrc ? 0 : crc32([...enc(type), ...data]))];
const ihdr = (w: number, h: number): number[] => [...u32(w), ...u32(h), 8, 2, 0, 0, 0];
const IDAT = [...deflateSync(Uint8Array.from([0, 1, 2, 3]))];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (chunks: number[][], w = 1, h = 1): Uint8Array => Uint8Array.from([...SIG, ...pngChunk('IHDR', ihdr(w, h)), ...chunks.flat(), ...pngChunk('IEND', [])]);
const types = (bytes: Uint8Array): string[] => {
  const out: string[] = [];
  for (let at = 8; at < bytes.length; ) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
    out.push(new TextDecoder().decode(bytes.slice(at + 4, at + 8)));
    at += 12 + len;
  }
  return out;
};

const seg = (marker: number, data: number[]): number[] => [0xff, marker, ...[(data.length + 2) >> 8, (data.length + 2) & 255], ...data];
const sof = (w: number, h: number): number[] => seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const GPS = enc('Exif\0\0GPSLatitude=4.7110N');
const jpeg = (middle: number[][], tail: number[] = []): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, ...middle.flat(), ...seg(0xdb, new Array(65).fill(1)), ...sof(1, 1), ...seg(0xc4, new Array(17).fill(0)), ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9, ...tail]);
const hasBytes = (haystack: Uint8Array, needle: number[]): boolean => Buffer.from(haystack).includes(Buffer.from(needle));

const riff = (chunks: number[][]): Uint8Array => {
  const body = [...enc('WEBP'), ...chunks.flat()];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body]);
};
const wchunk = (fourcc: string, data: number[]): number[] => [...enc(fourcc), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];
const vp8x = (flags: number, w: number, h: number): number[] => wchunk('VP8X', [flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255]);
const vp8l = (w: number, h: number): number[] => {
  const bits = (w - 1) | ((h - 1) << 14);
  return wchunk('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255, 9, 9, 9]);
};

describe('stripImageMetadata PNG (T847): lista blanca IHDR, PLTE, tRNS, IDAT, IEND', () => {
  it('[SC-ESC6-083][INV-ESC6-015] conserva solo los trozos de la lista blanca y descarta tEXt, eXIf, caBX, iDOT y los privados', () => {
    const input = png([pngChunk('eXIf', GPS), pngChunk('caBX', [1, 2]), pngChunk('iDOT', [3]), pngChunk('tEXt', enc('Comment\0hola')), pngChunk('tRNS', [1]), pngChunk('IDAT', IDAT)]);
    const out = stripImageMetadata('image/png', input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect([out.mime, types(out.bytes)]).toEqual(['image/png', ['IHDR', 'tRNS', 'IDAT', 'IEND']]);
    expect(hasBytes(out.bytes, GPS)).toBe(false);
  });

  it('[SC-ESC6-083] trunca todo byte posterior a IEND (polyglot PNG+ZIP) y la salida termina exactamente en el IEND', () => {
    const input = Uint8Array.from([...png([pngChunk('IDAT', IDAT)]), ...enc('PK\x03\x04polyglot')]);
    const out = stripImageMetadata('image/png', input);
    expect(out.ok && hasBytes(out.bytes, enc('PK'))).toBe(false);
    expect(out.ok && types(out.bytes).at(-1)).toBe('IEND');
  });

  it('[SC-ESC6-083] rechaza (ok = false): CRC inválido, APNG (acTL), archivo truncado, longitud enorme, sin IHDR al principio y firma que no coincide con el tipo declarado', () => {
    const base = [pngChunk('IDAT', IDAT)];
    expect(stripImageMetadata('image/png', png([pngChunk('IDAT', IDAT, true)])).ok).toBe(false);
    expect(stripImageMetadata('image/png', png([pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]), ...base])).ok).toBe(false);
    expect(stripImageMetadata('image/png', png(base).slice(0, 40)).ok).toBe(false);
    expect(stripImageMetadata('image/png', Uint8Array.from([...SIG, ...u32(0x7fffffff), ...enc('IDAT'), 1, 2, 3])).ok).toBe(false);
    expect(stripImageMetadata('image/png', Uint8Array.from([...SIG, ...pngChunk('IDAT', IDAT), ...pngChunk('IEND', [])])).ok).toBe(false);
    expect(stripImageMetadata('image/webp', png(base)).ok).toBe(false);
    expect(stripImageMetadata('image/png', new Uint8Array(0)).ok).toBe(false);
  });

  it('[SC-ESC6-083] un trozo crítico desconocido no se puede descartar con seguridad: se trata como ilegible', () => {
    expect(stripImageMetadata('image/png', png([pngChunk('ZZZZ', [1]), pngChunk('IDAT', IDAT)])).ok).toBe(false);
  });
});

describe('stripImageMetadata JPEG (T847): SOI, DQT, DHT, SOF*, DRI, SOS y EOI', () => {
  it('[SC-ESC6-041][INV-ESC6-015] elimina GPS en APP1, ICC en APP2, comentarios y JFIF; conserva las tablas, el cuadro y los datos del scan', () => {
    const input = jpeg([seg(0xe0, enc('JFIF\0')), seg(0xe1, GPS), seg(0xe2, enc('ICC_PROFILE\0')), seg(0xfe, enc('comentario')), seg(0xed, enc('Photoshop 3.0'))]);
    const out = stripImageMetadata('image/jpeg', input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect([hasBytes(out.bytes, GPS), hasBytes(out.bytes, enc('ICC_PROFILE')), hasBytes(out.bytes, enc('JFIF')), hasBytes(out.bytes, enc('comentario'))]).toEqual([false, false, false, false]);
    expect([...out.bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...out.bytes.slice(-2)]).toEqual([0xff, 0xd9]);
    expect(hasBytes(out.bytes, [0x12, 0x34, 0xff, 0x00, 0x56])).toBe(true);
  });

  it('[SC-ESC6-083] trunca los bytes posteriores a EOI (polyglot JPEG+ZIP) y rechaza JPEG sin EOI, truncado o sin SOF', () => {
    const out = stripImageMetadata('image/jpeg', jpeg([], enc('PK\x03\x04zip')));
    expect(out.ok && hasBytes(out.bytes, enc('PK'))).toBe(false);
    expect(stripImageMetadata('image/jpeg', jpeg([]).slice(0, 30)).ok).toBe(false);
    expect(stripImageMetadata('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])).ok).toBe(false);
    expect(stripImageMetadata('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2])).ok).toBe(false);
  });

  it('[SC-ESC6-083] conserva el APP14 Adobe (necesario para el color) y descarta los demás APPn', () => {
    const out = stripImageMetadata('image/jpeg', jpeg([seg(0xee, enc('Adobe\0\0\0\0\0\0\0')), seg(0xe1, GPS)]));
    expect(out.ok && hasBytes(out.bytes, enc('Adobe'))).toBe(true);
    expect(out.ok && hasBytes(out.bytes, GPS)).toBe(false);
  });
});

describe('stripImageMetadata WebP (T847): VP8, VP8L, VP8X sin indicadores EXIF/XMP/ICC y ALPH', () => {
  it('[INV-ESC6-015] pone a cero los indicadores ICC, EXIF y XMP de VP8X y elimina los trozos EXIF, XMP e ICCP; conserva ALPH y la imagen', () => {
    const input = riff([vp8x(0x20 | 0x10 | 0x08 | 0x04, 2, 2), wchunk('ICCP', [1, 2]), wchunk('ALPH', [0, 1, 2]), vp8l(2, 2), wchunk('EXIF', GPS), wchunk('XMP ', enc('<x:xmpmeta/>'))]);
    const out = stripImageMetadata('image/webp', input);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.bytes[20]).toBe(0x10);
    expect([hasBytes(out.bytes, GPS), hasBytes(out.bytes, enc('XMP ')), hasBytes(out.bytes, enc('ICCP'))]).toEqual([false, false, false]);
    expect(hasBytes(out.bytes, enc('ALPH'))).toBe(true);
    expect(new DataView(out.bytes.buffer, out.bytes.byteOffset + 4, 4).getUint32(0, true)).toBe(out.bytes.length - 8);
  });

  it('[SC-ESC6-083] rechaza WebP animado (ANIM/ANMF o indicador), RIFF truncado o con tamaño que no cierra, y descarta los bytes tras el RIFF', () => {
    expect(stripImageMetadata('image/webp', riff([vp8x(0x02, 2, 2), wchunk('ANIM', [0, 0, 0, 0, 0, 0]), wchunk('ANMF', new Array(16).fill(0))])).ok).toBe(false);
    expect(stripImageMetadata('image/webp', riff([vp8l(2, 2)]).slice(0, 20)).ok).toBe(false);
    const trailing = Uint8Array.from([...riff([vp8l(2, 2)]), ...enc('PKtrailing')]);
    const out = stripImageMetadata('image/webp', trailing);
    expect(out.ok && hasBytes(out.bytes, enc('PKtrailing'))).toBe(false);
  });
});

describe('límites de tamaño (T847, SC-ESC6-084): megapíxeles, lado y 32 MiB agregados', () => {
  it('[SC-ESC6-084] las constantes son 25 MP, 8192 px y 32 MiB', () => {
    expect([MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, MAX_REFERENCE_AGGREGATE_BYTES]).toEqual([25_000_000, 8192, 33_554_432]);
  });

  it('[SC-ESC6-084] lee las dimensiones de IHDR, SOF y VP8X/VP8L sin decodificar; una imagen de 60000 x 60000 o de lado > 8192 se trata como ausente', () => {
    expect(readImageDimensions('image/png', png([pngChunk('IDAT', IDAT)], 640, 480))).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions('image/jpeg', jpeg([]))).toEqual({ width: 1, height: 1 });
    expect(readImageDimensions('image/webp', riff([vp8x(0, 300, 200), vp8l(300, 200)]))).toEqual({ width: 300, height: 200 });
    expect(stripImageMetadata('image/png', png([pngChunk('IDAT', IDAT)], 60000, 60000)).ok).toBe(false);
    expect(stripImageMetadata('image/png', png([pngChunk('IDAT', IDAT)], 8193, 10)).ok).toBe(false);
    expect(stripImageMetadata('image/png', png([pngChunk('IDAT', IDAT)], 6000, 5000)).ok).toBe(false);
    expect(stripImageMetadata('image/png', png([pngChunk('IDAT', IDAT)], 5000, 5000)).ok).toBe(true);
  });

  it('[SC-ESC6-084][EDGE-ESC6-028] con nueve referencias de 10 MiB solo caben 3 dentro de 32 MiB: se omiten las de menor prioridad (el final) y el intento queda degradado', () => {
    const MiB = 1024 * 1024;
    expect(fitReferencesWithinBudget(new Array(9).fill(10 * MiB))).toEqual({ kept: 3, degraded: true });
    expect(fitReferencesWithinBudget([MiB, MiB])).toEqual({ kept: 2, degraded: false });
    expect(fitReferencesWithinBudget([])).toEqual({ kept: 0, degraded: false });
    expect(fitReferencesWithinBudget([40 * MiB, MiB])).toEqual({ kept: 0, degraded: true });
  });
});

describe('validateGeneratedImage (T848): validación de la salida por firma (REQ-ESC6-035)', () => {
  const okPng = png([pngChunk('IDAT', IDAT)]);
  const LIMIT = 1_000_000;

  it('[SC-ESC6-085] acepta PNG y WebP de un cuadro cuyo tipo declarado coincide con la firma y fija el tipo del servidor', () => {
    expect(validateGeneratedImage('image/png', okPng, LIMIT)).toEqual({ ok: true, mime: 'image/png' });
    expect(validateGeneratedImage('image/webp', riff([vp8l(2, 2)]), LIMIT)).toEqual({ ok: true, mime: 'image/webp' });
  });

  it('[SC-ESC6-085][SC-ESC6-072] termina ERR-SCENE-INVALID-IMAGE: JPEG, tipo declarado distinto de la firma, vacía, APNG, WebP animado, mayor que el tope y más de 25 MP', () => {
    const invalid = { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' };
    expect(validateGeneratedImage('image/png', jpeg([]), LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/webp', okPng, LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/png', new Uint8Array(0), LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/png', png([pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]), pngChunk('IDAT', IDAT)]), LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/webp', riff([vp8x(0x02, 2, 2), wchunk('ANMF', new Array(16).fill(0))]), LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/png', okPng, okPng.length - 1)).toEqual(invalid);
    expect(validateGeneratedImage('image/png', png([pngChunk('IDAT', IDAT)], 6000, 5000), LIMIT)).toEqual(invalid);
  });

  it('[REQ-ESC6-035][EDGE-ESC6-029] los metadatos de procedencia (tEXt/XMP, C2PA/SynthID) NO se tocan: la salida validada no se reescribe y devuelve solo el veredicto', () => {
    const withProvenance = png([pngChunk('caBX', enc('c2pa-manifest')), pngChunk('IDAT', IDAT)]);
    const verdict = validateGeneratedImage('image/png', withProvenance, LIMIT);
    expect(verdict).toEqual({ ok: true, mime: 'image/png' });
    expect(Object.keys(verdict)).not.toContain('bytes');
  });
});
