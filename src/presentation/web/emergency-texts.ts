/**
 * Textos LITERALES de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1676): copia de `x-sdd-constants.TEXTS` de `emergency-card.schema.json` (versión 0.1.0, DRAFT; la validación
 * legal externa sigue en `DEUDA-012-LEGAL-DISPUTAS-QR`). Un test de presentación los compara con el contrato para que no se desvíen. Sin lógica de negocio: solo sustitución de marcadores.
 *
 * @implements REQ-QR12-002, REQ-QR12-004, REQ-QR12-005, REQ-QR12-006
 */
export const EMERGENCY_NOTICE_VERSION = '0.1.0';

export const EMERGENCY_TEXTS = {
  version: '0.1.0',
  allergiesEditorHelp: 'Anota solo alergias confirmadas o con riesgo. Tipi no verifica esta información con un veterinario. No escribas nombres ni datos de otras personas.',
  activationNotice:
    'Cualquier persona que escanee este código verá el nombre de la mascota, sus alergias críticas que tú registraste y, si lo marcaste, tu teléfono. Las alergias se muestran tal cual las escribiste: no incluyas nombres ni datos de otras personas. Verifica que la información sea correcta antes de activarla. Si dejas de cumplir las condiciones, el código se apagará solo.',
  phoneOptInLabel: 'Mostrar mi teléfono en la ficha QR de {mascota}',
  publicHeading: 'Ficha de emergencia de {petName}',
  publicNoAllergies: 'El dueño no registró alergias críticas en esta ficha. Esto no significa que la mascota no tenga alergias.',
  publicFooter:
    'Esta información la registró el dueño de la mascota y puede no estar actualizada. No es un diagnóstico ni una indicación médica. Si la mascota necesita atención, comunícate con su veterinario o con una clínica veterinaria de urgencias.',
  printSheetCaption: 'Escanea para ver datos de emergencia',
} as const;

export const publicHeading = (petName: string): string => EMERGENCY_TEXTS.publicHeading.replace('{petName}', () => petName);
export const phoneOptInLabel = (petName: string): string => EMERGENCY_TEXTS.phoneOptInLabel.replace('{mascota}', () => petName);

/** Textos propios de la interfaz (no son del contrato; los revisa `/sati`). */
export const EMERGENCY_UI = {
  accountPhoneTitle: 'Teléfono de contacto',
  accountPhoneHelp: 'Opcional. Escríbelo con código de país, por ejemplo +573001234567. Solo se muestra en la ficha QR de una mascota si lo marcas allí; no se muestra en ningún otro lugar.',
  accountPhoneSaved: 'Teléfono guardado.',
  accountPhoneRemoved: 'Teléfono borrado.',
  accountPhoneUnavailable: 'No se pudo cargar tu teléfono; recarga la página.',
  allergiesTitle: 'Alergias críticas',
  allergiesLabel: 'Una alergia por línea (hasta 5, máximo 60 caracteres cada una)',
  allergiesSaved: 'Alergias guardadas.',
  allergiesUnavailable: 'No se pudieron cargar las alergias; recarga la página.',
  allergiesAutoOff: 'La ficha QR se apagó porque ya no cumple las condiciones para estar activa.',
  allergiesChangedBy: 'Las alergias críticas cambiaron hace poco.',
  qrTitle: 'Ficha QR de emergencia',
  qrOff: 'La ficha QR está apagada. Nadie puede ver datos de la mascota con un código.',
  qrOn: 'La ficha QR está activa.',
  qrActivate: 'Activar ficha QR',
  qrRegenerate: 'Generar un código nuevo',
  qrDeactivate: 'Desactivar ficha QR',
  qrConsent: 'Entiendo qué datos verá quien escanee el código y quiero activarlo',
  qrShowMyPhone: 'Mostrar mi teléfono',
  qrNoPhoneYet: 'Aún no tienes teléfono guardado: agrégalo en «Mi cuenta» para poder mostrarlo.',
  qrShownOnce: 'Descarga el código ahora: por seguridad solo se muestra esta vez. Si lo pierdes, genera uno nuevo y el anterior deja de funcionar.',
  qrDownloadSvg: 'Descargar SVG',
  qrDownloadPng: 'Descargar PNG',
  qrPrint: 'Imprimir hoja A6',
  qrReconfirm: 'El aviso cambió: confirma de nuevo si quieres mostrar tu teléfono.',
  qrReconfirmAction: 'Confirmar mi teléfono',
  qrRemovePhone: 'Dejar de mostrar mi teléfono',
  qrAutoOffTitle: 'La ficha se apagó sola',
  qrGuardMissing: 'Para activar la ficha necesitas al menos una alergia crítica o un teléfono visible.',
  qrConfirmDeactivate: 'Sí, desactivar',
  qrCancel: 'Cancelar',
  publicUnavailableTitle: 'Esta ficha no está disponible',
  publicUnavailable: 'El código no es válido o la ficha ya no está activa.',
  publicRateLimited: 'Demasiados intentos. Espera un momento y vuelve a escanear.',
  publicError: 'No se pudo cargar la ficha. Inténtalo de nuevo.',
  publicPhonesTitle: 'Teléfonos de contacto',
  publicNoPhones: 'El dueño no dejó teléfonos de contacto en esta ficha.',
  publicAllergiesTitle: 'Alergias críticas',
} as const;
