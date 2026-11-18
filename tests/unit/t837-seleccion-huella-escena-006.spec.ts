import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/domain/audit/sha256.ts';
import {
  EMPTY_INPUTS_SNAPSHOT,
  buildInputsSnapshot,
  computeFingerprint,
  countPendingChanges,
  hasInputs,
  parseInputsSnapshot,
  serializeInputsSnapshot,
  type SnapshotPet,
} from '../../src/domain/scene/inputs-snapshot.ts';
import { selectVisiblePets } from '../../src/domain/scene/select-visible-pets.ts';

/**
 * T837 (006, Fase 5): selección determinista de mascotas visibles (REQ-ESC6-008, D6-11) y huella de las entradas (REQ-ESC6-004). Funciones puras de dominio:
 * INV-ESC6-001, INV-ESC6-008; EDGE-ESC6-001, EDGE-ESC6-002, EDGE-ESC6-012; SC-ESC6-003, SC-ESC6-005, SC-ESC6-006, SC-ESC6-007, SC-ESC6-031, SC-ESC6-060.
 */
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const assigned = (n: number, at: string) => ({ id: id(n), assignedAt: at });
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

describe('selectVisiblePets (T837): orden total y tope N', () => {
  it('[SC-ESC6-006][INV-ESC6-008] con 11 mascotas y N = 8 devuelve exactamente 8 por antigüedad ascendente, total 11', () => {
    const pets = Array.from({ length: 11 }, (_, i) => assigned(i + 1, `2026-01-${String(20 - i).padStart(2, '0')}T00:00:00.000Z`));
    const { visible, total } = selectVisiblePets(pets, 8);
    expect(total).toBe(11);
    expect(visible.map((p) => p.id)).toEqual([11, 10, 9, 8, 7, 6, 5, 4].map(id));
  });

  it('[INV-ESC6-008] el desempate con la misma antigüedad es el id ascendente y repetir el cálculo da el mismo conjunto', () => {
    const at = '2026-02-01T00:00:00.000Z';
    const pets = [assigned(3, at), assigned(1, at), assigned(2, at)];
    const first = selectVisiblePets(pets, 2).visible.map((p) => p.id);
    expect(first).toEqual([id(1), id(2)]);
    expect(selectVisiblePets([...pets].reverse(), 2).visible.map((p) => p.id)).toEqual(first);
  });

  it('[SC-ESC6-007] al eliminar una mostrada entra la siguiente; al eliminar una no mostrada el conjunto visible no cambia', () => {
    const pets = Array.from({ length: 9 }, (_, i) => assigned(i + 1, `2026-03-0${i + 1}T00:00:00.000Z`));
    const base = selectVisiblePets(pets, 8).visible.map((p) => p.id);
    expect(base).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(id));
    expect(selectVisiblePets(pets.filter((p) => p.id !== id(2)), 8).visible.map((p) => p.id)).toEqual([1, 3, 4, 5, 6, 7, 8, 9].map(id));
    expect(selectVisiblePets(pets.filter((p) => p.id !== id(9)), 8).visible.map((p) => p.id)).toEqual(base);
  });

  it('[SC-ESC6-005] con menos mascotas que N devuelve todas; con cero devuelve vacío y total 0; no muta la entrada', () => {
    const pets = [assigned(2, '2026-01-02T00:00:00.000Z'), assigned(1, '2026-01-01T00:00:00.000Z')];
    const copy = JSON.stringify(pets);
    expect(selectVisiblePets(pets, 8)).toEqual({ visible: [pets[1], pets[0]], total: 2 });
    expect(JSON.stringify(pets)).toBe(copy);
    expect(selectVisiblePets([], 8)).toEqual({ visible: [], total: 0 });
  });

  it('[SC-ESC6-060] un N menor que 1 o no entero es un error de programación (RangeError)', () => {
    expect(() => selectVisiblePets([], 0)).toThrow(RangeError);
    expect(() => selectVisiblePets([], 1.5)).toThrow(RangeError);
  });
});

describe('inputs-snapshot (T837): JSON canónico y huella SHA-256', () => {
  it('[INV-ESC6-001] el snapshot serializa con claves ordenadas, sin espacios y con v = 1; la huella es el SHA-256 de esa cadena', () => {
    const snapshot = buildInputsSnapshot({ householdPhoto: 'h-1', pets: [pet(1, 'p-1')] });
    const text = serializeInputsSnapshot(snapshot);
    expect(text).toBe(
      `{"household":"h-1","pets":[{"breed":"Criollo","breedCode":"DOG_CRIOLLA","id":"${id(1)}","photo":"p-1","sex":"FEMALE","species":"CANINE","speciesOther":null}],"v":1}`,
    );
    expect(computeFingerprint(snapshot)).toBe(sha256Hex(text));
    expect(computeFingerprint(snapshot)).toHaveLength(64);
  });

  it('[INV-ESC6-001] misma entrada, mismos bytes e igual huella; el orden de las claves de entrada no importa', () => {
    const a = buildInputsSnapshot({ householdPhoto: null, pets: [pet(1), pet(2, 'x')] });
    const b = buildInputsSnapshot({ pets: [pet(1), pet(2, 'x')], householdPhoto: null });
    expect(serializeInputsSnapshot(a)).toBe(serializeInputsSnapshot(b));
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('[INV-ESC6-010] el snapshot no contiene nombres, microchip, fechas ni datos clínicos aunque la entrada los traiga', () => {
    const dirty = { ...pet(1), name: 'Firulais', microchipId: '123456789012345', birthDate: '2020-01-01' } as unknown as SnapshotPet;
    const text = serializeInputsSnapshot(buildInputsSnapshot({ householdPhoto: null, pets: [dirty] }));
    expect([text.includes('Firulais'), text.includes('microchip'), text.includes('2020')]).toEqual([false, false, false]);
  });

  it('[EDGE-ESC6-001][SC-ESC6-031] agregar una mascota y eliminarla deja la huella igual a la de la última generación', () => {
    const last = buildInputsSnapshot({ householdPhoto: null, pets: [pet(1)] });
    const withExtra = buildInputsSnapshot({ householdPhoto: null, pets: [pet(1), pet(2)] });
    const back = buildInputsSnapshot({ householdPhoto: null, pets: [pet(1)] });
    expect(computeFingerprint(withExtra)).not.toBe(computeFingerprint(last));
    expect(computeFingerprint(back)).toBe(computeFingerprint(last));
    expect(countPendingChanges(last, back)).toBe(0);
  });

  it('[EDGE-ESC6-002] una mascota fuera del tope no entra al snapshot: agregarla o eliminarla no cambia la huella', () => {
    const visible = selectVisiblePets(Array.from({ length: 9 }, (_, i) => assigned(i + 1, `2026-03-0${i + 1}T00:00:00.000Z`)), 8).visible;
    const without = selectVisiblePets(Array.from({ length: 8 }, (_, i) => assigned(i + 1, `2026-03-0${i + 1}T00:00:00.000Z`)), 8).visible;
    const snap = (list: ReadonlyArray<{ id: string }>) => buildInputsSnapshot({ householdPhoto: null, pets: list.map((p) => ({ ...pet(1), id: p.id })) });
    expect(computeFingerprint(snap(visible))).toBe(computeFingerprint(snap(without)));
  });

  it('[REQ-ESC6-004] la huella vacía es la del snapshot sin foto ni mascotas y hasInputs distingue lo vacío de lo no vacío', () => {
    expect(hasInputs(EMPTY_INPUTS_SNAPSHOT)).toBe(false);
    expect(hasInputs(buildInputsSnapshot({ householdPhoto: 'h', pets: [] }))).toBe(true);
    expect(hasInputs(buildInputsSnapshot({ householdPhoto: null, pets: [pet(1)] }))).toBe(true);
    expect(computeFingerprint(EMPTY_INPUTS_SNAPSHOT)).toBe(sha256Hex('{"household":null,"pets":[],"v":1}'));
  });

  it('[REQ-ESC6-004] parseInputsSnapshot recupera lo serializado y devuelve null ante texto inválido o de otra versión', () => {
    const snapshot = buildInputsSnapshot({ householdPhoto: 'h', pets: [pet(1, 'p')] });
    expect(parseInputsSnapshot(serializeInputsSnapshot(snapshot))).toEqual(snapshot);
    expect([parseInputsSnapshot('no es json'), parseInputsSnapshot('{"v":2,"household":null,"pets":[]}'), parseInputsSnapshot('[]')]).toEqual([null, null, null]);
  });
});

describe('countPendingChanges (T837): cambios por entidad (REQ-ESC6-004)', () => {
  const base = buildInputsSnapshot({ householdPhoto: 'h-1', pets: [pet(1, 'a'), pet(2)] });

  it('[SC-ESC6-003] sin diferencias son 0; con última generación nula y entradas, cada entidad cuenta 1', () => {
    expect(countPendingChanges(base, base)).toBe(0);
    expect(countPendingChanges(null, base)).toBe(3);
    expect(countPendingChanges(null, EMPTY_INPUTS_SNAPSHOT)).toBe(0);
  });

  it('[REQ-ESC6-004] una mascota agregada, una eliminada y una con foto cambiada cuentan 1 cada una; la foto del hogar cuenta 1', () => {
    const now = buildInputsSnapshot({ householdPhoto: 'h-2', pets: [pet(1, 'b'), pet(3)] });
    expect(countPendingChanges(base, now)).toBe(4);
  });

  it('[EDGE-ESC6-012][SC-ESC6-011] cambiar la foto de una mascota dos veces antes de actualizar cuenta 1 (se compara solo el estado final)', () => {
    const second = buildInputsSnapshot({ householdPhoto: 'h-1', pets: [pet(1, 'c'), pet(2)] });
    expect(countPendingChanges(base, second)).toBe(1);
    const reverted = buildInputsSnapshot({ householdPhoto: 'h-1', pets: [pet(1, 'a'), pet(2)] });
    expect(countPendingChanges(base, reverted)).toBe(0);
  });
});
