/**
 * Catalogo CERRADO de los parametros editables desde `/admin` (Feature 009, Fase 5a, #20; REQ-CFG9-001, REQ-CFG9-007, INV-CFG9-003; contrato `admin.openapi.yaml` 1.4.0).
 * Fuente unica en codigo de clave, tipo, defecto, restricciones y si la clave es escribible en esta entrega (P5-06 = B: en 5a solo `album.max_photos_per_pet` y `scene.enabled`).
 * PURO: sin E/S ni reloj. La fila de `platform_parameters` solo guarda texto; aqui se interpreta. Fila ausente o ilegible = defecto del codigo (nunca un error, INV-CFG9-003).
 * Una clave nueva exige tocar este catalogo, la siembra y el contrato.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-003, REQ-CFG9-007, REQ-CFG9-008, INV-CFG9-003, EDGE-009-014
 */

import { DEFAULT_PROMPT_BLOCKS, PROMPT_BLOCK_MAX_LENGTH, validatePromptBlocks } from '../scene/prompt-blocks.ts';
import {
  SCENE_ALLOWED_LOCATIONS,
  SCENE_DEFAULT_GLOBAL_QUOTA_MAX,
  SCENE_DEFAULT_LOCATION,
  SCENE_DEFAULT_MODEL,
  SCENE_GLOBAL_QUOTA_MAX_DERIVED_CEILING,
  SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
  SCENE_PARAM_LOCATION_KEY,
  SCENE_PARAM_MODEL_KEY,
  isAllowedSceneLocation,
  parseSceneGlobalQuotaMax,
} from '../scene/provider-parameters.ts';
import { ALBUM_MAX_PHOTOS_PER_PET_KEY, PARAMETER_CATALOG, interpretParameter } from './platform-parameters.ts';

export const SCENE_ENABLED_KEY = 'scene.enabled' as const;
export const SCENE_PROMPT_BLOCKS_KEY = 'scene.prompt.blocks' as const;
export { PROMPT_BLOCK_MAX_LENGTH };

/** Orden FIJO del catalogo (el de la respuesta de `listAdminParameters`). */
export const ADMIN_PARAMETER_KEYS = [
  ALBUM_MAX_PHOTOS_PER_PET_KEY,
  SCENE_ENABLED_KEY,
  SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
  SCENE_PARAM_MODEL_KEY,
  SCENE_PARAM_LOCATION_KEY,
  SCENE_PROMPT_BLOCKS_KEY,
] as const;
export type AdminParameterKey = (typeof ADMIN_PARAMETER_KEYS)[number];

/** Modelos admitidos (lista cerrada de 3, contrato 1.4.0). */
export const SCENE_ALLOWED_MODELS: readonly string[] = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'];

export interface AdminParameterConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly allowed?: readonly string[];
  /** Largo maximo por bloque de `scene.prompt.blocks` (A-3, cota de ergonomia). */
  readonly maxBlockLength?: number;
}

export interface AdminParameterSpec {
  readonly key: AdminParameterKey;
  readonly valueType: 'INTEGER' | 'BOOLEAN' | 'STRING' | 'JSON_BLOCKS';
  readonly defaultValue: string;
  readonly constraints: AdminParameterConstraints;
  /** `false` en las claves de la subfase 5b (P5-06 = B): se declaran, pero su escritura es 422 sin escribir. */
  readonly writable: boolean;
  /** Descripcion de la fila si la escritura debe crearla (fila ausente de una clave del catalogo: no es una clave nueva). */
  readonly description: string;
  /** `true` si el texto es el valor canonico EXACTO de la clave (se usa al escribir: sin recortar ni normalizar). */
  isCanonical(raw: string): boolean;
  /** `true` si la fila guardada es legible y rige (si no, rige el defecto). Es lo que lee la aplicacion en caliente. */
  isEffective(raw: string): boolean;
}

const albumSpec = PARAMETER_CATALOG[ALBUM_MAX_PHOTOS_PER_PET_KEY];
const CANONICAL_INTEGER = /^[1-9][0-9]{0,15}$/;
const isBooleanText = (raw: string): boolean => raw === 'true' || raw === 'false';

export const ADMIN_PARAMETER_CATALOG: Readonly<Record<AdminParameterKey, AdminParameterSpec>> = {
  [ALBUM_MAX_PHOTOS_PER_PET_KEY]: {
    key: ALBUM_MAX_PHOTOS_PER_PET_KEY,
    valueType: 'INTEGER',
    defaultValue: String(albumSpec.defaultValue),
    constraints: { min: albumSpec.min, max: albumSpec.max },
    writable: true,
    description: 'Máximo de fotos de álbum por mascota',
    isCanonical: (raw) => CANONICAL_INTEGER.test(raw) && Number(raw) >= albumSpec.min && Number(raw) <= albumSpec.max,
    // La misma lectura que usa el tope real del album (`interpretParameter`): lo que se muestra es lo que rige.
    isEffective: (raw) => interpretParameter(ALBUM_MAX_PHOTOS_PER_PET_KEY, raw).warning === null,
  },
  [SCENE_ENABLED_KEY]: {
    key: SCENE_ENABLED_KEY,
    valueType: 'BOOLEAN',
    defaultValue: 'true',
    constraints: { allowed: ['true', 'false'] },
    writable: true,
    description: 'Interruptor de la creación de imágenes de la escena del hogar',
    isCanonical: isBooleanText,
    isEffective: isBooleanText,
  },
  [SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY]: {
    key: SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
    valueType: 'INTEGER',
    defaultValue: String(SCENE_DEFAULT_GLOBAL_QUOTA_MAX),
    constraints: { min: 1, max: SCENE_GLOBAL_QUOTA_MAX_DERIVED_CEILING },
    writable: true,
    description: 'Cuota global mensual de imágenes de escena',
    isCanonical: (raw) => parseSceneGlobalQuotaMax(raw) !== null,
    isEffective: (raw) => parseSceneGlobalQuotaMax(raw) !== null,
  },
  [SCENE_PARAM_MODEL_KEY]: {
    key: SCENE_PARAM_MODEL_KEY,
    valueType: 'STRING',
    defaultValue: SCENE_DEFAULT_MODEL,
    constraints: { allowed: SCENE_ALLOWED_MODELS },
    writable: true,
    description: 'Modelo de generación de imágenes de escena',
    isCanonical: (raw) => SCENE_ALLOWED_MODELS.includes(raw),
    isEffective: (raw) => SCENE_ALLOWED_MODELS.includes(raw),
  },
  [SCENE_PARAM_LOCATION_KEY]: {
    key: SCENE_PARAM_LOCATION_KEY,
    valueType: 'STRING',
    defaultValue: SCENE_DEFAULT_LOCATION,
    constraints: { allowed: SCENE_ALLOWED_LOCATIONS },
    writable: true,
    description: 'Región del proveedor de imágenes de escena',
    isCanonical: isAllowedSceneLocation,
    isEffective: isAllowedSceneLocation,
  },
  [SCENE_PROMPT_BLOCKS_KEY]: {
    key: SCENE_PROMPT_BLOCKS_KEY,
    valueType: 'JSON_BLOCKS',
    // T1267/T1303: el defecto es el JSON canonico de los 6 bloques vigentes; desde 5b (T1296) la clave es escribible y el valor se valida con `validatePromptBlocks` (A-2, maxBlockLength 1000).
    defaultValue: JSON.stringify(DEFAULT_PROMPT_BLOCKS),
    constraints: { maxBlockLength: PROMPT_BLOCK_MAX_LENGTH },
    writable: true,
    description: 'Bloques del prompt de la escena',
    isCanonical: (raw) => validatePromptBlocks(raw, PROMPT_BLOCK_MAX_LENGTH).ok,
    isEffective: (raw) => validatePromptBlocks(raw, PROMPT_BLOCK_MAX_LENGTH).ok,
  },
};

export const isAdminParameterKey = (value: string): value is AdminParameterKey => (ADMIN_PARAMETER_KEYS as readonly string[]).includes(value);

/** Valor efectivo y su origen para una fila cruda (`null` = fila ausente). */
export function effectiveParameter(spec: AdminParameterSpec, raw: string | null): { readonly value: string; readonly source: 'DATABASE' | 'DEFAULT' } {
  if (raw !== null && spec.isEffective(raw)) return { value: spec.key === ALBUM_MAX_PHOTOS_PER_PET_KEY ? String(interpretParameter(ALBUM_MAX_PHOTOS_PER_PET_KEY, raw).value) : raw, source: 'DATABASE' };
  return { value: spec.defaultValue, source: 'DEFAULT' };
}

/** `scene.enabled` rige con `true`/`false` exactos; fila ausente o ilegible = habilitado (INV-CFG9-003). */
export const interpretSceneEnabled = (raw: string | null): { readonly enabled: boolean; readonly legible: boolean } => (raw === 'false' ? { enabled: false, legible: true } : { enabled: true, legible: raw === 'true' });
