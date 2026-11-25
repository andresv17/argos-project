/**
 * Aviso previo de la escena del hogar, EMPAQUETADO en el cliente (feature 006, T877; REQ-ESC6-026): el servidor solo conoce `noticeVersion` y `providerId`.
 * `NOTICE_VERSION` y `PROVIDER_ID` son constantes del código (no variables de entorno, H-MIF-006-06) y deben ser iguales a las del servidor
 * (`src/domain/scene/notice.ts`; `t877-aviso-consentimiento.spec.ts` lo comprueba): si divergieran, el consentimiento quedaría inválido. Un cambio de texto, de
 * proveedor o de región incrementa la versión y exige un nuevo consentimiento (EDGE-ESC6-018).
 *
 * Texto FINAL del aviso (Fase 14, T950, D6-22): declara Google Cloud Vertex AI, la región y que CADA regeneración reenvía la foto del hogar y las fotos vigentes de las mascotas
 * con consentimiento. El texto queda en revisión hasta la firma de Neo (T958); los datos sin fuente en disco (retención, borrado, SLA) no se asumen: se remiten a las condiciones
 * del proveedor o se declaran «pendientes de confirmar» (REQ-ESC6-028).
 *
 * @implements REQ-ESC6-021, REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026, EDGE-ESC6-018, EDGE-ESC6-023, SC-ESC6-033, SC-ESC6-036, SC-ESC6-040, SC-ESC6-067
 */
import type { GrantSceneConsentBody, SceneViewData } from './scene-api.ts';

/** Igual a `SCENE_NOTICE_VERSION` del servidor: subió a '2' con el aviso final (T950) y a '3' con la biografía enviada (T964, enmienda 2026-11-24). */
export const NOTICE_VERSION = '3';
export const NOTICE_PROVIDER_ID = 'vertex-gemini-image';
/** Igual a `SCENE_GLOBAL_NOTICE_VERSION` del servidor (D9-27 (5)): variante del aviso mientras la región efectiva es `global`; pide reconsentir solo entonces. */
export const NOTICE_GLOBAL_VERSION = '3-global';
export const NOTICE_TITLE = 'Crear la imagen de tu hogar con inteligencia artificial';
export const NOTICE_INTRO = 'Para dibujar tu hogar y tus mascotas en pixel art, Tipi envía imágenes a un servicio de inteligencia artificial de terceros. Antes de continuar, lee esto.';

export interface NoticeSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export const NOTICE_SECTIONS: readonly NoticeSection[] = [
  {
    title: '1. Qué se envía',
    paragraphs: [
      'Se envía la foto de tu hogar, si la subiste y consentiste; el avatar de cada mascota de la que eres Propietario Legal, si consentiste; la imagen de la escena anterior cuando solo se cambian algunas mascotas; y un texto técnico con la especie, la raza y el sexo de cada mascota.',
      'También se envía la biografía de cada mascota (el texto libre de su ficha, depurado de caracteres especiales y limitado a 280 caracteres) al servicio de inteligencia artificial de imágenes, junto con las instrucciones, tanto de las mascotas con foto como de las que no la tienen. No escribas en la biografía datos que no quieras compartir con el proveedor.',
      'Cada vez que generas o regeneras la escena, Tipi vuelve a enviar al proveedor la foto de tu hogar y las fotos vigentes de las mascotas con consentimiento, aunque ya las hubiera enviado antes: Tipi no reutiliza lo enviado, lo reenvía en cada regeneración.',
      'No se envían nombres de mascotas ni de personas, número de microchip, correo, fechas de nacimiento ni datos clínicos de la ficha; lo que escribas dentro de la biografía sí viaja.',
      'La normalización es parcial: Tipi elimina del archivo los metadatos (ubicación GPS, fecha de la cámara) antes de enviarlo, pero no recodifica ni reduce la imagen; su contenido visual llega tal cual al proveedor.',
    ],
  },
  {
    title: '2. A quién se envía',
    paragraphs: [
      'A Google LLC, mediante el servicio Google Cloud Vertex AI (modelo Gemini Image), desde el proyecto de Google Cloud de Tipi, que es quien contrata el servicio. El modelo exacto puede cambiar con el tiempo y lo fija Tipi por configuración.',
    ],
  },
  {
    title: '3. Dónde se procesa',
    paragraphs: ['En la región us-central1 (Iowa, Estados Unidos), lo que implica una transferencia internacional de tus imágenes. Que el modelo procese solo en esa región: pendiente de confirmar.'],
  },
  {
    title: '4. Cuánto tiempo las conserva el proveedor',
    paragraphs: [
      'Según las condiciones de Google Cloud (Cloud Data Processing Addendum y Service Specific Terms de Vertex AI), tus imágenes no se usan para entrenar los modelos fundacionales de Google. Tipi las trata como datos del cliente y las envía solo para generar la escena.',
      'La retención de la copia que recibe Google y su borrado se rigen por esas mismas condiciones; Tipi no controla esa copia y esos datos siguen pendientes de confirmar con la documentación oficial.',
      'La biografía se lee solo al generar y viaja de forma transitoria en la petición al proveedor; Tipi no la guarda en intentos de escena, instantáneas ni registros del servidor. Según los términos de datos de cliente de Google Cloud (Vertex AI), el proveedor no usa datos del cliente para entrenar sus modelos sin permiso, aunque puede conservar temporalmente peticiones hasta 30 días por prevención de abuso.',
    ],
  },
  {
    title: '5. No subas fotos con personas',
    paragraphs: [
      'Las fotos del hogar y de las mascotas pueden mostrar personas sin que lo notes, como personas fortuitas al fondo. Tipi no detecta personas: no subas fotos donde aparezca alguien, en especial menores.',
      'La imagen de tu hogar la verán todos los miembros activos del hogar. Si el dueño de una mascota no consintió, esa mascota aparece sin su foto.',
    ],
  },
  {
    title: '6. Sin respaldo y cómo borrar',
    paragraphs: [
      'La foto del hogar y las escenas generadas no se incluyen en el respaldo ni se restauran al importarlo.',
      'Puedes borrarlas cuando quieras con «Retirar consentimiento y borrar imágenes de la escena»: se borran de inmediato de nuestro almacenamiento. Restos técnicos pueden permanecer en copias de seguridad internas hasta su vencimiento: hasta 6 horas en la recuperación a un instante (PITR) y 14 días en los volcados de la base de datos. La copia que tenga el proveedor se rige por el punto 4.',
      'Si editas o borras la biografía en la ficha de la mascota (o revocas tu consentimiento), dejará de enviarse en las siguientes generaciones. Puedes retirar la imagen generada del hogar en cualquier momento.',
    ],
  },
];

/**
 * Aviso del driver local privado `gemini-api` (T895, REQ-ESC6-037, REQ-ESC6-026): proveedor y versión propios (iguales a los de `src/domain/scene/notice.ts`).
 * Cambian los apartados «A quién se envía», «Dónde se procesa» y el de retención; el resto es el del aviso de Vertex. Texto en revisión hasta la firma de Neo; los términos de datos de la
 * Developer API no tienen fuente en disco y se declaran «pendientes de confirmar» (REQ-ESC6-028).
 */
export const NOTICE_GEMINI_API_VERSION = 'gemini-api-3';
export const NOTICE_GEMINI_API_PROVIDER_ID = 'gemini-api';

export const NOTICE_GEMINI_API_SECTIONS: readonly NoticeSection[] = NOTICE_SECTIONS.map((section) => {
  if (section.title === '2. A quién se envía') {
    return {
      title: section.title,
      paragraphs: [
        'A Google LLC, mediante la API pública Gemini Developer API (modelo Gemini Image), con una clave del propietario de esta instalación de Tipi. Es un uso local y privado de la API pública, no un servicio de Google Cloud contratado por Tipi. Entidad contratante y nombre exacto del modelo: pendientes de confirmar.',
      ],
    };
  }
  if (section.title === '3. Dónde se procesa') {
    return {
      title: section.title,
      paragraphs: ['La región donde la Gemini Developer API procesa tus imágenes está pendiente de confirmar; puede implicar una transferencia internacional de tus imágenes.'],
    };
  }
  if (section.title === '4. Cuánto tiempo las conserva el proveedor') {
    return {
      title: section.title,
      paragraphs: [
        'Los términos de datos de la Gemini Developer API (retención, uso de las imágenes para entrenamiento según el plan de la clave) están pendientes de confirmar con su documentación oficial. Hasta confirmarlos, este uso local con tu propia clave queda bajo tu responsabilidad y no debe incluir fotos de terceros.',
        'La biografía de tus mascotas se lee únicamente al generar y viaja de forma transitoria en la petición al proveedor: Tipi no la almacena en los intentos de escena, en las instantáneas ni en los registros del servidor. Su uso para entrenamiento por parte del proveedor sigue pendiente de confirmar.',
      ],
    };
  }
  return section;
});

/**
 * Variante GLOBAL del aviso de Vertex (D9-27 (5)): solo cambia «3. Dónde se procesa» para declarar procesamiento sin región ni país fijos. Texto aprobado en firme por Neo
 * (D9-27 (4); REQ-ESC6-026).
 */
export const NOTICE_GLOBAL_SECTIONS: readonly NoticeSection[] = NOTICE_SECTIONS.map((section) =>
  section.title.startsWith('3.')
    ? {
        title: section.title,
        paragraphs: ['En la región global de Google Cloud Vertex AI: el procesamiento no queda fijado a una región ni a un país, lo que implica una transferencia internacional de tus imágenes.'],
      }
    : section,
);

/** Texto del aviso del proveedor que el servidor declara vigente (y su variante global por `noticeVersion`); un proveedor desconocido muestra el aviso por defecto (y su consentimiento se trata como OUTDATED). */
export const noticeSectionsFor = (providerId: string, noticeVersion?: string): readonly NoticeSection[] =>
  providerId === NOTICE_GEMINI_API_PROVIDER_ID ? NOTICE_GEMINI_API_SECTIONS : noticeVersion === NOTICE_GLOBAL_VERSION ? NOTICE_GLOBAL_SECTIONS : NOTICE_SECTIONS;

export type ConsentStep = 'GRANTED' | 'ASK' | 'OUTDATED';

/**
 * Paso del flujo: OUTDATED si el servidor ya exige otra versión del aviso u otro proveedor que los de este cliente (hay que reconsentir con el texto nuevo);
 * GRANTED si el usuario tiene vigentes los dos alcances (foto del hogar y avatares); ASK en otro caso. El alcance es por usuario (D6-16 = A).
 */
export function consentStep(consent: SceneViewData['consent']): ConsentStep {
  const known = ((consent.noticeVersion === NOTICE_VERSION || consent.noticeVersion === NOTICE_GLOBAL_VERSION) && consent.providerId === NOTICE_PROVIDER_ID) || (consent.noticeVersion === NOTICE_GEMINI_API_VERSION && consent.providerId === NOTICE_GEMINI_API_PROVIDER_ID);
  if (!known) return 'OUTDATED';
  return consent.householdPhotoGranted && consent.petPhotosGranted ? 'GRANTED' : 'ASK';
}

/** Cuerpo de `grantSceneConsent` con las constantes del cliente y los dos alcances. */
export const consentBody = (providerId: string = NOTICE_PROVIDER_ID, noticeVersion?: string): GrantSceneConsentBody =>
  providerId === NOTICE_GEMINI_API_PROVIDER_ID
    ? { noticeVersion: NOTICE_GEMINI_API_VERSION, providerId: NOTICE_GEMINI_API_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] }
    : { noticeVersion: noticeVersion === NOTICE_GLOBAL_VERSION ? NOTICE_GLOBAL_VERSION : NOTICE_VERSION, providerId: NOTICE_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] };
