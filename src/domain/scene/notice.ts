/**
 * Identidad del aviso de consentimiento de la escena (feature 006, REQ-ESC6-026, H-MIF-006-06): constantes del código, NO variables de entorno. Si divergieran por
 * entorno, el consentimiento quedaría inválido. Un cambio de versión del aviso o de proveedor invalida los consentimientos previos (EDGE-ESC6-018).
 *
 * @implements REQ-ESC6-026, REQ-ESC6-023, EDGE-ESC6-018
 */

export const SCENE_NOTICE_VERSION = '1';
export const SCENE_PROVIDER_ID = 'vertex-gemini-image';
