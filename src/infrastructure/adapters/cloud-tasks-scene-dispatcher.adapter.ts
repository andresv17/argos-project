/**
 * Despachador de la escena con Cloud Tasks (feature 006, T873; REQ-ESC6-013, REQ-ESC6-033, REQ-ESC6-036, INV-ESC6-018). Solo se construye con `ARGOS_SCENE_DRIVER=real`
 * (que hoy no arranca): en desarrollo y CI rige `InProcessSceneDispatcher`. `fetch` nativo inyectable y token del servidor de metadatos inyectable (sin SDK ni
 * `google-auth-library`); nunca llama a GCP desde las pruebas.
 *
 * - `POST https://cloudtasks.googleapis.com/v2/projects/{p}/locations/us-central1/queues/{q}/tasks` con `redirect: 'error'` y `AbortSignal.timeout`.
 * - Nombre de la tarea = `attemptId` (deduplicación: un segundo encolado es `ALREADY_EXISTS`), `dispatchDeadline` de 130 s, `oidcToken` con la cuenta
 *   `ARGOS_SCENE_TASKS_SA_EMAIL` y como audiencia la MISMA `ARGOS_SCENE_WORKER_URL`. Destino y audiencia salen SOLO de la configuración validada al construir: jamás de
 *   `Host`, `X-Forwarded-*` ni del trabajo, que aporta únicamente los dos UUID (INV-ESC6-018).
 * - Resultado como lo espera el caso de uso: 409 -> `code = 'ALREADY_EXISTS'` (éxito); 429, 5xx, red o tiempo agotado -> `UNAVAILABLE` / `DEADLINE_EXCEEDED` (ambiguo: no marca
 *   failed, el arrendamiento T_QUEUE resuelve, EDGE-ESC6-032); cualquier otro 4xx -> error sin código (rechazo determinista). Ningún error lleva el token, la URL, el
 *   identificador ni el cuerpo de la respuesta.
 *
 * @implements REQ-ESC6-013, REQ-ESC6-033, REQ-ESC6-036, INV-ESC6-018, EDGE-ESC6-017, EDGE-ESC6-032
 */

import type { SceneJob, SceneJobDispatcherPort } from '../../application/ports/scene-job-dispatcher.port.ts';
import { isValidSceneProject, isValidSceneQueue, isValidSceneWorkerUrl, isValidSchedulerEmail } from '../config/app-config.ts';

/** Región fija de la cola (`D6-01`, constante de código). */
export const SCENE_QUEUE_LOCATION = 'us-central1';
/** Plazo de despacho de la tarea: coincide con el `timeout` de 120 s de Cloud Run más margen (plan §6.1). */
export const SCENE_DISPATCH_DEADLINE = '130s';
const CLOUD_TASKS_HOST = 'https://cloudtasks.googleapis.com';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_TIMEOUT_MS = 10_000;
/** Cota de la caché del token de metadatos (~55 min, como el generador real). */
const TOKEN_CACHE_MS = 55 * 60 * 1000;

export interface CloudTasksDispatcherOptions {
  readonly projectId: string;
  readonly queue: string;
  /** `ARGOS_SCENE_WORKER_URL`: destino y audiencia. */
  readonly workerUrl: string;
  /** `ARGOS_SCENE_TASKS_SA_EMAIL`: cuenta con la que Cloud Tasks firma el token OIDC. */
  readonly serviceAccountEmail: string;
  readonly fetch?: typeof fetch;
  /** Token de acceso del servidor de metadatos; por defecto lo pide con caché. */
  readonly getAccessToken?: () => Promise<string>;
  readonly now?: () => number;
}

/** Error sin datos: solo un código estable que `classifyEnqueueError` entiende. */
class EnqueueError extends Error {
  constructor(
    message: string,
    readonly code?: 'ALREADY_EXISTS' | 'UNAVAILABLE' | 'DEADLINE_EXCEEDED',
  ) {
    super(message);
    this.name = 'EnqueueError';
  }
}

function metadataTokenProvider(fetchImpl: typeof fetch, now: () => number): () => Promise<string> {
  let cached: { token: string; until: number } | null = null;
  return async () => {
    if (cached !== null && cached.until > now()) return cached.token;
    const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error('token de metadatos no disponible');
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token === '') throw new Error('token de metadatos no disponible');
    cached = { token: body.access_token, until: now() + TOKEN_CACHE_MS };
    return cached.token;
  };
}

export class CloudTasksSceneDispatcher implements SceneJobDispatcherPort {
  private readonly queuePath: string;
  private readonly workerUrl: string;
  private readonly serviceAccountEmail: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;

  constructor(options: CloudTasksDispatcherOptions) {
    if (!isValidSceneProject(options.projectId) || !isValidSceneQueue(options.queue) || !isValidSceneWorkerUrl(options.workerUrl) || !isValidSchedulerEmail(options.serviceAccountEmail)) {
      throw new Error('Configuración del despachador de la escena inválida.');
    }
    this.queuePath = `projects/${options.projectId}/locations/${SCENE_QUEUE_LOCATION}/queues/${options.queue}`;
    this.workerUrl = options.workerUrl;
    this.serviceAccountEmail = options.serviceAccountEmail;
    this.fetchImpl = options.fetch ?? fetch;
    this.getAccessToken = options.getAccessToken ?? metadataTokenProvider(this.fetchImpl, options.now ?? (() => Date.now()));
  }

  async enqueue(job: SceneJob): Promise<void> {
    if (!UUID_V4.test(job.sceneId) || !UUID_V4.test(job.attemptId)) throw new Error('Trabajo de la escena inválido.');
    const task = {
      name: `${this.queuePath}/tasks/${job.attemptId}`,
      dispatchDeadline: SCENE_DISPATCH_DEADLINE,
      httpRequest: {
        httpMethod: 'POST',
        url: this.workerUrl,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ sceneId: job.sceneId, attemptId: job.attemptId }), 'utf8').toString('base64'),
        oidcToken: { serviceAccountEmail: this.serviceAccountEmail, audience: this.workerUrl },
      },
    };
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch {
      throw new EnqueueError('Cloud Tasks: sin token de acceso.', 'UNAVAILABLE');
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${CLOUD_TASKS_HOST}/v2/${this.queuePath}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new EnqueueError(timedOut ? 'Cloud Tasks: tiempo agotado.' : 'Cloud Tasks: sin respuesta.', timedOut ? 'DEADLINE_EXCEEDED' : 'UNAVAILABLE');
    }
    if (response.ok) return;
    const { status } = response;
    if (status === 409) throw new EnqueueError('Cloud Tasks: la tarea ya existía.', 'ALREADY_EXISTS');
    if (status === 429 || status >= 500) throw new EnqueueError(`Cloud Tasks: servicio no disponible (${status}).`, 'UNAVAILABLE');
    throw new EnqueueError(`Cloud Tasks: tarea rechazada (${status}).`);
  }
}
