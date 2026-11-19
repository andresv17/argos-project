/**
 * Cableado PURO del driver `gemini-api` (feature 006, T893; REQ-ESC6-037, REQ-ESC6-038; INV-ESC6-016, INV-ESC6-018, INV-ESC6-020): URL constante, cuerpo `generateContent`,
 * lectura de la respuesta y firma de la imagen. Sin red, sin reloj, sin entorno y sin registros: el adaptador lo orquesta y las pruebas lo ejercen con `fetch` simulado.
 * Host y ruta son CONSTANTES del código (nunca de configuración ni de entrada de usuario, anti-SSRF); la clave NO forma parte de la URL (viaja en `x-goog-api-key`).
 *
 * @implements REQ-ESC6-037, REQ-ESC6-038, REQ-ESC6-035, INV-ESC6-016, INV-ESC6-018, INV-ESC6-020
 */

import type { SceneReferenceImage } from '../../application/ports/scene-image-generator.port.ts';

/** Host y prefijo de la Developer API de Gemini: constantes (solo este archivo y el adaptador pueden nombrarlos, T889). */
export const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
export const GEMINI_API_PATH_PREFIX = '/v1beta/models/';
/** Cabecera de la clave: nunca en la URL ni en `?key=` (REQ-ESC6-038). */
export const GEMINI_API_KEY_HEADER = 'x-goog-api-key';
/** Tope del JSON de la petición (con base64) [no verificado contra el límite real del proveedor; ajustable por constructor]. */
export const GEMINI_INLINE_MAX_BYTES = 18 * 1024 * 1024;
/** Tope agregado de bytes CRUDOS de referencias para este driver: 13 MiB (x 4/3 de base64 < 18 MiB del tope inline), menor que los 32 MiB de REQ-ESC6-027. */
export const GEMINI_REFERENCE_MAX_BYTES = 13 * 1024 * 1024;
/** Tope de la imagen decodificada que se acepta del proveedor (igual al de la composición, REQ-ESC6-035). */
export const GEMINI_OUTPUT_MAX_BYTES = 32 * 1024 * 1024;

export type GeminiModality = 'IMAGE' | 'TEXT';
export type GeminiModalities = readonly ['IMAGE'] | readonly ['TEXT', 'IMAGE'];

const MODEL_PATTERN = /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,56}$/;
const KEY_PATTERN = /^[\x21-\x7e]{20,256}$/;

/** Modelo seguro para interpolar en la ruta: sin `/`, `?`, `#`, espacios ni `..`. */
export const isSafeGeminiModel = (model: string): boolean => MODEL_PATTERN.test(model) && !model.includes('..');
export const isSafeGeminiKey = (key: string): boolean => KEY_PATTERN.test(key);

/** URL exacta de `generateContent` (sin consulta y sin la clave). */
export const geminiGenerateUrl = (model: string): string => `${GEMINI_API_ORIGIN}${GEMINI_API_PATH_PREFIX}${model}:generateContent`;

/** Cuerpo `generateContent`: el texto del prompt primero y luego cada referencia `inlineData` en el orden recibido (`IMG_1..IMG_n`, ya fijado por el worker). */
export function buildGeminiBody(prompt: string, references: ReadonlyArray<SceneReferenceImage>, modalities: GeminiModalities): string {
  return JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }, ...references.map((r) => ({ inlineData: { mimeType: r.mime, data: Buffer.from(r.bytes).toString('base64') } }))],
      },
    ],
    generationConfig: { responseModalities: [...modalities] },
  });
}

export type GeminiParsed =
  | { readonly kind: 'image'; readonly mimeType: string; readonly data: string }
  | { readonly kind: 'none' };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Primera parte `inlineData` con `data` del primer candidato; ignora texto y bloqueos (el motivo del proveedor jamás se copia). */
export function parseGeminiResponse(text: string): GeminiParsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'none' };
  }
  if (!isRecord(json) || !Array.isArray(json['candidates'])) return { kind: 'none' };
  const first: unknown = json['candidates'][0];
  const content = isRecord(first) ? first['content'] : undefined;
  const parts = isRecord(content) ? content['parts'] : undefined;
  if (!Array.isArray(parts)) return { kind: 'none' };
  for (const part of parts as unknown[]) {
    const inline = isRecord(part) ? part['inlineData'] : undefined;
    if (isRecord(inline) && typeof inline['data'] === 'string' && typeof inline['mimeType'] === 'string') return { kind: 'image', mimeType: inline['mimeType'], data: inline['data'] };
  }
  return { kind: 'none' };
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bytes que implica un base64 sin decodificarlo (cota superior). */
export const base64DecodedLength = (data: string): number => Math.floor((data.length * 3) / 4);

export type GeminiDecoded =
  | { readonly ok: true; readonly mime: 'image/png' | 'image/webp'; readonly bytes: Uint8Array }
  | { readonly ok: false };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));

/**
 * Decodifica el base64 con tope y NO confía en el `mimeType` del proveedor: el tipo sale de la firma de los bytes (PNG o WebP) y debe coincidir con el declarado. La
 * reescritura por lista blanca (sin `tEXt`) la hace después `validateOutput` del worker (REQ-ESC6-035).
 */
export function decodeGeminiImage(mimeType: string, data: string, maxBytes: number): GeminiDecoded {
  if (data.length === 0 || !BASE64.test(data) || base64DecodedLength(data) > maxBytes) return { ok: false };
  const bytes = new Uint8Array(Buffer.from(data, 'base64'));
  if (bytes.length === 0 || bytes.length > maxBytes) return { ok: false };
  if (bytes.length >= 8 && PNG_SIGNATURE.every((x, i) => bytes[i] === x)) return mimeType === 'image/png' ? { ok: true, mime: 'image/png', bytes } : { ok: false };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return mimeType === 'image/webp' ? { ok: true, mime: 'image/webp', bytes } : { ok: false };
  return { ok: false };
}
