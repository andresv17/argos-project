/**
 * Puerto del generador de imágenes de la escena (feature 006, REQ-ESC6-017). El adaptador real (Vertex AI por `fetch`, inactivo) vive solo en
 * `infrastructure/`; `application/` depende únicamente de este puerto (INV-ESC6-002, INV-ARCH-004). Todo es `Promise` (INV-ARCH-005).
 *
 * El generador devuelve imagen o un `SceneErrorCode`: NUNCA el cuerpo ni el mensaje del proveedor (INV-ESC6-016, REQ-ESC6-031).
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, INV-ESC6-002, INV-ESC6-016, INV-ARCH-005
 */

import type { SceneErrorCode } from '../../generated/v34/schemas/types.ts';

/** Referencia opaca `IMG_n` ya resuelta a bytes por el worker (REQ-ESC6-027). */
export interface SceneReferenceImage {
  readonly ref: `IMG_${number}`;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export interface SceneGenerationRequest {
  /** Texto compilado de `buildImagePrompt` (determinista). */
  readonly prompt: string;
  readonly references: ReadonlyArray<SceneReferenceImage>;
  /** Aborta la llamada al agotar `T_GEN`. */
  readonly signal: AbortSignal;
}

export type SceneGenerationResult =
  | { readonly ok: true; readonly image: { readonly mime: 'image/png' | 'image/webp'; readonly bytes: Uint8Array } }
  | { readonly ok: false; readonly code: SceneErrorCode };

export interface SceneImageGeneratorPort {
  generate(request: SceneGenerationRequest): Promise<SceneGenerationResult>;
}
