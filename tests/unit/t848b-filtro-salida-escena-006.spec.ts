import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { validateGeneratedImage } from '../../src/infrastructure/adapters/image-metadata-stripper.ts';

/**
 * H-ORA-F6-A (006, Fase 6): `validateGeneratedImage` REESCRIBE la salida del proveedor por lista blanca y devuelve los bytes que se publican (antes de `put`).
 * PNG conserva IHDR, PLTE, IDAT, IEND, tRNS, caBX (C2PA) y el iTXt «XML:com.adobe.xmp» (<= 64 KiB); WebP conserva VP8 , VP8L, VP8X (sin indicadores EXIF/ICC), ALPH,
 * XMP  y C2PA. REQ-ESC6-035, INV-ESC6-007; ERR-SCENE-INVALID-IMAGE; N2-03 = A.
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
const chunk = (type: string, data: number[], badCrc = false): number[] => [...u32(data.length), ...enc(type), ...data, ...u32(badCrc ? 1 : crc32([...enc(type), ...data]))];
const IDAT = [...deflateSync(Uint8Array.from([0, 1, 2, 3]))];
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (middle: number[][], tail: number[] = []): Uint8Array =>
  Uint8Array.from([...SIG, ...chunk('IHDR', [...u32(1), ...u32(1), 8, 2, 0, 0, 0]), ...middle.flat(), ...chunk('IEND', []), ...tail]);
const typesOf = (b: Uint8Array): string[] => {
  const out: string[] = [];
  for (let at = 8; at < b.length; ) {
    out.push(new TextDecoder().decode(b.slice(at + 4, at + 8)));
    at += 12 + new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
  }
  return out;
};
const has = (h: Uint8Array, s: string): boolean => Buffer.from(h).includes(Buffer.from(s));
const XMP_KEY = 'XML:com.adobe.xmp';
const itxt = (keyword: string, text: string): number[] => chunk('iTXt', [...enc(keyword), 0, 0, 0, 0, 0, ...enc(text)]);
const LIMIT = 1_000_000;
const publish = (bytes: Uint8Array, mime = 'image/png') => {
  const v = validateGeneratedImage(mime, bytes, LIMIT);
  if (!v.ok) throw new Error(`rechazada: ${v.code}`);
  return v;
};

describe('validateGeneratedImage (H-ORA-F6-A): PNG por lista blanca', () => {
  it('[REQ-ESC6-035][INV-ESC6-007] la salida en modo eco (prompt en tEXt) se publica SIN tEXt ni prompt', () => {
    const echoed = png([chunk('tEXt', enc('prompt\0Place all 2 pets at the sofa')), chunk('IDAT', IDAT)]);
    const v = publish(echoed);
    expect(typesOf(v.bytes)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(has(v.bytes, 'tEXt')).toBe(false);
    expect(has(v.bytes, 'Place all 2 pets')).toBe(false);
  });

  it('[N2-03 = A] conserva caBX (C2PA), tRNS, PLTE y el iTXt XMP exacto; descarta zTXt, otro iTXt, eXIf, tIME, iCCP, sRGB, gAMA, cHRM, pHYs y privados', () => {
    const v = publish(
      png([
        chunk('PLTE', [0, 0, 0]),
        chunk('tRNS', [0]),
        chunk('zTXt', [97, 0, 0, 1]),
        itxt('Comment', 'prompt oculto'),
        itxt(XMP_KEY, '<x:xmpmeta/>'),
        chunk('eXIf', [1, 2]),
        chunk('tIME', new Array(7).fill(0)),
        chunk('iCCP', [97, 0, 0]),
        chunk('sRGB', [0]),
        chunk('gAMA', [0, 0, 0, 1]),
        chunk('cHRM', new Array(32).fill(0)),
        chunk('pHYs', new Array(9).fill(0)),
        chunk('prVt', [1]),
        chunk('caBX', enc('c2pa-manifest')),
        chunk('IDAT', IDAT),
      ]),
    );
    expect(typesOf(v.bytes)).toEqual(['IHDR', 'PLTE', 'tRNS', 'iTXt', 'caBX', 'IDAT', 'IEND']);
    expect(has(v.bytes, XMP_KEY)).toBe(true);
    expect(has(v.bytes, 'c2pa-manifest')).toBe(true);
    expect(has(v.bytes, 'prompt oculto')).toBe(false);
  });

  it('el XMP de más de 64 KiB, un iTXt con keyword parecida o un trozo crítico desconocido: XMP/keyword se descartan y el crítico desconocido es ERR-SCENE-INVALID-IMAGE', () => {
    const big = publish(png([itxt(XMP_KEY, 'x'.repeat(64 * 1024 + 1)), chunk('IDAT', IDAT)]));
    expect(typesOf(big.bytes)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const near = publish(png([itxt('XML:com.adobe.xmp2', 'a'), itxt('xml:com.adobe.xmp', 'a'), chunk('IDAT', IDAT)]));
    expect(typesOf(near.bytes)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(validateGeneratedImage('image/png', png([chunk('ZZZZ', [1]), chunk('IDAT', IDAT)]), LIMIT)).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
  });

  it('[CRC] un CRC roto, longitudes que no cierran el archivo o falta de IEND terminan ERR-SCENE-INVALID-IMAGE; todo byte posterior a IEND se trunca', () => {
    const invalid = { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' };
    expect(validateGeneratedImage('image/png', png([chunk('IDAT', IDAT), chunk('caBX', enc('m'), true)]), LIMIT)).toEqual(invalid);
    expect(validateGeneratedImage('image/png', png([chunk('tEXt', enc('a\0b'), true), chunk('IDAT', IDAT)]), LIMIT)).toEqual(invalid);
    const good = png([chunk('IDAT', IDAT)]);
    expect(validateGeneratedImage('image/png', good.subarray(0, good.length - 5), LIMIT)).toEqual(invalid);
    const lying = Uint8Array.from([...good.subarray(0, 8), ...u32(0x7fffff), ...good.subarray(12)]);
    expect(validateGeneratedImage('image/png', lying, LIMIT)).toEqual(invalid);
    const trailed = publish(png([chunk('IDAT', IDAT)], enc('<prompt-tras-IEND>')));
    expect(has(trailed.bytes, 'prompt-tras-IEND')).toBe(false);
    expect(typesOf(trailed.bytes).at(-1)).toBe('IEND');
  });
});

const wchunk = (fourcc: string, data: number[]): number[] => [...enc(fourcc), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];
const riff = (chunks: number[][], extra: number[] = []): Uint8Array => {
  const body = [...enc('WEBP'), ...chunks.flat()];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body, ...extra]);
};
const vp8x = (flags: number, w: number, h: number): number[] => wchunk('VP8X', [flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, 0, (h - 1) & 255, ((h - 1) >> 8) & 255, 0]);
const vp8l = (w: number, h: number): number[] => {
  const bits = (w - 1) | ((h - 1) << 14);
  return wchunk('VP8L', [0x2f, ...le32(bits), 0, 0]);
};
const wtypes = (b: Uint8Array): string[] => {
  const out: string[] = [];
  for (let at = 12; at < b.length; ) {
    const size = new DataView(b.buffer, b.byteOffset + at + 4, 4).getUint32(0, true);
    out.push(new TextDecoder().decode(b.slice(at, at + 4)));
    at += 8 + size + (size & 1);
  }
  return out;
};

describe('validateGeneratedImage (H-ORA-F6-A): WebP por lista blanca', () => {
  it('conserva VP8X (con EXIF e ICC en cero), VP8L, ALPH, XMP  y C2PA; descarta EXIF, ICCP y el resto, y trunca lo posterior', () => {
    const v = publish(
      riff(
        [vp8x(0x20 | 0x08 | 0x04 | 0x10, 2, 2), wchunk('ICCP', [1, 2]), wchunk('ALPH', [0, 1]), vp8l(2, 2), wchunk('EXIF', enc('prompt-en-exif')), wchunk('XMP ', enc('<x:xmpmeta/>')), wchunk('C2PA', enc('c2pa')), wchunk('JUNK', [9])],
        enc('basura-final'),
      ),
      'image/webp',
    );
    expect(wtypes(v.bytes)).toEqual(['VP8X', 'ALPH', 'VP8L', 'XMP ', 'C2PA']);
    const flagsAt = 12 + 8;
    expect([v.bytes[flagsAt]! & 0x20, v.bytes[flagsAt]! & 0x08, v.bytes[flagsAt]! & 0x10]).toEqual([0, 0, 0x10]);
    expect(has(v.bytes, 'prompt-en-exif')).toBe(false);
    expect(has(v.bytes, 'basura-final')).toBe(false);
    expect(new DataView(v.bytes.buffer, v.bytes.byteOffset + 4, 4).getUint32(0, true)).toBe(v.bytes.length - 8);
  });

  it('un WebP simple (VP8L solo) se conserva y un RIFF con longitudes que no cierran es ERR-SCENE-INVALID-IMAGE', () => {
    expect(wtypes(publish(riff([vp8l(2, 2)]), 'image/webp').bytes)).toEqual(['VP8L']);
    const broken = riff([vp8l(2, 2), [...enc('XMP '), ...le32(500), 1, 2]]);
    expect(validateGeneratedImage('image/webp', broken, LIMIT)).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
  });
});
