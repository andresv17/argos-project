/**
 * Composición de la escena del hogar (feature 006, T873; REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031, INV-ESC6-002, INV-ESC6-018): construye `SceneServices` desde la
 * configuración validada de `app-config.ts` (INV-ARCH-006). En desarrollo y CI: generador SIMULADO y despachador EN PROCESO que ejecuta `run` con `setImmediate`; el
 * `CloudTasksSceneDispatcher` solo se elige con `ARGOS_SCENE_DRIVER=real` (la configuración exige la constante de activación de T885, hoy false). Fase 14 (T952, D6-22): con `real`
 * se compone `VertexSceneImageGenerator` (token del metadata server, sin clave de API) con modelo y región de `platform_parameters` (respaldo en el entorno), el aviso final de
 * Vertex, `realDriver: true` y la cuota global mensual obligatoria. Sin llamadas a GCP al componer.
 *
 * `gemini-api` (T895, REQ-ESC6-037, INV-ESC6-014, INV-ESC6-020): driver LOCAL PRIVADO fuera de producción (la configuración ya lo rechaza con `NODE_ENV=production`). Compone
 * el generador de la Developer API con la clave y el modelo de la configuración, `realDriver: true` (el consentimiento vigente es obligatorio antes de cualquier llamada),
 * despachador EN PROCESO, `providerId` y `noticeVersion` propios y un tope de referencias menor (el JSON inline del proveedor es menor que 32 MiB).
 *
 * @implements REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031, REQ-ESC6-037, INV-ESC6-002, INV-ESC6-014, INV-ESC6-018, INV-ESC6-020
 */

import type { SceneGlobalQuotaPort } from '../../application/ports/scene-global-quota.port.ts';
import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';
import type { SceneServices } from '../../application/use-cases/use-case-support.ts';
import type { SceneProviderParameters } from '../../domain/scene/provider-parameters.ts';
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
import { SystemClockAdapter } from '../adapters/system-clock.adapter.ts';
import { createVertexSceneGenerator } from '../adapters/vertex-scene-image-generator.adapter.ts';
import type { AppConfig, SceneConfig } from '../config/app-config.ts';

/** Tope de bytes de la imagen generada que se acepta del proveedor. */
const MAX_GENERATED_IMAGE_BYTES = 32 * 1024 * 1024;

export interface SceneCompositionOptions {
  /** Ejecuta la generación de una tarea (el caso de uso del worker); lo usa el despachador en proceso. */
  readonly run: (job: SceneJob, signal: AbortSignal) => Promise<unknown>;
  /** Dobles para Cloud Tasks (pruebas): `fetch` y token de acceso. */
  readonly fetch?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  /** Modelo, región y tope global ya resueltos desde `platform_parameters` con respaldo en el entorno (T948); sin ellos rige el respaldo de `config.scene` (solo `real`). */
  readonly providerParameters?: SceneProviderParameters;
  /** Cuota global mensual atómica (T948): obligatoria con el driver `real` (no se arranca sin tope de gasto). */
  readonly globalQuota?: SceneGlobalQuotaPort;
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

/** Generador Vertex AI de la composición `real`: proyecto de la configuración, modelo y región de los parámetros resueltos (o su respaldo de entorno). */
function composeVertexGenerator(scene: SceneConfig, options: SceneCompositionOptions): SceneServices['generator'] {
  const model = options.providerParameters?.model ?? scene.model;
  const location = options.providerParameters?.location ?? scene.location;
  if (scene.projectId === null || model === null || location === null || options.globalQuota === undefined) throw new Error('Configuración del driver real incompleta para la escena.');
  return createVertexSceneGenerator({
    projectId: scene.projectId,
    location,
    model,
    timeoutSeconds: scene.genTimeoutSeconds,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.getAccessToken === undefined ? {} : { getAccessToken: () => options.getAccessToken!() }),
  });
}

/** `SceneServices` de la composición. Con `real` (T952) compone Vertex AI; la activación (T885) está habilitada por `SCENE_REAL_DRIVER_ACTIVATED = true` en `app-config.ts`. */
export function composeSceneServices(config: AppConfig, options: SceneCompositionOptions): SceneServices {
  const scene = config.scene;
  const real = scene.driver === 'real';
  const gemini = scene.driver === 'gemini-api';
  if (gemini && (scene.geminiApiKey === null || scene.geminiModel === null)) throw new Error('Configuración del driver gemini-api incompleta para la escena.');
  return {
    maxPets: scene.maxPets,
    quotaMax: scene.quotaMax,
    genTimeoutSeconds: scene.genTimeoutSeconds,
    leaseSeconds: scene.leaseSeconds,
    queueWaitSeconds: scene.queueWaitSeconds,
    realDriver: gemini || real,
    utcOffsetMinutes: utcOffsetMinutesOf(config.appTimezone, new Date(new SystemClockAdapter(config.appTimezone).nowIsoTimestamp())),
    noticeVersion: gemini ? SCENE_GEMINI_API_NOTICE_VERSION : SCENE_NOTICE_VERSION,
    providerId: gemini ? SCENE_GEMINI_API_PROVIDER_ID : SCENE_PROVIDER_ID,
    images: {
      strip: (mime, bytes) => stripImageMetadata(mime as StrippableMime, bytes),
      fit: (sizes) => (gemini || real ? fitReferencesWithinBudget(sizes, GEMINI_REFERENCE_MAX_BYTES) : fitReferencesWithinBudget(sizes)),
      withinLimits: (mime, bytes) => {
        const size = readImageDimensions(mime as StrippableMime, bytes);
        return size !== null && size.width * size.height <= MAX_IMAGE_PIXELS && Math.max(size.width, size.height) <= MAX_IMAGE_SIDE;
      },
      validateOutput: (mime, bytes) => validateGeneratedImage(mime, bytes, MAX_GENERATED_IMAGE_BYTES),
    },
    generator: real
      ? composeVertexGenerator(scene, options)
      : gemini
        ? createGeminiApiSceneGenerator({ apiKey: scene.geminiApiKey!, model: scene.geminiModel!, timeoutSeconds: scene.genTimeoutSeconds, ...(options.fetch === undefined ? {} : { fetch: options.fetch }) })
        : new FakeSceneImageGenerator({ mode: 'ok' }),
    dispatcher: selectSceneDispatcher(scene, options),
    ...(real && options.globalQuota !== undefined ? { globalQuota: options.globalQuota } : {}),
  };
}
