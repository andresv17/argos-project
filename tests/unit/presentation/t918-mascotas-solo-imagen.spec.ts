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
import { createLatestOnly, loadHomeSceneImage, sceneAltText } from '../../../src/presentation/web/scene-view.ts';
import type { SceneScope, SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView } from './escena-fixtures.ts';

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
