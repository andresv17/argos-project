/**
 * Reexportación del normalizador de metadatos de imagen (feature 006, T848). La implementación vive ahora en `src/domain/images/image-metadata-stripper.ts` (función pura, sin
 * dependencias) para que los casos de uso de `application` (006 y la foto de «Acerca de» de la 010, T1430) la usen sin importar de `infrastructure` (INV-ARCH-004).
 *
 * @implements REQ-ESC6-027, REQ-ESC6-035, INV-ESC6-015, INV-ACE10-001
 */
export * from '../../domain/images/image-metadata-stripper.ts';
