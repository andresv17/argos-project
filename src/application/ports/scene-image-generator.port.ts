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
  /** Etiqueta semántica CERRADA (`IMG_2 (Pet 1 - dog):`, solo enums de dominio; `reference-labels.ts`); el cableado la valida y, si falta o no cumple, usa `IMG_n:`. */
  readonly label?: string;
}

export interface SceneGenerationRequest {
  /**
   * Texto compilado de `buildImagePrompt` (determinista). INV-IA11-002 (011, REQ-IA11-003, D11-08 = A): el prompt vive SOLO en memoria durante la llamada. Regla para todo
   * adaptador (incluidos los futuros que consulten un LLM): no se persiste, no se devuelve en `SceneGenerationResult` ni en errores, no se registra en logs ni en trazas,
   * no se incrusta en los bytes de la imagen y no se hashea para guardar. Contiene biografías saneadas de mascotas: es dato derivado de personas. Solo sale del proceso
   * en el cuerpo de la petición al proveedor y nunca se conserva su copia.
   */
  readonly prompt: string;
  readonly references: ReadonlyArray<SceneReferenceImage>;
  /** Semilla determinista del intento (`deriveSceneSeed(attempt.id)`, REQ-ESC7-007): el adaptador real la traslada a `generationConfig.seed`; no se persiste ni se registra. */
  readonly seed: number;
  /** Aborta la llamada al agotar `T_GEN`. */
  readonly signal: AbortSignal;
}

export type SceneGenerationResult =
  | { readonly ok: true; readonly image: { readonly mime: 'image/png' | 'image/webp' | 'image/jpeg'; readonly bytes: Uint8Array } }
  | { readonly ok: false; readonly code: SceneErrorCode };

export interface SceneImageGeneratorPort {
  generate(request: SceneGenerationRequest): Promise<SceneGenerationResult>;
}
