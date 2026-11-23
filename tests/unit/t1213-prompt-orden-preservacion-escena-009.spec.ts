import { describe, expect, it } from 'vitest';
import { PIXEL_REDRAW_RULE, PRESERVATION_BLOCK, STYLE_BASE_TEXT, buildImagePrompt } from '../../src/domain/scene/build-image-prompt.ts';
import { DEFAULT_SCENE_STYLE } from '../../src/domain/scene/scene-payload.ts';
import { PET_COUNT_RULE, SCENE_SPEC_HEADER } from '../../src/domain/scene/scene-spec.ts';
import type { PetBlock, ScenePayload } from '../../src/generated/v34/schemas/types.ts';

/**
 * T1213, T1214 y T1283 (009, Fase 1, bloque B, `#57`): orden y bloque de preservación visual del prompt. FROM_SCRATCH/REGENERATE con los 4 casos base (REQ-PRO9-001..003),
 * modos incrementales, `N = 0`, tope de imágenes, determinismo y privacidad (REQ-PRO9-004..006) e invariante de una sola aparición formulado sobre `PRESERVATION_BLOCK`
 * y no sobre el literal (EDGE-009-044). REQ-PRO9-001..006, INV-PRO9-001, INV-PRO9-002; EDGE-009-024, EDGE-009-025, EDGE-009-026, EDGE-009-044; SC-009-028..034.
 */
const PRESERVATION_LITERAL =
  'Translate the pet from the reference photos into a single cohesive 16-bit isometric pixel art illustration. Faithfully preserve each pet species, fur colors, coat patterns, ear shapes, body proportions, and unique markings from the photos so each one is clearly recognizable.';
const HOUSEHOLD_GENERIC = 'Design a warm, cozy modern living room interior with honey-colored wooden floors, a soft armchair, pet beds, and a large sunlit window.';
const householdWithPhoto = (ref: string): string => `Draw a brand-new 16-bit retro RPG isometric cutaway room diorama inspired by the furniture, plants, color accents, and general room layout of ${ref}.`;
const NO_ANIMALS = 'Draw no animals in this room.';
const CLOSING_16 = 'Match the exact 16-bit isometric RPG pixel art style, warm natural lighting, and cozy palette.';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pet = (n: number, extra: Partial<PetBlock> = {}): PetBlock => ({
  id: id(n), action: 'RENDER', species: 'CANINE', speciesOther: null, breed: 'Criolla', breedCode: 'DOG_CRIOLLA', sex: 'FEMALE', hasReferencePhoto: false, photoRef: null, ...extra,
});
const withPhoto = (n: number, ref: string, extra: Partial<PetBlock> = {}): PetBlock => pet(n, { hasReferencePhoto: true, photoRef: ref as PetBlock['photoRef'], ...extra });
const cat = (n: number, extra: Partial<PetBlock> = {}): PetBlock => pet(n, { species: 'FELINE', breedCode: 'CAT_CRIOLLA', breed: 'Criollo', ...extra });
const payload = (pets: PetBlock[], opts: { household?: boolean; mode?: ScenePayload['mode'] } = {}): ScenePayload => ({
  schemaVersion: '1.0.0',
  mode: opts.mode ?? 'FROM_SCRATCH',
  style: DEFAULT_SCENE_STYLE,
  household: { id: id(900), hasReferencePhoto: opts.household === true, photoRef: opts.household === true ? 'IMG_1' : null },
  scene: { currentSceneRef: opts.mode === 'INCREMENTAL_ADD' || opts.mode === 'INCREMENTAL_REPLACE' || opts.mode === 'INCREMENTAL_REMOVE' ? 'IMG_1' : null, maxPets: 8, totalPetsInHousehold: pets.length },
  pets,
});
const once = (p: ScenePayload): string => {
  const outputs = new Set(Array.from({ length: 50 }, () => buildImagePrompt(p)));
  expect(outputs.size).toBe(1);
  return [...outputs][0]!;
};
const blocksOf = (text: string): string[] => text.split('\n\n');
const countOf = (text: string, needle: string): number => text.split(needle).length - 1;
const indexOfBlock = (blocks: string[], match: (b: string) => boolean): number => blocks.findIndex(match);
const isPhotoBlock = (b: string): boolean => b.startsWith('Pet 1 (') || /^Pet \d+ \(/.test(b);
const isJsonBlock = (b: string): boolean => b.startsWith(SCENE_SPEC_HEADER);
const isPlaceAll = (b: string): boolean => b.startsWith('Place all ');
const isCount = (b: string): boolean => b.startsWith('Exact animal count: ');

describe('T1283 PRESERVATION_BLOCK: el invariante se formula sobre el bloque y no sobre el literal (EDGE-009-044)', () => {
  it('[EDGE-009-044][REQ-PRO9-002] PRESERVATION_BLOCK es el valor por defecto del literal de REQ-PRO9-002, no vacío y distinto de las reglas de estilo', () => {
    expect(PRESERVATION_BLOCK).toBe(PRESERVATION_LITERAL);
    expect(PRESERVATION_BLOCK.length).toBeGreaterThan(0);
    expect(PRESERVATION_BLOCK).not.toBe(PIXEL_REDRAW_RULE);
    expect(PIXEL_REDRAW_RULE.includes(PRESERVATION_BLOCK) || STYLE_BASE_TEXT.includes(PRESERVATION_BLOCK) || PET_COUNT_RULE.includes(PRESERVATION_BLOCK)).toBe(false);
  });

  it('[INV-PRO9-001][EDGE-009-044] sobre PRESERVATION_BLOCK: aparece 1 vez si y solo si hay mascota con foto, en todos los modos y casos (con o sin foto de hogar)', () => {
    const cases: Array<[ScenePayload, number]> = [
      [payload([]), 0], [payload([], { household: true }), 0], [payload([pet(1), cat(2)]), 0], [payload([pet(1), cat(2)], { household: true }), 0],
      [payload([withPhoto(1, 'IMG_1')]), 1], [payload([withPhoto(1, 'IMG_2')], { household: true }), 1], [payload([withPhoto(1, 'IMG_2'), cat(2), withPhoto(3, 'IMG_3')], { household: true, mode: 'REGENERATE' }), 1],
      [payload([withPhoto(1, 'IMG_1'), withPhoto(2, 'IMG_2')]), 1],
    ];
    for (const [p, expected] of cases) expect(countOf(once(p), PRESERVATION_BLOCK)).toBe(expected);
  });
});

describe('T1213 FROM_SCRATCH/REGENERATE: orden de los 8 puntos en los 4 casos base (REQ-PRO9-001, REQ-PRO9-003, INV-PRO9-002; SC-009-028, SC-009-031)', () => {
  for (const mode of ['FROM_SCRATCH', 'REGENERATE'] as const) {
    it(`[SC-009-031][${mode}] caso 1, sin foto de hogar ni mascotas: estilo, hogar genérico, regla de cero animales`, () => {
      expect(blocksOf(once(payload([], { mode })))).toEqual([STYLE_BASE_TEXT, HOUSEHOLD_GENERIC, NO_ANIMALS]);
    });

    it(`[SC-009-031][SC-009-028][${mode}] caso 2, sin foto de hogar + mezcla: estilo, hogar, líneas con IMG, preservación, JSON, Place all, conteo, redibujado (JSON antes de Place all)`, () => {
      const text = once(payload([withPhoto(1, 'IMG_1'), cat(2), pet(3)], { mode }));
      const blocks = blocksOf(text);
      expect(blocks[0]).toBe(STYLE_BASE_TEXT);
      expect(blocks[1]).toBe(HOUSEHOLD_GENERIC);
      expect(blocks[2]).toBe('Pet 1 (dog): Use IMG_1 as the exact visual reference for this dog.');
      expect(blocks[3]).toBe(PRESERVATION_BLOCK);
      expect(blocks[4]!.startsWith(`${SCENE_SPEC_HEADER}\n{"renderedPetsCount":2,"pets":[{"index":2,"species":"cat"`)).toBe(true);
      expect(blocks[5]).toBe('Place all 3 pets naturally and separately in different cozy spots of the room.');
      expect(blocks[6]!.startsWith('Exact animal count: 3 pets in total (2 dogs, 1 cat).')).toBe(true);
      expect(blocks[7]).toBe(PIXEL_REDRAW_RULE);
      expect(blocks).toHaveLength(8);
    });

    it(`[SC-009-031][${mode}] caso 3, foto de hogar + N = 0: estilo, hogar con IMG_1, regla de cero animales, redibujado; sin bloque de preservación ni PET_COUNT_RULE`, () => {
      const text = once(payload([], { household: true, mode }));
      expect(blocksOf(text)).toEqual([STYLE_BASE_TEXT, householdWithPhoto('IMG_1'), NO_ANIMALS, PIXEL_REDRAW_RULE]);
      expect(countOf(text, PRESERVATION_BLOCK)).toBe(0);
      expect(text.includes(PET_COUNT_RULE)).toBe(false);
    });

    it(`[SC-009-031][${mode}] caso 4, foto de hogar + mezcla: los 8 puntos en orden exacto`, () => {
      const text = once(payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true, mode }));
      const blocks = blocksOf(text);
      expect(blocks[0]).toBe(STYLE_BASE_TEXT);
      expect(blocks[1]).toBe(householdWithPhoto('IMG_1'));
      expect(blocks[2]).toBe('Pet 1 (dog): Use IMG_2 as the exact visual reference for this dog.');
      expect(blocks[3]).toBe(PRESERVATION_BLOCK);
      expect(blocks[4]).toBe(`${SCENE_SPEC_HEADER}\n{"renderedPetsCount":1,"pets":[{"index":2,"species":"cat","breed":"mixed-breed","sex":"female"}]}`);
      expect(blocks[5]).toBe('Place all 2 pets naturally and separately in different cozy spots of the room.');
      expect(blocks[6]!.startsWith('Exact animal count: 2 pets in total (1 dog, 1 cat).')).toBe(true);
      expect(blocks[7]).toBe(PIXEL_REDRAW_RULE);
      expect(blocks).toHaveLength(8);
    });
  }

  it('[SC-009-028][INV-PRO9-002][REQ-PRO9-001] en mixto, Scene specification (JSON) y toda línea de mascota preceden a Place all N pets y a la frase de conteo', () => {
    const blocks = blocksOf(once(payload([withPhoto(1, 'IMG_2'), cat(2), pet(3), withPhoto(4, 'IMG_3')], { household: true })));
    const [photo, json, place, count] = [indexOfBlock(blocks, isPhotoBlock), indexOfBlock(blocks, isJsonBlock), indexOfBlock(blocks, isPlaceAll), indexOfBlock(blocks, isCount)];
    expect([photo, json, place, count].every((i) => i >= 0)).toBe(true);
    expect(photo).toBeLessThan(json);
    expect(json).toBeLessThan(place);
    expect(place).toBeLessThan(count);
  });

  it('[SC-009-029][INV-PRO9-001] con al menos una mascota con foto (con o sin foto de hogar) el bloque de preservación aparece exactamente una vez, entre las líneas con IMG y el JSON', () => {
    for (const household of [true, false]) {
      const first = household ? 'IMG_2' : 'IMG_1';
      const text = once(payload([withPhoto(1, first), withPhoto(2, household ? 'IMG_3' : 'IMG_2'), cat(3)], { household }));
      expect(countOf(text, PRESERVATION_BLOCK)).toBe(1);
      const blocks = blocksOf(text);
      expect(indexOfBlock(blocks, (b) => b === PRESERVATION_BLOCK)).toBe(indexOfBlock(blocks, isPhotoBlock) + 1);
      expect(indexOfBlock(blocks, (b) => b === PRESERVATION_BLOCK)).toBeLessThan(indexOfBlock(blocks, isJsonBlock));
    }
  });

  it('[SC-009-030][REQ-PRO9-002] con ninguna mascota con foto (nada, solo hogar con N = 0, solo hogar con mascotas sin foto) el bloque no aparece', () => {
    for (const p of [payload([]), payload([], { household: true }), payload([pet(1), cat(2)], { household: true }), payload([pet(1)])]) expect(countOf(once(p), PRESERVATION_BLOCK)).toBe(0);
  });

  it('[REQ-PRO9-003] sin mascotas sin foto (todas con foto) se omite el JSON y el orden sigue siendo líneas, preservación, Place all, conteo, redibujado', () => {
    const blocks = blocksOf(once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true })));
    expect(blocks.map((b) => (b === PRESERVATION_BLOCK ? 'P' : isPhotoBlock(b) ? 'L' : isPlaceAll(b) ? 'A' : isCount(b) ? 'C' : b === PIXEL_REDRAW_RULE ? 'R' : b === STYLE_BASE_TEXT ? 'S' : 'H'))).toEqual(['S', 'H', 'L', 'P', 'A', 'C', 'R']);
  });

  it('[REQ-PRO9-003] con N = 1 no se emite Place all y la frase de conteo cierra antes del redibujado', () => {
    const blocks = blocksOf(once(payload([withPhoto(1, 'IMG_1')])));
    expect(blocks.some(isPlaceAll)).toBe(false);
    expect(blocks.at(-1)).toBe(PIXEL_REDRAW_RULE);
    expect(isCount(blocks.at(-2)!)).toBe(true);
  });
});

describe('T1214 modos incrementales, N = 0, tope de imágenes, determinismo y privacidad (REQ-PRO9-004..006)', () => {
  const incremental = (mode: 'INCREMENTAL_ADD' | 'INCREMENTAL_REPLACE' | 'INCREMENTAL_REMOVE', pets: PetBlock[]): ScenePayload => payload(pets, { household: true, mode });

  it('[SC-009-032][REQ-PRO9-004] ADD y REPLACE con foto emiten el bloque inmediatamente antes de PIXEL_REDRAW_RULE (y después de PET_COUNT_RULE); el redibujado y el cierre se conservan', () => {
    const add = blocksOf(once(incremental('INCREMENTAL_ADD', [pet(1, { action: 'KEEP' }), cat(2, { action: 'ADD', hasReferencePhoto: true, photoRef: 'IMG_2' })])));
    const replace = blocksOf(once(incremental('INCREMENTAL_REPLACE', [pet(1, { action: 'KEEP' }), cat(2, { action: 'REPLACE', hasReferencePhoto: true, photoRef: 'IMG_2' })])));
    for (const blocks of [add, replace]) {
      const at = blocks.indexOf(PRESERVATION_BLOCK);
      expect(at).toBeGreaterThan(0);
      expect(blocks[at + 1]).toBe(PIXEL_REDRAW_RULE);
      expect(blocks[at - 1]).toBe(PET_COUNT_RULE);
      expect(blocks.at(-1)).toBe(CLOSING_16);
      expect(blocks.filter((b) => b === PRESERVATION_BLOCK)).toHaveLength(1);
    }
  });

  it('[SC-009-032][EDGE-009-026] ADD sin foto, REMOVE solo, o la única mascota con foto en KEEP: no se emite el bloque', () => {
    const cases = [
      incremental('INCREMENTAL_ADD', [pet(1, { action: 'KEEP' }), cat(2, { action: 'ADD' })]),
      incremental('INCREMENTAL_REMOVE', [pet(1, { action: 'KEEP' }), cat(2, { action: 'REMOVE' })]),
      incremental('INCREMENTAL_ADD', [withPhoto(1, 'IMG_2', { action: 'KEEP' }), cat(2, { action: 'ADD' })]),
      incremental('INCREMENTAL_REPLACE', [withPhoto(1, 'IMG_2', { action: 'KEEP' }), cat(2, { action: 'REPLACE' })]),
    ];
    for (const p of cases) expect(countOf(once(p), PRESERVATION_BLOCK)).toBe(0);
  });

  it('[SC-009-033][REQ-PRO9-005][EDGE-009-024] con N = 0 en desde-cero el prompt dice «Draw no animals in this room.» una vez y no menciona renderedPetsCount ni PET_COUNT_RULE', () => {
    for (const household of [false, true]) {
      const text = once(payload([], { household }));
      expect(countOf(text, NO_ANIMALS)).toBe(1);
      expect(text.includes('renderedPetsCount')).toBe(false);
      expect(text.includes(PET_COUNT_RULE)).toBe(false);
      expect(text.includes('Exact animal count')).toBe(false);
      expect(text.includes(PRESERVATION_BLOCK)).toBe(false);
    }
    // PET_COUNT_RULE queda para los modos incrementales.
    expect(once(incremental('INCREMENTAL_REMOVE', [pet(1, { action: 'REMOVE' })])).includes(PET_COUNT_RULE)).toBe(true);
  });

  it('[EDGE-009-025] mascotas con foto omitidas por el tope de imágenes (photoRef nulo en el payload final): ni línea con IMG ni bloque de preservación; con una que sobrevive, una sola vez', () => {
    const omitted = once(payload([pet(1, { hasReferencePhoto: true, photoRef: null }), cat(2, { hasReferencePhoto: true, photoRef: null })], { household: true }));
    expect(countOf(omitted, PRESERVATION_BLOCK)).toBe(0);
    expect(/Pet \d+ \(/.test(omitted.split('\n').filter((l) => l.includes('Use IMG')).join('\n'))).toBe(false);
    const partly = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: null })], { household: true }));
    expect(countOf(partly, PRESERVATION_BLOCK)).toBe(1);
  });

  it('[SC-009-034][REQ-PRO9-006] determinismo byte a byte y privacidad: ningún id, nombre, biografía ni texto libre de raza en el prompt con preservación', () => {
    const base = payload([withPhoto(7, 'IMG_2', { biography: 'biografia-secreta', breed: 'raza-libre-a' }), pet(3, { breed: 'raza-libre-b', biography: 'otra-biografia' })], { household: true });
    const p: ScenePayload = { ...base, household: { ...base.household, fallbackContext: 'contexto-secreto' } };
    const text = once(p);
    for (const leaked of [id(900), id(7), id(3), 'biografia-secreta', 'otra-biografia', 'raza-libre-a', 'raza-libre-b', 'contexto-secreto', 'biography', 'fallbackContext', 'maxPets', 'currentSceneRef', 'totalPetsInHousehold']) {
      expect(text.includes(leaked)).toBe(false);
    }
    expect(countOf(text, PRESERVATION_BLOCK)).toBe(1);
    expect(text.includes('"id"')).toBe(false);
  });
});
