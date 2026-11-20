/**
 * Lectura de los parámetros del proveedor de la escena desde `platform_parameters` con respaldo en el entorno ya validado (feature 006, Fase 14, T948; D6-22; REQ-ESC6-017,
 * REQ-ESC6-031): este archivo NO lee `process.env` ni `.env` (el entorno llega por `SceneConfig`, único lector `app-config.ts`) y solo hace `SELECT` por clave cerrada. Una fila
 * fuera de lista cerrada o de regex rechaza el arranque con la clave, nunca el valor.
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031
 */

import type { PlatformParameterRepositoryPort } from '../../application/ports/platform-parameter.port.ts';
import {
  SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
  SCENE_PARAM_LOCATION_KEY,
  SCENE_PARAM_MODEL_KEY,
  SceneParameterError,
  parseSceneGlobalQuotaMax,
  resolveSceneProviderParameters,
  type SceneProviderParameters,
} from '../../domain/scene/provider-parameters.ts';
import type { SceneConfig } from './app-config.ts';

type SceneEnvBackup = Pick<SceneConfig, 'globalQuotaMax' | 'model' | 'location'>;

/** Fila > entorno > defecto para las tres claves; rechaza (lanza `SceneParameterError`) una fila inválida. */
export async function loadSceneProviderParameters(repository: PlatformParameterRepositoryPort, env: SceneEnvBackup): Promise<SceneProviderParameters> {
  const [globalQuotaMax, model, location] = await Promise.all([
    repository.findValue(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY),
    repository.findValue(SCENE_PARAM_MODEL_KEY),
    repository.findValue(SCENE_PARAM_LOCATION_KEY),
  ]);
  return resolveSceneProviderParameters({ db: { globalQuotaMax, model, location }, env: { globalQuotaMax: env.globalQuotaMax, model: env.model, location: env.location } });
}

/** Lector del tope global que vuelve a consultar la fila en cada llamada (editable luego desde el portal admin); una fila inválida lanza. */
export function createSceneGlobalQuotaMaxReader(repository: PlatformParameterRepositoryPort, fallback: number): () => Promise<number> {
  return async () => {
    const raw = await repository.findValue(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY);
    if (raw === null) return fallback;
    const parsed = parseSceneGlobalQuotaMax(raw);
    if (parsed === null) throw new SceneParameterError([SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]);
    return parsed;
  };
}
