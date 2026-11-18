/**
 * Reexportación de fotos por `canvas` antes del `POST` (T616, D-13 A, SC-ALM-035, REQ-ARC-001): el archivo que recibe el servidor no lleva EXIF ni GPS y
 * conserva la orientación visual (el decodificador aplica la orientación EXIF al dibujar). JPEG sale como JPEG, PNG como PNG y WebP como WebP, o como JPEG si
 * el navegador no codifica WebP. Si el `canvas` no puede decodificar la imagen se informa el error y NUNCA se sube el original. Un PDF no se modifica.
 *
 * @implements REQ-ARC-001
 */

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const JPEG_QUALITY = 0.92;

export type PhotoReexportReason = 'DECODE' | 'ENCODE' | 'TOO_LARGE';

export class PhotoReexportError extends Error {
  constructor(public readonly reason: PhotoReexportReason) {
    super(
      reason === 'DECODE'
        ? 'No se pudo leer la imagen. Prueba con otra foto.'
        : reason === 'ENCODE'
          ? 'No se pudo preparar la foto para subirla. Prueba con otra imagen.'
          : 'La foto preparada supera los 10 MB. Prueba con una más pequeña.',
    );
    this.name = 'PhotoReexportError';
  }
}

/** Imagen decodificada con la orientación ya aplicada. */
export interface DecodedPhoto {
  readonly width: number;
  readonly height: number;
  encode(type: string, quality?: number): Promise<Blob | null>;
}
export interface PhotoCanvasPort {
  /** `null` si el navegador no puede decodificar el archivo. */
  decode(file: Blob): Promise<DecodedPhoto | null>;
}

export interface UploadPayload {
  readonly blob: Blob;
  readonly name: string;
}

const withExtension = (name: string, extension: string): string => `${name.replace(/\.[^./\\]*$/, '')}.${extension}`;

/** Puerto real del navegador: `createImageBitmap` con orientación EXIF y un `canvas` fuera de pantalla. */
export function browserPhotoPort(): PhotoCanvasPort {
  return {
    async decode(file) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (context === null) return null;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return {
          width: canvas.width,
          height: canvas.height,
          encode: (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
        };
      } catch {
        return null;
      }
    },
  };
}

async function encodeAs(photo: DecodedPhoto, type: string, quality?: number): Promise<Blob | null> {
  const blob = await photo.encode(type, quality);
  return blob !== null && blob.type === type ? blob : null;
}

/** Devuelve el archivo a subir: el PDF sin cambios; una foto reexportada por canvas; o lanza `PhotoReexportError` (no se sube nada). */
export async function reexportPhoto(file: File, port: PhotoCanvasPort, maxBytes: number = MEDIA_MAX_BYTES): Promise<UploadPayload> {
  if (file.type === 'application/pdf') return { blob: file, name: file.name };
  const photo = await port.decode(file);
  if (photo === null) throw new PhotoReexportError('DECODE');
  let blob: Blob | null = null;
  let name = file.name;
  if (file.type === 'image/png') blob = await encodeAs(photo, 'image/png');
  else if (file.type === 'image/webp') {
    blob = await encodeAs(photo, 'image/webp');
    if (blob === null) {
      blob = await encodeAs(photo, 'image/jpeg', JPEG_QUALITY);
      name = withExtension(file.name, 'jpg');
    }
  } else blob = await encodeAs(photo, 'image/jpeg', JPEG_QUALITY);
  if (blob === null) throw new PhotoReexportError('ENCODE');
  if (blob.size > maxBytes) throw new PhotoReexportError('TOO_LARGE');
  return { blob, name };
}
