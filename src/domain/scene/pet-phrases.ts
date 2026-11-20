/**
 * Frases por mascota del prompt (REQ-ESC6-009, REQ-ESC6-016; plan.md §5.3): con foto, la frase de referencia `IMG_n`; sin foto, nombre canónico del Anexo A o mestizo amigable
 * (D6-14); el texto libre `breed` nunca entra (`H-KEY-F5-2`, EDGE-ESC6-015); solo `speciesOther` saneado y entre comillas. Nunca `id`, nombre ni `biography` (INV-ESC6-010/017).
 * Módulo aparte de `build-image-prompt.ts` para mantener ese archivo libre de lógica de raza (T599, SC-CAT-033: los módulos de nombre `*age*` no leen la raza).
 * Pura (INV-ESC6-001).
 *
 * @implements REQ-ESC6-009, REQ-ESC6-016, SC-ESC6-136, SC-ESC6-137, INV-ESC6-001, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, EDGE-ESC6-015, SC-ESC6-066, SC-ESC6-082
 */

import type { PetBlock } from '../../generated/v34/schemas/types.ts';
import { canonicalBreedName } from './breed-names.ts';
import { sanitizeFreeText } from './sanitize-free-text.ts';

const SPECIES_LABELS: Readonly<Record<string, string>> = {
  CANINE: 'dog',
  FELINE: 'cat',
  RABBIT: 'rabbit',
  FERRET: 'ferret',
  BIRD: 'bird',
  REPTILE: 'reptile',
  SMALL_MAMMAL: 'small mammal',
};

/** Etiqueta visual de la especie: `speciesOther` saneado entre comillas (EDGE-ESC6-015) o «animal» si se omite. */
function speciesLabel(pet: PetBlock): string {
  if (pet.species === 'OTHER') {
    const other = sanitizeFreeText(pet.speciesOther);
    return other === null ? 'animal' : `"${other}"`;
  }
  return SPECIES_LABELS[pet.species] ?? 'animal';
}

/** Etiqueta legible de la especie para la línea `Pet {k} ({especie}):` y el conteo (D6-21): enums del dominio o `speciesOther` saneado entre comillas, o «animal». */
export const petSpeciesLabel = (pet: PetBlock): string => speciesLabel(pet);

/** Palabra de especie del JSON de escena (R5): la etiqueta del dominio en inglés; `OTHER` viaja como «other» y su `speciesOther` saneado va aparte. */
export const petSpeciesJsonWord = (pet: PetBlock): string => (pet.species === 'OTHER' ? 'other' : (SPECIES_LABELS[pet.species] ?? 'animal'));

/**
 * Token de talla de la línea de foto («medium dog»). PROVISIONAL (R6, D7-ESC-02): `PetBlock` no tiene talla y el contrato no se toca, así que devuelve vacío. Es el ÚNICO punto
 * donde adoptar la opción (a) de Neo cambiaría el texto; el resto de la estructura no depende de él.
 */
export const petSizeToken = (_pet: PetBlock): string => '';

/**
 * Frase de conteo exacto (D7-ESC-01, REQ-ESC7-006; decisión de Neo): `null` con N = 0; N = 1: `Exact animal count: 1 pet in total (G). Draw only this 1 pet and no additional animals.`;
 * N >= 2: `Exact animal count: N pets in total (G). Draw only these N pets and no additional animals.`. `G` es el desglose por especie (orden de primera aparición, singular con 1 y
 * plural regular con `s`; la etiqueta `OTHER` con valor va entre comillas y no se flexiona). Calculada solo de las mascotas recibidas. Pura (INV-ESC6-001), sin cifras quemadas.
 */
export function animalCountLine(pets: readonly PetBlock[]): string | null {
  if (pets.length === 0) return null;
  const groups = new Map<string, number>();
  for (const pet of pets) {
    const label = petSpeciesLabel(pet);
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  const parts = [...groups].map(([label, n]) => `${n} ${n === 1 || label.startsWith('"') ? label : `${label}s`}`);
  const detail = parts.join(', ');
  return pets.length === 1
    ? `Exact animal count: 1 pet in total (${detail}). Draw only this 1 pet and no additional animals.`
    : `Exact animal count: ${pets.length} pets in total (${detail}). Draw only these ${pets.length} pets and no additional animals.`;
}

export const sexLabel = (pet: PetBlock): string => (pet.sex === 'MALE' ? 'male' : 'female');

/** Frase de una mascota sin foto: nombre canónico (Anexo A) o mestizo amigable (D6-14), sin texto libre de raza. */
function describePet(pet: PetBlock): string {
  const species = speciesLabel(pet);
  const sex = sexLabel(pet);
  const canonical = canonicalBreedName(pet.breedCode);
  if (canonical !== null) return `Include a ${species} (breed ${canonical}, sex ${sex}) resting naturally in the room`;
  return `Include a friendly mixed-breed ${species} (${sex}) resting naturally in the room`;
}

export function petSentence(pet: PetBlock): string {
  if (pet.hasReferencePhoto && pet.photoRef !== null) {
    const kind = [petSizeToken(pet), speciesLabel(pet)].filter((word) => word !== '').join(' ');
    return `Use ${pet.photoRef} as the exact visual reference for this ${kind}.`;
  }
  return `${describePet(pet)}.`;
}

/** Descripción corta de una mascota retirada o reemplazada (sin nombre ni id; `TARGET_PET_DESCRIPTION`, RR-06-02). */
export function targetDescription(pet: PetBlock): string {
  const breed = canonicalBreedName(pet.breedCode) ?? 'mixed-breed';
  return `${breed} ${speciesLabel(pet)} (${sexLabel(pet)})`;
}
