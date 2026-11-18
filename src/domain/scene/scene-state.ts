/**
 * Máquina `STATE-SCENE-001` y derivación del estado (REQ-ESC6-003; data-model.md §4; ADR-006-09). Solo `generating` y `failed` se persisten (`run_state`); `idle`,
 * `outdated` y `ready` NO se guardan: `deriveStatus` los calcula en cada lectura con una función pura (sin proyección ni ganchos de recálculo). Las transiciones se
 * leen del contrato generado (`STATE_SCENE_001`); cualquier otra pareja se rechaza. También fija qué códigos `ERR-SCENE-*` son de superficie `SCENE_STATE` (solo
 * viajan en `SceneView.lastError`, no son respuestas HTTP, SC-ESC6-090) y cuáles sí son HTTP. Sin reloj ni entropía (INV-ESC6-001).
 *
 * @implements REQ-ESC6-003, INV-ESC6-001, STATE-SCENE-001, ERR-SCENE-GENERATION-FAILED, ERR-SCENE-GENERATION-TIMEOUT, ERR-SCENE-INVALID-IMAGE, ERR-SCENE-LEASE-EXPIRED, EDGE-ESC6-004, EDGE-ESC6-014, EDGE-ESC6-026, EDGE-ESC6-028, SC-ESC6-086, SC-ESC6-090
 */

import { STATE_SCENE_001, type StateScene001State } from '../../generated/v34/machines/home-scene.machine.ts';
import type { SceneErrorCode } from '../../generated/v34/schemas/types.ts';

export type SceneState = StateScene001State;

export type SceneTransitionResult = { readonly ok: true; readonly to: SceneState } | { readonly ok: false };

/** Transición válida del contrato o `{ ok: false }`; un evento puede listar varias causas separadas por `|`. */
export function transitionScene(from: SceneState, event: string): SceneTransitionResult {
  for (const t of STATE_SCENE_001.transitions) {
    if (t.from === from && t.event.split('|').map((e) => e.trim()).includes(event)) return { ok: true, to: t.to as SceneState };
  }
  return { ok: false };
}

export interface DeriveStatusInput {
  /** Instante de la lectura (UTC canónico), uno solo por operación. */
  readonly now: string;
  readonly runState: 'generating' | 'failed' | null;
  readonly leaseExpiresAt: string | null;
  readonly hasImage: boolean;
  /** Huella de la imagen vigente (`image_fingerprint`) o `null`. */
  readonly imageFingerprint: string | null;
  readonly imageDegraded: boolean;
  /** Huella calculada del estado vivo. */
  readonly fingerprintNow: string;
  /** Hay foto del hogar o al menos una mascota visible. */
  readonly hasInputs: boolean;
  /** Huella fijada por el último intento fallido (`current_attempt_id`), si `runState = 'failed'`. */
  readonly failedAttemptFingerprint: string | null;
  /** Código estable del último intento fallido. */
  readonly lastErrorCode: SceneErrorCode | null;
}

export interface DerivedStatus {
  readonly status: SceneState;
  /** Solo con `status = 'failed'`. */
  readonly lastError: SceneErrorCode | null;
  /** `true` si el arrendamiento venció: el caso de uso lo materializa por compare-and-set idempotente (data-model.md §7). */
  readonly leaseExpired: boolean;
}

/** Reglas en orden estricto (data-model.md §4). */
export function deriveStatus(input: DeriveStatusInput): DerivedStatus {
  if (input.runState === 'generating') {
    if (input.leaseExpiresAt !== null && input.leaseExpiresAt > input.now) return { status: 'generating', lastError: null, leaseExpired: false };
    return { status: 'failed', lastError: 'ERR-SCENE-LEASE-EXPIRED', leaseExpired: true };
  }
  if (input.runState === 'failed') {
    if (input.failedAttemptFingerprint !== null && input.fingerprintNow !== input.failedAttemptFingerprint) return { status: 'outdated', lastError: null, leaseExpired: false };
    return { status: 'failed', lastError: input.lastErrorCode ?? 'ERR-SCENE-GENERATION-FAILED', leaseExpired: false };
  }
  if (input.imageDegraded && input.hasImage) return { status: 'outdated', lastError: null, leaseExpired: false };
  if (input.hasImage && input.imageFingerprint === input.fingerprintNow) return { status: 'ready', lastError: null, leaseExpired: false };
  if (input.hasImage || input.hasInputs) return { status: 'outdated', lastError: null, leaseExpired: false };
  return { status: 'idle', lastError: null, leaseExpired: false };
}

/** Códigos de superficie `SCENE_STATE` del catálogo: viajan solo en `SceneView.lastError` y NO son respuesta HTTP (SC-ESC6-090). */
export const SCENE_STATE_ERROR_CODES: readonly SceneErrorCode[] = [
  'ERR-SCENE-GENERATION-FAILED',
  'ERR-SCENE-GENERATION-TIMEOUT',
  'ERR-SCENE-INVALID-IMAGE',
  'ERR-SCENE-LEASE-EXPIRED',
];

/** Códigos de la escena que sí son respuestas HTTP (403, 409 y 429 del contrato). */
export const HTTP_SCENE_ERROR_CODES: readonly string[] = ['ERR-SCENE-CONSENT-REQUIRED', 'ERR-SCENE-NOTICE-OUTDATED', 'ERR-SCENE-QUOTA-EXCEEDED'];

export const isSceneStateErrorCode = (code: string): code is SceneErrorCode => SCENE_STATE_ERROR_CODES.includes(code as SceneErrorCode);
export const isHttpSceneError = (code: string): boolean => HTTP_SCENE_ERROR_CODES.includes(code);
