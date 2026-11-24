/**
 * Bloques editables del prompt de la escena (Feature 009, Fase 5b, #20; T1267, T1303; REQ-CFG9-005, INV-CFG9-002, INV-PRO9-001, EDGE-009-020, EDGE-009-044; contrato interno A-1..A-6 del acta
 * `architect-009-5b-borradores.md`). Hoja del dominio: PURA, sin entorno ni E/S. Es la fuente de verdad de los textos por defecto (los re-exporta `build-image-prompt.ts`); este modulo NO importa
 * `build-image-prompt.ts` (sin ciclo). Lo que impone el CODIGO y no se edita: el orden, el JSON de la escena, las etiquetas `IMG_n`, la frase de conteo y que el bloque de preservacion se emita
 * UNA vez y solo si hay mascota con foto. El unico marcador de sustitucion es `{photoRef}` (referencia `IMG_n` de la foto del hogar), obligatorio en `HOUSEHOLD_WITH_PHOTO` y opcional en `PRESERVATION_BLOCK` (referencia `IMG_n` de la foto de cada mascota).
 *
 * @implements REQ-CFG9-005, INV-CFG9-002, INV-CFG9-003, INV-PRO9-001, EDGE-009-020, EDGE-009-044, SC-009-024, SC-009-025
 */

/** Base de estilo normativa (Neo, 2026-11-21, `claude/decisiones-neo-007-2026-11-21.md`): se emite siempre tal cual. */
export const STYLE_BASE_TEXT =
  'Create a single cohesive 16-bit cozy retro RPG isometric pixel art cutaway illustration of a sunlit home living room. Crisp pixel clusters, clean pixel-art outlines, flat warm indie-game shading, and a harmonious palette of warm forest green, soft pastel mint, warm cream, honey wood, and gentle sky blue. Include cozy pet-care details like ceramic food and water bowls, potted houseplants, and soft natural morning light.';

/** Regla de redibujado: texto fijo; se emite UNA vez y solo si el hogar o alguna mascota emitida lleva `photoRef` no nulo. */
export const PIXEL_REDRAW_RULE =
  'Render every wall, floor tile, piece of furniture, plant, and pet as crisp 16-bit retro RPG video-game pixel art with clearly visible individual pixels, sharp pixel-art outlines, and flat cozy indie-game shading.';

/**
 * Bloque de preservacion visual (feature 009, `#57`, REQ-PRO9-002, EDGE-009-044): valor por defecto del literal de Neo. Se emite EXACTAMENTE una vez si y solo si al menos
 * una mascota visible (`RENDER`, o `ADD`/`REPLACE` en incrementales) lleva foto de referencia. El invariante se formula sobre este bloque logico y no sobre el literal.
 */
export const PRESERVATION_BLOCK =
  'Translate this pet from {photoRef} into the 16-bit isometric pixel art illustration, faithfully preserving its species, fur colors, coat patterns, ear shapes, body proportions, and unique markings so it is clearly recognizable.';

/** Sustituto de `{photoRef}` en los modos incrementales (la imagen de cada mascota ya viaja etiquetada en su propia linea; repetir `IMG_n` duplicaria la referencia). */
export const INCREMENTAL_PHOTO_REF_TEXT = 'its reference photo';
/** Bloque de preservacion tal como se emite en los incrementales: `{photoRef}` nunca llega crudo al proveedor. */
export const renderIncrementalPreservation = (text: string): string => text.split('{photoRef}').join(INCREMENTAL_PHOTO_REF_TEXT);
/** Valor por defecto ya renderizado para los incrementales. */
export const INCREMENTAL_PRESERVATION_BLOCK = renderIncrementalPreservation(PRESERVATION_BLOCK);

/** Hogar con foto de referencia: `{photoRef}` se sustituye por la etiqueta `IMG_n` del hogar. */
export const HOUSEHOLD_WITH_PHOTO =
  'Draw a brand-new 16-bit retro RPG isometric cutaway room diorama inspired by the furniture, plants, color accents, and general room layout of {photoRef}.';

/** Hogar sin foto de referencia. */
export const HOUSEHOLD_GENERIC = 'Design a warm, cozy modern living room interior with honey-colored wooden floors, a soft armchair, pet beds, and a large sunlit window.';

/** Cierre de estilo: solo los modos incrementales lo emiten. */
export const STYLE_CLOSING = 'Match the exact 16-bit isometric RPG pixel art style, warm natural lighting, and cozy palette.';

/** Orden FIJO de los 6 bloques (el de la semilla y el de la validacion). */
export const PROMPT_BLOCK_NAMES = ['STYLE_BASE_TEXT', 'HOUSEHOLD_WITH_PHOTO', 'HOUSEHOLD_GENERIC', 'PRESERVATION_BLOCK', 'PIXEL_REDRAW_RULE', 'STYLE_CLOSING'] as const;
export type PromptBlockName = (typeof PROMPT_BLOCK_NAMES)[number];
export type PromptBlocks = Readonly<Record<PromptBlockName, string>>;

/** Conjunto CERRADO de marcadores de sustitucion (INV-CFG9-002, LCK-24). */
export const RECOGNIZED_MARKERS = ['{photoRef}'] as const;
const PHOTO_REF_MARKER = RECOGNIZED_MARKERS[0];

/** Semilla: el texto vigente tras #57, byte a byte. */
export const DEFAULT_PROMPT_BLOCKS: PromptBlocks = {
  STYLE_BASE_TEXT,
  HOUSEHOLD_WITH_PHOTO,
  HOUSEHOLD_GENERIC,
  PRESERVATION_BLOCK,
  PIXEL_REDRAW_RULE,
  STYLE_CLOSING,
};

export type PromptBlocksValidation = { readonly ok: true; readonly blocks: PromptBlocks } | { readonly ok: false; readonly code: 'ERR-SCHEMA-VALIDATION-FAILED' };
/** A-3: 1000 caracteres por bloque (cota de ergonomia, no de coste ni de seguridad). */
export const PROMPT_BLOCK_MAX_LENGTH = 1000;

const FAIL: PromptBlocksValidation = { ok: false, code: 'ERR-SCHEMA-VALIDATION-FAILED' };

/** Texto que imita lo que fija el codigo (etiquetas `IMG_n`, JSON de la escena, conteo, numeracion de mascotas). */
const IMITATION = /IMG_\d|renderedPetsCount|Scene specification|Exact animal count|^Pet\s+\d/im;
// eslint-disable-next-line no-control-regex
/** C0 (salvo tab y salto de linea), DEL y C1 (Cc), formato (Cf: U+202E, U+200B, U+FEFF...) y separadores de linea y parrafo (Zl U+2028, Zp U+2029). SEN-T1271-02. */
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]|\p{Cf}/u;

/**
 * Valida el valor crudo de `scene.prompt.blocks` (A-2). Nunca devuelve el valor ni un mensaje que lo contenga (INV-CFG9-003). Orden: JSON objeto plano; claves exactas; cada valor
 * cadena no vacia y dentro de `maxBlockLength`; marcadores; imitaciones; una sola aparicion del bloque de preservacion; sin caracteres de control.
 */
export function validatePromptBlocks(raw: string, maxBlockLength: number): PromptBlocksValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return FAIL;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return FAIL;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PROMPT_BLOCK_NAMES.length || !PROMPT_BLOCK_NAMES.every((name) => Object.hasOwn(record, name))) return FAIL;
  const blocks = {} as Record<PromptBlockName, string>;
  for (const name of PROMPT_BLOCK_NAMES) {
    const value = record[name];
    if (typeof value !== 'string' || value.trim().length < 1 || value.length > maxBlockLength) return FAIL;
    if (CONTROL_CHARS.test(value) || IMITATION.test(value)) return FAIL;
    const withoutMarker = name === 'HOUSEHOLD_WITH_PHOTO' || name === 'PRESERVATION_BLOCK' ? value.split(PHOTO_REF_MARKER).join('') : value;
    if (/[{}$%]/.test(withoutMarker)) return FAIL;
    if (name === 'HOUSEHOLD_WITH_PHOTO' && !value.includes(PHOTO_REF_MARKER)) return FAIL;
    blocks[name] = value;
  }
  const preservation = blocks.PRESERVATION_BLOCK.trim();
  for (const name of PROMPT_BLOCK_NAMES) {
    if (name === 'PRESERVATION_BLOCK') continue;
    if (blocks[name].includes(PRESERVATION_BLOCK) || blocks[name].includes(preservation)) return FAIL;
  }
  return { ok: true, blocks };
}
