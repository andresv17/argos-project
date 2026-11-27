/**
 * Miniatura de la foto del hogar generada en el cliente con canvas (feature 011, T1539; REQ-HOG11-003, D11-10 = C): «Ver foto» descarga el objeto una sola vez,
 * bajo demanda, y lo reduce a un lado máximo de `THUMBNAIL_MAX_PX`. Sin librería de imagen nueva. El valor del tope vive solo aquí (INV-ARCH-006).
 *
 * @implements REQ-HOG11-003
 */

/** Lado máximo, en píxeles, de la miniatura de la foto del hogar (REQ-HOG11-003). */
export const THUMBNAIL_MAX_PX = 96;
const THUMBNAIL_QUALITY = 0.8;

export interface ThumbnailSource {
  readonly width: number;
  readonly height: number;
  /** Codifica la imagen redibujada a `width` x `height`; `null` si el navegador no puede. */
  encode(width: number, height: number, type: string, quality: number): Promise<Blob | null>;
}
export interface ThumbnailPort {
  /** `null` si el navegador no puede decodificar el archivo. */
  decode(file: Blob): Promise<ThumbnailSource | null>;
}

/** Tamaño que cabe en `max` x `max` conservando la proporción; nunca amplía. */
export function fitWithin(width: number, height: number, max: number = THUMBNAIL_MAX_PX): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Miniatura JPEG de `file` (lado ≤ `THUMBNAIL_MAX_PX`) o `null` si no se pudo decodificar o codificar. */
export async function makeThumbnail(file: Blob, port: ThumbnailPort): Promise<Blob | null> {
  const source = await port.decode(file);
  if (source === null) return null;
  const size = fitWithin(source.width, source.height);
  const blob = await source.encode(size.width, size.height, 'image/jpeg', THUMBNAIL_QUALITY);
  return blob !== null && blob.type === 'image/jpeg' ? blob : null;
}

/** Puerto real del navegador: `createImageBitmap` con orientación EXIF y un `canvas` fuera de pantalla. */
export function browserThumbnailPort(): ThumbnailPort {
  return {
    async decode(file) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width, height } = bitmap;
        return {
          width,
          height,
          encode: (w, h, type, quality) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const context = canvas.getContext('2d');
            if (context === null) return Promise.resolve(null);
            context.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
            return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
          },
        };
      } catch {
        return null;
      }
    },
  };
}
