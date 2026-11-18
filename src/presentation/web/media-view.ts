/**
 * Lógica de presentación de los medios, sin React: tipos aceptados, textos de error, renovación proactiva de la URL firmada y paginación del álbum.
 *
 * @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, INV-ARC-004
 */
import { ERROR_CATALOG, type ErrorCode } from '../../generated/errors/error-codes.ts';

/** `accept` del selector de fotos (REQ-ARC-001, SC-ALM-032) y del de archivos (fotos y PDF). */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const FILE_ACCEPT = `${PHOTO_ACCEPT},application/pdf`;
/** Texto del 415 con la lista de tipos permitidos. */
export const ALLOWED_TYPES_MESSAGE = 'Tipo de archivo no permitido. Tipos permitidos: JPEG, PNG, WebP y PDF (las fotos, solo JPEG, PNG o WebP).';
const GENERIC_MESSAGE = ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].detailTemplate;
/** Textos de los códigos `ERR-MEDIA-*` del catálogo 3.1.0 (la SPA importa el catálogo 3.0.0, que no los trae; `t611-contrato-medios.spec.ts` los compara). */
export const MEDIA_MESSAGES: Readonly<Record<string, string>> = {
  'ERR-MEDIA-NOT-FOUND': 'El archivo no existe.',
  'ERR-MEDIA-QUOTA-EXCEEDED': 'Se alcanzó el límite de almacenamiento de archivos de tus mascotas.',
  'ERR-MEDIA-STORAGE-UNAVAILABLE': 'El almacenamiento de archivos no responde. Intenta de nuevo en unos minutos.',
  'ERR-MEDIA-TOO-LARGE': 'El archivo supera el máximo de 10 MB.',
  'ERR-MEDIA-TYPE-NOT-ALLOWED': ALLOWED_TYPES_MESSAGE,
};
const isCode = (code: string): code is ErrorCode => Object.prototype.hasOwnProperty.call(ERROR_CATALOG, code);

/** Texto para la persona: el del catálogo 3.1.0; el 415 lista los tipos permitidos. Un código desconocido usa el mensaje genérico. */
export function mediaProblemMessage(code: string | undefined): string {
  if (code === undefined) return GENERIC_MESSAGE;
  return MEDIA_MESSAGES[code] ?? (isCode(code) ? ERROR_CATALOG[code].detailTemplate : GENERIC_MESSAGE);
}

export const ALBUM_PAGE_SIZE = 24;
/** Páginas del álbum para un total (al menos 1). */
export const albumPageCount = (total: number): number => Math.max(1, Math.ceil(total / ALBUM_PAGE_SIZE));

/** Tamaño legible: KB con un decimal por debajo de 1 MB, MB con un decimal por encima. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1).replace('.', ',')} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
