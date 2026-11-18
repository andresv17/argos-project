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
export function assertNeutralFilename(filename: string): void {
  if (!NEUTRAL_FILENAME.test(filename)) throw new RangeError('Nombre de URL firmada no neutro.');
}

/** Prefijo de listado: vacío no se admite; solo `pets/` y sus UUID. */
export function assertListPrefix(prefix: string): void {
  if (!/^pets\/(?:[0-9a-f-]{1,36}(?:\/(?:files|photos|avatar)?(?:\/[0-9a-f-]{0,36})?)?)?$/.test(prefix)) throw new RangeError('Prefijo de medios no válido.');
}
