/**
 * T1512 (011, Bloque B, [GH:#72]; D11-07 = A): la imagen de escena generada por IA lleva una etiqueta visible y accesible «Imagen generada con inteligencia artificial»
 * (constante única) en toda superficie web que la muestre; nunca en fotos subidas; sin marca de agua en los bytes; el prompt no se muestra.
 * REQ-IA11-001, REQ-IA11-002, REQ-IA11-003, INV-IA11-001; SC-011-010..014.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeSceneImageView } from '../../../src/presentation/web/components/HomeSceneImage.tsx';
import { SceneBlockView, type SceneBlockViewProps } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { HouseholdPhotoView, type HouseholdPhotoViewProps } from '../../../src/presentation/web/components/HouseholdPhoto.tsx';
import * as sceneView from '../../../src/presentation/web/scene-view.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView as makeView, sceneViewSinImagen } from './escena-fixtures.ts';

const TEXT = 'Imagen generada con inteligencia artificial';
const noop = (): void => undefined;
const home = (): string => renderToStaticMarkup(h(HomeSceneImageView, { householdId: HOUSEHOLD_ID, view: { imageTag: IMAGE_TAG, shown: 3 } }));
const block = (view = makeView()): string => renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'esc', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop } as SceneBlockViewProps));
const src = (p: string): string => readFileSync(p, 'utf8');

/** La etiqueta está asociada a la imagen: `aria-describedby` apunta al id del elemento que contiene el texto. */
function assertAssociated(html: string): void {
  expect(html).toContain(TEXT);
  const id = html.match(/<img\b[^>]*aria-describedby="([^"]+)"/)?.[1];
  expect(id).toMatch(/^[\w:-]+$/);
  expect(html).toMatch(new RegExp(`id="${id}"[^>]*>${TEXT}<`));
  expect(html.indexOf('<img')).toBeLessThan(html.indexOf(TEXT));
}

describe('T1512 etiqueta de IA (REQ-IA11-001/002)', () => {
  it('[SC-011-010][REQ-IA11-001] la constante única exportada tiene el texto de D11-07', () => {
    expect((sceneView as Record<string, unknown>)['SCENE_AI_LABEL']).toBe(TEXT);
  });
  it('[SC-011-011][REQ-IA11-002] vista del hogar (Mascotas): etiqueta visible asociada a la imagen y «Mi hogar» intacto', () => {
    const html = home();
    assertAssociated(html);
    expect(html.match(new RegExp(TEXT, 'g'))).toHaveLength(1);
    // HTML: figcaption es el primer o el último hijo de figure; aquí el último, y contiene «Mi hogar» y la etiqueta asociada por aria-describedby
    expect(html).toMatch(new RegExp(`<img\\b[^>]*/><figcaption\\b[^>]*><span\\b[^>]*>Mi hogar</span><span\\b[^>]*>${TEXT}</span></figcaption></figure>$`));
    expect(html.indexOf('Mi hogar')).toBeLessThan(html.indexOf(TEXT));
  });
  it('[SC-011-011] bloque «Escena del hogar»: etiqueta visible asociada a la imagen; sin imagen no hay etiqueta', () => {
    assertAssociated(block());
    expect(block().match(new RegExp(TEXT, 'g'))).toHaveLength(1);
    expect(block(sceneViewSinImagen())).not.toContain(TEXT);
    // la etiqueta es el figcaption y el último hijo de su figure
    expect(block()).toMatch(new RegExp(`<img\\b[^>]*/><figcaption\\b[^>]*>${TEXT}</figcaption></figure>`));
  });
  it('[SC-011-012] contraste AA: la etiqueta usa color de texto oscuro (slate-900), no atenuado, y no está oculta', () => {
    for (const html of [home(), block()]) {
      const tag = html.match(/<[a-z]+\b[^>]*>Imagen generada con inteligencia artificial</)?.[0] ?? '';
      expect(tag).toMatch(/text-slate-(800|900)/);
      expect(tag).not.toMatch(/sr-only|hidden|opacity|aria-hidden/);
    }
  });
  it('[SC-011-012] fuente: la constante vive en un único lugar y los componentes no repiten el literal', () => {
    expect(src('src/presentation/web/scene-view.ts')).toContain(TEXT);
    expect(src('src/presentation/web/components/HomeSceneImage.tsx')).not.toContain(TEXT);
    expect(src('src/presentation/web/components/SceneBlock.tsx')).not.toContain(TEXT);
    expect(src('src/presentation/web/components/HomeSceneImage.tsx')).toContain('SCENE_AI_LABEL');
    expect(src('src/presentation/web/components/SceneBlock.tsx')).toContain('SCENE_AI_LABEL');
  });
});

describe('T1512 foto subida sin etiqueta (INV-IA11-001) y bytes intactos (REQ-IA11-002)', () => {
  it('[SC-011-013][INV-IA11-001] la foto de referencia del hogar y el avatar no llevan la etiqueta ni usan la constante', () => {
    const props = { idPrefix: 'foto', photoState: 'PRESENT', photoSrc: '/api/households/x/photo', canUpload: true, chosenName: null, uploading: false, confirmDelete: false, error: null, onPhotoLoad: noop, onPhotoError: noop, onChoose: noop, onUpload: noop, onAskDelete: noop, onConfirmDelete: noop, onCancelDelete: noop } as unknown as HouseholdPhotoViewProps;
    expect(renderToStaticMarkup(h(HouseholdPhotoView, props))).not.toMatch(/inteligencia artificial/i);
    for (const f of ['HouseholdPhoto', 'PetAvatar', 'AvatarCropper', 'PhotoAlbum', 'MediaPanel']) expect(src(`src/presentation/web/components/${f}.tsx`)).not.toContain('SCENE_AI_LABEL');
  });
  it('[SC-011-014][REQ-IA11-002] sin marca de agua: el servidor y el cliente no componen texto sobre los bytes de la imagen (sin canvas/fillText en la escena)', () => {
    for (const f of ['HomeSceneImage.tsx', 'SceneBlock.tsx']) expect(src(`src/presentation/web/components/${f}`)).not.toMatch(/canvas|fillText|toBlob|drawImage/);
    expect(src('src/presentation/web/scene-view.ts')).not.toMatch(/fillText|drawImage/);
    // la descarga sigue siendo el enlace directo a la ruta de bytes, sin transformación en el cliente
    expect(block()).toMatch(/<a\b[^>]*href="[^"]*scene\/image[^"]*"[^>]*download=/);
  });
  it('[REQ-IA11-003] la etiqueta no incluye texto de prompt: solo la constante junto a la imagen', () => {
    for (const html of [home(), block()]) expect(html).not.toMatch(/prompt/i);
  });
});
