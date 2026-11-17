/**
 * T615/T616 [US4] reexportación de fotos por canvas antes del POST (D-13 A, SC-ALM-035, REQ-ARC-001): lógica con puertos falsos de decodificación y
 * codificación. «Sin segmentos EXIF» y «orientación correcta» dependen del navegador real (Chromium y WebKit): esas comprobaciones quedan pendientes y se
 * declaran; aquí se fija el contrato de la función: qué formato sale, qué falla y qué nunca se sube.
 */
import { describe, expect, it } from 'vitest';
import { PhotoReexportError, reexportPhoto, type PhotoCanvasPort } from '../../../src/presentation/web/photo-reexport.ts';

const MIB = 1024 * 1024;

function port(encodes: Record<string, number>, decoded = true): PhotoCanvasPort & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async decode() {
      return decoded
        ? {
            width: 800,
            height: 600,
            async encode(type: string) {
              requested.push(type);
              return type in encodes ? new Blob([new Uint8Array(encodes[type] ?? 0)], { type }) : null;
            },
          }
        : null;
    },
  };
}
const file = (type: string, name: string): File => new File([new Uint8Array(10)], name, { type });

describe('T616 reexportación de fotos (D-13 A)', () => {
  it('[SC-ALM-035] un JPEG sale como JPEG nuevo (sin metadatos) conservando el nombre', async () => {
    const out = await reexportPhoto(file('image/jpeg', 'mi-foto.jpg'), port({ 'image/jpeg': 100 }));
    expect([out.blob.type, out.name]).toEqual(['image/jpeg', 'mi-foto.jpg']);
  });

  it('[SC-ALM-035] un PNG sale como PNG y un WebP como WebP', async () => {
    const png = await reexportPhoto(file('image/png', 'a.png'), port({ 'image/png': 100 }));
    const webp = await reexportPhoto(file('image/webp', 'b.webp'), port({ 'image/webp': 100 }));
    expect([png.blob.type, webp.blob.type]).toEqual(['image/png', 'image/webp']);
  });

  it('[SC-ALM-035] un WebP que el navegador no codifica cae a JPEG y el nombre cambia de extensión', async () => {
    const p = port({ 'image/jpeg': 100 });
    const out = await reexportPhoto(file('image/webp', 'b.webp'), p);
    expect([p.requested, out.blob.type, out.name]).toEqual([['image/webp', 'image/jpeg'], 'image/jpeg', 'b.jpg']);
  });

  it('[SC-ALM-035] una imagen que el canvas no puede decodificar falla con DECODE y no devuelve el original', async () => {
    const error = await reexportPhoto(file('image/jpeg', 'rota.jpg'), port({}, false)).catch((e: unknown) => e);
    expect([error instanceof PhotoReexportError, (error as PhotoReexportError).reason]).toEqual([true, 'DECODE']);
  });

  it('[SC-ALM-035] si ningún formato se codifica falla con ENCODE', async () => {
    const error = await reexportPhoto(file('image/png', 'a.png'), port({})).catch((e: unknown) => e);
    expect((error as PhotoReexportError).reason).toBe('ENCODE');
  });

  it('[REQ-ARC-001] el resultado que supera 10 MiB falla con TOO_LARGE', async () => {
    const error = await reexportPhoto(file('image/png', 'a.png'), port({ 'image/png': 10 * MIB + 1 })).catch((e: unknown) => e);
    expect((error as PhotoReexportError).reason).toBe('TOO_LARGE');
    const ok = await reexportPhoto(file('image/png', 'a.png'), port({ 'image/png': 10 * MIB }));
    expect(ok.blob.size).toBe(10 * MIB);
  });

  it('[SC-ALM-035] un PDF se devuelve sin cambios y sin tocar el canvas', async () => {
    const p = port({});
    const pdf = file('application/pdf', 'carnet.pdf');
    const out = await reexportPhoto(pdf, p);
    expect([out.blob, out.name, p.requested]).toEqual([pdf, 'carnet.pdf', []]);
  });
});
