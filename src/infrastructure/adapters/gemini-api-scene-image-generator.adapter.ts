/**
 * Generador de imágenes `gemini-api` (feature 006, T893; REQ-ESC6-037, REQ-ESC6-038, REQ-ESC6-035; INV-ESC6-016, INV-ESC6-018, INV-ESC6-020; SC-ESC6-099): cliente `fetch`
 * nativo de la Developer API de Gemini para el uso LOCAL PRIVADO de Neo, fuera de producción (la configuración rechaza el driver con `NODE_ENV=production`). Sin
 * dependencia npm, sin variables de entorno (la clave y el modelo llegan por constructor desde `app-config.ts`), sin `console.*` y SIN reintento interno (un 429 o un 5xx
 * es un intento FALLIDO; el reintento es del usuario). `redirect: 'error'`; la clave viaja solo en `x-goog-api-key`. NUNCA devuelve ni registra el cuerpo del proveedor, la
 * URL, las cabeceras, la clave ni el prompt: solo imagen o un código `ERR-SCENE-*` ya existente. El temporizador propio es `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` y se
 * combina con la señal de la petición; el worker aplica después `validateOutput` (lista blanca, sin `tEXt`) antes de guardar.
 *
 * @implements REQ-ESC6-037, REQ-ESC6-038, REQ-ESC6-035, INV-ESC6-016, INV-ESC6-018, INV-ESC6-020
 */

import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../application/ports/scene-image-generator.port.ts';
import {
  GEMINI_API_KEY_HEADER,
  GEMINI_INLINE_MAX_BYTES,
  GEMINI_OUTPUT_MAX_BYTES,
  buildGeminiBody,
  decodeGeminiImage,
  invalidOutputLogLine,
  geminiGenerateUrl,
  isSafeGeminiKey,
  isSafeGeminiModel,
  parseGeminiResponse,
  type GeminiModalities,
} from './gemini-api-wire.ts';

export interface GeminiApiSceneImageGeneratorOptions {
  /** `GEMINI_API_KEY` ya validada por `app-config.ts`; no se registra ni se copia en ningún mensaje. */
  readonly apiKey: string;
  /** `ARGOS_SCENE_GEMINI_MODEL` (se interpola en la ruta constante del proveedor). */
  readonly model: string;
  /** `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` (T_GEN, 10..105). */
  readonly timeoutSeconds: number;
  /** `fetch` inyectable (pruebas); por defecto el global, resuelto en cada llamada. */
  readonly fetch?: typeof fetch;
  /** `IMAGE` por defecto; `TEXT`+`IMAGE` si el modelo lo exige [no verificado con la documentación vigente]. */
  readonly responseModalities?: GeminiModalities;
  /** Tope del JSON de la petición; mayor devuelve `ERR-SCENE-GENERATION-FAILED` sin llamar a la red. */
  readonly maxInlineBytes?: number;
  /** Tope de la imagen decodificada que se acepta. */
  readonly maxOutputBytes?: number;
  /** Registro técnico de `INVALID_OUTPUT` (solo `scene-generator INVALID_OUTPUT mimeType=<MIME cerrado>`); sin él no se registra nada. */
  readonly log?: (line: string) => void;
}

const FAILED: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' };
const TIMEOUT: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' };
const INVALID: SceneGenerationResult = { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' };
/** Holgura de lectura sobre el base64 de la imagen máxima (JSON de envoltura). */
const ENVELOPE_SLACK_BYTES = 64 * 1024;

export class GeminiApiSceneImageGenerator implements SceneImageGeneratorPort {
  /** Campo `#` (privado de ES): ni `util.inspect` ni un volcado del objeto lo muestran. */
  readonly #apiKey: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly modalities: GeminiModalities;
  private readonly maxInlineBytes: number;
  private readonly maxOutputBytes: number;
  private readonly log: ((line: string) => void) | undefined;

  constructor(options: GeminiApiSceneImageGeneratorOptions) {
    // Los mensajes no incluyen valor alguno (ni de la clave ni del modelo).
    if (!isSafeGeminiModel(options.model)) throw new Error('Configuración del adaptador gemini-api inválida: modelo.');
    if (!isSafeGeminiKey(options.apiKey)) throw new Error('Configuración del adaptador gemini-api inválida: credencial.');
    this.#apiKey = options.apiKey;
    this.url = geminiGenerateUrl(options.model);
    this.timeoutMs = options.timeoutSeconds * 1000;
    this.fetchImpl = options.fetch;
    this.modalities = options.responseModalities ?? ['IMAGE'];
    this.maxInlineBytes = options.maxInlineBytes ?? GEMINI_INLINE_MAX_BYTES;
    this.maxOutputBytes = options.maxOutputBytes ?? GEMINI_OUTPUT_MAX_BYTES;
    this.log = options.log;
  }

  /** La clave no sale en `JSON.stringify` (y, por ser `#`, tampoco en `util.inspect`). */
  toJSON(): Record<string, never> {
    return {};
  }

  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    if (request.signal.aborted) return TIMEOUT;
    const body = buildGeminiBody(request.prompt, request.references, this.modalities, request.seed);
    if (Buffer.byteLength(body, 'utf8') > this.maxInlineBytes) return FAILED;

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      const response = await doFetch(this.url, {
        method: 'POST',
        redirect: 'error',
        headers: { [GEMINI_API_KEY_HEADER]: this.#apiKey, 'content-type': 'application/json' },
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
      if (decoded.ok) return { ok: true, image: { mime: decoded.mime, bytes: decoded.bytes } };
      this.log?.(invalidOutputLogLine(parsed.mimeType)); // solo el MIME cerrado: nunca bytes, prompt ni datos personales
      return INVALID;
    } catch {
      return controller.signal.aborted ? TIMEOUT : FAILED; // ni el mensaje ni la causa salen del adaptador
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
    }
  }
}

/** Fábrica para la composición: así solo este archivo nombra la clase (guarda T889, SC-ESC6-101). */
export const createGeminiApiSceneGenerator = (options: GeminiApiSceneImageGeneratorOptions): SceneImageGeneratorPort => new GeminiApiSceneImageGenerator(options);
