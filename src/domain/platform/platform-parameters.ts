/**
 * Catálogo de parámetros de plataforma en código (feature 005): fuente única de clave, tipo, defecto y rango (MIF-005-07).
 * La fila de BD solo guarda texto; aquí se interpreta. Fila ausente, ilegible o fuera de rango => defecto del código + motivo del aviso (EDGE-005-03).
 * Una clave nueva exige tocar este catálogo, la siembra y `platform-parameter.schema.json`.
 * @implements REQ-PRM-002, REQ-PRM-001, EDGE-005-03, D5-07
 */

export const ALBUM_MAX_PHOTOS_PER_PET_KEY = 'album.max_photos_per_pet' as const;

export const KNOWN_PARAMETER_KEYS = [ALBUM_MAX_PHOTOS_PER_PET_KEY] as const;
export type KnownParameterKey = (typeof KNOWN_PARAMETER_KEYS)[number];

export interface IntegerParameterSpec {
  readonly type: 'INTEGER';
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
}

export const PARAMETER_CATALOG: Readonly<Record<KnownParameterKey, IntegerParameterSpec>> = {
  [ALBUM_MAX_PHOTOS_PER_PET_KEY]: { type: 'INTEGER', defaultValue: 10, min: 1, max: 50 },
};

/** TTL máximo de la caché por instancia (D5-07). */
export const PARAMETER_CACHE_TTL_MS = 60_000;

export type ParameterWarningReason = 'ABSENT' | 'UNREADABLE' | 'OUT_OF_RANGE';

export interface InterpretedParameter {
  readonly value: number;
  readonly warning: ParameterWarningReason | null;
}

const INTEGER_TEXT = /^-?\d{1,15}$/;

export function interpretParameter(key: KnownParameterKey, raw: string | null): InterpretedParameter {
  const spec = PARAMETER_CATALOG[key];
  if (raw === null) return { value: spec.defaultValue, warning: 'ABSENT' };
  if (!INTEGER_TEXT.test(raw)) return { value: spec.defaultValue, warning: 'UNREADABLE' };
  const parsed = Number(raw);
  if (parsed < spec.min || parsed > spec.max) return { value: spec.defaultValue, warning: 'OUT_OF_RANGE' };
  return { value: parsed, warning: null };
}
