/**
 * T919 (006, Fase 11, N2-15 = opción B): el bloque de la escena OWNER vive solo en «Hogar» y únicamente con 0 hogares (ya cargados), conservando el retiro de
 * consentimiento (REQ-ESC6-025). REQ-ESC6-019, REQ-ESC6-025, REQ-ESC6-032; SC-ESC6-109, SC-ESC6-110.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ownerSceneVisible } from '../../../src/presentation/web/scene-view.ts';

const read = (path: string): string => readFileSync(path, 'utf8');

describe('T919 bloque OWNER en «Hogar» solo con 0 hogares (N2-15 = B)', () => {
  it('[SC-ESC6-109] el bloque OWNER se ofrece solo con la lista ya cargada y 0 hogares', () => {
    expect(ownerSceneVisible(true, 0)).toBe(true);
    expect(ownerSceneVisible(true, 1)).toBe(false);
    expect(ownerSceneVisible(true, 3)).toBe(false);
    expect(ownerSceneVisible(false, 0)).toBe(false);
  });

  it('[SC-ESC6-109] HouseholdsPage monta HomeScene OWNER condicionado a ownerSceneVisible y sigue montando la de cada hogar', () => {
    const households = read('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(households).toMatch(/ownerSceneVisible\(loaded, households\.length\)[^]*<HomeScene[^>]*kind: 'OWNER'/);
    expect(households).toMatch(/<HomeScene[^>]*kind: 'HOUSEHOLD'/);
  });

  it('[REQ-ESC6-025] el panel de consentimiento (retiro) sigue ligado al bloque OWNER vía HomeScene', () => {
    const scene = read('src/presentation/web/components/HomeScene.tsx');
    expect(scene).toMatch(/<SceneConsent\b/);
  });

  it('[SC-ESC6-110] «Mascotas» no monta ninguna escena OWNER (el bloque queda solo en «Hogar»)', () => {
    expect(read('src/presentation/web/pages/PetsPage.tsx')).not.toMatch(/kind: 'OWNER'/);
  });
});
