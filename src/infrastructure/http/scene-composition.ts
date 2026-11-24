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

import type { PlatformParameterRepositoryPort } from '../../application/ports/platform-parameter.port.ts';
import type { SceneGlobalQuotaPort } from '../../application/ports/scene-global-quota.port.ts';
import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';
import type { SceneServices } from '../../application/use-cases/use-case-support.ts';
import type { PromptBlocks } from '../../domain/scene/prompt-blocks.ts';
import {
  SCENE_DEFAULT_MODEL,
  resolveSceneProviderSelection,
  type SceneProviderDriver,
  type SceneProviderParameters,
  type SceneProviderSelection,
} from '../../domain/scene/provider-parameters.ts';
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
import { createSceneProviderRouter, PROVIDER_NOT_CONFIGURED_LOG } from '../adapters/scene-provider-router.adapter.ts';
import { createVertexSceneGenerator } from '../adapters/vertex-scene-image-generator.adapter.ts';
import { SCENE_MAX_CLOSED_WITHOUT_CALL_PER_DAY, SCENE_UNMARKED_ATTEMPT_TTL_SECONDS, type AppConfig, type SceneConfig } from '../config/app-config.ts';
import { createSceneProviderSelectionReader } from '../config/scene-provider-selection.ts';

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
  /** Lector en caliente de `scene.prompt.blocks` (T1306; cache <= 60 s). */
  readonly readPromptBlocks?: () => Promise<PromptBlocks>;
  /** Lector en caliente de modelo y región (T1265; caché <= 60 s): el generador Vertex compone la URL en cada llamada. Sin él rigen los parámetros resueltos al arrancar. */
  readonly readProviderParameters?: () => Promise<SceneProviderParameters>;
  /** Seleccion efectiva del proveedor en caliente (T1314, D9-30; cache <= 60 s). Sin ella rige la seleccion estatica del despliegue (defecto), sin lectura de `scene.provider_driver`. */
  readonly readProviderSelection?: () => Promise<SceneProviderSelection>;
  /** Fuente de `platform_parameters` para construir la lectura en caliente de `scene.provider_driver` (T1314); sin ella ni `readProviderSelection` rige la seleccion estatica del despliegue. */
  readonly selectionSource?: { readonly repository: PlatformParameterRepositoryPort; readonly now: () => number };
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

/** Registro técnico del generador (solo `scene-generator INVALID_OUTPUT mimeType=<MIME cerrado>`: nunca bytes, prompt ni datos personales). */
const logSceneGenerator = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/** Generador Vertex AI de la composición `real`: proyecto de la configuración, modelo y región de los parámetros resueltos (o su respaldo de entorno). */
function composeVertexGenerator(scene: SceneConfig, options: SceneCompositionOptions): SceneServices['generator'] {
  const model = options.providerParameters?.model ?? scene.model;
  const location = options.providerParameters?.location ?? scene.location;
  if (scene.projectId === null || model === null || location === null || options.globalQuota === undefined) throw new Error('Configuración del driver real incompleta para la escena.');
  const read = options.readProviderParameters;
  return createVertexSceneGenerator({
    projectId: scene.projectId,
    location,
    model,
    ...(read === undefined ? {} : { getParameters: async () => { const p = await read(); return { model: p.model, location: p.location }; } }),
    timeoutSeconds: scene.genTimeoutSeconds,
    log: logSceneGenerator,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.getAccessToken === undefined ? {} : { getAccessToken: () => options.getAccessToken!() }),
  });
}

/**
 * `SceneServices` de la composición. Con `real` (T952) compone Vertex AI; la activación (T885) está habilitada por `SCENE_REAL_DRIVER_ACTIVATED = true` en `app-config.ts`.
 * T1314 (D9-30): con `real` o `gemini-api` se compone un ENRUTADOR sobre `SceneImageGeneratorPort` con los proveedores que tienen credenciales (Vertex: configuración `real`; `gemini-api`: `GEMINI_API_KEY`),
 * que lee `scene.provider_driver` en caliente. Defecto sin fila: `vertex` con configuración de Vertex; si no, el proveedor del entorno.
 */
export function composeSceneServices(config: AppConfig, options: SceneCompositionOptions): SceneServices {
  const scene = config.scene;
  const real = scene.driver === 'real';
  const gemini = scene.driver === 'gemini-api';
  const routed = real || gemini;
  const geminiKey = scene.geminiApiKey;
  if (gemini && (geminiKey === null || scene.geminiModel === null)) throw new Error('Configuración del driver gemini-api incompleta para la escena.');
  const available: SceneProviderDriver[] = [...(real ? (['vertex'] as const) : []), ...(routed && geminiKey !== null ? (['gemini-api'] as const) : [])];
  const defaultDriver: SceneProviderDriver | null = real ? 'vertex' : gemini ? 'gemini-api' : null;
  const staticModel = real ? (options.providerParameters?.model ?? scene.model ?? SCENE_DEFAULT_MODEL) : (scene.geminiModel ?? SCENE_DEFAULT_MODEL);
  const staticSelection: SceneProviderSelection = resolveSceneProviderSelection({ rowDriver: null, available, defaultDriver, model: staticModel });
  const resolve =
    options.readProviderSelection ??
    (options.selectionSource === undefined
      ? async (): Promise<SceneProviderSelection> => {
          // Sin lectura de `platform_parameters`: el proveedor es el defecto del despliegue; con Vertex y lector de parametros, modelo y region vigentes son los de esa misma lectura.
          if (real && options.readProviderParameters !== undefined) return resolveSceneProviderSelection({ rowDriver: null, available, defaultDriver, model: (await options.readProviderParameters()).model });
          return staticSelection;
        }
      : createSceneProviderSelectionReader({
          repository: options.selectionSource.repository,
          available,
          defaultDriver,
          geminiEnvModel: scene.geminiModel,
          ...(options.readProviderParameters === undefined ? {} : { readVertexParameters: async () => { const p = await options.readProviderParameters!(); return { model: p.model, location: p.location }; } }),
          now: options.selectionSource.now,
        }));
  let generator: SceneServices['generator'];
  if (routed) {
    const providers: Partial<Record<SceneProviderDriver, SceneServices['generator']>> = {};
    if (real) providers.vertex = composeVertexGenerator(scene, options);
    if (geminiKey !== null) {
      providers['gemini-api'] = createGeminiApiSceneGenerator({
        apiKey: geminiKey,
        getModel: async () => (await resolve()).model,
        timeoutSeconds: scene.genTimeoutSeconds,
        log: logSceneGenerator,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
    }
    generator = createSceneProviderRouter({ providers, resolve, log: logSceneGenerator });
  } else generator = new FakeSceneImageGenerator({ mode: 'ok' });
  return {
    maxPets: scene.maxPets,
    quotaMax: scene.quotaMax,
    genTimeoutSeconds: scene.genTimeoutSeconds,
    leaseSeconds: scene.leaseSeconds,
    queueWaitSeconds: scene.queueWaitSeconds,
    unmarkedAttemptTtlSeconds: SCENE_UNMARKED_ATTEMPT_TTL_SECONDS,
    maxClosedWithoutCallPerDay: SCENE_MAX_CLOSED_WITHOUT_CALL_PER_DAY,
    realDriver: routed,
    utcOffsetMinutes: utcOffsetMinutesOf(config.appTimezone, new Date(new SystemClockAdapter(config.appTimezone).nowIsoTimestamp())),
    noticeVersion: gemini ? SCENE_GEMINI_API_NOTICE_VERSION : SCENE_NOTICE_VERSION,
    providerId: gemini ? SCENE_GEMINI_API_PROVIDER_ID : SCENE_PROVIDER_ID,
    images: {
      strip: (mime, bytes) => stripImageMetadata(mime as StrippableMime, bytes),
      fit: (sizes) => (routed ? fitReferencesWithinBudget(sizes, GEMINI_REFERENCE_MAX_BYTES) : fitReferencesWithinBudget(sizes)),
      withinLimits: (mime, bytes) => {
        const size = readImageDimensions(mime as StrippableMime, bytes);
        return size !== null && size.width * size.height <= MAX_IMAGE_PIXELS && Math.max(size.width, size.height) <= MAX_IMAGE_SIDE;
      },
      validateOutput: (mime, bytes) => validateGeneratedImage(mime, bytes, MAX_GENERATED_IMAGE_BYTES),
    },
    generator,
    dispatcher: selectSceneDispatcher(scene, options),
    ...(options.readPromptBlocks === undefined ? {} : { promptBlocks: options.readPromptBlocks }),
    ...(routed && options.globalQuota !== undefined ? { globalQuota: options.globalQuota } : {}),
    ...(routed
      ? {
          // El par registrado por intento es el EFECTIVO (misma lectura que el enrutador): con `gemini-api` la region es `null` (D9-29).
          providerCall:
            options.readProviderSelection === undefined && options.selectionSource === undefined && options.readProviderParameters === undefined
              ? { model: staticSelection.model, location: staticSelection.location }
              : async () => {
                  const selection = await resolve();
                  return { model: selection.model, location: selection.location };
                },
          providerRouting: { available, defaultDriver, resolve: loggedResolve(resolve) },
        }
      : {}),
  };
}

/** `resolve` con registro tecnico (`scene-provider PROVIDER_NOT_CONFIGURED`, sin valores) cuando la seleccion falla cerrado. */
function loggedResolve(resolve: () => Promise<SceneProviderSelection>): () => Promise<SceneProviderSelection> {
  return async () => {
    const selection = await resolve();
    if (!selection.configured) logSceneGenerator(PROVIDER_NOT_CONFIGURED_LOG);
    return selection;
  };
}
