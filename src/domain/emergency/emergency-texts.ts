/**
 * Textos de la ficha QR (Feature 012, Bloque D, #32; `emergency-card.schema.json` 0.3.0 `x-sdd-constants.TEXTS`, versión 0.1.0 DRAFT; validación legal externa abierta en DEUDA-012-LEGAL-DISPUTAS-QR).
 * Fuente única en código para la SPA (T1676) y las pruebas. `allergiesEditorHelp` es el texto del editor de alergias de `/maggie` m-6 (T1662).
 *
 * @implements REQ-QR12-002, REQ-QR12-006, REQ-QR12-009, T1662
 */
export const EMERGENCY_TEXTS = {
  version: '0.1.0',
  allergiesEditorHelp: 'Anota solo alergias confirmadas o con riesgo. Tipi no verifica esta información con un veterinario. No escribas nombres ni datos de otras personas.',
  phoneOptInLabel: 'Mostrar mi teléfono en la ficha QR de {mascota}',
} as const;
