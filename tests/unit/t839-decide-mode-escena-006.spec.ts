import { describe, expect, it } from 'vitest';
import { buildInputsSnapshot, computeFingerprint, serializeInputsSnapshot, type InputsSnapshot, type SnapshotPet } from '../../src/domain/scene/inputs-snapshot.ts';
import { decideMode } from '../../src/domain/scene/decide-mode.ts';

/**
 * T839 (006, Fase 5): `decide-mode` y asignación de ranuras `IMG_n` (REQ-ESC6-006, REQ-ESC6-007, REQ-ESC6-009, REQ-ESC6-010; INV-ESC6-001; EDGE-ESC6-008,
 * EDGE-ESC6-010; SC-ESC6-001, SC-ESC6-002, SC-ESC6-004, SC-ESC6-008..SC-ESC6-013, SC-ESC6-021, SC-ESC6-056). Precedencia: REGENERATE > sin imagen vigente >
 * cambio de la foto del hogar > incrementales (más de un tipo = INCREMENTAL_MIXED, D6-08 = A).
 */
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pet = (n: number, photo: string | null = null, extra: Partial<SnapshotPet> = {}): SnapshotPet => ({
  id: id(n),
  species: 'CANINE',
  speciesOther: null,
  breed: 'Criollo',
  breedCode: 'DOG_CRIOLLA',
  sex: 'FEMALE',
  photo,
  ...extra,
});
const snap = (household: string | null, ...pets: SnapshotPet[]): InputsSnapshot => buildInputsSnapshot({ householdPhoto: household, pets });
const actions = (plan: { pets: ReadonlyArray<{ petId: string; action: string }> }): string[] => plan.pets.map((p) => `${p.petId.slice(-1)}:${p.action}`);

describe('decideMode (T839): FROM_SCRATCH y REGENERATE', () => {
  it('[SC-ESC6-001] sin imagen vigente y sin foto: FROM_SCRATCH, mascota RENDER sin referencia, sin ranuras de foto', () => {
    const plan = decideMode({ last: null, now: snap(null, pet(1)), hasImage: false, action: 'UPDATE' });
    expect(plan).toMatchObject({ mode: 'FROM_SCRATCH', currentSceneRef: null, householdRef: null });
    expect(plan?.pets).toEqual([{ petId: id(1), action: 'RENDER', ref: null }]);
  });

  it('[SC-ESC6-002] sin imagen, con foto de mascota: la mascota lleva la ranura IMG_1 y la ranura vale 1', () => {
    const plan = decideMode({ last: null, now: snap(null, pet(1, 'a')), hasImage: false, action: 'UPDATE' });
    expect(plan?.pets).toEqual([{ petId: id(1), action: 'RENDER', ref: 'IMG_1' }]);
    expect(plan?.slotCount).toBe(1);
  });

  it('[SC-ESC6-004] con foto del hogar: IMG_1 es la foto del hogar y las mascotas con foto siguen en orden de selección', () => {
    const plan = decideMode({ last: null, now: snap('h', pet(1, 'a'), pet(2), pet(3, 'c')), hasImage: false, action: 'UPDATE' });
    expect(plan?.householdRef).toBe('IMG_1');
    expect(plan?.pets.map((p) => p.ref)).toEqual(['IMG_2', null, 'IMG_3']);
    expect(plan?.slotCount).toBe(3);
  });

  it('[SC-ESC6-013] el cambio de la foto del hogar (alta, reemplazo o borrado) con imagen vigente fuerza FROM_SCRATCH con todas las mascotas RENDER', () => {
    const last = snap('h1', pet(1, 'a'), pet(2));
    for (const household of ['h2', null]) {
      const plan = decideMode({ last, now: snap(household, pet(1, 'a'), pet(2)), hasImage: true, action: 'UPDATE' });
      expect(plan?.mode).toBe('FROM_SCRATCH');
      expect(actions(plan!)).toEqual(['1:RENDER', '2:RENDER']);
      expect(plan?.currentSceneRef).toBeNull();
    }
    expect(decideMode({ last: snap(null, pet(1)), now: snap('h', pet(1)), hasImage: true, action: 'UPDATE' })?.mode).toBe('FROM_SCRATCH');
  });

  it('[SC-ESC6-107][REQ-ESC6-006] foto del hogar nueva, reemplazada o borrada con las mismas mascotas e imagen vigente: FROM_SCRATCH, sin escena previa, IMG_1 si hay foto, todas RENDER, y el inputs-snapshot cambia', () => {
    const last = snap('h1', pet(1, 'a'), pet(2));
    const cases: Array<{ household: string | null; ref: string | null }> = [
      { household: 'h2', ref: 'IMG_1' },
      { household: null, ref: null },
    ];
    for (const { household, ref } of cases) {
      const now = snap(household, pet(1, 'a'), pet(2));
      expect(computeFingerprint(now)).not.toBe(computeFingerprint(last));
      expect(serializeInputsSnapshot(now)).not.toBe(serializeInputsSnapshot(last));
      const plan = decideMode({ last, now, hasImage: true, action: 'UPDATE' });
      expect(plan).toMatchObject({ mode: 'FROM_SCRATCH', currentSceneRef: null, householdRef: ref });
      expect(actions(plan!)).toEqual(['1:RENDER', '2:RENDER']);
    }
    const added = decideMode({ last: snap(null, pet(1), pet(2)), now: snap('nueva', pet(1), pet(2)), hasImage: true, action: 'UPDATE' });
    expect(added).toMatchObject({ mode: 'FROM_SCRATCH', currentSceneRef: null, householdRef: 'IMG_1' });
    expect(actions(added!)).toEqual(['1:RENDER', '2:RENDER']);
  });

  it('[SC-ESC6-021][REQ-ESC6-007] REGENERATE gana a todo: sin escena previa, todas RENDER con sus referencias, incluso sin cambios pendientes', () => {
    const same = snap('h', pet(1, 'a'), pet(2, 'b'));
    const plan = decideMode({ last: same, now: same, hasImage: true, action: 'REGENERATE' });
    expect(plan).toMatchObject({ mode: 'REGENERATE', currentSceneRef: null, householdRef: 'IMG_1' });
    expect(plan?.pets).toEqual([
      { petId: id(1), action: 'RENDER', ref: 'IMG_2' },
      { petId: id(2), action: 'RENDER', ref: 'IMG_3' },
    ]);
  });

  it('[REQ-ESC6-006] REGENERATE gana también cuando no hay imagen vigente', () => {
    expect(decideMode({ last: null, now: snap(null, pet(1)), hasImage: false, action: 'REGENERATE' })?.mode).toBe('REGENERATE');
  });

  it('[SC-ESC6-010][EDGE-ESC6-010] hogar sin mascotas ni foto y sin imagen: FROM_SCRATCH con pets vacío y sin error', () => {
    const plan = decideMode({ last: null, now: snap(null), hasImage: false, action: 'UPDATE' });
    expect(plan).toMatchObject({ mode: 'FROM_SCRATCH', pets: [], slotCount: 0 });
  });
});

describe('decideMode (T839): modos incrementales', () => {
  const last = snap(null, pet(1, 'a'), pet(2), pet(3, 'c'));

  it('[SC-ESC6-008] ADD: la escena previa es IMG_1, las anteriores KEEP sin referencia y la nueva ADD con la suya', () => {
    const plan = decideMode({ last: snap(null, pet(1), pet(2)), now: snap(null, pet(1), pet(2), pet(3, 'c')), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_ADD');
    expect(plan?.currentSceneRef).toBe('IMG_1');
    expect(plan?.pets).toEqual([
      { petId: id(1), action: 'KEEP', ref: null },
      { petId: id(2), action: 'KEEP', ref: null },
      { petId: id(3), action: 'ADD', ref: 'IMG_2' },
    ]);
  });

  it('[SC-ESC6-009] REMOVE: la retirada va con acción REMOVE al final y las otras KEEP', () => {
    const plan = decideMode({ last, now: snap(null, pet(1, 'a'), pet(3, 'c')), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_REMOVE');
    expect(actions(plan!)).toEqual(['1:KEEP', '3:KEEP', '2:REMOVE']);
    expect(plan?.slotCount).toBe(1);
  });

  it('[SC-ESC6-010][EDGE-ESC6-010] eliminar la única mascota con imagen vigente es INCREMENTAL_REMOVE (nunca error)', () => {
    const plan = decideMode({ last: snap(null, pet(1)), now: snap(null), hasImage: true, action: 'UPDATE' });
    expect(plan).toMatchObject({ mode: 'INCREMENTAL_REMOVE', counts: { added: 0, removed: 1, replaced: 0, household: 0, total: 1 } });
  });

  it('[SC-ESC6-011] REPLACE: foto agregada a una mascota sin foto lleva REPLACE con su ranura y las demás KEEP', () => {
    const plan = decideMode({ last: snap(null, pet(1), pet(2)), now: snap(null, pet(1, 'x'), pet(2)), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_REPLACE');
    expect(plan?.pets).toEqual([
      { petId: id(1), action: 'REPLACE', ref: 'IMG_2' },
      { petId: id(2), action: 'KEEP', ref: null },
    ]);
  });

  it('[SC-ESC6-012] REPLACE: quitar la foto deja REPLACE sin ranura (el bloque usa species, breed y sex)', () => {
    const plan = decideMode({ last: snap(null, pet(1, 'a')), now: snap(null, pet(1)), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_REPLACE');
    expect(plan?.pets).toEqual([{ petId: id(1), action: 'REPLACE', ref: null }]);
    expect(plan?.slotCount).toBe(1);
  });

  it('[SC-ESC6-056][EDGE-ESC6-008] agregar, eliminar y reemplazar a la vez: INCREMENTAL_MIXED con ADD, REMOVE, REPLACE y KEEP y una sola decisión', () => {
    const base = snap(null, pet(1), pet(2), pet(3));
    const plan = decideMode({ last: base, now: snap(null, pet(1), pet(3, 'z'), pet(4)), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_MIXED');
    expect(actions(plan!)).toEqual(['1:KEEP', '3:REPLACE', '4:ADD', '2:REMOVE']);
    expect(plan?.counts).toEqual({ household: 0, added: 1, removed: 1, replaced: 1, total: 3 });
  });

  it('[SC-ESC6-056] si además cambió la foto del hogar el modo es FROM_SCRATCH (precedencia sobre lo incremental)', () => {
    const plan = decideMode({ last: snap('h1', pet(1)), now: snap('h2', pet(1), pet(2)), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('FROM_SCRATCH');
    expect(plan?.counts).toEqual({ household: 1, added: 1, removed: 0, replaced: 0, total: 2 });
  });

  it('[REQ-ESC6-006] con imagen y sin cambios pendientes una actualización no tiene modo (null: el botón estaría deshabilitado)', () => {
    const same = snap(null, pet(1));
    expect(decideMode({ last: same, now: same, hasImage: true, action: 'UPDATE' })).toBeNull();
  });

  it('[REQ-ESC6-009] razas criollas y especies sin catálogo no cambian el modo; un cambio de raza o sexo de una mascota es REPLACE', () => {
    const plan = decideMode({ last: snap(null, pet(1)), now: snap(null, pet(1, null, { breed: 'Otra', breedCode: 'DOG_OTHER' })), hasImage: true, action: 'UPDATE' });
    expect(plan?.mode).toBe('INCREMENTAL_REPLACE');
  });

  it('[INV-ESC6-001] es pura: misma entrada, misma decisión, y no muta los snapshots', () => {
    const input = { last, now: snap(null, pet(1, 'a'), pet(4)), hasImage: true, action: 'UPDATE' as const };
    const before = JSON.stringify(input);
    expect(decideMode(input)).toEqual(decideMode(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});

/**
 * T927 (006, Fase 12; D6-20): las mascotas `KEEP` con foto vigente también reciben ranura `IMG_n` en los modos incrementales ADD, REPLACE y MIXED. El orden entre
 * ranuras de `ADD`/`REPLACE` y de `KEEP` lo fija `N2-16` (pendiente de Neo); estas pruebas no lo suponen y comprueban solo el conjunto de ranuras.
 * REQ-ESC6-006, REQ-ESC6-008, REQ-ESC6-016; INV-ESC6-001, INV-ESC6-010; SC-ESC6-122, SC-ESC6-127.
 */
describe('decideMode (T927): ranuras de KEEP con foto en incrementales', () => {
  const refsOf = (plan: { pets: ReadonlyArray<{ ref: string | null }> }): Array<string | null> => plan.pets.map((p) => p.ref);
  const keepRefs = (plan: { pets: ReadonlyArray<{ action: string; ref: string | null }> }): Array<string | null> => plan.pets.filter((p) => p.action === 'KEEP').map((p) => p.ref);
  const slotSet = (plan: { slotCount: number }): string[] => Array.from({ length: plan.slotCount - 1 }, (_, i) => `IMG_${i + 2}`);

  it('[SC-ESC6-122] INCREMENTAL_ADD: cada KEEP con foto lleva una ranura distinta desde IMG_2, la ADD con foto otra y slotCount = 1 + mascotas con foto', () => {
    const last = snap(null, pet(1, 'a'), pet(2, 'b'), pet(3));
    const plan = decideMode({ last, now: snap(null, pet(1, 'a'), pet(2, 'b'), pet(3), pet(4, 'd')), hasImage: true, action: 'UPDATE' })!;
    expect(plan.mode).toBe('INCREMENTAL_ADD');
    expect(plan.currentSceneRef).toBe('IMG_1');
    expect(actions(plan)).toEqual(['1:KEEP', '2:KEEP', '3:KEEP', '4:ADD']);
    expect(plan.pets.find((p) => p.petId === id(3))?.ref).toBeNull();
    expect(plan.slotCount).toBe(4);
    const refs = refsOf(plan).filter((r) => r !== null);
    expect([...refs].sort()).toEqual(slotSet(plan));
    expect(new Set(refs).size).toBe(refs.length);
    expect(keepRefs(plan).filter((r) => r !== null)).toHaveLength(2);
    expect(plan.pets.find((p) => p.petId === id(1))?.ref).toMatch(/^IMG_[2-9]$/);
    expect(plan.pets.find((p) => p.petId === id(2))?.ref).toMatch(/^IMG_[2-9]$/);
  });

  it('[SC-ESC6-122] INCREMENTAL_REPLACE: la KEEP con foto lleva ranura y la REPLACE con foto otra, sin repetir', () => {
    const plan = decideMode({ last: snap(null, pet(1, 'a'), pet(2)), now: snap(null, pet(1, 'a'), pet(2, 'x')), hasImage: true, action: 'UPDATE' })!;
    expect(plan.mode).toBe('INCREMENTAL_REPLACE');
    expect(actions(plan)).toEqual(['1:KEEP', '2:REPLACE']);
    expect(plan.slotCount).toBe(3);
    expect(refsOf(plan).filter((r) => r !== null).sort()).toEqual(['IMG_2', 'IMG_3']);
    expect(plan.pets.find((p) => p.petId === id(1))?.ref).toMatch(/^IMG_[2-9]$/);
  });

  it('[SC-ESC6-122] INCREMENTAL_MIXED: KEEP con foto con ranura; REMOVE nunca lleva ranura; slotCount cuenta solo las enviadas', () => {
    const last = snap(null, pet(1, 'a'), pet(2, 'b'), pet(3));
    const plan = decideMode({ last, now: snap(null, pet(1, 'a'), pet(3, 'z'), pet(4, 'd')), hasImage: true, action: 'UPDATE' })!;
    expect(plan.mode).toBe('INCREMENTAL_MIXED');
    expect(actions(plan)).toEqual(['1:KEEP', '3:REPLACE', '4:ADD', '2:REMOVE']);
    expect(plan.pets.find((p) => p.petId === id(2))?.ref).toBeNull();
    expect(plan.slotCount).toBe(4);
    expect(refsOf(plan).filter((r) => r !== null).sort()).toEqual(['IMG_2', 'IMG_3', 'IMG_4']);
    expect(plan.pets.find((p) => p.petId === id(1))?.ref).toMatch(/^IMG_[2-9]$/);
  });

  it('[SC-ESC6-122] una KEEP sin foto sigue con ref null y no consume ranura', () => {
    const plan = decideMode({ last: snap(null, pet(1), pet(2)), now: snap(null, pet(1), pet(2), pet(3, 'c')), hasImage: true, action: 'UPDATE' })!;
    expect(plan.pets.map((p) => p.ref)).toEqual([null, null, 'IMG_2']);
    expect(plan.slotCount).toBe(2);
  });

  it('[SC-ESC6-122] INCREMENTAL_REMOVE, FROM_SCRATCH y REGENERATE no cambian: sin ranuras para KEEP', () => {
    const last = snap(null, pet(1, 'a'), pet(2, 'b'), pet(3, 'c'));
    const remove = decideMode({ last, now: snap(null, pet(1, 'a'), pet(3, 'c')), hasImage: true, action: 'UPDATE' })!;
    expect(remove.pets).toEqual([{ petId: id(1), action: 'KEEP', ref: null }, { petId: id(3), action: 'KEEP', ref: null }, { petId: id(2), action: 'REMOVE', ref: null }]);
    expect(remove.slotCount).toBe(1);
    const scratch = decideMode({ last: null, now: snap(null, pet(1, 'a'), pet(2)), hasImage: false, action: 'UPDATE' })!;
    expect(scratch.pets).toEqual([{ petId: id(1), action: 'RENDER', ref: 'IMG_1' }, { petId: id(2), action: 'RENDER', ref: null }]);
    const regen = decideMode({ last, now: last, hasImage: true, action: 'REGENERATE' })!;
    expect(regen.pets.map((p) => [p.action, p.ref])).toEqual([['RENDER', 'IMG_1'], ['RENDER', 'IMG_2'], ['RENDER', 'IMG_3']]);
  });

  it('[SC-ESC6-127][REQ-ESC6-008] 8 mascotas con foto (7 KEEP y 1 ADD): exactamente 9 ranuras (1 + N) y ninguna más', () => {
    const base = Array.from({ length: 7 }, (_, i) => pet(i + 1, `f${i}`));
    const plan = decideMode({ last: snap(null, ...base), now: snap(null, ...base, pet(8, 'f7')), hasImage: true, action: 'UPDATE' })!;
    expect(plan.mode).toBe('INCREMENTAL_ADD');
    expect(plan.slotCount).toBe(9);
    const refs = refsOf(plan).filter((r) => r !== null);
    expect(refs).toHaveLength(8);
    expect(new Set(refs).size).toBe(8);
    expect([...refs].sort()).toEqual(slotSet(plan));
  });

  it('[INV-ESC6-001][SC-ESC6-122] pura con KEEP con foto: 100 ejecuciones idénticas y sin mutar los snapshots', () => {
    const last = snap(null, pet(1, 'a'), pet(2));
    const now = snap(null, pet(1, 'a'), pet(2), pet(3, 'c'));
    const before = JSON.stringify([last, now]);
    const first = JSON.stringify(decideMode({ last, now, hasImage: true, action: 'UPDATE' }));
    for (let i = 0; i < 100; i += 1) expect(JSON.stringify(decideMode({ last, now, hasImage: true, action: 'UPDATE' }))).toBe(first);
    expect(JSON.stringify([last, now])).toBe(before);
  });
});
