/**
 * Construcción del payload de la escena (REQ-ESC6-015; contrato `scene-payload.schema.json` 1.0.0, tipos generados de `v34`). A partir del plan de `decideMode` y de
 * los snapshots de entradas: las mascotas visibles en su orden y, al final, las retiradas (`REMOVE`, tomadas del snapshot anterior). Los textos libres salen ya
 * saneados (INV-ESC6-011; fuera de la lista blanca: valor por defecto); `biography` y `fallbackContext` NUNCA se informan (INV-ESC6-017, SC-ESC6-049); el payload no
 * lleva nombres de mascota ni de usuario (INV-ESC6-010). Pura (INV-ESC6-001).
 *
 * @implements REQ-ESC6-015, REQ-ESC6-009, INV-ESC6-001, INV-ESC6-006, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, SC-ESC6-022, SC-ESC6-049
 */

import type { PetBlock, ScenePayload, StyleBlock } from '../../generated/v34/schemas/types.ts';
import type { ModePlan } from './decide-mode.ts';
import type { InputsSnapshot, SnapshotPet } from './inputs-snapshot.ts';
import { canonicalBreedName } from './breed-names.ts';
import { sanitizeFreeText } from './sanitize-free-text.ts';

export const SCENE_PAYLOAD_SCHEMA_VERSION = '1.0.0';

/** Estilo fijo de la escena (constantes del servidor, no entrada del usuario). */
export const DEFAULT_SCENE_STYLE: StyleBlock = {
  artStyle: '16-bit cozy retro RPG isometric pixel art with natural-language warm pastel palette',
  lighting: 'soft natural morning light',
  palette: ['#1D4F3A', '#E6F2EA', '#F4F8EF', '#EAF6FF'],
  constraints: ['No text', 'no blur', 'no anti-aliasing'],
};

/** `breed` es obligatorio en el contrato 1.0.0, pero el texto libre del usuario no sale del servidor (`H-KEY-F5-2`): constante neutra para toda raza sin nombre canónico. */
export const MIXED_BREED_LABEL = 'Mixed breed';

export interface BuildScenePayloadInput {
  readonly plan: ModePlan;
  readonly last: InputsSnapshot | null;
  readonly now: InputsSnapshot;
  /** Hogar de la escena (`null` para el propietario sin hogar, D6-09). */
  readonly householdId: string | null;
  readonly maxPets: number;
  /** `M`: mascotas asignadas al hogar (incluye las no visibles). */
  readonly totalPets: number;
}

function petBlock(pet: SnapshotPet, action: PetBlock['action'], ref: PetBlock['photoRef']): PetBlock {
  const speciesOther = pet.species === 'OTHER' ? (sanitizeFreeText(pet.speciesOther) ?? 'animal') : null;
  const hasPhoto = ref !== null;
  return {
    id: pet.id,
    action,
    species: pet.species as PetBlock['species'],
    speciesOther,
    breed: canonicalBreedName(pet.breedCode) ?? MIXED_BREED_LABEL,
    breedCode: pet.breedCode,
    sex: pet.sex as PetBlock['sex'],
    hasReferencePhoto: hasPhoto,
    photoRef: ref,
  };
}

export function buildScenePayload(input: BuildScenePayloadInput): ScenePayload {
  const { plan, last, now, householdId, maxPets, totalPets } = input;
  const byId = new Map([...(last?.pets ?? []), ...now.pets].map((p) => [p.id, p]));
  const pets = plan.pets.flatMap((entry) => {
    const pet = byId.get(entry.petId);
    return pet === undefined ? [] : [petBlock(pet, entry.action, entry.ref)];
  });
  return {
    schemaVersion: SCENE_PAYLOAD_SCHEMA_VERSION,
    mode: plan.mode,
    style: DEFAULT_SCENE_STYLE,
    household: { id: householdId, hasReferencePhoto: plan.householdRef !== null, photoRef: plan.householdRef },
    scene: { currentSceneRef: plan.currentSceneRef, maxPets, totalPetsInHousehold: totalPets },
    pets,
  };
}
