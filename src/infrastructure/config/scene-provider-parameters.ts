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
  SCENE_DEFAULT_GLOBAL_QUOTA_MAX,
  SCENE_DEFAULT_LOCATION,
  deriveLocation,
  SCENE_DEFAULT_MODEL,
  SCENE_PARAM_MODEL_KEY,
  SceneParameterError,
  isSafeSceneModel,
  parseSceneGlobalQuotaMax,
  resolveSceneProviderParameters,
  type SceneProviderParameters,
} from '../../domain/scene/provider-parameters.ts';
import { DEFAULT_PROMPT_BLOCKS, PROMPT_BLOCK_MAX_LENGTH, validatePromptBlocks, type PromptBlocks } from '../../domain/scene/prompt-blocks.ts';
import type { SceneConfig } from './app-config.ts';

type SceneEnvBackup = Pick<SceneConfig, 'globalQuotaMax' | 'model' | 'location'>;

/** Fila > entorno > defecto para las tres claves; rechaza (lanza `SceneParameterError`) una fila inválida. */
export async function loadSceneProviderParameters(repository: PlatformParameterRepositoryPort, env: SceneEnvBackup): Promise<SceneProviderParameters> {
  const [globalQuotaMax, model] = await Promise.all([repository.findValue(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY), repository.findValue(SCENE_PARAM_MODEL_KEY)]);
  return resolveSceneProviderParameters({ db: { globalQuotaMax, model }, env: { globalQuotaMax: env.globalQuotaMax, model: env.model } });
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

/** Tope de la caché del lector en caliente: la relectura de `platform_parameters` nunca se retrasa más de 60 s (REQ-CFG9-002, SC-009-023). */
export const SCENE_PARAMETERS_CACHE_MAX_TTL_MS = 60_000;

/**
 * Lector EN CALIENTE de modelo y tope (la región se deriva del modelo, D9-29) (T1265; REQ-CFG9-002, INV-CFG9-003, EDGE-009-018, EDGE-009-046): relee las dos filas con caché <= 60 s. Una fila ilegible, fuera de
 * lista o `global` NO lanza: esa clave cae al respaldo de entorno y, en su defecto, al defecto de código; el valor inválido no se devuelve ni se registra. Si el repositorio falla
 * la lectura propaga el error (el adaptador falla cerrado).
 */
export function createSceneProviderParametersReader(options: {
  readonly repository: PlatformParameterRepositoryPort;
  readonly env: SceneEnvBackup;
  readonly now: () => number;
  readonly cacheTtlMs?: number;
}): () => Promise<SceneProviderParameters> {
  const ttl = Math.min(Math.max(options.cacheTtlMs ?? SCENE_PARAMETERS_CACHE_MAX_TTL_MS, 0), SCENE_PARAMETERS_CACHE_MAX_TTL_MS);
  let cached: { readonly at: number; readonly value: SceneProviderParameters } | null = null;
  return async () => {
    const now = options.now();
    if (cached !== null && now - cached.at < ttl && now >= cached.at) return cached.value;
    const [quotaRaw, modelRaw] = await Promise.all([options.repository.findValue(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY), options.repository.findValue(SCENE_PARAM_MODEL_KEY)]);
    const quotaParsed = quotaRaw === null ? null : parseSceneGlobalQuotaMax(quotaRaw);
    const envModel = options.env.model ?? SCENE_DEFAULT_MODEL;
    // D9-29 / INV-CFG9-001: la region se DERIVA del modelo; un modelo sin par con coste de fuente nunca se devuelve y cae al respaldo de entorno o al defecto del codigo, sin eco del valor.
    const dbModel = modelRaw !== null && isSafeSceneModel(modelRaw) && deriveLocation('vertex', modelRaw) !== null ? modelRaw : null;
    const model = dbModel ?? (deriveLocation('vertex', envModel) !== null ? envModel : SCENE_DEFAULT_MODEL);
    const location = deriveLocation('vertex', model) ?? SCENE_DEFAULT_LOCATION;
    const value: SceneProviderParameters = {
      globalQuotaMax: quotaParsed ?? options.env.globalQuotaMax ?? SCENE_DEFAULT_GLOBAL_QUOTA_MAX,
      model,
      location,
    };
    cached = { at: now, value };
    return value;
  };
}

/**
 * Lector EN CALIENTE de `scene.prompt.blocks` (T1306; REQ-CFG9-002, REQ-CFG9-005, INV-CFG9-003): cache <= 60 s; fila ausente, invalida o ilegible = bloques de codigo, sin lanzar ni devolver el valor.
 */
export function createScenePromptBlocksReader(options: { readonly repository: PlatformParameterRepositoryPort; readonly now: () => number; readonly cacheTtlMs?: number }): () => Promise<PromptBlocks> {
  const ttl = Math.min(Math.max(options.cacheTtlMs ?? SCENE_PARAMETERS_CACHE_MAX_TTL_MS, 0), SCENE_PARAMETERS_CACHE_MAX_TTL_MS);
  let cached: { readonly at: number; readonly value: PromptBlocks } | null = null;
  return async () => {
    const now = options.now();
    if (cached !== null && now - cached.at < ttl && now >= cached.at) return cached.value;
    let value: PromptBlocks = DEFAULT_PROMPT_BLOCKS;
    try {
      const raw = await options.repository.findValue('scene.prompt.blocks');
      const checked = raw === null ? null : validatePromptBlocks(raw, PROMPT_BLOCK_MAX_LENGTH);
      if (checked !== null && checked.ok) value = checked.blocks;
    } catch {
      value = DEFAULT_PROMPT_BLOCKS;
    }
    cached = { at: now, value };
    return value;
  };
}
