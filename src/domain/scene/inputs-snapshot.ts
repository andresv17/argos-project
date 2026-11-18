/**
 * Snapshot canónico de las entradas de la escena y su huella (REQ-ESC6-004; data-model.md §2.6). Contiene solo lo que cambia la imagen: el objeto de la foto
 * efectiva del hogar y, por mascota visible, `id`, `species`, `speciesOther`, `breed`, `breedCode`, `sex` y el objeto del avatar efectivo. NUNCA nombres de
 * mascota ni de usuario, microchip, fechas ni datos clínicos (INV-ESC6-010, INV-ESC6-016): `buildInputsSnapshot` copia campo por campo. La huella es el SHA-256
 * puro de `domain/audit` sobre el JSON canónico (misma entrada, mismos bytes, INV-ESC6-001). Sin reloj ni entropía.
 *
 * @implements REQ-ESC6-004, INV-ESC6-001, INV-ESC6-008, INV-ESC6-010, EDGE-ESC6-001, EDGE-ESC6-002, EDGE-ESC6-012, SC-ESC6-003, SC-ESC6-031
 */

import { canonicalJson } from '../audit/canonical-json.ts';
import { sha256Hex } from '../audit/sha256.ts';

export interface SnapshotPet {
  readonly id: string;
  readonly species: string;
  readonly speciesOther: string | null;
  readonly breed: string;
  readonly breedCode: string | null;
  readonly sex: string;
  /** Identificador del objeto del avatar efectivo (consentimiento vigente) o `null`. */
  readonly photo: string | null;
}

export interface InputsSnapshot {
  readonly v: 1;
  /** Identificador del objeto de la foto del hogar efectiva o `null`. */
  readonly household: string | null;
  /** En el orden de selección de D6-11. */
  readonly pets: readonly SnapshotPet[];
}

export interface InputsSnapshotInput {
  readonly householdPhoto: string | null;
  readonly pets: readonly SnapshotPet[];
}

export function buildInputsSnapshot(input: InputsSnapshotInput): InputsSnapshot {
  return {
    v: 1,
    household: input.householdPhoto,
    pets: input.pets.map((p) => ({
      id: p.id,
      species: p.species,
      speciesOther: p.speciesOther,
      breed: p.breed,
      breedCode: p.breedCode,
      sex: p.sex,
      photo: p.photo,
    })),
  };
}

export const EMPTY_INPUTS_SNAPSHOT: InputsSnapshot = buildInputsSnapshot({ householdPhoto: null, pets: [] });

/** JSON canónico: claves ordenadas, sin espacios. */
export function serializeInputsSnapshot(snapshot: InputsSnapshot): string {
  return canonicalJson(snapshot);
}

/** Huella: SHA-256 hexadecimal del JSON canónico. */
export function computeFingerprint(snapshot: InputsSnapshot): string {
  return sha256Hex(serializeInputsSnapshot(snapshot));
}

/** `true` si hay foto del hogar o al menos una mascota (huella distinta de la vacía). */
export function hasInputs(snapshot: InputsSnapshot): boolean {
  return snapshot.household !== null || snapshot.pets.length > 0;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

function parsePet(value: unknown): SnapshotPet | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  if (!isString(p['id']) || !isString(p['species']) || !isNullableString(p['speciesOther']) || !isString(p['breed'])) return null;
  if (!isNullableString(p['breedCode']) || !isString(p['sex']) || !isNullableString(p['photo'])) return null;
  return { id: p['id'], species: p['species'], speciesOther: p['speciesOther'], breed: p['breed'], breedCode: p['breedCode'], sex: p['sex'], photo: p['photo'] };
}

/** Lee un snapshot guardado; `null` si no es JSON, no es versión 1 o tiene otra forma. */
export function parseInputsSnapshot(text: string): InputsSnapshot | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r['v'] !== 1 || !isNullableString(r['household']) || !Array.isArray(r['pets'])) return null;
  const pets = r['pets'].map(parsePet);
  if (pets.some((p) => p === null)) return null;
  return buildInputsSnapshot({ householdPhoto: r['household'], pets: pets as SnapshotPet[] });
}

/**
 * Cambios pendientes por entidad (REQ-ESC6-004): la foto del hogar cuenta 1 si difiere; una mascota agregada, eliminada o con entradas distintas cuenta 1.
 * Se compara solo el estado final contra el de la última generación (`null` = nunca se generó): cambiar dos veces lo mismo cuenta 1 (EDGE-ESC6-012).
 */
export function countPendingChanges(last: InputsSnapshot | null, now: InputsSnapshot): number {
  const before = last ?? EMPTY_INPUTS_SNAPSHOT;
  let changes = before.household === now.household ? 0 : 1;
  const previous = new Map(before.pets.map((p) => [p.id, canonicalJson(p)]));
  const current = new Map(now.pets.map((p) => [p.id, canonicalJson(p)]));
  for (const [id, text] of current) if (previous.get(id) !== text) changes += 1;
  for (const id of previous.keys()) if (!current.has(id)) changes += 1;
  return changes;
}
