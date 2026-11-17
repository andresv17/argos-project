/**
 * Lógica de presentación de los medios, sin React: tipos aceptados, textos de error, renovación proactiva de la URL firmada y paginación del álbum.
 *
 * @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, INV-ARC-004
 */
import { ERROR_CATALOG, type ErrorCode } from '../../generated/v31/errors/error-codes.ts';
import type { MediaAccess } from './media-api.ts';

/** `accept` del selector de fotos (REQ-ARC-001, SC-ALM-032) y del de archivos (fotos y PDF). */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const FILE_ACCEPT = `${PHOTO_ACCEPT},application/pdf`;
/** Texto del 415 con la lista de tipos permitidos. */
export const ALLOWED_TYPES_MESSAGE = 'Tipo de archivo no permitido. Tipos permitidos: JPEG, PNG, WebP y PDF (las fotos, solo JPEG, PNG o WebP).';
const GENERIC_MESSAGE = ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].detailTemplate;
const OVERRIDES: Readonly<Record<string, string>> = {
  'ERR-MEDIA-TYPE-NOT-ALLOWED': ALLOWED_TYPES_MESSAGE,
  'ERR-MEDIA-TOO-LARGE': 'El archivo supera el máximo de 10 MB.',
};
const isCode = (code: string): code is ErrorCode => Object.prototype.hasOwnProperty.call(ERROR_CATALOG, code);

/** Texto para la persona: el del catálogo 3.1.0; el 415 lista los tipos permitidos. Un código desconocido usa el mensaje genérico. */
export function mediaProblemMessage(code: string | undefined): string {
  if (code === undefined) return GENERIC_MESSAGE;
  return OVERRIDES[code] ?? (isCode(code) ? ERROR_CATALOG[code].detailTemplate : GENERIC_MESSAGE);
}

/** Retardo de la renovación: el 80 % del tiempo entre la obtención de la URL y `expiresAt` (SC-ALM-032); nunca negativo. */
export function renewalDelayMs(obtainedAtMs: number, expiresAtMs: number): number {
  return Math.max(0, Math.floor((expiresAtMs - obtainedAtMs) * 0.8));
}

const RETRY_DELAY_MS = 2_000;

export interface AccessRenewerOptions {
  readonly fetchAccess: () => Promise<MediaAccess>;
  readonly onUrl: (access: MediaAccess) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * Mantiene vigente la URL firmada de un visor: la pide, la publica y programa su renovación al 80 % de `expiresAt`. Si una renovación falla reintenta una
 * sola vez a los 2 s; si vuelve a fallar informa el error y no pide más. `stop` cancela lo pendiente.
 */
export function createAccessRenewer({ fetchAccess, onUrl, onError }: AccessRenewerOptions): { start(): Promise<void>; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  async function obtain(retriesLeft: number): Promise<void> {
    if (stopped) return;
    try {
      const access = await fetchAccess();
      if (stopped) return;
      onUrl(access);
      timer = setTimeout(() => void obtain(1), renewalDelayMs(Date.now(), Date.parse(access.expiresAt)));
    } catch (error) {
      if (stopped) return;
      if (retriesLeft > 0) timer = setTimeout(() => void obtain(retriesLeft - 1), RETRY_DELAY_MS);
      else onError(error);
    }
  }
  return {
    start: () => obtain(0),
    stop: () => {
      stopped = true;
      clear();
    },
  };
}

export const ALBUM_PAGE_SIZE = 24;
/** Páginas del álbum para un total (al menos 1). */
export const albumPageCount = (total: number): number => Math.max(1, Math.ceil(total / ALBUM_PAGE_SIZE));

/** Tamaño legible: KB con un decimal por debajo de 1 MB, MB con un decimal por encima. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1).replace('.', ',')} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
