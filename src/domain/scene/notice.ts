/**
 * Identidad del aviso de consentimiento de la escena (feature 006, REQ-ESC6-026, H-MIF-006-06): constantes del código, NO variables de entorno. Si divergieran por
 * entorno, el consentimiento quedaría inválido. Un cambio de versión del aviso o de proveedor invalida los consentimientos previos (EDGE-ESC6-018).
 *
 * @implements REQ-ESC6-026, REQ-ESC6-023, EDGE-ESC6-018
 */

/** Versión del aviso (Fase 14, T950: '2'; enmienda 2026-11-24, T964: '3' por la biografía enviada al servicio de IA): todo consentimiento anterior queda OUTDATED y se pide de nuevo (D-2, EDGE-ESC6-018). */
export const SCENE_NOTICE_VERSION = '3';
export const SCENE_PROVIDER_ID = 'vertex-gemini-image';
/**
 * Driver `gemini-api` (T895, REQ-ESC6-037; INV-ESC6-014, INV-ESC6-020): proveedor y versión del aviso PROPIOS. Distintos de los de Vertex, así que un consentimiento
 * dado a otro proveedor o a otra versión no sirve y el generador recibe 0 llamadas (EDGE-ESC6-018). El texto del aviso queda en revisión hasta la firma de Neo (REQ-ESC6-026).
 */
export const SCENE_GEMINI_API_PROVIDER_ID = 'gemini-api';
export const SCENE_GEMINI_API_NOTICE_VERSION = 'gemini-api-3';
