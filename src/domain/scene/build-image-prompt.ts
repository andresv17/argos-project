/**
 * `buildImagePrompt(payload)`: compila el texto final en inglés de la escena (REQ-ESC6-016; plan.md §5.3). Pura y determinista: misma entrada, misma salida byte a
 * byte (INV-ESC6-001, SC-ESC6-023). Bloques separados por una línea en blanco: (1) base de estilo; (2) hogar (solo `FROM_SCRATCH` y `REGENERATE`); (3) mascotas
 * (`RENDER`) con cierre «Place all N pets…» solo con N ≥ 1; (4) bloque incremental sobre la escena previa (`IMG_n` de `currentSceneRef`). El único contenido variable
 * son enums del dominio, `speciesOther` ya saneado por la lista blanca (INV-ESC6-011, entre comillas como etiqueta de datos), nombres canónicos de raza
 * (Anexo A del plan) y etiquetas `IMG_n`; el texto libre `breed` nunca se lee (`H-KEY-F5-2`). NUNCA se emiten `id`, nombres, `biography` ni `fallbackContext` (INV-ESC6-010, INV-ESC6-017).
 *
 * @implements REQ-ESC6-016, REQ-ESC6-009, INV-ESC6-001, INV-ESC6-010, INV-ESC6-011, INV-ESC6-017, EDGE-ESC6-015, SC-ESC6-023, SC-ESC6-066, SC-ESC6-082
 */

import type { ScenePayload } from '../../generated/v34/schemas/types.ts';
import { petSentence, targetDescription } from './pet-phrases.ts';

/**
 * Base de estilo normativa (plan.md §5.3, `H-KEY-F5-2`): byte a byte el bloque 1 de «Plantilla de referencia» de `claude/requerimiento-escena-hogar-pixel-art.md`.
 * Se emite siempre tal cual; no se recompone desde las ranuras de `payload.style`.
 */
export const STYLE_BASE_TEXT =
  'Create a single cohesive high-detail 32-bit isometric pixel art cutaway illustration of a cozy, sunlit home living room. Crisp pixel edges, clean indie game aesthetic, harmonious palette of forest green (#1d4f3a), soft pastel mint (#e6f2ea), warm cream (#f4f8ef), and sky blue (#eaf6ff). Include warm pet-care details like ceramic food and water bowls, potted houseplants, and soft natural morning light. No text, no blur, no anti-aliasing.';

const STYLE_CLOSING = 'Match the exact 32-bit isometric pixel art style, lighting, and palette.';

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
  return [STYLE_BASE_TEXT, ...(scratch ? scratchBlocks(payload) : incrementalBlocks(payload))].join('\n\n');
}
