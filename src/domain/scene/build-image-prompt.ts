/**
 * `buildImagePrompt(payload)`: compila el texto final en inglés de la escena (REQ-ESC6-016, REQ-ESC7-003..008; plan.md §5.3 y ADR-007-07). Pura y determinista: misma entrada, misma
 * salida byte a byte (INV-ESC6-001, SC-ESC6-023). Bloques separados por una línea en blanco. `FROM_SCRATCH`/`REGENERATE` (R4): (1) base de estilo 16-bit; (2) hogar; (3) bloque de
 * fotos (una línea `Pet k (especie): Use IMG_n …` por mascota CON foto, ordinal global 1-based); (4) `Place all N pets…` con N = total visible, solo si N >= 2 (R3, D7-ESC-03); (5) bloque JSON solo de las
 * mascotas SIN foto, con el mismo ordinal global (R1, R2), omitido si no hay ninguna; (6) frase de conteo D7-ESC-01 (N >= 1); `PET_COUNT_RULE` solo con N = 0 (R1); (7) regla de
 * redibujado si el hogar o alguna mascota llevan foto. Sin `STYLE_CLOSING` en estos modos. Incrementales: bloque de cambios, JSON con todas las visibles, frase de conteo,
 * `PET_COUNT_RULE`, redibujado si aplica y `STYLE_CLOSING` 16-bit. El único contenido variable son enums del dominio, `speciesOther` ya saneado (INV-ESC6-011), nombres canónicos
 * de raza y etiquetas `IMG_n`; el texto libre `breed` nunca se lee (`H-KEY-F5-2`). NUNCA se emiten `id`, nombres, `biography` ni `fallbackContext` (INV-ESC6-010, INV-ESC6-017).
 *
 * @implements REQ-ESC6-016, REQ-ESC6-009, REQ-ESC7-003, REQ-ESC7-004, REQ-ESC7-005, REQ-ESC7-006, REQ-ESC7-008, SC-007-036, SC-007-037, SC-007-038, SC-007-039, SC-007-040, SC-007-041, SC-007-043, INV-ESC6-001, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, EDGE-ESC6-015, EDGE-007-023, EDGE-007-024
 */

import type { ScenePayload } from '../../generated/v34/schemas/types.ts';
import { animalCountLine, petSentence, petSpeciesLabel, targetDescription } from './pet-phrases.ts';
import { PET_COUNT_RULE, sceneSpecBlock } from './scene-spec.ts';

/** Base de estilo normativa (Neo, 2026-11-21, `claude/decisiones-neo-007-2026-11-21.md`): se emite siempre tal cual. */
export const STYLE_BASE_TEXT =
  'Create a single cohesive 16-bit cozy retro RPG isometric pixel art cutaway illustration of a sunlit home living room. Crisp pixel clusters, clean pixel-art outlines, flat warm indie-game shading, and a harmonious palette of warm forest green, soft pastel mint, warm cream, honey wood, and gentle sky blue. Include cozy pet-care details like ceramic food and water bowls, potted houseplants, and soft natural morning light.';

/** Regla de redibujado: texto fijo; se emite UNA vez y solo si el hogar o alguna mascota emitida lleva `photoRef` no nulo. */
export const PIXEL_REDRAW_RULE =
  'Render every wall, floor tile, piece of furniture, plant, and pet as crisp 16-bit retro RPG video-game pixel art with clearly visible individual pixels, sharp pixel-art outlines, and flat cozy indie-game shading.';

/** Cierre de estilo: solo los modos incrementales lo emiten (R4). */
const STYLE_CLOSING = 'Match the exact 16-bit isometric RPG pixel art style, warm natural lighting, and cozy palette.';

function householdBlock(payload: ScenePayload): string {
  const { hasReferencePhoto, photoRef } = payload.household;
  if (hasReferencePhoto && photoRef !== null) {
    return `Draw a brand-new 16-bit retro RPG isometric cutaway room diorama inspired by the furniture, plants, color accents, and general room layout of ${photoRef}.`;
  }
  return 'Design a warm, cozy modern living room interior with honey-colored wooden floors, a soft armchair, pet beds, and a large sunlit window.';
}

/** Frase de conteo (D7-ESC-01) sobre las mascotas visibles (sin las `REMOVE`, la misma lista que el JSON); vacío con N = 0. */
const countBlock = (payload: ScenePayload): string[] => {
  const line = animalCountLine(payload.pets.filter((p) => p.action !== 'REMOVE'));
  return line === null ? [] : [line];
};

const carriesPhoto = (pet: ScenePayload['pets'][number]): boolean => pet.hasReferencePhoto && pet.photoRef !== null;

function scratchBlocks(payload: ScenePayload): string[] {
  const rendered = payload.pets.filter((p) => p.action === 'RENDER');
  const blocks = [householdBlock(payload)];
  // Ordinal global 1-based sobre TODAS las visibles (R2): el bloque de fotos y el JSON lo comparten y son disjuntos.
  const photoLines = rendered.flatMap((pet, i) => (carriesPhoto(pet) ? [`Pet ${i + 1} (${petSpeciesLabel(pet)}): ${petSentence(pet)}`] : []));
  if (photoLines.length > 0) blocks.push(photoLines.join('\n'));
  // R3 / D7-ESC-03 (opción C, Neo): la frase «Place…» solo existe para N >= 2; con N = 1 no se emite (el literal de Neo no define singular).
  if (rendered.length > 1) blocks.push(`Place all ${rendered.length} pets naturally and separately in different cozy spots of the room.`);
  const json = sceneSpecBlock(payload, { onlyWithoutPhoto: true });
  if (json !== null) blocks.push(json);
  blocks.push(...countBlock(payload));
  if (rendered.length === 0) blocks.push(PET_COUNT_RULE);
  const household = payload.household.hasReferencePhoto && payload.household.photoRef !== null;
  if (household || rendered.some(carriesPhoto)) blocks.push(PIXEL_REDRAW_RULE);
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
  const withPhoto = payload.pets.some((p) => (p.action === 'ADD' || p.action === 'REPLACE') && carriesPhoto(p));
  return [intro + '\n' + lines.join('\n'), sceneSpecBlock(payload), ...countBlock(payload), PET_COUNT_RULE, ...(withPhoto ? [PIXEL_REDRAW_RULE] : []), STYLE_CLOSING];
}

export function buildImagePrompt(payload: ScenePayload): string {
  const scratch = payload.mode === 'FROM_SCRATCH' || payload.mode === 'REGENERATE';
  return [STYLE_BASE_TEXT, ...(scratch ? scratchBlocks(payload) : incrementalBlocks(payload))].join('\n\n');
}
