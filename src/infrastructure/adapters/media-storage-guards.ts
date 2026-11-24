/**
 * Comprobaciones comunes de los adaptadores de `MediaStoragePort`: clave de objeto, caducidad y nombre neutro. Los mensajes no repiten
 * el valor rechazado (NFR-ALM-002).
 *
 * @implements INV-ARC-003, INV-ARC-004, REQ-ARC-003, NFR-ALM-002
 */

import { isMediaObjectKey } from '../../domain/media/index.ts';

export const MIN_SIGNED_URL_TTL_SECONDS = 30;
export const MAX_SIGNED_URL_TTL_SECONDS = 900;
const NEUTRAL_FILENAME = /^[A-Za-z0-9]{1,16}\.[a-z0-9]{1,8}$/;
/** Nombre fijo de la descarga de la escena (REQ-UX8-002, 006 3.5.0): sin nombre de mascota ni de hogar. */
const DOWNLOAD_FILENAME = /^argos-hogar-\d{4}-\d{2}-\d{2}\.(?:png|jpg|webp)$/;

export function assertMediaKey(key: string): void {
  if (!isMediaObjectKey(key)) throw new RangeError('Clave de medio no válida.');
}

/** Mínimo de la superficie pública del enlace veterinario (EDGE-005-23): `X-Goog-Expires` nunca es 0. */
export const MIN_PUBLIC_SIGNED_URL_TTL_SECONDS = 1;

export function assertTtlSeconds(ttlSeconds: number, allowShortTtl = false): void {
  const min = allowShortTtl ? MIN_PUBLIC_SIGNED_URL_TTL_SECONDS : MIN_SIGNED_URL_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < min || ttlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new RangeError(`Caducidad de URL firmada fuera de ${min}-900 segundos.`);
  }
}

/** Nombre neutro `foto.jpg`, `archivo.pdf`: letras, dígitos y una extensión; nunca el nombre original (D-14 A). */
export function assertNeutralFilename(filename: string, disposition: 'inline' | 'attachment' = 'inline'): void {
  const pattern = disposition === 'attachment' ? DOWNLOAD_FILENAME : NEUTRAL_FILENAME;
  if (!pattern.test(filename)) throw new RangeError('Nombre de URL firmada no neutro.');
}

/** Valor de `response-content-disposition` de la solicitud (`inline` por omisión). */
export function contentDispositionOf(request: { readonly filename: string; readonly disposition?: 'inline' | 'attachment' }): string {
  return `${request.disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${request.filename}"`;
}

/** Prefijo de listado: vacío no se admite; solo `pets/`, `scenes/` y `households/` con sus UUID y la carpeta fija de cada uno (INV-ARC-003). */
const LIST_PREFIXES: readonly RegExp[] = [
  /^pets\/(?:[0-9a-f-]{1,36}(?:\/(?:files|photos|avatar)?(?:\/[0-9a-f-]{0,36})?)?)?$/,
  /^scenes\/(?:[0-9a-f-]{1,36}(?:\/(?:images)?(?:\/[0-9a-f-]{0,36})?)?)?$/,
  /^households\/(?:[0-9a-f-]{1,36}(?:\/(?:photo)?(?:\/[0-9a-f-]{0,36})?)?)?$/,
];
export function assertListPrefix(prefix: string): void {
  if (!LIST_PREFIXES.some((pattern) => pattern.test(prefix))) throw new RangeError('Prefijo de medios no válido.');
}
