/**
 * T811 (N2-06 (b), 006): dominio de claves de INV-ARC-003 ampliado con `scenes/{sceneId}/images/{objectId}` y
 * `households/{householdId}/photo/{objectId}` (REQ-ESC6-018, REQ-ESC6-029; INV-ESC6-009; EDGE-ESC6-021; SC-ESC6-028, SC-ESC6-044, SC-ESC6-052).
 * Las tres formas de 004 (`pets/.../(files|photos|avatar)/...`) no cambian; no se amplía la lista de conciliación con una segunda rutina.
 */
import { describe, expect, it } from 'vitest';
import * as mediaDomain from '../../src/domain/media/index.ts';
import { assertListPrefix, assertMediaKey } from '../../src/infrastructure/adapters/media-storage-guards.ts';

/** Vista tipada de la API nueva de `media-keys.ts` (T812): las pruebas rojas compilan antes de que exista. */
const { RECONCILED_PREFIXES, aboutPhotoObjectKey, householdPhotoObjectKey, isMediaObjectKey, mediaObjectKey, reconciliationAgeMinutes, sceneImageObjectKey } = mediaDomain as unknown as {
  RECONCILED_PREFIXES: readonly string[];
  aboutPhotoObjectKey(objectId: string): string;
  householdPhotoObjectKey(householdId: string, objectId: string): string;
  isMediaObjectKey(key: string): boolean;
  mediaObjectKey(petId: string, kind: 'FILE' | 'PHOTO', mediaId: string): string;
  reconciliationAgeMinutes(key: string): number;
  sceneImageObjectKey(sceneId: string, objectId: string): string;
};

const SCENE = '3f1c0a52-7d3e-4b8a-9a61-0c2f4d5e6a71';
const HOUSE = '8b2d9c10-5e47-4f3a-a1b6-7c9d0e1f2a34';
const OBJ = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('T811 claves de objeto de la escena (INV-ARC-003, INV-ESC6-009)', () => {
  it('SC-ESC6-052: la imagen de la escena y la foto del hogar se derivan solo de UUID v4 y una carpeta fija, sin extensión ni texto del usuario', () => {
    expect(sceneImageObjectKey(SCENE, OBJ)).toBe(`scenes/${SCENE}/images/${OBJ}`);
    expect(householdPhotoObjectKey(HOUSE, OBJ)).toBe(`households/${HOUSE}/photo/${OBJ}`);
  });

  it('INV-ESC6-009: un identificador que no es UUID v4 en minúsculas lanza RangeError sin repetir el valor', () => {
    for (const bad of ['', 'x', SCENE.toUpperCase(), `${SCENE}/..`, '../etc', '3f1c0a52-7d3e-1b8a-9a61-0c2f4d5e6a71', `${SCENE}.png`]) {
      for (const make of [() => sceneImageObjectKey(bad, OBJ), () => sceneImageObjectKey(SCENE, bad), () => householdPhotoObjectKey(bad, OBJ), () => householdPhotoObjectKey(HOUSE, bad)]) {
        expect(make).toThrow(RangeError);
        expect(make).toThrow(/^(?!.*\.\.).*$/);
      }
    }
  });

  it('INV-ARC-003: isMediaObjectKey admite las 5 formas y rechaza mezclas de carpeta, extra segmentos, mayúsculas y recorridos', () => {
    const valid = [
      mediaObjectKey(SCENE, 'FILE', OBJ), mediaObjectKey(SCENE, 'PHOTO', OBJ), `pets/${SCENE}/avatar/${OBJ}`,
      sceneImageObjectKey(SCENE, OBJ), householdPhotoObjectKey(HOUSE, OBJ),
    ];
    for (const key of valid) expect(isMediaObjectKey(key), key).toBe(true);
    const invalid = [
      `scenes/${SCENE}/photo/${OBJ}`, `scenes/${SCENE}/files/${OBJ}`, `scenes/${SCENE}/avatar/${OBJ}`, `households/${HOUSE}/images/${OBJ}`,
      `households/${HOUSE}/files/${OBJ}`, `pets/${SCENE}/images/${OBJ}`, `pets/${SCENE}/photo/${OBJ}`, `scenes/${SCENE}/images/${OBJ}/x`, `scenes/${SCENE}/images/${OBJ}.png`,
      `scenes/${SCENE.toUpperCase()}/images/${OBJ}`, `scenes/../images/${OBJ}`, `scenes//images/${OBJ}`, `/scenes/${SCENE}/images/${OBJ}`, `scenes/${SCENE}/images/`,
      `scenes/${SCENE}/images/../${OBJ}`, `other/${SCENE}/images/${OBJ}`,
    ];
    for (const key of invalid) expect(isMediaObjectKey(key), key).toBe(false);
  });

  it('INV-ARC-003: assertMediaKey acepta las claves de la escena y rechaza las demás con RangeError', () => {
    expect(assertMediaKey(sceneImageObjectKey(SCENE, OBJ))).toBeUndefined();
    expect(assertMediaKey(householdPhotoObjectKey(HOUSE, OBJ))).toBeUndefined();
    expect(() => assertMediaKey(`scenes/${SCENE}/other/${OBJ}`)).toThrow(RangeError);
  });
});

describe('T811 assertListPrefix con scenes/ y households/ (sin RangeError)', () => {
  it('REQ-ESC6-029: acepta los prefijos de listado de la conciliación y del borrado en cascada', () => {
    for (const prefix of ['pets/', 'scenes/', 'households/', `scenes/${SCENE}/`, `scenes/${SCENE}/images/`, `households/${HOUSE}/`, `households/${HOUSE}/photo/`, `scenes/${SCENE}/images/${OBJ.slice(0, 8)}`]) {
      expect(assertListPrefix(prefix), prefix).toBeUndefined();
    }
  });

  it('INV-ARC-003: rechaza el prefijo vacío, la raíz, carpetas ajenas, mayúsculas y recorridos', () => {
    for (const prefix of ['', '/', 'scenes', 'households', 'scenes/..', 'scenes/../', `scenes/${SCENE}/files/`, `scenes/${SCENE}/photo/`, `households/${HOUSE}/images/`, 'Scenes/', 'scenes/%2e/', 'otros/', 'scenes//']) {
      expect(() => assertListPrefix(prefix), prefix).toThrow(RangeError);
    }
  });
});

describe('T811 conciliación: prefijos y antigüedad (H-LCK-006-11, EDGE-ESC6-021)', () => {
  it('REQ-ESC6-029: la rutina existente concilia pets/ (24 h) y añade scenes/ y households/ (15 min); no hay una segunda rutina', () => {
    // T1430 (H-ARCH-ACE-KEY): la 010 añade `about/` a la MISMA rutina; las demás reglas no cambian.
    expect(RECONCILED_PREFIXES).toEqual(['pets/', 'scenes/', 'households/', 'about/']);
    expect(reconciliationAgeMinutes(mediaObjectKey(SCENE, 'FILE', OBJ))).toBe(24 * 60);
    expect(reconciliationAgeMinutes(`pets/${SCENE}/avatar/${OBJ}`)).toBe(24 * 60);
    expect(reconciliationAgeMinutes(sceneImageObjectKey(SCENE, OBJ))).toBe(15);
    expect(reconciliationAgeMinutes(householdPhotoObjectKey(HOUSE, OBJ))).toBe(15);
    expect(reconciliationAgeMinutes(aboutPhotoObjectKey(OBJ))).toBe(15);
  });

  it('INV-ARC-003: reconciliationAgeMinutes rechaza una clave que no es de medios', () => {
    expect(() => reconciliationAgeMinutes(`scenes/${SCENE}/other/${OBJ}`)).toThrow(RangeError);
    expect(() => reconciliationAgeMinutes('')).toThrow(RangeError);
  });
});

describe('T1430 claves de «Acerca de» (H-ARCH-ACE-KEY, INV-ARC-003, INV-ACE10-001)', () => {
  it('about/photo/<uuid>: se deriva solo del UUID de la versión de la foto, sin extensión, sin id de administrador ni texto del usuario', () => {
    expect(aboutPhotoObjectKey(OBJ)).toBe(`about/photo/${OBJ}`);
    expect(isMediaObjectKey(aboutPhotoObjectKey(OBJ))).toBe(true);
    for (const bad of ['', 'x', OBJ.toUpperCase(), `${OBJ}/..`, '../etc', '3f1c0a52-7d3e-1b8a-9a61-0c2f4d5e6a71', `${OBJ}.png`]) expect(() => aboutPhotoObjectKey(bad), bad).toThrow(RangeError);
  });

  it('isMediaObjectKey rechaza las variantes de about/ (carpeta ajena, segmento extra, extensión, mayúsculas, recorrido, sin uuid)', () => {
    const invalid = [
      `about/${OBJ}`, `about/photos/${OBJ}`, `about/files/${OBJ}`, `about/avatar/${OBJ}`, `about/photo/${OBJ}/x`, `about/photo/${OBJ}.png`, `about/photo/${OBJ.toUpperCase()}`,
      `about/${HOUSE}/photo/${OBJ}`, 'about/photo/', 'about/photo', 'about/../photo/x', `/about/photo/${OBJ}`, `about//photo/${OBJ}`, `About/photo/${OBJ}`,
    ];
    for (const key of invalid) expect(isMediaObjectKey(key), key).toBe(false);
  });

  it('assertMediaKey acepta la clave de about/ y rechaza las demás con RangeError', () => {
    expect(assertMediaKey(aboutPhotoObjectKey(OBJ))).toBeUndefined();
    expect(() => assertMediaKey(`about/other/${OBJ}`)).toThrow(RangeError);
  });

  it('assertListPrefix acepta about/, about/photo/ y un prefijo parcial de uuid, y rechaza carpetas ajenas, mayúsculas y recorridos', () => {
    for (const prefix of ['about/', 'about/photo', 'about/photo/', `about/photo/${OBJ.slice(0, 8)}`]) expect(assertListPrefix(prefix), prefix).toBeUndefined();
    for (const prefix of ['about', 'About/', 'about/..', 'about/../', 'about/photos/', `about/${HOUSE}/`, 'about//', 'about/photo/%2e']) expect(() => assertListPrefix(prefix), prefix).toThrow(RangeError);
  });
});
