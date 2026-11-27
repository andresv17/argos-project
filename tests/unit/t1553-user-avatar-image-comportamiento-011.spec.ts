import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sanitizeUserAvatar, userAvatarMimeOf } from '../../src/domain/images/user-avatar-image.ts';
import { USER_AVATAR_MAX_BYTES } from '../../src/domain/media/user-avatar-limits.ts';

/**
 * H-011-3 (cobertura de ramas, 011 Bloque I): comportamiento de `sanitizeUserAvatar` y `userAvatarMimeOf` (REQ-PRF11-001, SC-011-061, SC-011-062, INV-ARC-001, INV-ARC-002):
 * veredictos TOO_LARGE / TYPE / INVALID, saneado por lista blanca y dimensiones en TODAS las cabeceras declaradas (todos los SOF de un JPEG; VP8X, VP8L y VP8 de un WebP).
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
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IDAT = [...deflateSync(Uint8Array.from([0, 1, 2, 3]))];
const png = (w: number, h: number, extra: number[][] = [], badCrc = false): Uint8Array =>
  Uint8Array.from([...SIG, ...pngChunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0], badCrc), ...extra.flat(), ...pngChunk('IDAT', IDAT), ...pngChunk('IEND', [])]);

const seg = (marker: number, data: number[]): number[] => [0xff, marker, ...[(data.length + 2) >> 8, (data.length + 2) & 255], ...data];
const sof = (w: number, h: number): number[] => seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
const jpeg = (sofs: number[][], middle: number[][] = [], scan: number[] = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a]): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, ...middle.flat(), ...seg(0xdb, new Array(65).fill(1)), ...sofs.flat(), ...seg(0xc4, new Array(17).fill(0)), ...seg(0xda, [1, 1, 0, 0, 63, 0]), ...scan, 0xff, 0xd9]);

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
const vp8 = (w: number, h: number): number[] => wchunk('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8, 1, 2]);
const reason = (b: Uint8Array): string => {
  const v = sanitizeUserAvatar(b);
  return v.ok ? 'OK' : v.reason;
};

describe('sanitizeUserAvatar: tamaño y tipo (SC-011-061)', () => {
  it('rechaza con TOO_LARGE lo que supera el tope antes de mirar la firma', () => {
    expect(reason(new Uint8Array(USER_AVATAR_MAX_BYTES + 1))).toBe('TOO_LARGE');
  });
  it.each([
    ['vacío', new Uint8Array(0)],
    ['SVG', Uint8Array.from(enc('<svg xmlns="http://www.w3.org/2000/svg"/>'))],
    ['PDF', Uint8Array.from(enc('%PDF-1.4 contenido'))],
    ['firma desconocida', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
  ])('responde TYPE para %s', (_n, bytes) => {
    expect(reason(bytes)).toBe('TYPE');
  });
});

describe('sanitizeUserAvatar: PNG', () => {
  it('acepta un PNG cuadrado de 64 y de 1024 y devuelve solo la versión saneada (sin tEXt)', () => {
    const input = png(64, 64, [pngChunk('tEXt', enc('Comment\0secreto'))]);
    const v = sanitizeUserAvatar(input);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.mime).toBe('image/png');
    expect(Buffer.from(v.bytes).includes(Buffer.from(enc('secreto')))).toBe(false);
    expect(reason(png(1024, 1024))).toBe('OK');
  });
  it.each([
    ['no cuadrada', png(64, 128)],
    ['lado menor a 64', png(63, 63)],
    ['lado mayor a 1024', png(1025, 1025)],
    ['CRC corrupto', png(64, 64, [], true)],
    ['truncada', png(64, 64).subarray(0, 20)],
  ])('responde INVALID para PNG %s', (_n, bytes) => {
    expect(reason(bytes)).toBe('INVALID');
  });
});

describe('sanitizeUserAvatar: JPEG (todas las cabeceras SOF)', () => {
  it('acepta un JPEG cuadrado, descarta EXIF y conserva los datos del escaneo con byte relleno y RST', () => {
    const gps = enc('Exif\0\0GPSLatitude=4.7110N');
    const v = sanitizeUserAvatar(jpeg([sof(64, 64)], [seg(0xe1, gps)]));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.mime).toBe('image/jpeg');
    expect(Buffer.from(v.bytes).includes(Buffer.from(gps))).toBe(false);
  });
  it('acepta dos SOF iguales y rechaza dos SOF con lados distintos (miniatura que difiere)', () => {
    expect(reason(jpeg([sof(128, 128), sof(128, 128)]))).toBe('OK');
    expect(reason(jpeg([sof(128, 128), sof(64, 64)]))).toBe('INVALID');
    expect(reason(jpeg([sof(128, 128), sof(128, 64)]))).toBe('INVALID');
  });
  it('rechaza JPEG no cuadrado, fuera de rango o sin EOI', () => {
    expect(reason(jpeg([sof(100, 64)]))).toBe('INVALID');
    expect(reason(jpeg([sof(2000, 2000)]))).toBe('INVALID');
    const sinEoi = jpeg([sof(64, 64)]);
    expect(reason(sinEoi.subarray(0, sinEoi.length - 2))).toBe('INVALID');
  });
});

describe('sanitizeUserAvatar: WebP (VP8X, VP8L y VP8)', () => {
  it('acepta VP8L y VP8 cuadrados', () => {
    expect(reason(riff([vp8l(256, 256)]))).toBe('OK');
    expect(reason(riff([vp8(256, 256)]))).toBe('OK');
  });
  it('acepta VP8X + ALPH + VP8L coherentes y limpia los indicadores EXIF/XMP/ICC', () => {
    const v = sanitizeUserAvatar(riff([vp8x(0x2c | 0x10, 128, 128), wchunk('ALPH', [0, 1]), vp8l(128, 128), wchunk('EXIF', [1, 2, 3, 4])]));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.bytes[20]! & (0x20 | 0x08 | 0x04)).toBe(0);
    expect(Buffer.from(v.bytes).includes(Buffer.from(enc('EXIF')))).toBe(false);
  });
  it('rechaza un lienzo VP8X que difiere del marco VP8L o VP8', () => {
    expect(reason(riff([vp8x(0, 128, 128), vp8l(64, 64)]))).toBe('INVALID');
    expect(reason(riff([vp8x(0, 128, 128), vp8(64, 64)]))).toBe('INVALID');
  });
  it('rechaza animados, no cuadrados, fuera de rango, VP8L sin firma y WebP sin imagen', () => {
    expect(reason(riff([vp8x(0x02, 128, 128), vp8l(128, 128)]))).toBe('INVALID');
    expect(reason(riff([vp8l(128, 64)]))).toBe('INVALID');
    expect(reason(riff([vp8l(32, 32)]))).toBe('INVALID');
    expect(reason(riff([wchunk('VP8L', [0x00, 1, 2, 3, 4, 5, 6, 7])]))).toBe('INVALID');
    expect(reason(riff([wchunk('EXIF', [1, 2, 3, 4])]))).toBe('INVALID');
  });
});

describe('userAvatarMimeOf: tipo por FIRMA (Trinity H-5)', () => {
  it('devuelve el tipo de PNG, JPEG y WebP y null para PDF, vacío y desconocido', () => {
    expect(userAvatarMimeOf(png(64, 64))).toBe('image/png');
    expect(userAvatarMimeOf(jpeg([sof(64, 64)]))).toBe('image/jpeg');
    expect(userAvatarMimeOf(riff([vp8l(64, 64)]))).toBe('image/webp');
    expect(userAvatarMimeOf(Uint8Array.from(enc('%PDF-1.7')))).toBeNull();
    expect(userAvatarMimeOf(new Uint8Array(0))).toBeNull();
    expect(userAvatarMimeOf(Uint8Array.from([9, 9, 9, 9]))).toBeNull();
  });
});
