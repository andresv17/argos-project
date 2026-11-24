/**
 * `buildImagePrompt(payload)`: compila el texto final en inglés de la escena (REQ-ESC6-016, REQ-ESC7-003..008; plan.md §5.3 y ADR-007-07). Pura y determinista: misma entrada, misma
 * salida byte a byte (INV-ESC6-001, SC-ESC6-023). Bloques separados por una línea en blanco. `FROM_SCRATCH`/`REGENERATE` (R4 enmendada por la 009, REQ-PRO9-003): (1) base de
 * estilo 16-bit; (2) hogar; (3) bloque de fotos (una línea `Pet k (especie): Use IMG_n …` por mascota CON foto, ordinal global 1-based); (4) `PRESERVATION_BLOCK` una vez si y solo si
 * hay mascota con foto; (5) bloque JSON solo de las mascotas SIN foto, con el mismo ordinal global (R1, R2), omitido si no hay ninguna; (6) `Place all N pets…` con N = total visible,
 * solo si N >= 2 (R3, D7-ESC-03); (7) frase de conteo D7-ESC-01 (N >= 1) o `Draw no animals in this room.` con N = 0 (D9-13); (8) regla de redibujado si el hogar o alguna mascota
 * llevan foto. Sin `STYLE_CLOSING` ni `PET_COUNT_RULE` en estos modos. Incrementales: bloque de cambios, JSON con todas las visibles, frase de conteo, `PET_COUNT_RULE`,
 * `PRESERVATION_BLOCK` si hay `ADD`/`REPLACE` con foto, redibujado si aplica y `STYLE_CLOSING` 16-bit. El único contenido variable son enums del dominio, `speciesOther` ya saneado (INV-ESC6-011), nombres canónicos
 * de raza y etiquetas `IMG_n`; el texto libre `breed` nunca se lee (`H-KEY-F5-2`). NUNCA se emiten `id`, nombres ni `fallbackContext` (INV-ESC6-010, INV-ESC6-017). Enmienda 2026-11-24: la `biography` YA saneada se emite SOLO como cadena JSON tras `PET_BIO_RULE`: con foto, en un bloque aparte (`PET_BIO_BLOCK`, una línea `Pet k (IMG_n): "…"`) justo tras `PRESERVATION_BLOCK`; sin foto, como `bio` de su entrada del JSON. Sin biografía no se emite nada.
 *
 * @implements REQ-PRO9-001, REQ-PRO9-002, REQ-PRO9-003, REQ-PRO9-004, REQ-PRO9-005, REQ-PRO9-006, REQ-PRO9-007, INV-PRO9-001, INV-PRO9-002, REQ-ESC6-016, REQ-ESC6-009, REQ-ESC7-003, REQ-ESC7-004, REQ-ESC7-005, REQ-ESC7-006, REQ-ESC7-008, SC-007-036, SC-007-037, SC-007-038, SC-007-039, SC-007-040, SC-007-041, SC-007-043, INV-ESC6-001, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, EDGE-ESC6-015, EDGE-007-023, EDGE-007-024
 */

import type { ScenePayload } from '../../generated/v34/schemas/types.ts';
import { animalCountLine, petSentence, petSpeciesLabel, targetDescription } from './pet-phrases.ts';
import {
  DEFAULT_PROMPT_BLOCKS,
  HOUSEHOLD_GENERIC,
  HOUSEHOLD_WITH_PHOTO,
  PIXEL_REDRAW_RULE,
  PRESERVATION_BLOCK,
  RECOGNIZED_MARKERS,
  STYLE_BASE_TEXT,
  STYLE_CLOSING,
  type PromptBlocks,
} from './prompt-blocks.ts';
import { PET_BIO_BLOCK, PET_BIO_RULE, PET_COUNT_RULE, sceneSpecBlock } from './scene-spec.ts';
import { sanitizeBiography } from './sanitize-free-text.ts';

export { HOUSEHOLD_GENERIC, HOUSEHOLD_WITH_PHOTO, PIXEL_REDRAW_RULE, PRESERVATION_BLOCK, STYLE_BASE_TEXT, STYLE_CLOSING };

/** Regla de cero animales de los modos desde cero (REQ-PRO9-005, `D9-13` = A): sustituye a `PET_COUNT_RULE` con N = 0 (que cita un `renderedPetsCount` inexistente). */
const NO_ANIMALS_RULE = 'Draw no animals in this room.';

function householdBlock(payload: ScenePayload, blocks: PromptBlocks): string {
  const { hasReferencePhoto, photoRef } = payload.household;
  // A-6: split/join (no String.replace, cuyo patron de reemplazo interpretaria `$&`, `$1`).
  if (hasReferencePhoto && photoRef !== null) return blocks.HOUSEHOLD_WITH_PHOTO.split(RECOGNIZED_MARKERS[0]).join(photoRef);
  return blocks.HOUSEHOLD_GENERIC;
}

/** Frase de conteo (D7-ESC-01) sobre las mascotas visibles (sin las `REMOVE`, la misma lista que el JSON); vacío con N = 0. */
const countBlock = (payload: ScenePayload): string[] => {
  const line = animalCountLine(payload.pets.filter((p) => p.action !== 'REMOVE'));
  return line === null ? [] : [line];
};

const carriesPhoto = (pet: ScenePayload['pets'][number]): boolean => pet.hasReferencePhoto && pet.photoRef !== null;

function scratchBlocks(payload: ScenePayload, blocks: PromptBlocks): string[] {
  const rendered = payload.pets.filter((p) => p.action === 'RENDER');
  const out = [householdBlock(payload, blocks)];
  // Ordinal global 1-based sobre TODAS las visibles (R2): el bloque de fotos y el JSON lo comparten y son disjuntos.
  const photoLines = rendered.flatMap((pet, i) => (carriesPhoto(pet) ? [`Pet ${i + 1} (${petSpeciesLabel(pet)}): ${petSentence(pet)}`] : []));
  if (photoLines.length > 0) out.push(photoLines.join('\n'), blocks.PRESERVATION_BLOCK);
  // Enmienda 2026-11-24 (INV-ESC6-010/017): biografía de las mascotas CON foto en un bloque aparte, solo como cadena JSON tras la regla fija.
  const bioLines = rendered.flatMap((pet, i) => {
    const bio = carriesPhoto(pet) ? sanitizeBiography(pet.biography) : null;
    return bio === null ? [] : [`Pet ${i + 1} (${pet.photoRef}): ${JSON.stringify(bio)}`];
  });
  if (bioLines.length > 0) out.push([PET_BIO_RULE, PET_BIO_BLOCK, ...bioLines].join('\n'));
  // REQ-PRO9-001/003: toda descripción de mascota (líneas con IMG y JSON) precede a «Place…» y a la frase de conteo (INV-PRO9-002).
  const json = sceneSpecBlock(payload, { onlyWithoutPhoto: true });
  if (json !== null) out.push(json);
  // R3 / D7-ESC-03 (opción C, Neo): la frase «Place…» solo existe para N >= 2; con N = 1 no se emite (el literal de Neo no define singular).
  if (rendered.length > 1) out.push(`Place all ${rendered.length} pets naturally and separately in different cozy spots of the room.`);
  out.push(...countBlock(payload));
  if (rendered.length === 0) out.push(NO_ANIMALS_RULE);
  const household = payload.household.hasReferencePhoto && payload.household.photoRef !== null;
  if (household || rendered.some(carriesPhoto)) out.push(blocks.PIXEL_REDRAW_RULE);
  return out;
}

function incrementalBlocks(payload: ScenePayload, blocks: PromptBlocks): string[] {
  const base = payload.scene.currentSceneRef ?? 'IMG_1';
  const others = payload.mode === 'INCREMENTAL_ADD' ? 'existing' : 'other';
  const lines: string[] = [];
  for (const pet of payload.pets.filter((p) => p.action === 'ADD')) lines.push(`- Add: ${petSentence(pet)}`);
  for (const pet of payload.pets.filter((p) => p.action === 'REMOVE')) lines.push(`- Remove only: the ${targetDescription(pet)}.`);
  for (const pet of payload.pets.filter((p) => p.action === 'REPLACE')) lines.push(`- Replace only: the ${targetDescription(pet)}, redrawn as follows. ${petSentence(pet)}`);
  const intro = `Use ${base} as the exact base scene. Keep the room, furniture, and all ${others} pets in their exact positions and appearance without altering them. Apply only these changes, one per line:`;
  const withPhoto = payload.pets.some((p) => (p.action === 'ADD' || p.action === 'REPLACE') && carriesPhoto(p));
  return [intro + '\n' + lines.join('\n'), sceneSpecBlock(payload), ...countBlock(payload), PET_COUNT_RULE, ...(withPhoto ? [blocks.PRESERVATION_BLOCK, blocks.PIXEL_REDRAW_RULE] : []), blocks.STYLE_CLOSING];
}

/** `blocks` ya validado (A-6): un valor invalido nunca llega aqui; sin `blocks` rige el defecto de codigo. */
export function buildImagePrompt(payload: ScenePayload, blocks: PromptBlocks = DEFAULT_PROMPT_BLOCKS): string {
  const scratch = payload.mode === 'FROM_SCRATCH' || payload.mode === 'REGENERATE';
  return [blocks.STYLE_BASE_TEXT, ...(scratch ? scratchBlocks(payload, blocks) : incrementalBlocks(payload, blocks))].join('\n\n');
}
