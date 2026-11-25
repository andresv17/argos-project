/**
 * T1170 (008, Bloque H, [GH:#55]): `HomeSceneImageView` pinta un `figcaption` visible «Mi hogar» bajo la imagen, solo cuando se pinta la imagen, sin duplicar el `alt`
 * ni agregar controles. Texto PROVISIONAL de la spec (D8-09, pendiente de Neo). Enmienda a D6-19 («sin textos», SC-ESC6-110/111 de 006).
 * REQ-UX8-003, EDGE-008-022; SC-008-039, SC-008-040, SC-008-041.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeSceneImageView } from '../../../src/presentation/web/components/HomeSceneImage.tsx';
import { SCENE_AI_LABEL as AI_LABEL, sceneAltText } from '../../../src/presentation/web/scene-view.ts';
import { HOUSEHOLD_ID, IMAGE_TAG } from './escena-fixtures.ts';

const render = (householdId: string | null, view: { imageTag: string | null; shown: number } | null): string => renderToStaticMarkup(h(HomeSceneImageView, { householdId, view }));

describe('T1170 rótulo «Mi hogar» (REQ-UX8-003)', () => {
  it('[REQ-UX8-003][SC-008-039] con imagen hay exactamente 1 figcaption visible con «Mi hogar», dentro del figure y después de la imagen', () => {
    const html = render(HOUSEHOLD_ID, { imageTag: IMAGE_TAG, shown: 3 });
    const captions = html.match(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/g) ?? [];
    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatch(/<span\b[^>]*>Mi hogar<\/span>/);
    expect(captions[0]).toContain(AI_LABEL);
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<figcaption'));
    expect(html.indexOf('</figcaption>')).toBeLessThan(html.indexOf('</figure>'));
  });

  it('[SC-008-040][EDGE-008-022] sin imagen no hay rótulo: 0 hogares, vista nula e imageTag null no pintan nada', () => {
    expect(render(null, { imageTag: IMAGE_TAG, shown: 1 })).toBe('');
    expect(render(HOUSEHOLD_ID, null)).toBe('');
    expect(render(HOUSEHOLD_ID, { imageTag: null, shown: 0 })).toBe('');
  });

  it('[SC-008-040][EDGE-008-022] el rótulo no repite el texto alternativo de la imagen (sin duplicar para lectores de pantalla)', () => {
    const html = render(HOUSEHOLD_ID, { imageTag: IMAGE_TAG, shown: 2 });
    expect(html).toContain(`alt="${sceneAltText(2)}"`);
    expect(sceneAltText(2)).not.toContain('Mi hogar');
    expect(html.match(/Mi hogar/g)).toHaveLength(1);
  });

  it('[SC-008-041] el rótulo no agrega controles ni textos de estado, cuota o consentimiento (el resto de D6-19 se conserva)', () => {
    const html = render(HOUSEHOLD_ID, { imageTag: IMAGE_TAG, shown: 3 });
    expect(html).not.toMatch(/<(button|a|input|select|textarea|form)\b/);
    expect(html).not.toMatch(/role="(status|alert)"|aria-live|generaciones|consentimiento|Regenerar/i);
  });
});
