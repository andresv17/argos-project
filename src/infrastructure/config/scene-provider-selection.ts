/**
 * Lector EN CALIENTE del proveedor de la escena (feature 009, T1314; D9-30 (1)(2)(4); REQ-CFG9-002, INV-CFG9-003; SC-009-057): relee `scene.provider_driver` con caché <= 60 s por instancia y compone la
 * seleccion efectiva con el modelo y la region vigentes. Fila ausente o ilegible = defecto del despliegue (sin lanzar ni devolver el valor). Si el repositorio falla la lectura, la
 * seleccion es `configured: false` (falla cerrado), nunca otro proveedor. Este archivo NO lee `process.env`: la disponibilidad y el defecto llegan de `app-config.ts` por la composicion.
 *
 * @implements REQ-CFG9-002, INV-CFG9-003
 */

import type { PlatformParameterRepositoryPort } from '../../application/ports/platform-parameter.port.ts';
import {
  SCENE_DEFAULT_MODEL,
  SCENE_PARAM_DRIVER_KEY,
  SCENE_PARAM_MODEL_KEY,
  driverSupportsModel,
  resolveSceneProviderSelection,
  type SceneProviderDriver,
  type SceneProviderSelection,
} from '../../domain/scene/provider-parameters.ts';
import { SCENE_PARAMETERS_CACHE_MAX_TTL_MS } from './scene-provider-parameters.ts';

export function createSceneProviderSelectionReader(options: {
  readonly repository: PlatformParameterRepositoryPort;
  readonly available: readonly SceneProviderDriver[];
  readonly defaultDriver: SceneProviderDriver | null;
  /** Modelo de respaldo de `gemini-api` por entorno (`ARGOS_SCENE_GEMINI_MODEL`), solo local. */
  readonly geminiEnvModel?: string | null;
  /** Modelo y region de Vertex ya derivados (misma lectura en caliente que usa el generador Vertex). */
  readonly readVertexParameters?: () => Promise<{ readonly model: string; readonly location: string }>;
  readonly now: () => number;
  readonly cacheTtlMs?: number;
}): () => Promise<SceneProviderSelection> {
  const ttl = Math.min(Math.max(options.cacheTtlMs ?? SCENE_PARAMETERS_CACHE_MAX_TTL_MS, 0), SCENE_PARAMETERS_CACHE_MAX_TTL_MS);
  let cached: { readonly at: number; readonly value: SceneProviderSelection } | null = null;
  const closed = (model: string): SceneProviderSelection => ({ driver: null, configured: false, model, location: null });
  return async () => {
    const now = options.now();
    if (cached !== null && now - cached.at < ttl && now >= cached.at) return cached.value;
    let value: SceneProviderSelection;
    try {
      const rowDriver = await options.repository.findValue(SCENE_PARAM_DRIVER_KEY);
      const first = resolveSceneProviderSelection({ rowDriver, available: options.available, defaultDriver: options.defaultDriver, model: SCENE_DEFAULT_MODEL });
      if (first.driver === 'vertex' && options.readVertexParameters !== undefined) {
        const p = await options.readVertexParameters();
        value = resolveSceneProviderSelection({ rowDriver, available: options.available, defaultDriver: options.defaultDriver, model: p.model });
      } else if (first.driver === 'gemini-api') {
        const modelRow = await options.repository.findValue(SCENE_PARAM_MODEL_KEY);
        const env = options.geminiEnvModel ?? null;
        const model = modelRow !== null && driverSupportsModel('gemini-api', modelRow) ? modelRow : env !== null && driverSupportsModel('gemini-api', env) ? env : SCENE_DEFAULT_MODEL;
        value = resolveSceneProviderSelection({ rowDriver, available: options.available, defaultDriver: options.defaultDriver, model });
      } else value = first;
    } catch {
      return closed(SCENE_DEFAULT_MODEL); // un fallo de lectura falla cerrado y NO se cachea (la siguiente llamada relee)
    }
    cached = { at: now, value };
    return value;
  };
}
