import { describe, expect, it } from 'vitest';
import type { PetBlock, ScenePayload } from '../../src/generated/v34/schemas/types.ts';
import { PIXEL_REDRAW_RULE, STYLE_BASE_TEXT, buildImagePrompt } from '../../src/domain/scene/build-image-prompt.ts';
import { PET_COUNT_RULE } from '../../src/domain/scene/scene-spec.ts';
import { DEFAULT_SCENE_STYLE } from '../../src/domain/scene/scene-payload.ts';

/**
 * T1071 (007, Bloque G; pruebas rojas del prompt combinado): un solo texto con bloque de fotos (mascotas con `photoRef`) y bloque JSON (solo mascotas sin foto), ordinal
 * global 1-based disjunto, `IMG_1` hogar y mascotas desde `IMG_2` (o `IMG_1` sin hogar), frase de conteo de Neo (D7-ESC-01) y literales 16-bit de Neo (T1069).
 * Los literales se copian de `claude/decisiones-neo-007-2026-11-21.md` (no se lee `claude/` en la prueba: no está versionado).
 * REQ-ESC7-003, REQ-ESC7-004, REQ-ESC7-006, REQ-ESC7-008, EDGE-007-023, EDGE-007-024; SC-007-036..041.
 */
const NEO_STYLE_BASE_TEXT =
  'Create a single cohesive 16-bit cozy retro RPG isometric pixel art cutaway illustration of a sunlit home living room. Crisp pixel clusters, clean pixel-art outlines, flat warm indie-game shading, and a harmonious palette of warm forest green, soft pastel mint, warm cream, honey wood, and gentle sky blue. Include cozy pet-care details like ceramic food and water bowls, potted houseplants, and soft natural morning light.';
const NEO_PIXEL_REDRAW_RULE =
  'Render every wall, floor tile, piece of furniture, plant, and pet as crisp 16-bit retro RPG video-game pixel art with clearly visible individual pixels, sharp pixel-art outlines, and flat cozy indie-game shading.';
const NEO_ARTSTYLE = '16-bit cozy retro RPG isometric pixel art with natural-language warm pastel palette';
const NEO_HOUSEHOLD_GENERIC = 'Design a warm, cozy modern living room interior with honey-colored wooden floors, a soft armchair, pet beds, and a large sunlit window.';
const neoHouseholdWithPhoto = (ref: string): string =>
  `Draw a brand-new 16-bit retro RPG isometric cutaway room diorama inspired by the furniture, plants, color accents, and general room layout of ${ref}.`;
const neoCount = (n: number, group: string): string =>
  n === 1
    ? `Exact animal count: 1 pet in total (${group}). Draw only this 1 pet and no additional animals.`
    : `Exact animal count: ${n} pets in total (${group}). Draw only these ${n} pets and no additional animals.`;
const neoPlaceAll = (n: number): string => `Place all ${n} pets naturally and separately in different cozy spots of the room.`;

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pet = (n: number, extra: Partial<PetBlock> = {}): PetBlock => ({
  id: id(n), action: 'RENDER', species: 'CANINE', speciesOther: null, breed: 'Criolla', breedCode: 'DOG_CRIOLLA', sex: 'FEMALE', hasReferencePhoto: false, photoRef: null, ...extra,
});
const withPhoto = (n: number, ref: string, extra: Partial<PetBlock> = {}): PetBlock => pet(n, { hasReferencePhoto: true, photoRef: ref as PetBlock['photoRef'], ...extra });
const cat = (n: number, extra: Partial<PetBlock> = {}): PetBlock => pet(n, { species: 'FELINE', breedCode: 'CAT_CRIOLLA', breed: 'Criollo', ...extra });
const payload = (pets: PetBlock[], opts: { household?: boolean; mode?: 'FROM_SCRATCH' | 'REGENERATE' } = {}): ScenePayload => ({
  schemaVersion: '1.0.0',
  mode: opts.mode ?? 'FROM_SCRATCH',
  style: DEFAULT_SCENE_STYLE,
  household: { id: id(900), hasReferencePhoto: opts.household === true, photoRef: opts.household === true ? 'IMG_1' : null },
  scene: { currentSceneRef: null, maxPets: 8, totalPetsInHousehold: pets.length },
  pets,
});
const once = (p: ScenePayload): string => {
  const outputs = new Set(Array.from({ length: 100 }, () => buildImagePrompt(p)));
  expect(outputs.size).toBe(1);
  return [...outputs][0]!;
};
const blocksOf = (text: string): string[] => text.split('\n\n');
const countOf = (text: string, needle: string): number => text.split(needle).length - 1;
const photoLines = (text: string): string[] => text.split('\n').filter((l) => /^Pet \d+ \([^)]*\): Use IMG_\d+ as the exact visual reference/.test(l));
const imgRefs = (text: string): string[] => text.match(/IMG_\d+/g) ?? [];
const jsonOf = (text: string): { renderedPetsCount: number; pets: { index: number }[] } | null => {
  const start = text.indexOf('{');
  const stop = text.lastIndexOf('}');
  if (!text.includes('renderedPetsCount') || start < 0 || stop < start) return null;
  return JSON.parse(text.slice(start, stop + 1)) as { renderedPetsCount: number; pets: { index: number }[] };
};
const jsonIndexes = (text: string): number[] => (jsonOf(text)?.pets ?? []).map((p) => p.index);
const photoOrdinals = (text: string): number[] => photoLines(text).map((l) => Number(/^Pet (\d+) /.exec(l)![1]));

describe('T1071 literales 16-bit de Neo (REQ-ESC7-005, SC-007-041)', () => {
  it('[SC-007-041] STYLE_BASE_TEXT, PIXEL_REDRAW_RULE y el prompt completo usan los literales 16-bit de Neo', () => {
    expect(STYLE_BASE_TEXT).toBe(NEO_STYLE_BASE_TEXT);
    expect(PIXEL_REDRAW_RULE).toBe(NEO_PIXEL_REDRAW_RULE);
    expect(DEFAULT_SCENE_STYLE.artStyle).toBe(NEO_ARTSTYLE);
    const text = once(payload([pet(1)]));
    expect(text.startsWith(`${NEO_STYLE_BASE_TEXT}\n\n`)).toBe(true);
  });

  it('[SC-007-041] sin #hex ni «32-bit» en ningún caso (con/sin foto de hogar, 0..8 mascotas, mixtos)', () => {
    const cases: ScenePayload[] = [
      payload([]), payload([], { household: true }), payload([pet(1)]), payload([withPhoto(1, 'IMG_2')], { household: true }),
      payload([withPhoto(1, 'IMG_1'), pet(2)]), payload([withPhoto(1, 'IMG_2'), cat(2), withPhoto(3, 'IMG_3')], { household: true, mode: 'REGENERATE' }),
      payload(Array.from({ length: 8 }, (_, i) => pet(i + 1))),
    ];
    for (const p of cases) {
      const text = once(p);
      expect(/#[0-9a-fA-F]{3}\b/.test(text)).toBe(false);
      expect(/#[0-9a-fA-F]{6}\b/.test(text)).toBe(false);
      expect(text.includes('32-bit')).toBe(false);
      expect(text.includes('16-bit')).toBe(true);
    }
  });

  it('[SC-007-041] el bloque de hogar es el literal de Neo: con foto (IMG_1) o genérico', () => {
    expect(blocksOf(once(payload([withPhoto(1, 'IMG_2')], { household: true })))).toContain(neoHouseholdWithPhoto('IMG_1'));
    expect(blocksOf(once(payload([pet(1)])))).toContain(NEO_HOUSEHOLD_GENERIC);
  });
});

describe('T1071 todas con foto (SC-007-036, REQ-ESC7-003/004)', () => {
  it('[SC-007-036] hogar IMG_1 y mascotas IMG_2..IMG_(N+1) en orden; el bloque de fotos lista las N; sin JSON ni PET_COUNT_RULE', () => {
    for (const mode of ['FROM_SCRATCH', 'REGENERATE'] as const) {
      const text = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' }), withPhoto(3, 'IMG_4')], { household: true, mode }));
      expect(photoLines(text)).toHaveLength(3);
      expect(photoOrdinals(text)).toEqual([1, 2, 3]);
      expect(photoLines(text).map((l) => /IMG_\d+/.exec(l)![0])).toEqual(['IMG_2', 'IMG_3', 'IMG_4']);
      expect(countOf(text, 'IMG_1')).toBe(1);
      expect(blocksOf(text)).toContain(neoHouseholdWithPhoto('IMG_1'));
      expect(jsonOf(text)).toBeNull();
      expect(text.includes('renderedPetsCount')).toBe(false);
      expect(text.includes(PET_COUNT_RULE)).toBe(false);
      expect(blocksOf(text)).toContain(neoPlaceAll(3));
      expect(blocksOf(text)).toContain(neoCount(3, '2 dogs, 1 cat'));
      expect(countOf(text, NEO_PIXEL_REDRAW_RULE)).toBe(1);
    }
  });

  it('[SC-007-036] ejemplo 1 de Neo: hogar IMG_1 + dog IMG_2 + cat IMG_3, bloques en orden estable', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true }));
    const blocks = blocksOf(text);
    expect(blocks[0]).toBe(NEO_STYLE_BASE_TEXT);
    expect(blocks[1]).toBe(neoHouseholdWithPhoto('IMG_1'));
    expect(blocks[2]!.split('\n')).toHaveLength(2);
    expect(blocks[2]!.startsWith('Pet 1 (dog): Use IMG_2 as the exact visual reference')).toBe(true);
    expect(blocks[2]!.split('\n')[1]!.startsWith('Pet 2 (cat): Use IMG_3 as the exact visual reference')).toBe(true);
    expect(blocks[3]).toBe(neoPlaceAll(2));
    expect(blocks[4]).toBe(neoCount(2, '1 dog, 1 cat'));
    expect(blocks[5]).toBe(NEO_PIXEL_REDRAW_RULE);
    expect(blocks).toHaveLength(6);
  });
});

describe('T1071 ninguna con foto (SC-007-037, EDGE-007-024)', () => {
  it('[SC-007-037] sin foto de hogar y sin fotos de mascota: ningún IMG_n, JSON con las N, sin regla de redibujado', () => {
    const text = once(payload([pet(1), cat(2), pet(3)]));
    expect(imgRefs(text)).toEqual([]);
    expect(photoLines(text)).toEqual([]);
    expect(jsonIndexes(text)).toEqual([1, 2, 3]);
    expect(jsonOf(text)?.renderedPetsCount).toBe(3);
    expect(blocksOf(text)).toContain(NEO_HOUSEHOLD_GENERIC);
    expect(blocksOf(text)).toContain(neoPlaceAll(3));
    expect(blocksOf(text)).toContain(neoCount(3, '2 dogs, 1 cat'));
    expect(text.includes(NEO_PIXEL_REDRAW_RULE)).toBe(false);
  });

  it('[SC-007-037] con foto de hogar y ninguna mascota con foto: solo IMG_1 (hogar), JSON con las N y redibujado una vez', () => {
    const text = once(payload([pet(1), cat(2)], { household: true }));
    expect(imgRefs(text)).toEqual(['IMG_1']);
    expect(jsonIndexes(text)).toEqual([1, 2]);
    expect(countOf(text, NEO_PIXEL_REDRAW_RULE)).toBe(1);
  });

  it('[SC-007-037][EDGE-007-024] hogar sin foto/consentimiento: las mascotas con foto arrancan en IMG_1 y no queda ninguna referencia de hogar', () => {
    const text = once(payload([withPhoto(1, 'IMG_1'), withPhoto(2, 'IMG_2')]));
    expect(photoLines(text).map((l) => /IMG_\d+/.exec(l)![0])).toEqual(['IMG_1', 'IMG_2']);
    expect(imgRefs(text)).toEqual(['IMG_1', 'IMG_2']);
    expect(blocksOf(text)).toContain(NEO_HOUSEHOLD_GENERIC);
    expect(text.includes('inspired by the furniture')).toBe(false);
  });
});

describe('T1071 mixto y ordinal único (SC-007-038, EDGE-007-023, R2)', () => {
  it('[SC-007-038] ejemplo 3: hogar IMG_1, Pet 1 con IMG_2, Pet 2 solo en JSON con ordinal global 2', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true }));
    expect(photoOrdinals(text)).toEqual([1]);
    expect(jsonIndexes(text)).toEqual([2]);
    expect(jsonOf(text)?.renderedPetsCount).toBe(1);
    expect(blocksOf(text)).toContain(neoPlaceAll(2));
    expect(blocksOf(text)).toContain(neoCount(2, '1 dog, 1 cat'));
    expect(blocksOf(text).at(-1)).toBe(NEO_PIXEL_REDRAW_RULE);
  });

  it('[SC-007-038] cada ordinal 1..N aparece exactamente una vez entre bloque de fotos y JSON, con y sin hogar, y los bloques son disjuntos', () => {
    const pets = [pet(1), withPhoto(2, 'IMG_2'), cat(3), withPhoto(4, 'IMG_3'), pet(5)];
    for (const household of [true, false]) {
      const list = household ? pets : [pet(1), withPhoto(2, 'IMG_1'), cat(3), withPhoto(4, 'IMG_2'), pet(5)];
      const text = once(payload(list, { household }));
      const photo = photoOrdinals(text);
      const json = jsonIndexes(text);
      expect(photo).toEqual([2, 4]);
      expect(json).toEqual([1, 3, 5]);
      expect([...photo, ...json].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
      expect(photo.filter((k) => json.includes(k))).toEqual([]);
      expect(jsonOf(text)?.renderedPetsCount).toBe(3);
    }
  });

  it('[SC-007-038] las fotos de mascota arrancan en IMG_2 con hogar y en IMG_1 sin hogar, consecutivas y sin huecos', () => {
    const withHome = once(payload([withPhoto(1, 'IMG_2'), pet(2), withPhoto(3, 'IMG_3')], { household: true }));
    expect(imgRefs(withHome)).toEqual(['IMG_1', 'IMG_2', 'IMG_3']);
    const noHome = once(payload([withPhoto(1, 'IMG_1'), pet(2), withPhoto(3, 'IMG_2')]));
    expect(imgRefs(noHome)).toEqual(['IMG_1', 'IMG_2']);
  });

  it('[SC-007-038] las REMOVE no cuentan: N visible, ordinales y conteo excluyen las retiradas', () => {
    const text = once(payload([pet(1), pet(2, { action: 'REMOVE' }), cat(3)]));
    expect(blocksOf(text)).toContain(neoCount(2, '1 dog, 1 cat'));
    expect(blocksOf(text)).toContain(neoPlaceAll(2));
  });
});

describe('T1071 cero mascotas (SC-007-039)', () => {
  it('[SC-007-039] sin bloque de fotos ni JSON ni frase de conteo ni Place all; con PET_COUNT_RULE', () => {
    for (const household of [false, true]) {
      const text = once(payload([], { household }));
      expect(photoLines(text)).toEqual([]);
      expect(jsonIndexes(text)).toEqual([]);
      expect(text.includes('Exact animal count')).toBe(false);
      expect(text.includes('Place all')).toBe(false);
      expect(text.includes('Pet 1')).toBe(false);
      expect(blocksOf(text)).toContain(PET_COUNT_RULE);
      expect(text.startsWith(`${NEO_STYLE_BASE_TEXT}\n\n`)).toBe(true);
      expect(blocksOf(text)).toContain(household ? neoHouseholdWithPhoto('IMG_1') : NEO_HOUSEHOLD_GENERIC);
    }
  });
});

describe('T1071 frase de conteo exacta (SC-007-040, REQ-ESC7-006, D7-ESC-01)', () => {
  it('[SC-007-040] N = 1: singular «1 pet … this 1 pet», una sola vez, con foto o sin foto', () => {
    for (const p of [payload([pet(1)]), payload([withPhoto(1, 'IMG_2')], { household: true })]) {
      const text = once(p);
      expect(countOf(text, 'Exact animal count: ')).toBe(1);
      expect(blocksOf(text)).toContain(neoCount(1, '1 dog'));
      expect(text.includes('1 pets')).toBe(false);
      expect(text.includes('these 1 pets')).toBe(false);
    }
  });

  it('[SC-007-040] N = 2, 3, 5 y 8: plural «N pets … these N pets», una sola vez, con N = total visible y G sumando N', () => {
    const groups: Record<number, string> = { 2: '2 dogs', 3: '3 dogs', 5: '5 dogs', 8: '8 dogs' };
    for (const n of [2, 3, 5, 8]) {
      const plain = once(payload(Array.from({ length: n }, (_, i) => pet(i + 1))));
      const mixed = once(payload(Array.from({ length: n }, (_, i) => (i % 2 === 0 ? withPhoto(i + 1, `IMG_${i / 2 + 1}`) : pet(i + 1)))));
      for (const text of [plain, mixed]) {
        expect(countOf(text, 'Exact animal count: ')).toBe(1);
        expect(blocksOf(text)).toContain(neoCount(n, groups[n]!));
        expect(text.includes(`these ${n} pets`)).toBe(true);
      }
    }
  });

  it('[SC-007-040] la frase va tras el JSON y antes de PET_COUNT_RULE cuando ambos existen; PET_COUNT_RULE no cambia', () => {
    const text = once(payload([pet(1), cat(2)]));
    const iJson = text.indexOf('renderedPetsCount');
    const iCount = text.indexOf('Exact animal count: ');
    expect(iJson).toBeGreaterThanOrEqual(0);
    expect(iCount).toBeGreaterThan(iJson);
    if (text.includes(PET_COUNT_RULE)) expect(text.indexOf(PET_COUNT_RULE)).toBeGreaterThan(iCount);
    expect(PET_COUNT_RULE).toBe('Draw exactly renderedPetsCount animals, one for each entry of pets and matching its species, breed, and sex; do not add, omit, merge, or duplicate any animal, and draw no other animal even if a reference image shows more. When renderedPetsCount is zero, draw no animals.');
  });
});

describe('T1071 pureza, determinismo y no fuga (SC-007-041, REQ-ESC7-008)', () => {
  it('[SC-007-041] 100 ejecuciones idénticas en todos los casos del combinado', () => {
    const cases: ScenePayload[] = [
      payload([]), payload([pet(1)]), payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true }),
      payload([withPhoto(1, 'IMG_1'), withPhoto(2, 'IMG_2')]), payload(Array.from({ length: 8 }, (_, i) => pet(i + 1)), { mode: 'REGENERATE' }),
    ];
    for (const p of cases) expect(once(p).length).toBeGreaterThan(0);
  });

  it('[SC-007-041][REQ-ESC7-008] ningún id, biography, fallbackContext, breed libre, nombre, semilla ni metadatos de escena', () => {
    const pets = [withPhoto(7, 'IMG_2', { biography: 'biografia-secreta', breed: 'raza-libre-a' }), pet(3, { breed: 'raza-libre-b', biography: 'otra-biografia' })];
    const base = payload(pets, { household: true });
    const text = once({ ...base, household: { ...base.household, fallbackContext: 'contexto-secreto' } });
    for (const leaked of [id(900), id(7), id(3), 'biografia-secreta', 'otra-biografia', 'raza-libre-a', 'raza-libre-b', 'contexto-secreto', 'biography', 'fallbackContext', 'maxPets', 'currentSceneRef', 'totalPetsInHousehold', 'seed']) {
      expect(text.includes(leaked)).toBe(false);
    }
    expect(jsonIndexes(text)).toEqual([2]);
    expect(text.includes('"id"')).toBe(false);
  });

  it('[SC-007-041] el JSON de mascotas sin foto no repite ninguna mascota con foto (sin photoRef ni hasReferencePhoto true)', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), pet(2), withPhoto(3, 'IMG_3')], { household: true }));
    const spec = jsonOf(text);
    expect(spec?.pets).toHaveLength(1);
    expect(text.includes('"hasReferencePhoto":true') || text.includes('"hasReferencePhoto": true')).toBe(false);
    expect(countOf(text, 'IMG_2')).toBe(1);
    expect(countOf(text, 'IMG_3')).toBe(1);
  });
});
