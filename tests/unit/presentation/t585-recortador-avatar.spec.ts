/**
 * T585 [US5] recortador de avatar (REQ-AVA-002, SC-ALM-019): geometría del recorte (cuadrado dentro de la imagen, zoom, arrastre y teclado) y exportación a
 * 512×512 (WebP, o JPEG calidad 0,85 si `toBlob` no codifica WebP: Safari). Lógica pura con un lienzo falso; la ejecución en Chromium y WebKit reales
 * (SC-ALM-019) queda pendiente y se declara (E2E fuera de esta pasada).
 */
import { describe, expect, it } from 'vitest';
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_OUTPUT_SIZE,
  AvatarExportError,
  applyCropKey,
  cropSquare,
  dragCrop,
  exportAvatar,
  initialCrop,
  type AvatarCanvasPort,
} from '../../../src/presentation/web/avatar-crop.ts';

const WIDE = { width: 1600, height: 1000 };

class FakeCanvas implements AvatarCanvasPort {
  readonly drawn: number[][] = [];
  readonly requested: Array<[string, number | undefined]> = [];
  constructor(private readonly encodes: readonly string[]) {}
  drawSquare(sx: number, sy: number, side: number, outputSize: number): void {
    this.drawn.push([sx, sy, side, outputSize]);
  }
  async toBlob(type: string, quality?: number): Promise<Blob | null> {
    this.requested.push([type, quality]);
    return this.encodes.includes(type) ? new Blob(['x'], { type }) : null;
  }
}

describe('T585 geometría del recorte', () => {
  it('[REQ-AVA-002] el recorte inicial es el mayor cuadrado centrado de una foto rectangular', () => {
    expect(cropSquare(WIDE, initialCrop(WIDE))).toEqual({ sx: 300, sy: 0, side: 1000 });
    expect(cropSquare({ width: 800, height: 1200 }, initialCrop({ width: 800, height: 1200 }))).toEqual({ sx: 0, sy: 200, side: 800 });
  });

  it('[REQ-AVA-002] con zoom 2 el lado es la mitad y el cuadrado nunca sale de la imagen', () => {
    const zoomed = { ...initialCrop(WIDE), zoom: 2 };
    expect(cropSquare(WIDE, zoomed)).toEqual({ sx: 550, sy: 250, side: 500 });
    expect(cropSquare(WIDE, { zoom: 2, centerX: -50, centerY: 5000 })).toEqual({ sx: 0, sy: 500, side: 500 });
  });

  it('[REQ-AVA-002] el teclado mueve el recorte un 5 % del lado con las flechas, hace zoom con + y - dentro de 1..4 y respeta los bordes', () => {
    const start = { ...initialCrop(WIDE), zoom: 2 };
    expect(cropSquare(WIDE, applyCropKey(WIDE, start, 'ArrowRight')).sx).toBe(575);
    expect(cropSquare(WIDE, applyCropKey(WIDE, start, 'ArrowLeft')).sx).toBe(525);
    expect(cropSquare(WIDE, applyCropKey(WIDE, start, 'ArrowUp')).sy).toBe(225);
    expect(cropSquare(WIDE, applyCropKey(WIDE, start, 'ArrowDown')).sy).toBe(275);
    expect(applyCropKey(WIDE, start, '+').zoom).toBeGreaterThan(2);
    expect(applyCropKey(WIDE, start, '-').zoom).toBeLessThan(2);
    expect([applyCropKey(WIDE, initialCrop(WIDE), '-').zoom, applyCropKey(WIDE, { ...start, zoom: 4 }, '+').zoom]).toEqual([1, 4]);
    expect(applyCropKey(WIDE, start, 'a')).toBe(start);
    let edge = start;
    for (let n = 0; n < 200; n += 1) edge = applyCropKey(WIDE, edge, 'ArrowRight');
    expect(cropSquare(WIDE, edge).sx).toBe(1100);
  });

  it('[REQ-AVA-002] arrastrar la vista previa desplaza la imagen en sentido contrario al gesto', () => {
    const start = { ...initialCrop(WIDE), zoom: 2 };
    // Vista de 256 px con zoom 2: 1 px de pantalla = 500/256 px de imagen.
    const moved = dragCrop(WIDE, start, 128, -64, 256);
    expect(cropSquare(WIDE, moved)).toEqual({ sx: 300, sy: 375, side: 500 });
  });
});

describe('T585 exportación del avatar: 512×512 WebP o JPEG de respaldo', () => {
  it('[SC-ALM-019] dibuja el cuadrado en 512×512 y entrega WebP cuando el navegador lo codifica', async () => {
    const canvas = new FakeCanvas(['image/webp', 'image/jpeg']);
    const result = await exportAvatar(canvas, { sx: 300, sy: 0, side: 1000 });
    expect([canvas.drawn, canvas.requested, result.mime, result.blob.type, AVATAR_OUTPUT_SIZE]).toEqual([[[300, 0, 1000, 512]], [['image/webp', undefined]], 'image/webp', 'image/webp', 512]);
  });

  it('[SC-ALM-019] si toBlob no produce image/webp (Safari) reintenta como JPEG con calidad 0,85', async () => {
    const canvas = new FakeCanvas(['image/jpeg']);
    const result = await exportAvatar(canvas, { sx: 0, sy: 0, side: 600 });
    expect([canvas.requested, result.mime, AVATAR_JPEG_QUALITY]).toEqual([[['image/webp', undefined], ['image/jpeg', 0.85]], 'image/jpeg', 0.85]);
  });

  it('[REQ-AVA-002] si ningún formato se codifica se informa el error y no se entrega archivo', async () => {
    await expect(exportAvatar(new FakeCanvas([]), { sx: 0, sy: 0, side: 600 })).rejects.toBeInstanceOf(AvatarExportError);
  });
});
