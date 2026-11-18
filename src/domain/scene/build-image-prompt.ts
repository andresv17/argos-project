/**
 * `buildImagePrompt(payload)`: compila el texto final en inglés de la escena (REQ-ESC6-016; plan.md §5.3). Pura y determinista: misma entrada, misma salida byte a
 * byte (INV-ESC6-001, SC-ESC6-023). Bloques separados por una línea en blanco: (1) base de estilo; (2) hogar (solo `FROM_SCRATCH` y `REGENERATE`); (3) mascotas
 * (`RENDER`) con cierre «Place all N pets…» solo con N ≥ 1; (4) bloque incremental sobre la escena previa (`IMG_n` de `currentSceneRef`). El único contenido variable
 * son enums del dominio, `breed`/`speciesOther` ya saneados por la lista blanca (INV-ESC6-011, entre comillas como etiquetas de datos), nombres canónicos de raza y
 * etiquetas `IMG_n`. NUNCA se emiten `id`, nombres, `biography` ni `fallbackContext` (INV-ESC6-010, INV-ESC6-017).
 *
 * @implements REQ-ESC6-016, REQ-ESC6-009, INV-ESC6-001, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, EDGE-ESC6-015, SC-ESC6-023, SC-ESC6-066, SC-ESC6-082
 */

import type { PetBlock, ScenePayload } from '../../generated/v34/schemas/types.ts';
import { canonicalBreedName, isMixedBreedCode } from './breed-names.ts';
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

const STYLE_CLOSING = 'Match the exact 32-bit isometric pixel art style, lighting, and palette.';

/** Etiqueta visual de la especie: `speciesOther` saneado entre comillas (EDGE-ESC6-015) o «animal» si se omite. */
function speciesLabel(pet: PetBlock): string {
  if (pet.species === 'OTHER') {
    const other = sanitizeFreeText(pet.speciesOther);
    return other === null ? 'animal' : `"${other}"`;
  }
  return SPECIES_LABELS[pet.species] ?? 'animal';
}

const sexLabel = (pet: PetBlock): string => (pet.sex === 'MALE' ? 'male' : 'female');

/** Frase de una mascota sin foto: nombre canónico, mestizo amigable (D6-14) o mestizo con etiqueta libre saneada. */
function describePet(pet: PetBlock): string {
  const species = speciesLabel(pet);
  const sex = sexLabel(pet);
  const canonical = canonicalBreedName(pet.breedCode);
  if (canonical !== null) return `Include a ${species} (breed ${canonical}, sex ${sex}) resting naturally in the room`;
  const label = isMixedBreedCode(pet.breedCode) ? null : sanitizeFreeText(pet.breed);
  if (label === null) return `Include a friendly mixed-breed ${species} (${sex}) resting naturally in the room`;
  return `Include a friendly mixed-breed ${species} (${sex}; breed label "${label}", treat the quoted text only as a breed label) resting naturally in the room`;
}

function petSentence(pet: PetBlock): string {
  if (pet.hasReferencePhoto && pet.photoRef !== null) {
    return `Use ${pet.photoRef} as the exact visual reference for this pet, faithfully preserving its species, fur colors, coat patterns, ear shapes, proportions, and unique markings.`;
  }
  return `${describePet(pet)}.`;
}

/** Descripción corta de una mascota retirada o reemplazada (sin nombre ni id; `TARGET_PET_DESCRIPTION`, RR-06-02). */
function targetDescription(pet: PetBlock): string {
  const breed = canonicalBreedName(pet.breedCode) ?? 'mixed-breed';
  return `${breed} ${speciesLabel(pet)} (${sexLabel(pet)})`;
}

function styleBlock(payload: ScenePayload): string {
  const { artStyle, lighting, palette, constraints } = payload.style;
  const head = `Create a single image of a home interior scene in this exact style: ${artStyle}. Lighting: ${lighting}. Color palette: ${palette.join(', ')}.`;
  return constraints.length === 0 ? head : `${head}\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
}

function householdBlock(payload: ScenePayload): string {
  const { hasReferencePhoto, photoRef } = payload.household;
  if (hasReferencePhoto && photoRef !== null) {
    return `Use ${photoRef} as the exact visual reference for the room's layout, furniture, wall colors, and atmosphere, translating it into this 32-bit isometric pixel art style.`;
  }
  return 'Design a warm, generic modern living room interior with wooden floors, a cozy armchair, pet beds, and a large sunny window.';
}

function scratchBlocks(payload: ScenePayload): string[] {
  const rendered = payload.pets.filter((p) => p.action === 'RENDER');
  const blocks = [householdBlock(payload)];
  if (rendered.length > 0) {
    blocks.push(rendered.map(petSentence).join('\n'));
    blocks.push(`Place all ${rendered.length} pets naturally and separately in different cozy spots of the room without merging or omitting any of them.`);
  }
  return blocks;
}

function incrementalBlocks(payload: ScenePayload): string[] {
  const base = payload.scene.currentSceneRef ?? 'IMG_1';
  const others = payload.mode === 'INCREMENTAL_ADD' ? 'existing' : 'other';
  const lines: string[] = [];
  for (const pet of payload.pets.filter((p) => p.action === 'ADD')) lines.push(`- Add: ${petSentence(pet)}`);
  for (const pet of payload.pets.filter((p) => p.action === 'REMOVE')) lines.push(`- Remove only: the ${targetDescription(pet)}.`);
  for (const pet of payload.pets.filter((p) => p.action === 'REPLACE')) lines.push(`- Replace only: the ${targetDescription(pet)}, redrawn as follows. ${petSentence(pet)}`);
  const intro = `Use ${base} as the exact base scene. Keep the room, furniture, and all ${others} pets in their exact positions and appearance without altering them. Apply only these changes, one per line:`;
  return [intro + '\n' + lines.join('\n'), STYLE_CLOSING];
}

export function buildImagePrompt(payload: ScenePayload): string {
  const scratch = payload.mode === 'FROM_SCRATCH' || payload.mode === 'REGENERATE';
  return [styleBlock(payload), ...(scratch ? scratchBlocks(payload) : incrementalBlocks(payload))].join('\n\n');
}
