/**
 * Generador de imágenes Vertex AI (feature 006, Fase 14, T946; D6-22, ADR-006-21; REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001; INV-ESC6-016, INV-ESC6-018): cliente `fetch`
 * nativo de `generateContent` de Vertex AI con el token OAuth2 del metadata server de Cloud Run (SIN clave de API, SIN `x-goog-api-key`, SIN SDK ni `google-auth-library`).
 * El cuerpo, el parseo de la respuesta y la decodificación de la imagen son los de `gemini-api-wire.ts` (importados, no copiados). Host `{location}-aiplatform.googleapis.com`
 * con `location` en LISTA CERRADA y ruta `.../publishers/google/models/{model}:generateContent` con `model` por regex cerrada: ninguno sale de entrada de usuario (anti-SSRF).
 * SIN reintento interno (un 429 o un 5xx es un intento FALLIDO), `redirect: 'error'`, un único `AbortSignal` (T_GEN + la señal de la petición) que cubre token y proveedor.
 * NUNCA devuelve ni registra el cuerpo del proveedor, la URL, las cabeceras, el token ni el prompt: solo imagen o un código `ERR-SCENE-*` ya existente.
 *
 * @implements INV-CFG9-001, REQ-ESC6-017, REQ-ESC6-031, NFR-ESC6-001, INV-ESC6-016, INV-ESC6-018
 */

import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../application/ports/scene-image-generator.port.ts';
import { SCENE_GLOBAL_LOCATION_ENABLED, isAllowedSceneLocation, isSafeSceneModel } from '../../domain/scene/provider-parameters.ts';
import {
  GEMINI_INLINE_MAX_BYTES,
  GEMINI_OUTPUT_MAX_BYTES,
  buildGeminiBody,
  decodeGeminiImage,
  isSafeGeminiModel,
  parseGeminiResponse,
  type GeminiModalities,
} from './gemini-api-wire.ts';
import { createMetadataTokenClient } from './metadata-token-client.ts';

/** Sufijo constante del host regional de Vertex AI (solo este archivo lo nombra). */
const VERTEX_HOST_SUFFIX = '-aiplatform.googleapis.com';
/** Host de la región `global`: inalcanzable mientras `SCENE_GLOBAL_LOCATION_ENABLED` sea `false` (Enmienda 009-B, condición (g)). */
const VERTEX_GLOBAL_HOST = 'aiplatform.googleapis.com';
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export interface VertexSceneImageGeneratorOptions {
  /** `ARGOS_SCENE_PROJECT_ID` ya validado por `app-config.ts`. */
  readonly projectId: string;
  /** Región en lista cerrada (`platform_parameters` o `ARGOS_SCENE_LOCATION`). Opcional solo si hay `getParameters`. */
  readonly location?: string;
  /** Modelo (`platform_parameters` o `ARGOS_SCENE_MODEL`); se interpola en la ruta. Opcional solo si hay `getParameters`. */
  readonly model?: string;
  /** Relectura en caliente (T1265): modelo y región vigentes; la URL se compone EN CADA llamada y un valor inválido o un fallo de lectura falla cerrado sin `fetch`. */
  readonly getParameters?: () => Promise<{ readonly model: string; readonly location: string }>;
  /** `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` (T_GEN, 10..105). */
  readonly timeoutSeconds: number;
  /** `fetch` inyectable (pruebas); por defecto el global, resuelto en cada llamada. */
  readonly fetch?: typeof fetch;
  /** Token inyectable (pruebas); por defecto el del metadata server con caché de vencimiento anticipado. */
  readonly getAccessToken?: (signal: AbortSignal) => Promise<string>;
  /** Reloj de la caché del token (pruebas). */
  readonly now?: () => number;
  readonly responseModalities?: GeminiModalities;
  readonly maxInlineBytes?: number;
  readonly maxOutputBytes?: number;
}

const FAILED: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' };
const TIMEOUT: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' };
const INVALID: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' };
const ENVELOPE_SLACK_BYTES = 64 * 1024;

export class VertexSceneImageGenerator implements SceneImageGeneratorPort {
  private readonly projectId: string;
  private readonly staticParams: { readonly model: string; readonly location: string } | null;
  private readonly getParameters: (() => Promise<{ readonly model: string; readonly location: string }>) | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly modalities: GeminiModalities;
  private readonly maxInlineBytes: number;
  private readonly maxOutputBytes: number;
  readonly #getAccessToken: (signal: AbortSignal) => Promise<string>;

  constructor(options: VertexSceneImageGeneratorOptions) {
    // Los mensajes no incluyen valor alguno.
    if (!PROJECT_PATTERN.test(options.projectId) || options.projectId.includes('..')) throw new Error('Configuración del adaptador vertex inválida: proyecto.');
    this.projectId = options.projectId;
    this.getParameters = options.getParameters;
    if (options.getParameters === undefined || options.location !== undefined || options.model !== undefined) {
      if (options.location === undefined || !isAllowedSceneLocation(options.location)) throw new Error('Configuración del adaptador vertex inválida: región.');
      if (options.model === undefined || !isSafeGeminiModel(options.model) || !isSafeSceneModel(options.model)) throw new Error('Configuración del adaptador vertex inválida: modelo.');
      this.staticParams = { model: options.model, location: options.location };
    } else this.staticParams = null;
    this.timeoutMs = options.timeoutSeconds * 1000;
    this.fetchImpl = options.fetch;
    this.modalities = options.responseModalities ?? ['IMAGE'];
    this.maxInlineBytes = options.maxInlineBytes ?? GEMINI_INLINE_MAX_BYTES;
    this.maxOutputBytes = options.maxOutputBytes ?? GEMINI_OUTPUT_MAX_BYTES;
    if (options.getAccessToken !== undefined) this.#getAccessToken = options.getAccessToken;
    else {
      const client = createMetadataTokenClient({ ...(options.fetch === undefined ? {} : { fetch: options.fetch }), ...(options.now === undefined ? {} : { now: options.now }) });
      this.#getAccessToken = (signal) => client.getAccessToken(signal);
    }
  }

  /** Ni el token ni la configuración salen en `JSON.stringify`. */
  toJSON(): Record<string, never> {
    return {};
  }

  /** URL de la llamada: región y modelo vigentes validados ahora; `null` si no son válidos (anti-SSRF, sin eco del valor). */
  private async resolveUrl(): Promise<string | null> {
    const params = this.getParameters === undefined ? this.staticParams : await this.getParameters();
    if (params === null || typeof params.location !== 'string' || typeof params.model !== 'string') return null;
    const { location, model } = params;
    if (!isAllowedSceneLocation(location) || !isSafeGeminiModel(model) || !isSafeSceneModel(model)) return null;
    const host = SCENE_GLOBAL_LOCATION_ENABLED && location === 'global' ? VERTEX_GLOBAL_HOST : `${location}${VERTEX_HOST_SUFFIX}`;
    return `https://${host}/v1/projects/${this.projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  }

  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    if (request.signal.aborted) return TIMEOUT;
    let url: string | null;
    try {
      url = await this.resolveUrl();
    } catch {
      return FAILED; // lectura de parámetros rota: falla cerrado, sin host por defecto
    }
    if (url === null) return FAILED;
    const body = buildGeminiBody(request.prompt, request.references, this.modalities, request.seed);
    if (Buffer.byteLength(body, 'utf8') > this.maxInlineBytes) return FAILED;

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const token = await this.#getAccessToken(controller.signal);
      if (controller.signal.aborted) return TIMEOUT;
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      const response = await doFetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined); // el cuerpo de error no se lee ni se copia (INV-ESC6-016)
        return FAILED;
      }
      const readLimit = Math.ceil((this.maxOutputBytes * 4) / 3) + ENVELOPE_SLACK_BYTES;
      const announced = Number(response.headers.get('content-length'));
      if (Number.isFinite(announced) && announced > readLimit) {
        await response.body?.cancel().catch(() => undefined);
        return FAILED;
      }
      const text = await response.text();
      if (text.length > readLimit) return FAILED;
      const parsed = parseGeminiResponse(text);
      if (parsed.kind === 'none') return FAILED;
      const decoded = decodeGeminiImage(parsed.mimeType, parsed.data, this.maxOutputBytes);
      return decoded.ok ? { ok: true, image: { mime: decoded.mime, bytes: decoded.bytes } } : INVALID;
    } catch {
      return controller.signal.aborted ? TIMEOUT : FAILED; // ni el mensaje ni la causa salen del adaptador
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
    }
  }
}

/** Fábrica para la composición: así solo este archivo nombra la clase. */
export const createVertexSceneGenerator = (options: VertexSceneImageGeneratorOptions): SceneImageGeneratorPort => new VertexSceneImageGenerator(options);
