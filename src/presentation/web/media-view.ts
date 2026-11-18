/**
 * Lógica de presentación de los medios, sin React: tipos aceptados, textos de error, renovación proactiva de la URL firmada y paginación del álbum.
 *
 * @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, INV-ARC-004, REQ-ALB5-002, REQ-ALB5-005, REQ-CLI5-001, SC-005-007, SC-005-008
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
/**
 * Textos de los códigos `ERR-MEDIA-*` del catálogo incremental de la 005 (3.3.0). Aparte de `MEDIA_MESSAGES` porque ese mapa se compara con el catálogo 3.1.0 completo;
 * `t725-t726-album-ui.spec.ts` compara este texto con `contracts/errors/error-catalog.json` de la 005 (la SPA no puede importar `generated/v33`, regla de capas).
 */
export const ALBUM_MESSAGES: Readonly<Record<string, string>> = {
  'ERR-MEDIA-ALBUM-LIMIT': 'El álbum de esta mascota está completo. Elimina alguna foto o guarda las fotos médicas en Historial / Archivos.',
};
const isCode = (code: string): code is ErrorCode => Object.prototype.hasOwnProperty.call(ERROR_CATALOG, code);

/** Texto para la persona: el del catálogo 3.1.0; el 415 lista los tipos permitidos. Un código desconocido usa el mensaje genérico. */
export function mediaProblemMessage(code: string | undefined): string {
  if (code === undefined) return GENERIC_MESSAGE;
  return MEDIA_MESSAGES[code] ?? ALBUM_MESSAGES[code] ?? (isCode(code) ? ERROR_CATALOG[code].detailTemplate : GENERIC_MESSAGE);
}

/**
 * Textos del panel «Archivos» de «Historial / Archivos» (T732, `/sati` S2): el 415 y la cuota hablan de archivos clínicos; el resto de códigos usa los textos comunes.
 * La cuota la comparten álbum y archivos (REQ-CLI5-003), por eso el texto remite a «archivos o fotos».
 */
export const CLINICAL_FILES_MESSAGES: Readonly<Record<string, string>> = {
  'ERR-MEDIA-TYPE-NOT-ALLOWED': 'Ese formato no se admite. Usa PDF, JPEG, PNG o WebP.',
  'ERR-MEDIA-QUOTA-EXCEEDED': 'No hay espacio suficiente en tu cuota. Elimina archivos o fotos para liberar espacio.',
};
export const clinicalFilesMessage = (code: string | undefined): string => (code === undefined ? mediaProblemMessage(code) : CLINICAL_FILES_MESSAGES[code] ?? mediaProblemMessage(code));

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
/** Fecha de subida «12 nov 2026» a partir del instante ISO (día UTC; no es la fecha del examen, D5-04). */
export function uploadDateText(iso: string): string {
  const [year = '', month = '', day = ''] = iso.slice(0, 10).split('-');
  const name = MONTHS[Number(month) - 1];
  return name === undefined ? iso.slice(0, 10) : `${Number(day)} ${name} ${year}`;
}

export const ALBUM_PAGE_SIZE = 24;
/** Páginas del álbum para un total (al menos 1). */
export const albumPageCount = (total: number): number => Math.max(1, Math.ceil(total / ALBUM_PAGE_SIZE));

/** Tamaño legible: KB con un decimal por debajo de 1 MB, MB con un decimal por encima. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1).replace('.', ',')} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
