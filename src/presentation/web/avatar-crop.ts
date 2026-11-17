/**
 * Recortador de avatar (REQ-AVA-002, SC-ALM-019): lógica pura de la geometría del recorte y de la exportación. El cliente exporta un cuadrado de 512×512 px:
 * WebP si `canvas.toBlob` produce `image/webp` y JPEG (calidad 0,85) en caso contrario (Safari). El servidor no procesa imágenes.
 *
 * El recorte es siempre un cuadrado dentro de la imagen: lado = lado menor / zoom (zoom 1..4) y centro acotado para no salir de ella.
 *
 * @implements REQ-AVA-002
 */

export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_JPEG_QUALITY = 0.85;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Paso de las flechas, como fracción del lado del recorte. */
const KEY_STEP = 0.05;
const ZOOM_FACTOR = 1.25;

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}
/** Zoom y centro del recorte en píxeles de la imagen original. */
export interface CropState {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
}
export interface CropSquare {
  readonly sx: number;
  readonly sy: number;
  readonly side: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const sideOf = (size: ImageSize, zoom: number): number => Math.min(size.width, size.height) / zoom;

/** Recorte inicial: el mayor cuadrado centrado. */
export function initialCrop(size: ImageSize): CropState {
  return { zoom: MIN_ZOOM, centerX: size.width / 2, centerY: size.height / 2 };
}

/** Normaliza el estado: zoom dentro de 1..4 y centro tal que el cuadrado no salga de la imagen. */
function normalize(size: ImageSize, state: CropState): CropState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const half = sideOf(size, zoom) / 2;
  return { zoom, centerX: clamp(state.centerX, half, size.width - half), centerY: clamp(state.centerY, half, size.height - half) };
}

/** Cuadrado de origen (esquina y lado) que se dibuja en el lienzo de salida. */
export function cropSquare(size: ImageSize, state: CropState): CropSquare {
  const normalized = normalize(size, state);
  const side = sideOf(size, normalized.zoom);
  return { sx: normalized.centerX - side / 2, sy: normalized.centerY - side / 2, side };
}

/** Teclado (REQ-AVA-002): flechas mueven el recorte un 5 % del lado; `+`/`=` y `-` cambian el zoom. Otra tecla devuelve el mismo objeto. */
export function applyCropKey(size: ImageSize, state: CropState, key: string): CropState {
  const step = sideOf(size, state.zoom) * KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return normalize(size, { ...state, centerX: state.centerX - step });
    case 'ArrowRight':
      return normalize(size, { ...state, centerX: state.centerX + step });
    case 'ArrowUp':
      return normalize(size, { ...state, centerY: state.centerY - step });
    case 'ArrowDown':
      return normalize(size, { ...state, centerY: state.centerY + step });
    case '+':
    case '=':
      return normalize(size, { ...state, zoom: state.zoom * ZOOM_FACTOR });
    case '-':
    case '_':
      return normalize(size, { ...state, zoom: state.zoom / ZOOM_FACTOR });
    default:
      return state;
  }
}

/** Arrastre de `dx`,`dy` píxeles de pantalla sobre una vista cuadrada de `viewportPx`: la imagen sigue al gesto, el centro va en sentido contrario. */
export function dragCrop(size: ImageSize, state: CropState, dx: number, dy: number, viewportPx: number): CropState {
  const ratio = sideOf(size, state.zoom) / viewportPx;
  return normalize(size, { ...state, centerX: state.centerX - dx * ratio, centerY: state.centerY - dy * ratio });
}

/** Lienzo de salida: dibuja el cuadrado de origen escalado a `outputSize` y lo codifica. */
export interface AvatarCanvasPort {
  drawSquare(sx: number, sy: number, side: number, outputSize: number): void;
  toBlob(type: string, quality?: number): Promise<Blob | null>;
}

export class AvatarExportError extends Error {
  constructor() {
    super('No se pudo preparar la foto. Prueba con otra imagen.');
    this.name = 'AvatarExportError';
  }
}

export interface AvatarExport {
  readonly blob: Blob;
  readonly mime: 'image/webp' | 'image/jpeg';
}

/** Exporta el recorte: WebP si el navegador lo codifica; si no, JPEG con calidad 0,85; si tampoco, `AvatarExportError`. */
export async function exportAvatar(canvas: AvatarCanvasPort, square: CropSquare): Promise<AvatarExport> {
  canvas.drawSquare(square.sx, square.sy, square.side, AVATAR_OUTPUT_SIZE);
  const webp = await canvas.toBlob('image/webp');
  if (webp !== null && webp.type === 'image/webp') return { blob: webp, mime: 'image/webp' };
  const jpeg = await canvas.toBlob('image/jpeg', AVATAR_JPEG_QUALITY);
  if (jpeg !== null && jpeg.type === 'image/jpeg') return { blob: jpeg, mime: 'image/jpeg' };
  throw new AvatarExportError();
}
