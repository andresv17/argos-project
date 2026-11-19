/**
 * Aviso previo de la escena del hogar, EMPAQUETADO en el cliente (feature 006, T877; REQ-ESC6-026): el servidor solo conoce `noticeVersion` y `providerId`.
 * `NOTICE_VERSION` y `PROVIDER_ID` son constantes del código (no variables de entorno, H-MIF-006-06) y deben ser iguales a las del servidor
 * (`src/domain/scene/notice.ts`; `t877-aviso-consentimiento.spec.ts` lo comprueba): si divergieran, el consentimiento quedaría inválido. Un cambio de texto, de
 * proveedor o de región incrementa la versión y exige un nuevo consentimiento (EDGE-ESC6-018).
 *
 * El texto es el BORRADOR `specs/006-escena-hogar-pixel-art/aviso-consentimiento-borrador.md` hasta que Neo (Nivel 2) lo firme (`NOTICE_DRAFT`); los datos sin fuente
 * en disco (retención del proveedor, región exacta del modelo) se declaran «pendientes de confirmar» y no se asumen (REQ-ESC6-028).
 *
 * @implements REQ-ESC6-021, REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026, EDGE-ESC6-018, EDGE-ESC6-023, SC-ESC6-033, SC-ESC6-036, SC-ESC6-040, SC-ESC6-067
 */
import type { GrantSceneConsentBody, SceneViewData } from './scene-api.ts';

export const NOTICE_VERSION = '1';
export const NOTICE_PROVIDER_ID = 'vertex-gemini-image';
/** El texto sigue siendo borrador hasta la firma legal de Neo (REQ-ESC6-026). */
export const NOTICE_DRAFT = true;

export const NOTICE_TITLE = 'Crear la imagen de tu hogar con inteligencia artificial';
export const NOTICE_INTRO = 'Para dibujar tu hogar y tus mascotas en pixel art, ARGOS envía imágenes a un servicio de inteligencia artificial de terceros. Antes de continuar, lee esto.';
/** Chip visible mientras `NOTICE_DRAFT` (H-S12). */
export const NOTICE_DRAFT_CHIP = 'BORRADOR';
/** Frase breve para quien ya consintió mientras el aviso sea borrador (H-S12). */
export const NOTICE_DRAFT_GRANTED_LABEL = 'El aviso al que diste tu consentimiento es un borrador pendiente de revisión y firma legal.';
export const NOTICE_DRAFT_LABEL = 'Borrador: este texto está pendiente de revisión y firma legal; no es la versión final.';

export interface NoticeSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export const NOTICE_SECTIONS: readonly NoticeSection[] = [
  {
    title: '1. Qué se envía',
    paragraphs: [
      'Se envía la foto de tu hogar, si la subiste y consentiste; el avatar de cada mascota de la que eres Propietario Legal, si consentiste; la imagen de la escena anterior cuando solo se cambian algunas mascotas; y un texto técnico con la especie, la raza y el sexo de cada mascota.',
      'No se envían nombres de mascotas ni de personas, número de microchip, correo, fechas de nacimiento ni datos clínicos.',
      'La normalización es parcial: ARGOS elimina del archivo los metadatos (ubicación GPS, fecha de la cámara) antes de enviarlo, pero no recodifica ni reduce la imagen; su contenido visual llega tal cual al proveedor.',
    ],
  },
  {
    title: '2. A quién se envía',
    paragraphs: ['A Google LLC, mediante el servicio Vertex AI (modelo Gemini Image), desde el proyecto de Google Cloud de ARGOS. Entidad contratante y nombre exacto del modelo: pendientes de confirmar.'],
  },
  {
    title: '3. Dónde se procesa',
    paragraphs: ['En la región us-central1 (Iowa, Estados Unidos), lo que implica una transferencia internacional de tus imágenes. Que el modelo procese solo en esa región: pendiente de confirmar.'],
  },
  {
    title: '4. Cuánto tiempo las conserva el proveedor',
    paragraphs: ['La política de retención del proveedor y su uso de las imágenes para entrenamiento están pendientes de confirmar con su documentación oficial. Hasta confirmarlos, este apartado no puede firmarse.'],
  },
  {
    title: '5. No subas fotos con personas',
    paragraphs: [
      'Las fotos del hogar y de las mascotas pueden mostrar personas sin que lo notes, como personas fortuitas al fondo. ARGOS no detecta personas: no subas fotos donde aparezca alguien, en especial menores.',
      'La imagen de tu hogar la verán todos los miembros activos del hogar. Si el dueño de una mascota no consintió, esa mascota aparece sin su foto.',
    ],
  },
  {
    title: '6. Sin respaldo y cómo borrar',
    paragraphs: [
      'La foto del hogar y las escenas generadas no se incluyen en el respaldo ni se restauran al importarlo.',
      'Puedes borrarlas cuando quieras con «Retirar consentimiento y borrar imágenes de la escena»: se borran de inmediato de nuestro almacenamiento. Restos técnicos pueden permanecer en copias de seguridad internas hasta su vencimiento: hasta 6 horas en la recuperación a un instante (PITR) y 14 días en los volcados de la base de datos. La copia que tenga el proveedor se rige por el punto 4.',
    ],
  },
];

export type ConsentStep = 'GRANTED' | 'ASK' | 'OUTDATED';

/**
 * Paso del flujo: OUTDATED si el servidor ya exige otra versión del aviso u otro proveedor que los de este cliente (hay que reconsentir con el texto nuevo);
 * GRANTED si el usuario tiene vigentes los dos alcances (foto del hogar y avatares); ASK en otro caso. El alcance es por usuario (D6-16 = A).
 */
export function consentStep(consent: SceneViewData['consent']): ConsentStep {
  if (consent.noticeVersion !== NOTICE_VERSION || consent.providerId !== NOTICE_PROVIDER_ID) return 'OUTDATED';
  return consent.householdPhotoGranted && consent.petPhotosGranted ? 'GRANTED' : 'ASK';
}

/** Cuerpo de `grantSceneConsent` con las constantes del cliente y los dos alcances. */
export const consentBody = (): GrantSceneConsentBody => ({ noticeVersion: NOTICE_VERSION, providerId: NOTICE_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
