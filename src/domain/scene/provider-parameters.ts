/**
 * Parámetros del proveedor Vertex AI de la escena (feature 006, Fase 14, T946/T948; D6-22; REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001): claves de `platform_parameters`, valores
 * por defecto, lista cerrada de regiones y regex del modelo. PURO: sin entorno, sin reloj, sin E/S. La lectura de la fila y del entorno es de `infrastructure/`.
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, NFR-ESC6-001
 */

import { SCENE_COST_TABLE_MICRO_USD, sceneCostCeiling } from './scene-cost.ts';

/** Claves en `platform_parameters` (texto); si la fila no existe rige el respaldo de entorno y, en su defecto, el valor por defecto. */
export const SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY = 'scene.global_quota_max';
export const SCENE_PARAM_MODEL_KEY = 'scene.provider_model';
export const SCENE_PARAM_LOCATION_KEY = 'scene.provider_location';
/** Prefijo de la fila contador de la ventana mensual: `scene.global_quota_used.YYYY-MM` (valor entero en texto). */
export const SCENE_GLOBAL_QUOTA_USED_PREFIX = 'scene.global_quota_used.';

export const SCENE_DEFAULT_GLOBAL_QUOTA_MAX = 5;
export const SCENE_DEFAULT_MODEL = 'gemini-2.5-flash-image';
export const SCENE_DEFAULT_LOCATION = 'us-central1';
/**
 * Region `global` LATENTE (Enmienda 009-B, condicion (g); EDGE-009-046): constante de CODIGO, no clave de `platform_parameters` ni del catalogo de /admin. Con `false` la region
 * `global` no esta en la lista cerrada y se rechaza en cualquier forma; activarla exige una enmienda aprobada por Neo.
 */
export const SCENE_GLOBAL_LOCATION_ENABLED = false as boolean;

/** Lista cerrada de regiones de Vertex AI admitidas (el host se compone solo con una de ellas, anti-SSRF). */
export const SCENE_ALLOWED_LOCATIONS: readonly string[] = [
  'us-central1',
  'us-east1',
  'us-east4',
  'us-east5',
  'us-south1',
  'us-west1',
  'us-west4',
  'northamerica-northeast1',
  'europe-west1',
  'europe-west2',
  'europe-west3',
  'europe-west4',
  'europe-west9',
  'asia-northeast1',
  'asia-southeast1',
];

/** Regiones aceptables: lista cerrada (sensible a caja, sin espacios ni rutas); `global` solo detras de `SCENE_GLOBAL_LOCATION_ENABLED`. */
export const isAllowedSceneLocation = (value: string): boolean => SCENE_ALLOWED_LOCATIONS.includes(value) || (SCENE_GLOBAL_LOCATION_ENABLED && value === 'global');

const MODEL_PATTERN = /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,56}$/;
/** Modelo seguro para interpolar en la ruta: empieza por `gemini-`, sin `/`, `?`, `#`, espacios ni `..`. */
export const isSafeSceneModel = (value: string): boolean => MODEL_PATTERN.test(value) && !value.includes('..');

/** Techo del tope global DERIVADO de la tabla de costes aprobada (floor(5_000_000 / costeMin) = 111); 0 con la tabla vacia (nada es editable). */
export const SCENE_GLOBAL_QUOTA_MAX_DERIVED_CEILING: number = sceneCostCeiling(SCENE_COST_TABLE_MICRO_USD) ?? 0;

const QUOTA_TEXT = /^[1-9][0-9]{0,3}$/;
export const parseSceneGlobalQuotaMax = (value: string): number | null => {
  if (!QUOTA_TEXT.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= SCENE_GLOBAL_QUOTA_MAX_DERIVED_CEILING ? parsed : null;
};

export interface SceneProviderParameters {
  readonly globalQuotaMax: number;
  readonly model: string;
  readonly location: string;
}

/** Error de arranque: nombra solo la clave, jamás el valor. */
export class SceneParameterError extends Error {
  constructor(readonly keys: readonly string[]) {
    super(`Parámetro de la escena inválido: ${keys.join(', ')}.`);
    this.name = 'SceneParameterError';
  }
}

export interface SceneParameterSources {
  /** Texto de la fila de `platform_parameters` (o `null` si no existe). */
  readonly db: { readonly globalQuotaMax: string | null; readonly model: string | null; readonly location: string | null };
  /** Respaldo de entorno ya validado por `app-config.ts` (o `null` si no se definió). */
  readonly env: { readonly globalQuotaMax: number | null; readonly model: string | null; readonly location: string | null };
}

/** Fila de `platform_parameters` > respaldo de entorno > valor por defecto. Una fila presente pero fuera de rango, de lista o de regex rechaza el arranque. */
export function resolveSceneProviderParameters(sources: SceneParameterSources): SceneProviderParameters {
  const invalid: string[] = [];
  let globalQuotaMax = sources.env.globalQuotaMax ?? SCENE_DEFAULT_GLOBAL_QUOTA_MAX;
  if (sources.db.globalQuotaMax !== null) {
    const parsed = parseSceneGlobalQuotaMax(sources.db.globalQuotaMax);
    if (parsed === null) invalid.push(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY);
    else globalQuotaMax = parsed;
  }
  let model = sources.env.model ?? SCENE_DEFAULT_MODEL;
  if (sources.db.model !== null) {
    if (isSafeSceneModel(sources.db.model)) model = sources.db.model;
    else invalid.push(SCENE_PARAM_MODEL_KEY);
  }
  let location = sources.env.location ?? SCENE_DEFAULT_LOCATION;
  if (sources.db.location !== null) {
    if (isAllowedSceneLocation(sources.db.location)) location = sources.db.location;
    else invalid.push(SCENE_PARAM_LOCATION_KEY);
  }
  if (invalid.length > 0) throw new SceneParameterError(invalid);
  return { globalQuotaMax, model, location };
}
