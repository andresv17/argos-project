/**
 * Lógica de presentación de la escena del hogar, sin React (feature 006, T875/T876): textos, motivo del botón, mensajes estables por código, ruta de la imagen y
 * sondeo único cada 3 s. No hay datos de la mascota ni del servidor en los textos de error (INV-ESC6-016); la imagen se pide a la ruta propia del ámbito con
 * `v = imageTag` (etiqueta de caché, INV-ESC6-019) y nunca se guarda una URL firmada en el DOM (NFR-ESC6-003).
 *
 * @implements REQ-ESC6-005, REQ-ESC6-019, REQ-ESC6-021, NFR-ESC6-003, NFR-ESC6-004, INV-ESC6-016, INV-ESC6-019
 */
import type { Scheduler } from './access-renewer.ts';
import { ERROR_CATALOG } from '../../generated/errors/error-codes.ts';
import { mediaProblemMessage, uploadDateText } from './media-view.ts';
import type { SceneErrorCode, SceneScope, SceneViewData } from './scene-api.ts';

/** Intervalo del sondeo mientras `generating` (constante del cliente, no variable del servidor, H-MIF-006-06). */
export const ARGOS_SCENE_POLL_SECONDS = 3;
const MAX_POLL_ERRORS = 3;

const petsWord = (n: number): string => (n === 1 ? '1 mascota' : `${n} mascotas`);

/** Texto alternativo de la imagen: cuántas mascotas hay en la escena (WCAG 1.1.1). */
export const sceneAltText = (shown: number): string => (shown === 0 ? 'Escena del hogar en pixel art sin mascotas' : `Escena del hogar en pixel art con ${petsWord(shown)}`);

export const scenePendingText = (view: SceneViewData): string => `cambios pendientes: ${view.pending} · generaciones restantes: ${view.quota.remaining}`;

/** «Se muestran N de M mascotas» solo cuando hay más mascotas que las dibujadas (REQ-ESC6-008). */
export const scenePetsShownText = (pets: SceneViewData['pets']): string | null => (pets.total > pets.shown ? `Se muestran ${pets.shown} de ${pets.total} mascotas` : null);

export const SCENE_STALE_TEXT = 'Imagen desactualizada: no incluye los cambios más recientes.';

const FAILURE_TEXT: Readonly<Record<SceneErrorCode, string>> = {
  'ERR-SCENE-GENERATION-FAILED': 'No se pudo crear la imagen. Puedes reintentar; no se descontó ninguna generación.',
  'ERR-SCENE-GENERATION-TIMEOUT': 'La imagen tardó demasiado en crearse. Puedes reintentar; no se descontó ninguna generación.',
  'ERR-SCENE-INVALID-IMAGE': 'El servicio devolvió una imagen que no se puede usar. Puedes reintentar; no se descontó ninguna generación.',
  'ERR-SCENE-LEASE-EXPIRED': 'El proceso se interrumpió antes de terminar. Puedes reintentar; no se descontó ninguna generación.',
};
export const sceneFailureText = (code: SceneErrorCode | null): string => (code === null ? FAILURE_TEXT['ERR-SCENE-GENERATION-FAILED'] : FAILURE_TEXT[code]);

export function sceneStatusText(view: SceneViewData): string {
  switch (view.status) {
    case 'generating':
      return 'Generando la imagen… puede tardar cerca de un minuto.';
    case 'failed':
      return 'La última generación no terminó.';
    case 'outdated':
      return view.pending > 0 ? 'Hay cambios sin reflejar en la imagen.' : 'La imagen necesita actualizarse.';
    case 'ready':
      return 'La imagen está al día.';
    default:
      return view.imageTag === null ? 'Todavía no hay imagen del hogar.' : 'Sin novedades.';
  }
}

/** Estado del botón «Actualizar imagen del hogar»: con `canUpdate` falso siempre hay un motivo visible (REQ-ESC6-005). */
export function sceneUpdateState(view: SceneViewData): { readonly disabled: boolean; readonly reason: string | null } {
  if (view.actions.canUpdate) return { disabled: false, reason: null };
  switch (view.actions.blockedReason) {
    case 'NO_CHANGES':
      return { disabled: true, reason: 'No hay cambios pendientes desde la última imagen.' };
    case 'QUOTA_EXHAUSTED':
      return { disabled: true, reason: `Se agotaron las generaciones de este mes. Se reinician el ${uploadDateText(view.quota.resetsAt)}; la imagen actual se conserva.` };
    case 'GENERATING':
      return { disabled: true, reason: 'La imagen se está generando; espera a que termine.' };
    case 'CONSENT_REQUIRED':
      return { disabled: true, reason: 'Falta tu consentimiento para enviar fotos al servicio de inteligencia artificial.' };
    case 'ROLE':
      return { disabled: true, reason: 'Solo el propietario del hogar o un administrador puede actualizar la imagen.' };
    case 'COOLDOWN':
      return { disabled: true, reason: 'Hubo demasiados intentos seguidos; espera un momento antes de volver a intentarlo.' };
    default:
      return { disabled: true, reason: 'La imagen no se puede actualizar ahora.' };
  }
}

const GENERIC_MESSAGE = ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].detailTemplate;
const PROBLEM_TEXT: Readonly<Record<string, string>> = {
  'ERR-SCENE-CONSENT-REQUIRED': 'Antes de crear la imagen debes leer el aviso y dar tu consentimiento.',
  'ERR-SCENE-QUOTA-EXCEEDED': 'Se agotaron las generaciones de este mes. La imagen actual se conserva.',
  'ERR-SCENE-NOTICE-OUTDATED': 'El aviso cambió. Léelo de nuevo y consiente otra vez.',
  'ERR-ACC-FORBIDDEN': 'Solo el propietario del hogar o un administrador puede cambiar la escena.',
  'ERR-HOUSE-NOT-FOUND': 'No se encontró la escena de este hogar.',
  'ERR-SCHEMA-VALIDATION-FAILED': 'La petición no es válida. Recarga la pantalla e inténtalo de nuevo.',
};

/** Texto para la persona a partir del CÓDIGO: nunca el detalle del servidor, el prompt ni datos personales. `ERR-MEDIA-*` usa los textos de medios. */
export function sceneProblemMessage(code: string, retryAfterSeconds?: number): string {
  if (code === 'ERR-RATE-LIMITED') return retryAfterSeconds === undefined ? 'Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.' : `Hubo demasiados intentos. Vuelve a intentarlo en ${retryAfterSeconds} s.`;
  const own = PROBLEM_TEXT[code];
  if (own !== undefined) return own;
  return code.startsWith('ERR-MEDIA-') ? mediaProblemMessage(code) : GENERIC_MESSAGE;
}

/** Ruta propia de la imagen vigente del ámbito (302 firmada por el servidor); `null` sin imagen. */
export function sceneImagePath(scope: SceneScope, imageTag: string | null): string | null {
  if (imageTag === null) return null;
  return scope.kind === 'HOUSEHOLD' ? `/api/households/${scope.householdId}/scene/image?v=${imageTag}` : `/api/me/scene/image?v=${imageTag}`;
}

/** Ruta propia de la foto del hogar (302 firmada); `tag` solo etiqueta de caché. */
export const householdPhotoPath = (householdId: string, tag: string): string => `/api/households/${householdId}/photo?v=${tag}`;

export interface ScenePollerOptions {
  readonly fetchScene: () => Promise<SceneViewData>;
  readonly onView: (view: SceneViewData) => void;
  /** Se llama UNA vez, tras `MAX_POLL_ERRORS` fallos seguidos; el sondeo se detiene. */
  readonly onError: (error: unknown) => void;
  readonly scheduler: Scheduler;
}

/** Sondeo único (un solo hilo por instancia): consulta de inmediato y se reprograma cada `ARGOS_SCENE_POLL_SECONDS` solo mientras `generating`. */
export function createScenePoller({ fetchScene, onView, onError, scheduler }: ScenePollerOptions): { start(): void; stop(): void } {
  let running = false;
  let cancel: (() => void) | null = null;
  let errors = 0;
  const tick = async (): Promise<void> => {
    cancel = null;
    try {
      const view = await fetchScene();
      if (!running) return;
      errors = 0;
      onView(view);
      if (view.status === 'generating') cancel = scheduler.after(() => void tick(), ARGOS_SCENE_POLL_SECONDS * 1000);
      else running = false;
    } catch (error) {
      if (!running) return;
      errors += 1;
      if (errors >= MAX_POLL_ERRORS) {
        running = false;
        onError(error);
      } else cancel = scheduler.after(() => void tick(), ARGOS_SCENE_POLL_SECONDS * 1000);
    }
  };
  return {
    start() {
      if (running) return;
      running = true;
      errors = 0;
      void tick();
    },
    stop() {
      running = false;
      cancel?.();
      cancel = null;
    },
  };
}
