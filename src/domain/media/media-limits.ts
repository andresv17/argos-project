/**
 * Constantes de dominio de medios (REQ-AVA-001, REQ-ALB-001): tope fijo del avatar y tamaño de página del álbum.
 * Los topes configurables (`ARGOS_MEDIA_*`) los entrega la composición, nunca el dominio (INV-ARCH-006).
 *
 * @implements REQ-AVA-001, REQ-ALB-001, INV-ALB-001
 */

/** Tamaño máximo del avatar: 512 KiB (REQ-AVA-001, K-09: sin validar dimensiones). */
export const AVATAR_MAX_BYTES = 524_288;

/** Elementos por página del álbum (REQ-ALB-001, INV-ALB-001). */
export const MEDIA_PAGE_SIZE = 24;
