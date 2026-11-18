/**
 * Soporte de los E2E de medios y avatar (T585, T615): fabrica en el navegador imágenes de prueba (mitad roja y mitad azul, para detectar la orientación),
 * les inyecta metadatos reales (EXIF con orientación y GPS en JPEG, `tEXt` en PNG, `EXIF` en WebP) y decodifica en el navegador lo que sale del cliente.
 * Los bytes viajan entre Node y la página como base64.
 *
 * @implements REQ-ARC-001, REQ-AVA-002
 */
import type { Page } from '@playwright/test';

export type Format = 'image/jpeg' | 'image/png' | 'image/webp';

/** Carga una página de la SPA servida por Vite (sin sesión) para poder importar los módulos del cliente. */
export async function openClientPage(page: Page): Promise<void> {
  await page.goto('/login');
}

/** Dibuja `width`×`height` (mitad izquierda roja, derecha azul) y lo codifica en `format`; devuelve `null` si el navegador no codifica ese formato. */
export async function makeImage(page: Page, format: Format, width: number, height: number): Promise<Buffer | null> {
  const base64 = await page.evaluate(
    async ({ format, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, width / 2, height);
      context.fillStyle = '#0000ff';
      context.fillRect(width / 2, 0, width / 2, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.95));
      if (blob === null || blob.type !== format) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { format, width, height },
  );
  return base64 === null ? null : Buffer.from(base64, 'base64');
}

/** Inserta tras el SOI un APP1 EXIF con Orientation (0x0112) y un GPS IFD (latitud de referencia). */
export function jpegWithExif(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(56);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(2, 8);
  // Entrada 1: Orientation, SHORT, 1, valor.
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  // Entrada 2: GPSInfo, LONG, 1, desplazamiento 38.
  tiff.writeUInt16BE(0x8825, 22);
  tiff.writeUInt16BE(4, 24);
  tiff.writeUInt32BE(1, 26);
  tiff.writeUInt32BE(38, 30);
  tiff.writeUInt32BE(0, 34);
  // GPS IFD: una entrada GPSLatitudeRef = "N".
  tiff.writeUInt16BE(1, 38);
  tiff.writeUInt16BE(0x0001, 40);
  tiff.writeUInt16BE(2, 42);
  tiff.writeUInt32BE(2, 44);
  tiff.write('N\0', 48, 'ascii');
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Inserta un fragmento `tEXt` (Comment/«GPS 4.6,-74.0») justo tras IHDR. */
export function pngWithText(png: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from('Comment\0GPS 4.6,-74.0', 'latin1')]);
  const type = Buffer.from('tEXt', 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, body])));
  const chunk = Buffer.concat([length, type, body, crc]);
  const afterIhdr = 8 + 12 + 13;
  return Buffer.concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]);
}

/** Añade un fragmento `EXIF` a un WebP extendido (VP8X) y enciende su bandera; el WebP simple se envuelve antes en un VP8X. */
export function webpWithExif(webp: Buffer, width: number, height: number): Buffer {
  let base = webp;
  if (webp.toString('ascii', 12, 16) !== 'VP8X') {
    const vp8x = Buffer.alloc(18);
    vp8x.write('VP8X', 0, 'ascii');
    vp8x.writeUInt32LE(10, 4);
    vp8x.writeUIntLE(width - 1, 12, 3);
    vp8x.writeUIntLE(height - 1, 15, 3);
    base = Buffer.concat([webp.subarray(0, 12), vp8x, webp.subarray(12)]);
  }
  base = Buffer.from(base);
  base[20] = base[20]! | 0x08; // bandera EXIF del VP8X
  const exifData = Buffer.from('MM\0*\0\0\0\b\0\0\0\0\0\0', 'binary');
  const exif = Buffer.alloc(8 + exifData.length);
  exif.write('EXIF', 0, 'ascii');
  exif.writeUInt32LE(exifData.length, 4);
  exifData.copy(exif, 8);
  const out = Buffer.concat([base, exif]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

/** Medidas y colores de la imagen decodificada con la orientación EXIF aplicada: dimensiones y color en (x%, y%) de las cuatro esquinas del centro. */
export interface Decoded {
  readonly width: number;
  readonly height: number;
  /** RGB en el centro del cuarto izquierdo, derecho, superior e inferior. */
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly top: readonly number[];
  readonly bottom: readonly number[];
}

export async function decodeInPage(page: Page, bytes: Buffer, type: string): Promise<Decoded | null> {
  return page.evaluate(
    async ({ base64, type }) => {
      try {
        const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([raw], { type }), { imageOrientation: 'from-image' });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const at = (fx: number, fy: number): number[] => Array.from(context.getImageData(Math.floor(bitmap.width * fx), Math.floor(bitmap.height * fy), 1, 1).data.slice(0, 3));
        return { width: bitmap.width, height: bitmap.height, left: at(0.25, 0.5), right: at(0.75, 0.5), top: at(0.5, 0.25), bottom: at(0.5, 0.75) };
      } catch {
        return null;
      }
    },
    { base64: bytes.toString('base64'), type },
  );
}

/** Verdadero si los bytes contienen un segmento EXIF (APP1 «Exif»), un `tEXt`/`eXIf`/`iTXt` de PNG o un fragmento `EXIF`/`XMP ` de WebP. */
export function hasMetadata(bytes: Buffer): boolean {
  const text = bytes.toString('latin1');
  return text.includes('Exif\0\0') || text.includes('tEXt') || text.includes('eXIf') || text.includes('iTXt') || text.includes('EXIF') || text.includes('XMP ') || text.includes('http://ns.adobe.com/xap');
}

export const isRed = (rgb: readonly number[]): boolean => rgb[0]! > 200 && rgb[1]! < 60 && rgb[2]! < 60;
export const isBlue = (rgb: readonly number[]): boolean => rgb[2]! > 200 && rgb[0]! < 60 && rgb[1]! < 60;
