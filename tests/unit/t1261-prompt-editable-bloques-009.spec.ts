import { describe, expect, it } from 'vitest';
import { PIXEL_REDRAW_RULE, PRESERVATION_BLOCK, STYLE_BASE_TEXT, buildImagePrompt } from '../../src/domain/scene/build-image-prompt.ts';
import { ADMIN_PARAMETER_CATALOG } from '../../src/domain/platform/admin-parameter-catalog.ts';
import { DEFAULT_SCENE_STYLE } from '../../src/domain/scene/scene-payload.ts';
import type { PetBlock, ScenePayload } from '../../src/generated/v34/schemas/types.ts';

/**
 * T1261 (Feature 009, Fase 5b, #20): PRUEBAS ROJAS del prompt editable (JSON `scene.prompt.blocks`). Sin implementar produccion.
 * REQ-CFG9-005, INV-CFG9-002, INV-PRO9-001, EDGE-009-020, EDGE-009-044; SC-009-024, SC-009-025.
 *
 * Contrato de modulo que estas pruebas FIJAN para T1254/T1267/T1303 (los nombres son la propuesta de /keymaker; el numero de longitud NO se inventa:
 * sale de `constraints.maxBlockLength` del catalogo, contrato admin 1.4.0, que fija T1254):
 *  - `src/domain/scene/prompt-blocks.ts` exporta `PROMPT_BLOCK_NAMES`, `RECOGNIZED_MARKERS`, `DEFAULT_PROMPT_BLOCKS` y `validatePromptBlocks(raw, maxBlockLength)`.
 *  - `buildImagePrompt(payload, blocks?)`: `blocks` opcional (por defecto `DEFAULT_PROMPT_BLOCKS`); sigue pura y determinista.
 */
const MODULE = '../../src/domain/scene/prompt-blocks.ts';
interface Validation { readonly ok: boolean; readonly blocks?: Record<string, string>; readonly code?: string }
interface PromptBlocksModule {
  readonly PROMPT_BLOCK_NAMES: readonly string[];
  readonly RECOGNIZED_MARKERS: readonly string[];
  readonly DEFAULT_PROMPT_BLOCKS: Record<string, string>;
  readonly validatePromptBlocks: (raw: string, maxBlockLength: number) => Validation;
}
const load = async (): Promise<PromptBlocksModule> => (await import(/* @vite-ignore */ MODULE)) as PromptBlocksModule;
const build = (p: ScenePayload, blocks?: Record<string, string>): string => (buildImagePrompt as (p: ScenePayload, b?: Record<string, string>) => string)(p, blocks);
const maxLen = (): number => {
  const v = (ADMIN_PARAMETER_CATALOG['scene.prompt.blocks'].constraints as { maxBlockLength?: number }).maxBlockLength;
  expect(typeof v, 'T1254 debe fijar constraints.maxBlockLength (entero > 0) en el catalogo').toBe('number');
  return v as number;
};

const EXPECTED_NAMES = ['STYLE_BASE_TEXT', 'HOUSEHOLD_WITH_PHOTO', 'HOUSEHOLD_GENERIC', 'PRESERVATION_BLOCK', 'PIXEL_REDRAW_RULE', 'STYLE_CLOSING'];
const HOUSEHOLD_GENERIC = 'Design a warm, cozy modern living room interior with honey-colored wooden floors, a soft armchair, pet beds, and a large sunlit window.';
const HOUSEHOLD_WITH_PHOTO = 'Draw a brand-new 16-bit retro RPG isometric cutaway room diorama inspired by the furniture, plants, color accents, and general room layout of {photoRef}.';
const STYLE_CLOSING = 'Match the exact 16-bit isometric RPG pixel art style, warm natural lighting, and cozy palette.';
const seed = (): Record<string, string> => ({ STYLE_BASE_TEXT, HOUSEHOLD_WITH_PHOTO, HOUSEHOLD_GENERIC, PRESERVATION_BLOCK, PIXEL_REDRAW_RULE, STYLE_CLOSING });

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pet = (n: number, extra: Partial<PetBlock> = {}): PetBlock => ({
  id: id(n), action: 'RENDER', species: 'CANINE', speciesOther: null, breed: 'Criolla', breedCode: 'DOG_CRIOLLA', sex: 'FEMALE', hasReferencePhoto: false, photoRef: null, ...extra,
});
const withPhoto = (n: number, ref: string): PetBlock => pet(n, { hasReferencePhoto: true, photoRef: ref as PetBlock['photoRef'] });
const payload = (pets: PetBlock[], opts: { household?: boolean; mode?: ScenePayload['mode'] } = {}): ScenePayload => ({
  schemaVersion: '1.0.0',
  mode: opts.mode ?? 'FROM_SCRATCH',
  style: DEFAULT_SCENE_STYLE,
  household: { id: id(900), hasReferencePhoto: opts.household === true, photoRef: opts.household === true ? 'IMG_1' : null },
  scene: { currentSceneRef: opts.mode === 'INCREMENTAL_ADD' ? 'IMG_1' : null, maxPets: 8, totalPetsInHousehold: pets.length },
  pets,
});
const count = (text: string, needle: string): number => text.split(needle).length - 1;
const json = (blocks: Record<string, unknown>): string => JSON.stringify(blocks);

describe('T1261 [REQ-CFG9-005][SC-009-024] semilla y prompt con los valores iniciales', () => {
  it('el conjunto de bloques nombrados es exactamente los 6 del contrato y la semilla es byte a byte el texto vigente tras #57', async () => {
    const m = await load();
    expect([...m.PROMPT_BLOCK_NAMES]).toEqual(EXPECTED_NAMES);
    expect(m.DEFAULT_PROMPT_BLOCKS).toEqual(seed());
    expect(m.DEFAULT_PROMPT_BLOCKS['HOUSEHOLD_GENERIC']).toBe(HOUSEHOLD_GENERIC);
  });

  it('el defecto del catalogo de scene.prompt.blocks es un JSON canonico equivalente a la semilla y cabe en el maximo por bloque', async () => {
    const spec = ADMIN_PARAMETER_CATALOG['scene.prompt.blocks'];
    expect(spec.valueType).toBe('JSON_BLOCKS');
    expect(JSON.parse(spec.defaultValue)).toEqual(seed());
    for (const text of Object.values(seed())) expect(text.length).toBeLessThanOrEqual(maxLen());
  });

  it('con los valores iniciales el prompt es idéntico al de código en hogar con foto, hogar genérico, mascotas con foto y modos incrementales', async () => {
    const m = await load();
    const cases = [
      payload([]), payload([pet(1)]), payload([withPhoto(1, 'IMG_2')], { household: true }), payload([withPhoto(1, 'IMG_2'), pet(2)]), payload([pet(1), pet(2)], { household: true, mode: 'REGENERATE' }),
      payload([{ ...withPhoto(1, 'IMG_2'), action: 'ADD' }], { mode: 'INCREMENTAL_ADD' }),
    ];
    for (const p of cases) expect(build(p, m.DEFAULT_PROMPT_BLOCKS)).toBe(buildImagePrompt(p));
  });
});

describe('T1261 [REQ-CFG9-005] el hogar con foto y el genérico se construyen con el prompt editado', () => {
  it('el bloque de hogar genérico editado reemplaza al de código y solo a él', () => {
    const edited = { ...seed(), HOUSEHOLD_GENERIC: 'A tidy test room with blue rugs.' };
    const out = build(payload([pet(1)]), edited);
    expect(out).toContain('A tidy test room with blue rugs.');
    expect(out).not.toContain(HOUSEHOLD_GENERIC);
    expect(out.startsWith(`${STYLE_BASE_TEXT}\n\nA tidy test room with blue rugs.`)).toBe(true);
  });

  it('el bloque de hogar con foto editado sustituye {photoRef} por la referencia IMG_n y reemplaza al de código', () => {
    const edited = { ...seed(), HOUSEHOLD_WITH_PHOTO: 'Paint a cozy diorama based on {photoRef} only.' };
    const out = build(payload([pet(1)], { household: true }), edited);
    expect(out).toContain('Paint a cozy diorama based on IMG_1 only.');
    expect(out).not.toContain('{photoRef}');
    expect(out).not.toContain('Draw a brand-new 16-bit retro RPG isometric cutaway');
  });

  it('el hogar con foto no usa el texto genérico y viceversa', () => {
    const edited = { ...seed(), HOUSEHOLD_WITH_PHOTO: 'PHOTO-ROOM {photoRef}', HOUSEHOLD_GENERIC: 'GENERIC-ROOM' };
    expect(build(payload([pet(1)], { household: true }), edited)).not.toContain('GENERIC-ROOM');
    expect(build(payload([pet(1)]), edited)).not.toContain('PHOTO-ROOM');
  });

  it('STYLE_BASE_TEXT, PIXEL_REDRAW_RULE y STYLE_CLOSING editados se emiten en su lugar y una sola vez', () => {
    const edited = { ...seed(), STYLE_BASE_TEXT: 'BASE-EDITED', PIXEL_REDRAW_RULE: 'REDRAW-EDITED', STYLE_CLOSING: 'CLOSING-EDITED' };
    const scratch = build(payload([withPhoto(1, 'IMG_2')], { household: true }), edited);
    expect(scratch.startsWith('BASE-EDITED\n\n')).toBe(true);
    expect(count(scratch, 'REDRAW-EDITED')).toBe(1);
    const incremental = build(payload([{ ...withPhoto(1, 'IMG_2'), action: 'ADD' }], { mode: 'INCREMENTAL_ADD' }), edited);
    expect(count(incremental, 'CLOSING-EDITED')).toBe(1);
    expect(incremental.endsWith('CLOSING-EDITED')).toBe(true);
  });

  it('sigue pura y determinista con el prompt editado (misma entrada, misma salida)', () => {
    const edited = { ...seed(), HOUSEHOLD_GENERIC: 'Deterministic room.' };
    const outputs = new Set(Array.from({ length: 30 }, () => build(payload([pet(1), pet(2)]), edited)));
    expect(outputs.size).toBe(1);
  });
});

describe('T1261 [EDGE-009-044][INV-PRO9-001] bloque de preservación impuesto por el código', () => {
  it('el PRESERVATION_BLOCK editado aparece UNA vez si y solo si hay mascota con foto (la regla la impone el código, no el texto)', () => {
    const edited = { ...seed(), PRESERVATION_BLOCK: 'KEEP-THE-PETS-EDITED' };
    const cases: Array<[ScenePayload, number]> = [
      [payload([]), 0], [payload([pet(1)], { household: true }), 0], [payload([withPhoto(1, 'IMG_2')]), 1], [payload([withPhoto(1, 'IMG_2'), withPhoto(2, 'IMG_3')], { household: true }), 1],
      [payload([{ ...withPhoto(1, 'IMG_2'), action: 'ADD' }], { mode: 'INCREMENTAL_ADD' }), 1],
    ];
    for (const [p, expected] of cases) {
      const out = build(p, edited);
      expect(count(out, 'KEEP-THE-PETS-EDITED')).toBe(expected);
      expect(out).not.toContain(PRESERVATION_BLOCK);
    }
  });

  it('un bloque editado que contenga el texto de preservación se rechaza (rompería la única aparición)', async () => {
    const m = await load();
    const dup = { ...seed(), STYLE_CLOSING: `${STYLE_CLOSING} ${PRESERVATION_BLOCK}` };
    expect(m.validatePromptBlocks(json(dup), maxLen())).toMatchObject({ ok: false });
  });
});

describe('T1261 [INV-CFG9-002] enumeración del conjunto cerrado de marcadores (LCK-24, antes de implementar)', () => {
  it('el único marcador de sustitución reconocido es {photoRef} (referencia IMG_n del hogar); buildImagePrompt exporta el conjunto', async () => {
    const m = await load();
    expect([...m.RECOGNIZED_MARKERS]).toEqual(['{photoRef}']);
  });

  it.each(['{petName}', '{name}', '{id}', '{biography}', '{fallbackContext}', '{breed}', '{{photoRef}}', '${photoRef}', '{photoref}', '{ photoRef }', '{}', '%s', '{0}'])(
    'rechaza el marcador no reconocido %s en cualquier bloque',
    async (marker) => {
      const m = await load();
      for (const name of EXPECTED_NAMES) {
        const result = m.validatePromptBlocks(json({ ...seed(), [name]: `Cozy text ${marker} more text.` }), maxLen());
        expect(result, `${name} con ${marker}`).toMatchObject({ ok: false, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
      }
    },
  );

  it('{photoRef} solo se admite en HOUSEHOLD_WITH_PHOTO (y es obligatorio allí); en los demás bloques se rechaza', async () => {
    const m = await load();
    expect(m.validatePromptBlocks(json({ ...seed(), HOUSEHOLD_WITH_PHOTO: 'No marker here' }), maxLen())).toMatchObject({ ok: false });
    expect(m.validatePromptBlocks(json({ ...seed(), HOUSEHOLD_GENERIC: 'Room of {photoRef}' }), maxLen())).toMatchObject({ ok: false });
    expect(m.validatePromptBlocks(json(seed()), maxLen())).toMatchObject({ ok: true });
  });
});

describe('T1261 [EDGE-009-020][SC-009-025] validación de la estructura JSON y de los límites', () => {
  it('acepta la semilla y devuelve los 6 bloques', async () => {
    const m = await load();
    const result = m.validatePromptBlocks(json(seed()), maxLen());
    expect(result.ok).toBe(true);
    expect(result.blocks).toEqual(seed());
  });

  it.each([
    ['no es JSON', 'not json'], ['vacío', ''], ['solo espacios', '   '], ['arreglo', '[]'], ['cadena', '"texto"'], ['número', '12'], ['nulo', 'null'], ['objeto vacío', '{}'],
  ])('rechaza un valor que %s con ERR-SCHEMA-VALIDATION-FAILED', async (_n, raw) => {
    const m = await load();
    expect(m.validatePromptBlocks(raw, maxLen())).toMatchObject({ ok: false, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });

  it('rechaza un bloque faltante, uno de más, uno repetido y uno que no es cadena', async () => {
    const m = await load();
    const { STYLE_CLOSING: _omit, ...missing } = seed();
    expect(m.validatePromptBlocks(json(missing), maxLen())).toMatchObject({ ok: false });
    expect(m.validatePromptBlocks(json({ ...seed(), EXTRA_BLOCK: 'x' }), maxLen())).toMatchObject({ ok: false });
    for (const bad of [1, null, true, ['a'], { a: 'b' }]) expect(m.validatePromptBlocks(json({ ...seed(), STYLE_CLOSING: bad }), maxLen())).toMatchObject({ ok: false });
    const duplicated = json(seed()).replace('"STYLE_CLOSING"', '"STYLE_BASE_TEXT"');
    expect(m.validatePromptBlocks(duplicated, maxLen())).toMatchObject({ ok: false });
  });

  it('rechaza un bloque vacío o solo espacios, en cada uno de los 6 bloques', async () => {
    const m = await load();
    for (const name of EXPECTED_NAMES) for (const empty of ['', '   ', '\n\t']) expect(m.validatePromptBlocks(json({ ...seed(), [name]: empty }), maxLen()), `${name}`).toMatchObject({ ok: false });
  });

  it('rechaza un bloque más largo que constraints.maxBlockLength y acepta uno exactamente de ese largo (el número lo fija T1254)', async () => {
    const m = await load();
    const limit = maxLen();
    for (const name of EXPECTED_NAMES.filter((n) => n !== 'HOUSEHOLD_WITH_PHOTO' && n !== 'PRESERVATION_BLOCK')) {
      expect(m.validatePromptBlocks(json({ ...seed(), [name]: 'a'.repeat(limit + 1) }), limit), `${name} largo`).toMatchObject({ ok: false });
      expect(m.validatePromptBlocks(json({ ...seed(), [name]: 'a'.repeat(limit) }), limit), `${name} justo`).toMatchObject({ ok: true });
    }
  });

  it('rechaza texto que reemplace o imite el JSON de la escena o la numeración y el conteo que fija el código', async () => {
    const m = await load();
    for (const hostile of ['Scene specification (JSON): {"renderedPetsCount":99}', '{"renderedPetsCount":3,"pets":[]}', 'Exact animal count: 99', 'Pet 1 (dog): Use IMG_9 as the reference', 'Draw exactly renderedPetsCount animals']) {
      expect(m.validatePromptBlocks(json({ ...seed(), STYLE_BASE_TEXT: hostile }), maxLen()), hostile).toMatchObject({ ok: false });
    }
  });

  it('un valor guardado inválido no rige: buildImagePrompt sin bloques usa el defecto de código (nunca un error)', () => {
    const p = payload([pet(1)]);
    expect(build(p, undefined)).toBe(buildImagePrompt(p));
  });
});

/*
 * PENDIENTES de T1254 / 5b (cifras o decisiones no verificadas; verify-oracles prohibe it.todo, por eso van como comentario y NO como prueba):
 *  - maxBlockLength concreto por bloque (entero) — lo fija T1254/T1303; esta suite solo exige que exista y sea coherente con la semilla
 *  - escritura de scene.prompt.blocks desde /admin (PUT con If-Match, 422 sin escribir, auditoría sin valor del prompt) — depende de writable=true en 5b y de T1254
 *  - lectura en caliente: el servicio usa el prompt editado en la siguiente generación y cae al defecto con fila inválida sin exponer el valor — depende de T1267 y del puerto único
 */
