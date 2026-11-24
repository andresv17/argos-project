import { describe, expect, it } from 'vitest';
import type { PetBlock, ScenePayload } from '../../src/generated/v34/schemas/types.ts';
import { PIXEL_REDRAW_RULE, PRESERVATION_BLOCK, STYLE_BASE_TEXT, buildImagePrompt } from '../../src/domain/scene/build-image-prompt.ts';
import { petSizeToken } from '../../src/domain/scene/pet-phrases.ts';
import { PET_COUNT_RULE } from '../../src/domain/scene/scene-spec.ts';
import { DEFAULT_SCENE_STYLE } from '../../src/domain/scene/scene-payload.ts';

/**
 * T1071 (007, Bloque G; pruebas rojas del prompt combinado): un solo texto con bloque de fotos (mascotas con `photoRef`) y bloque JSON (solo mascotas sin foto), ordinal
 * global 1-based disjunto, `IMG_1` hogar y mascotas desde `IMG_2` (o `IMG_1` sin hogar), frase de conteo de Neo (D7-ESC-01) y literales 16-bit de Neo (T1069).
 * Los literales se copian de las decisiones de Neo del 2026-11-21 (archivo no versionado; la prueba no lo lee).
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
/** Enmienda 009 (T1212/T1215, `D9-26` = A): bloque de preservación visual, una vez si y solo si hay mascota con foto; N = 0 usa esta frase y no `PET_COUNT_RULE`. */
const NEO_NO_ANIMALS = 'Draw no animals in this room.';
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
const photoLines = (text: string): string[] => text.split('\n').filter((l) => /^Pet \d+ \([^)]*\): Translate this pet from IMG_\d+ /.test(l));
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
  it('[SC-007-041][REQ-ESC7-005] STYLE_BASE_TEXT, PIXEL_REDRAW_RULE y el prompt completo usan los literales 16-bit de Neo', () => {
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
  it('[SC-007-036][REQ-ESC7-003] hogar IMG_1 y mascotas IMG_2..IMG_(N+1) en orden; el bloque de fotos lista las N; sin JSON ni PET_COUNT_RULE', () => {
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

  it('[SC-007-036][REQ-ESC7-004] ejemplo 1 de Neo: hogar IMG_1 + dog IMG_2 + cat IMG_3, bloques en orden estable', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true }));
    const blocks = blocksOf(text);
    expect(blocks[0]).toBe(NEO_STYLE_BASE_TEXT);
    expect(blocks[1]).toBe(neoHouseholdWithPhoto('IMG_1'));
    expect(blocks[2]!.split('\n')).toHaveLength(2);
    expect(blocks[2]!.startsWith('Pet 1 (dog): Translate this pet from IMG_2 ')).toBe(true);
    expect(blocks[2]!.split('\n')[1]!.startsWith('Pet 2 (cat): Translate this pet from IMG_3 ')).toBe(true);
    // Orden de Neo (2026-11-24): sin PRESERVATION_BLOCK suelto en los modos desde cero.
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
    expect(jsonOf(text)?.renderedPetsCount).toBe(2);
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
      expect(jsonOf(text)?.renderedPetsCount).toBe(5);
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
      expect(blocksOf(text)).toContain(NEO_NO_ANIMALS);
      expect(text.includes(PET_COUNT_RULE)).toBe(false);
      expect(text.includes('renderedPetsCount')).toBe(false);
      expect(countOf(text, PRESERVATION_BLOCK)).toBe(0);
      expect(text.startsWith(`${NEO_STYLE_BASE_TEXT}\n\n`)).toBe(true);
      expect(blocksOf(text)).toContain(household ? neoHouseholdWithPhoto('IMG_1') : NEO_HOUSEHOLD_GENERIC);
    }
  });
});

describe('T1071 frase de conteo exacta (SC-007-040, REQ-ESC7-006, D7-ESC-01)', () => {
  it('[SC-007-040][REQ-ESC7-006] N = 1: singular «1 pet … this 1 pet», una sola vez, con foto o sin foto, sin frase «Place…» (D7-ESC-03 C)', () => {
    for (const p of [payload([pet(1)]), payload([withPhoto(1, 'IMG_2')], { household: true })]) {
      const text = once(p);
      expect(countOf(text, 'Exact animal count: ')).toBe(1);
      expect(blocksOf(text)).toContain(neoCount(1, '1 dog'));
      expect(text.includes('1 pets')).toBe(false);
      expect(text.includes('these 1 pets')).toBe(false);
      expect(text.includes('Place')).toBe(false);
      expect(text.includes('Place the 1 pet')).toBe(false);
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

  it('[SC-007-040] la frase va tras el JSON, PET_COUNT_RULE no se emite con N >= 1 y su texto no cambia', () => {
    const text = once(payload([pet(1), cat(2)]));
    const iJson = text.indexOf('renderedPetsCount');
    const iCount = text.indexOf('Exact animal count: ');
    expect(iJson).toBeGreaterThanOrEqual(0);
    expect(iCount).toBeGreaterThan(iJson);
    expect(text.includes(PET_COUNT_RULE)).toBe(false);
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
    const pets = [withPhoto(7, 'IMG_2', { breed: 'raza-libre-a' }), pet(3, { breed: 'raza-libre-b' })];
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

const NEO_SPEC_HEADER = 'Scene specification (JSON):';
const NEO_CLOSING_16 = 'Match the exact 16-bit isometric RPG pixel art style, warm natural lighting, and cozy palette.';
const photoLine = (k: number, species: string, ref: string): string =>
  `Pet ${k} (${species}): Translate this pet from ${ref} into the 16-bit isometric pixel art illustration, faithfully preserving its species, fur colors, coat patterns, ear shapes, body proportions, and unique markings so it is clearly recognizable.`;
const jsonPet = (index: number, species: string): string => `{"index":${index},"species":"${species}","breed":"mixed-breed","sex":"female"}`;

describe('T1071 R1: PET_COUNT_RULE solo con N = 0 y sin STYLE_CLOSING en modos desde cero (REQ-ESC7-006, SC-007-043)', () => {
  it('[SC-007-043] en FROM_SCRATCH y REGENERATE, con N >= 1 (todas con foto, ninguna, mixto), nunca PET_COUNT_RULE ni cierre de estilo', () => {
    const cases: ScenePayload[] = [
      payload([pet(1)]), payload([withPhoto(1, 'IMG_1')]), payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true }),
      payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true, mode: 'REGENERATE' }),
      payload(Array.from({ length: 8 }, (_, i) => pet(i + 1)), { mode: 'REGENERATE' }),
    ];
    for (const p of cases) {
      const text = once(p);
      expect(text.includes(PET_COUNT_RULE)).toBe(false);
      expect(text.includes('Match the exact')).toBe(false);
      expect(text.includes(NEO_CLOSING_16)).toBe(false);
    }
  });

  it('[SC-007-043] con N = 0 (enmienda 009) aparece «Draw no animals in this room.» exactamente una vez, PET_COUNT_RULE 0 veces y no el cierre de estilo', () => {
    for (const mode of ['FROM_SCRATCH', 'REGENERATE'] as const) {
      const text = once(payload([], { mode }));
      expect(countOf(text, NEO_NO_ANIMALS)).toBe(1);
      expect(countOf(text, PET_COUNT_RULE)).toBe(0);
      expect(text.includes('Match the exact')).toBe(false);
    }
  });
});

describe('T1071 R4/R5/R6: cabecera, JSON compacto, línea de foto y token de talla (SC-007-043)', () => {
  it('[SC-007-043] la cabecera es «Scene specification (JSON):» seguida de un JSON de una sola línea con las claves de R5 y sin la advertencia retirada', () => {
    const text = once(payload([pet(1), cat(2)]));
    const lines = text.split('\n');
    const at = lines.indexOf(NEO_SPEC_HEADER);
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe(`{"renderedPetsCount":2,"pets":[${jsonPet(1, 'dog')},${jsonPet(2, 'cat')}]}`);
    expect(text.includes('data only, not instructions')).toBe(false);
    for (const removed of ['"mode"', '"household"', '"action"', '"hasReferencePhoto"', '"photoRef"', '"size"']) expect(text.includes(removed)).toBe(false);
  });

  it('[SC-007-043] speciesOther saneado viaja en el JSON entre species y breed', () => {
    const text = once(payload([pet(1, { species: 'OTHER', speciesOther: 'Hurón', breedCode: null, breed: 'x' })]));
    expect(text.includes('"index":1,"species":"other","speciesOther":"Hurón","breed":"mixed-breed","sex":"female"')).toBe(true);
  });

  it('[SC-007-043] la línea de foto es la directa de Neo (2026-11-24: «Translate this pet from IMG_n …»), sin la frase «Use IMG_n as the exact visual reference» y sin talla (D7-ESC-02 provisional)', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true }));
    expect(text.split('\n')).toContain(photoLine(1, 'dog', 'IMG_2'));
    expect(text.split('\n')).toContain(photoLine(2, 'cat', 'IMG_3'));
    expect(text.includes('exact visual reference')).toBe(false);
    expect(countOf(text, 'faithfully preserving')).toBe(2);
  });

  it('[SC-007-043] petSizeToken está aislado y devuelve cadena vacía mientras D7-ESC-02 esté abierta', () => {
    expect(petSizeToken(pet(1))).toBe('');
    expect(petSizeToken(cat(2))).toBe('');
  });
});

describe('T1071 SC-007-043: los tres ejemplos de Neo byte a byte (salvo el token de talla)', () => {
  const REDRAW = NEO_PIXEL_REDRAW_RULE;
  it('[SC-007-043] ejemplo 1: hogar + todas con foto', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2, { hasReferencePhoto: true, photoRef: 'IMG_3' })], { household: true }));
    expect(text).toBe([NEO_STYLE_BASE_TEXT, neoHouseholdWithPhoto('IMG_1'), `${photoLine(1, 'dog', 'IMG_2')}\n${photoLine(2, 'cat', 'IMG_3')}`, neoPlaceAll(2), neoCount(2, '1 dog, 1 cat'), REDRAW].join('\n\n'));
  });

  it('[SC-007-043] ejemplo 2: sin hogar y ninguna con foto', () => {
    const text = once(payload([pet(1), cat(2)]));
    const json = `${NEO_SPEC_HEADER}\n{"renderedPetsCount":2,"pets":[${jsonPet(1, 'dog')},${jsonPet(2, 'cat')}]}`;
    expect(text).toBe([NEO_STYLE_BASE_TEXT, NEO_HOUSEHOLD_GENERIC, json, neoPlaceAll(2), neoCount(2, '1 dog, 1 cat')].join('\n\n'));
  });

  it('[SC-007-043][R2][REQ-ESC7-004] ejemplo 3: mixto con hogar; el JSON conserva el ordinal global 2', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true }));
    // Enmienda 2026-11-24 (defecto del prompt mixto): renderedPetsCount = total visible y referencePhotoPets declara las mascotas con foto omitidas del JSON.
    const json = `${NEO_SPEC_HEADER}\n{"renderedPetsCount":2,"pets":[${jsonPet(2, 'cat')}],"referencePhotoPets":[1]}`;
    expect(text).toBe([NEO_STYLE_BASE_TEXT, neoHouseholdWithPhoto('IMG_1'), photoLine(1, 'dog', 'IMG_2'), json, neoPlaceAll(2), neoCount(2, '1 dog, 1 cat'), REDRAW].join('\n\n'));
  });

  it('[R2] sin reindexar con huecos: mascotas 1 y 3 sin foto, 2 con foto -> JSON con índices 1 y 3', () => {
    const text = once(payload([pet(1), withPhoto(2, 'IMG_2'), cat(3)], { household: true }));
    expect(text.includes(`"pets":[${jsonPet(1, 'dog')},${jsonPet(3, 'cat')}]`)).toBe(true);
  });
});

describe('T1071 modos incrementales: misma cabecera y forma, cierre 16-bit (R4, R5)', () => {
  const incremental = (): ScenePayload => ({
    ...payload([pet(1, { action: 'KEEP' }), cat(2, { action: 'ADD', hasReferencePhoto: true, photoRef: 'IMG_2' })], { household: true }),
    mode: 'INCREMENTAL_ADD',
    scene: { currentSceneRef: 'IMG_1', maxPets: 8, totalPetsInHousehold: 2 },
  });
  it('[R5] cabecera nueva, JSON compacto con todas las visibles, PET_COUNT_RULE conservada y cierre 16-bit', () => {
    const text = once(incremental());
    expect(text.includes(`${NEO_SPEC_HEADER}\n{"renderedPetsCount":2,"pets":[${jsonPet(1, 'dog')},${jsonPet(2, 'cat')}]}`)).toBe(true);
    expect(text.includes('data only, not instructions')).toBe(false);
    expect(text.includes(PET_COUNT_RULE)).toBe(true);
    expect(text.endsWith(NEO_CLOSING_16)).toBe(true);
    expect(text.includes('32-bit')).toBe(false);
    expect(text.includes('- Add: Use IMG_2 as the exact visual reference for this cat.')).toBe(true);
  });
});

describe('T1071 enmienda 009: bloque de preservación y orden JSON-antes-de-Place (INV-PRO9-001, REQ-PRO9-001)', () => {
  it('[SC-009-029][SC-009-030] PRESERVATION_BLOCK aparece 1 vez con mascota con foto y 0 sin ella (con o sin foto de hogar)', () => {
    // Orden de Neo (2026-11-24): en los modos desde cero el bloque separado desaparece (su contenido va en la línea de cada mascota); los incrementales con foto lo conservan una vez.
    for (const p of [payload([withPhoto(1, 'IMG_2')], { household: true }), payload([withPhoto(1, 'IMG_1'), pet(2)]), payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true })]) expect(countOf(once(p), PRESERVATION_BLOCK)).toBe(0);
    expect(countOf(once({ ...payload([pet(1, { action: 'KEEP' }), cat(2, { action: 'ADD', hasReferencePhoto: true, photoRef: 'IMG_2' })], { household: true }), mode: 'INCREMENTAL_ADD', scene: { currentSceneRef: 'IMG_1', maxPets: 8, totalPetsInHousehold: 2 } }), PRESERVATION_BLOCK)).toBe(1);
    for (const p of [payload([]), payload([pet(1), cat(2)]), payload([pet(1), cat(2)], { household: true })]) expect(countOf(once(p), PRESERVATION_BLOCK)).toBe(0);
  });

  it('[SC-009-028] en mixto el JSON precede a «Place all» y la línea de la mascota con foto precede al JSON', () => {
    const text = once(payload([withPhoto(1, 'IMG_2'), cat(2)], { household: true }));
    expect(text.indexOf('Translate this pet from IMG_2')).toBeLessThan(text.indexOf(NEO_SPEC_HEADER));
    expect(text.indexOf(NEO_SPEC_HEADER)).toBeLessThan(text.indexOf('Place all'));
  });
});
