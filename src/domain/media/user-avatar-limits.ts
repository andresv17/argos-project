/**
 * Límites de la foto de perfil de la cuenta (feature 011, `#78`, SC-011-061, INV-ARCH-006): tope de bytes y lado de la imagen cuadrada. `app-config.ts` los reexporta como ÚNICA
 * fuente configurable; la capa de aplicación los toma de aquí porque no importa de `infrastructure` (INV-ARCH-004).
 *
 * @implements REQ-PRF11-001, SC-011-061
 */

/** 512 KiB, medidos sobre el cuerpo recibido y antes de decodificar. */
export const USER_AVATAR_MAX_BYTES = 524_288;
/** Lado mínimo (px) de la imagen cuadrada. */
export const USER_AVATAR_MIN_SIDE = 64;
/** Lado máximo (px); más estricto que `MAX_IMAGE_SIDE = 8192`: el cliente exporta 512 x 512. */
export const USER_AVATAR_MAX_SIDE = 1024;
