/**
 * T918 (006, Fase 11): «Mascotas» solo visualiza la imagen vigente del hogar del contexto activo: sin controles, sin textos de estado, cuota ni consentimiento, nada con
 * 0 hogares, contexto «Mis mascotas», `imageTag = null` o error de lectura, 0 peticiones a `/api/me/scene` y prevalece la lectura más reciente.
 * REQ-ESC6-019, REQ-ESC6-032; SC-ESC6-110, SC-ESC6-111.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeSceneImageView } from '../../../src/presentation/web/components/HomeSceneImage.tsx';
import { createLatestOnly, loadHomeSceneImage, principalHouseholdId, sceneAltText } from '../../../src/presentation/web/scene-view.ts';
import type { SceneScope, SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView } from './escena-fixtures.ts';
import type { HouseholdView } from '../../../src/presentation/web/view-model.ts';

const read = (path: string): string => readFileSync(path, 'utf8');
const OTHER_HOUSE = '22222222-2222-4222-8222-222222222202';

describe('T918 vista de solo lectura (SC-ESC6-110)', () => {
  it('[SC-ESC6-110] con imageTag no nulo hay 1 imagen con el texto alternativo de sceneAltText y 0 botones, enlaces, campos, formularios o textos de estado', () => {
    const html = renderToStaticMarkup(h(HomeSceneImageView, { householdId: HOUSEHOLD_ID, view: { imageTag: IMAGE_TAG, shown: 3 } }));
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(`alt="${sceneAltText(3)}"`);
    expect(html).toContain(`src="/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}"`);
    expect(html).not.toMatch(/<(button|a|input|select|textarea|form)\b/);
    expect(html).not.toMatch(/role="(status|alert)"|aria-live|cambios pendientes|generaciones|consentimiento|Actualizar|Regenerar|Reintentar/i);
    expect(html).not.toMatch(/googleapis|X-Goog|Signature/);
  });

  it('[SC-ESC6-111] sin vista, con imageTag null o sin hogar no se pinta nada', () => {
    expect(renderToStaticMarkup(h(HomeSceneImageView, { householdId: HOUSEHOLD_ID, view: null }))).toBe('');
    expect(renderToStaticMarkup(h(HomeSceneImageView, { householdId: HOUSEHOLD_ID, view: { imageTag: null, shown: 0 } }))).toBe('');
    expect(renderToStaticMarkup(h(HomeSceneImageView, { householdId: null, view: { imageTag: IMAGE_TAG, shown: 1 } }))).toBe('');
  });

  it('[SC-ESC6-110] el código fuente de PetsPage no contiene HomeScene, SceneBlock, scope OWNER, petsRevision ni reloadToken', () => {
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).not.toMatch(/HomeScene\b|SceneBlock|kind: 'OWNER'|petsRevision|reloadToken/);
    expect(pets).toMatch(/<HomeSceneImage\b/);
  });

  it('[SC-ESC6-110] el componente de solo lectura no importa SceneBlock, SceneConsent ni HouseholdPhoto y solo lee escenas de HOUSEHOLD', () => {
    const source = read('src/presentation/web/components/HomeSceneImage.tsx');
    expect(source).not.toMatch(/SceneBlock|SceneConsent|HouseholdPhoto|<Button|<button|kind: 'OWNER'|me\/scene/);
  });
});

describe('T918 lectura por contexto (SC-ESC6-111)', () => {
  const calls = (): { scopes: SceneScope[]; get: (scope: SceneScope) => Promise<SceneViewData> } => {
    const scopes: SceneScope[] = [];
    return { scopes, get: async (scope) => { scopes.push(scope); return sceneView({ pets: { shown: 2, total: 2, maxPets: 8 } }); } };
  };

  it('[SC-ESC6-111] sin hogar (0 hogares o contexto «Mis mascotas») hay 0 peticiones a la escena, también ninguna a /me/scene', async () => {
    const c = calls();
    expect(await loadHomeSceneImage(c.get, null)).toBeNull();
    expect(c.scopes).toEqual([]);
  });

  it('[SC-ESC6-111] un hogar con escena lee exactamente 1 vez y solo con el ámbito HOUSEHOLD', async () => {
    const c = calls();
    expect(await loadHomeSceneImage(c.get, HOUSEHOLD_ID)).toEqual({ imageTag: IMAGE_TAG, shown: 2 });
    expect(c.scopes).toEqual([{ kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }]);
  });

  it('[SC-ESC6-111] un hogar sin imagen devuelve imageTag null (no se pinta nada)', async () => {
    expect(await loadHomeSceneImage(async () => sceneView({ imageTag: null }), HOUSEHOLD_ID)).toEqual({ imageTag: null, shown: 3 });
  });

  it('[SC-ESC6-111] un error de lectura da null: 0 elementos y 0 mensajes de error', async () => {
    expect(await loadHomeSceneImage(async () => { throw new Error('boom'); }, HOUSEHOLD_ID)).toBeNull();
  });

  it('[SC-ESC6-111] si dos lecturas se cruzan prevalece la del contexto actual (la más reciente)', async () => {
    const seen: string[] = [];
    const latest = createLatestOnly();
    let finishOld: (v: string) => void = () => undefined;
    const old = new Promise<string>((resolve) => { finishOld = resolve; });
    latest.run(old, (v) => seen.push(v));
    latest.run(Promise.resolve('nuevo'), (v) => seen.push(v));
    await Promise.resolve();
    finishOld('viejo');
    await old;
    await Promise.resolve();
    expect(seen).toEqual(['nuevo']);
  });

  it('[SC-ESC6-111] cancelar descarta una lectura en vuelo (cambio a «Mis mascotas» o desmontaje)', async () => {
    const seen: string[] = [];
    const latest = createLatestOnly();
    let finish: (v: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    latest.run(pending, (v) => seen.push(v));
    latest.cancel();
    finish('tarde');
    await pending;
    await Promise.resolve();
    expect(seen).toEqual([]);
    latest.run(Promise.resolve(OTHER_HOUSE), (v) => seen.push(v));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([OTHER_HOUSE]);
  });
});

/**
 * T925 (006, Fase 12; D6-20): hogar principal en «Mis mascotas». `principalHouseholdId` es pura: el `household.createdAt` más antiguo y, a igualdad, el `id` menor,
 * sin depender del orden del arreglo. Sin jsdom: se prueba la función, la lectura con `loadHomeSceneImage` y la inspección de la fuente de `PetsPage` e `HomeSceneImage`.
 * REQ-ESC6-019, REQ-ESC6-032; SC-ESC6-119, SC-ESC6-120, SC-ESC6-121.
 */
const hv = (id: string, createdAt: string): HouseholdView => ({ household: { id, name: `Hogar ${id.slice(-1)}`, createdAt }, myRole: 'ADMIN', isHouseholdOwner: true, members: [], pendingInvitations: [] }) as unknown as HouseholdView;
const ID_A = '22222222-2222-4222-8222-222222222201';
const ID_B = '22222222-2222-4222-8222-222222222202';
const ID_C = '22222222-2222-4222-8222-222222222203';
const OLD = '2026-01-01T10:00:00.000Z';
const NEW = '2026-06-01T10:00:00.000Z';

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

describe('T925 principalHouseholdId (SC-ESC6-121)', () => {
  it('[SC-ESC6-121] lista vacía devuelve null', () => {
    expect(principalHouseholdId([])).toBeNull();
  });

  it('[SC-ESC6-121] createdAt distintos: gana el más antiguo en cualquier permutación', () => {
    const set = [hv(ID_A, NEW), hv(ID_B, OLD), hv(ID_C, '2026-03-01T10:00:00.000Z')];
    for (const order of permutations(set)) expect(principalHouseholdId(order)).toBe(ID_B);
  });

  it('[SC-ESC6-121] createdAt iguales: gana el id menor en orden ascendente, en cualquier permutación', () => {
    const set = [hv(ID_C, OLD), hv(ID_A, OLD), hv(ID_B, OLD)];
    for (const order of permutations(set)) expect(principalHouseholdId(order)).toBe(ID_A);
  });

  it('[SC-ESC6-121] empate parcial: entre los de createdAt mínimo decide el id', () => {
    const set = [hv(ID_A, NEW), hv(ID_C, OLD), hv(ID_B, OLD)];
    for (const order of permutations(set)) expect(principalHouseholdId(order)).toBe(ID_B);
  });

  it('[SC-ESC6-121] 100 ejecuciones sobre permutaciones del mismo conjunto dan el mismo valor y no se muta el arreglo recibido', () => {
    const set = [hv(ID_A, NEW), hv(ID_B, OLD), hv(ID_C, OLD)];
    const all = permutations(set);
    for (let i = 0; i < 100; i += 1) {
      const input = [...all[i % all.length]!];
      const snapshot = JSON.stringify(input);
      expect(principalHouseholdId(input)).toBe(ID_B);
      expect(JSON.stringify(input)).toBe(snapshot);
    }
  });

  it('[SC-ESC6-121] la función es pura: scene-view.ts no usa reloj, azar ni entorno en su código', () => {
    const code = read('src/presentation/web/scene-view.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/Date\.now|new Date\(|Math\.random|process\.env/);
  });
});

describe('T925 hogar principal en «Mis mascotas» (SC-ESC6-119, SC-ESC6-120)', () => {
  const imagesByHousehold = (withImage: readonly string[]): { reads: string[]; get: (scope: SceneScope) => Promise<SceneViewData> } => {
    const reads: string[] = [];
    return {
      reads,
      get: async (scope) => {
        if (scope.kind !== 'HOUSEHOLD') throw new Error('solo HOUSEHOLD');
        reads.push(scope.householdId);
        return sceneView({ imageTag: withImage.includes(scope.householdId) ? IMAGE_TAG : null });
      },
    };
  };

  it('[SC-ESC6-119] 2 hogares (el antiguo con imagen) en cualquier orden del arreglo: 1 lectura, la del hogar más antiguo, con imagen', async () => {
    for (const order of permutations([hv(ID_A, NEW), hv(ID_B, OLD)])) {
      const c = imagesByHousehold([ID_B]);
      expect(await loadHomeSceneImage(c.get, principalHouseholdId(order))).toEqual({ imageTag: IMAGE_TAG, shown: 3 });
      expect(c.reads).toEqual([ID_B]);
    }
  });

  it('[SC-ESC6-120] (a) 0 hogares: 0 lecturas y nada que pintar', async () => {
    const c = imagesByHousehold([]);
    expect(await loadHomeSceneImage(c.get, principalHouseholdId([]))).toBeNull();
    expect(c.reads).toEqual([]);
  });

  it('[SC-ESC6-120] (b) principal sin imagen y segundo con imagen: «Mis mascotas» no pinta nada y no lee el segundo hogar; el segundo solo al elegirlo', async () => {
    const c = imagesByHousehold([ID_A]);
    const principal = await loadHomeSceneImage(c.get, principalHouseholdId([hv(ID_A, NEW), hv(ID_B, OLD)]));
    expect(principal).toEqual({ imageTag: null, shown: 3 });
    expect(renderToStaticMarkup(h(HomeSceneImageView, { householdId: ID_B, view: principal }))).toBe('');
    expect(c.reads).toEqual([ID_B]);
    expect(await loadHomeSceneImage(c.get, ID_A)).toEqual({ imageTag: IMAGE_TAG, shown: 3 });
    expect(c.reads).toEqual([ID_B, ID_A]);
  });

  it('[SC-ESC6-120] (c) error de lectura del principal: null, 0 elementos y 0 mensajes de error', async () => {
    const failing = async (): Promise<SceneViewData> => { throw new Error('boom'); };
    const view = await loadHomeSceneImage(failing, principalHouseholdId([hv(ID_A, NEW), hv(ID_B, OLD)]));
    expect(view).toBeNull();
    expect(renderToStaticMarkup(h(HomeSceneImageView, { householdId: ID_B, view }))).toBe('');
  });

  it('[SC-ESC6-120] (d) 2 hogares con imagen: principal en «Mis mascotas», el otro al elegirlo, y vuelta al principal; 1 lectura por cambio del hogar resuelto', async () => {
    const c = imagesByHousehold([ID_A, ID_B]);
    const households = [hv(ID_A, NEW), hv(ID_B, OLD)];
    const principal = principalHouseholdId(households);
    expect(principal).toBe(ID_B);
    await loadHomeSceneImage(c.get, principal);
    await loadHomeSceneImage(c.get, ID_A);
    await loadHomeSceneImage(c.get, principal);
    expect(c.reads).toEqual([ID_B, ID_A, ID_B]);
    const html = renderToStaticMarkup(h(HomeSceneImageView, { householdId: principal, view: { imageTag: IMAGE_TAG, shown: 3 } }));
    expect(html).toContain(`/api/households/${ID_B}/scene/image?v=${IMAGE_TAG}`);
    expect(html).not.toMatch(/<(button|a|input|select|textarea|form)\b/);
  });

  it('[SC-ESC6-120] elegir en el selector el mismo hogar que ya era el principal no repite la lectura: HomeSceneImage depende solo del householdId resuelto', () => {
    const source = read('src/presentation/web/components/HomeSceneImage.tsx');
    expect(source).toMatch(/\[api, householdId\]\);/);
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).toMatch(/<HomeSceneImage householdId=\{isMine \? principalHouseholdId\(households\) : contextId\} \/>/);
  });

  it('[SC-ESC6-119][SC-ESC6-120] PetsPage no llama a /me/scene, no monta HomeScene ni SceneBlock y no añade lecturas de hogares: reutiliza GET /households', () => {
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).not.toMatch(/me\/scene|HomeScene\b|SceneBlock|kind: 'OWNER'/);
    expect(pets.match(/api\.GET\('\/households'\)/g)).toHaveLength(1);
    expect(pets).toMatch(/import \{[^}]*principalHouseholdId[^}]*\} from '\.\.\/scene-view\.ts'/);
  });

  it('[SC-ESC6-119] «Hogar» sigue siendo el único lugar de gestión: HomeSceneImage de «Mascotas» sin controles ni estado', () => {
    const html = renderToStaticMarkup(h(HomeSceneImageView, { householdId: ID_B, view: { imageTag: IMAGE_TAG, shown: 2 } }));
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(button|a|input|select|textarea|form)\b|role="(status|alert)"|aria-live/);
  });
});
