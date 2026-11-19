/**
 * Composición de la escena del hogar (feature 006, T873; REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031, INV-ESC6-002, INV-ESC6-018): construye `SceneServices` desde la
 * configuración validada de `app-config.ts` (INV-ARCH-006). En desarrollo y CI: generador SIMULADO y despachador EN PROCESO que ejecuta `run` con `setImmediate`; el
 * `CloudTasksSceneDispatcher` solo se elige con `ARGOS_SCENE_DRIVER=real` (hoy imposible: la configuración exige la constante de activación, T885) y el generador real no
 * existe como código seleccionable, así que la composición completa del real se NIEGA. Sin llamadas a GCP.
 *
 * `gemini-api` (T895, REQ-ESC6-037, INV-ESC6-014, INV-ESC6-020): driver LOCAL PRIVADO fuera de producción (la configuración ya lo rechaza con `NODE_ENV=production`). Compone
 * el generador de la Developer API con la clave y el modelo de la configuración, `realDriver: true` (el consentimiento vigente es obligatorio antes de cualquier llamada),
 * despachador EN PROCESO, `providerId` y `noticeVersion` propios y un tope de referencias menor (el JSON inline del proveedor es menor que 32 MiB).
 *
 * @implements REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031, REQ-ESC6-037, INV-ESC6-002, INV-ESC6-014, INV-ESC6-018, INV-ESC6-020
 */

import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';
import type { SceneServices } from '../../application/use-cases/use-case-support.ts';
import { SCENE_GEMINI_API_NOTICE_VERSION, SCENE_GEMINI_API_PROVIDER_ID, SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../domain/scene/notice.ts';
import { CloudTasksSceneDispatcher } from '../adapters/cloud-tasks-scene-dispatcher.adapter.ts';
import { FakeSceneImageGenerator } from '../adapters/fake-scene-image-generator.adapter.ts';
import { GEMINI_REFERENCE_MAX_BYTES } from '../adapters/gemini-api-wire.ts';
import { createGeminiApiSceneGenerator } from '../adapters/gemini-api-scene-image-generator.adapter.ts';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  fitReferencesWithinBudget,
  readImageDimensions,
  stripImageMetadata,
  validateGeneratedImage,
  type StrippableMime,
} from '../adapters/image-metadata-stripper.ts';
import { InProcessSceneDispatcher } from '../adapters/in-process-scene-dispatcher.adapter.ts';
import type { AppConfig, SceneConfig } from '../config/app-config.ts';

/** Tope de bytes de la imagen generada que se acepta del proveedor. */
const MAX_GENERATED_IMAGE_BYTES = 32 * 1024 * 1024;

export interface SceneCompositionOptions {
  /** Ejecuta la generación de una tarea (el caso de uso del worker); lo usa el despachador en proceso. */
  readonly run: (job: SceneJob, signal: AbortSignal) => Promise<unknown>;
  /** Dobles para Cloud Tasks (pruebas): `fetch` y token de acceso. */
  readonly fetch?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
}

/** Desfase de la zona IANA respecto de UTC, en minutos, en el instante dado (p. ej. `America/Bogota` -> -300). */
export function utcOffsetMinutesOf(timeZone: string, instant: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(part);
  if (match === null || match[1] === undefined) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Despachador por driver: `fake` (desarrollo y CI) = en proceso; `real` = Cloud Tasks con destino, cuenta, cola y proyecto SOLO de la configuración validada (INV-ESC6-018).
 */
export function selectSceneDispatcher(scene: SceneConfig, options: SceneCompositionOptions): SceneJobDispatcherPort {
  if (scene.driver === 'real') {
    if (scene.projectId === null || scene.workerUrl === null || scene.tasksServiceAccountEmail === null) throw new Error('Configuración de Cloud Tasks incompleta para la escena.');
    return new CloudTasksSceneDispatcher({
      projectId: scene.projectId,
      queue: scene.queue,
      workerUrl: scene.workerUrl,
      serviceAccountEmail: scene.tasksServiceAccountEmail,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.getAccessToken === undefined ? {} : { getAccessToken: options.getAccessToken }),
    });
  }
  const timeoutMs = scene.genTimeoutSeconds * 1000;
  return new InProcessSceneDispatcher((job) => options.run(job, AbortSignal.timeout(timeoutMs)).then(() => undefined), { allowed: true });
}

/** `SceneServices` de la composición. Con el driver real se niega: el generador de Vertex no existe como código seleccionable hasta T885 (REQ-ESC6-028). */
export function composeSceneServices(config: AppConfig, options: SceneCompositionOptions): SceneServices {
  const scene = config.scene;
  if (scene.driver === 'real') throw new Error('ARGOS_SCENE_DRIVER=real no está disponible: el adaptador del proveedor no se entrega hasta la compuerta del driver real.');
  const gemini = scene.driver === 'gemini-api';
  if (gemini && (scene.geminiApiKey === null || scene.geminiModel === null)) throw new Error('Configuración del driver gemini-api incompleta para la escena.');
  return {
    maxPets: scene.maxPets,
    quotaMax: scene.quotaMax,
    genTimeoutSeconds: scene.genTimeoutSeconds,
    leaseSeconds: scene.leaseSeconds,
    queueWaitSeconds: scene.queueWaitSeconds,
    realDriver: gemini,
    utcOffsetMinutes: utcOffsetMinutesOf(config.appTimezone, new Date()),
    noticeVersion: gemini ? SCENE_GEMINI_API_NOTICE_VERSION : SCENE_NOTICE_VERSION,
    providerId: gemini ? SCENE_GEMINI_API_PROVIDER_ID : SCENE_PROVIDER_ID,
    images: {
      strip: (mime, bytes) => stripImageMetadata(mime as StrippableMime, bytes),
      fit: (sizes) => (gemini ? fitReferencesWithinBudget(sizes, GEMINI_REFERENCE_MAX_BYTES) : fitReferencesWithinBudget(sizes)),
      withinLimits: (mime, bytes) => {
        const size = readImageDimensions(mime as StrippableMime, bytes);
        return size !== null && size.width * size.height <= MAX_IMAGE_PIXELS && Math.max(size.width, size.height) <= MAX_IMAGE_SIDE;
      },
      validateOutput: (mime, bytes) => validateGeneratedImage(mime, bytes, MAX_GENERATED_IMAGE_BYTES),
    },
    generator: gemini
      ? createGeminiApiSceneGenerator({ apiKey: scene.geminiApiKey!, model: scene.geminiModel!, timeoutSeconds: scene.genTimeoutSeconds, ...(options.fetch === undefined ? {} : { fetch: options.fetch }) })
      : new FakeSceneImageGenerator({ mode: 'ok' }),
    dispatcher: selectSceneDispatcher(scene, options),
  };
}
