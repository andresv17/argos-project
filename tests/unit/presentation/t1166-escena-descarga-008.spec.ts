/**
 * T1166/T1168 (008, Bloque G, [GH:#54]): botón «Descargar imagen» de la escena. Pide la imagen vigente con `download=1` (contrato 006 3.5.0; el atributo `download`
 * se ignora con la redirección 302 a otro origen, EDGE-008-020), con nombre `tipi-hogar-AAAA-MM-DD.png` sin PII (EDGE-008-021) y solo con imagen vigente.
 * REQ-UX8-002; SC-008-035, SC-008-036.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { sceneDownloadFilename, sceneImageDownloadPath, sceneImagePath } from '../../../src/presentation/web/scene-view.ts';
import type { SceneScope, SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView, sceneViewSinImagen } from './escena-fixtures.ts';

const noop = (): void => undefined;
const HOUSEHOLD: SceneScope = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID };
const render = (view: SceneViewData, scope: SceneScope = HOUSEHOLD): string =>
  renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'escena-h1', scope, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
const anchor = (html: string): string => html.match(/<a [^>]*>Descargar imagen<\/a>/)?.[0] ?? '';

describe('T1166 nombre de archivo (EDGE-008-021)', () => {
  it('[SC-008-035] tipi-hogar-AAAA-MM-DD.png con el día en America/Bogota, no en UTC', () => {
    expect(sceneDownloadFilename('2026-11-18T10:00:00.000Z')).toBe('tipi-hogar-2026-11-18.png');
    expect(sceneDownloadFilename('2026-11-19T03:30:00.000Z')).toBe('tipi-hogar-2026-11-18.png');
  });

  it('[REQ-ESC6-035] (enmienda N2 JPEG) con image/jpeg la pista es .jpg y con image/webp .webp; sin tipo o png, .png', () => {
    expect(sceneDownloadFilename('2026-11-18T10:00:00.000Z', 'image/jpeg')).toBe('tipi-hogar-2026-11-18.jpg');
    expect(sceneDownloadFilename('2026-11-18T10:00:00.000Z', 'image/webp')).toBe('tipi-hogar-2026-11-18.webp');
    expect(sceneDownloadFilename('2026-11-18T10:00:00.000Z', 'image/png')).toBe('tipi-hogar-2026-11-18.png');
  });

  it('[SC-008-035] un instante ilegible no inventa nombre (null)', () => {
    expect(sceneDownloadFilename('no-es-una-fecha')).toBeNull();
  });

  it('[SC-008-035] el nombre cumple el patrón del contrato y no contiene PII ni caracteres de control', () => {
    const name = sceneDownloadFilename('2027-01-01T05:00:00.000Z');
    expect(name).toMatch(/^tipi-hogar-\d{4}-\d{2}-\d{2}\.png$/);
    expect(name).toBe('tipi-hogar-2027-01-01.png');
  });
});

describe('T1166 ruta de descarga (EDGE-008-020)', () => {
  it('[SC-008-037] la ruta es la de la imagen con download=1 en ambos ámbitos', () => {
    expect(sceneImageDownloadPath(HOUSEHOLD, IMAGE_TAG)).toBe(`/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}&download=1`);
    expect(sceneImageDownloadPath({ kind: 'OWNER' }, IMAGE_TAG)).toBe(`/api/me/scene/image?v=${IMAGE_TAG}&download=1`);
  });

  it('[SC-008-036] sin imagen vigente no hay ruta de descarga', () => {
    expect(sceneImageDownloadPath(HOUSEHOLD, null)).toBeNull();
    expect(sceneImagePath(HOUSEHOLD, null)).toBeNull();
  });
});

describe('T1168 botón «Descargar imagen» en SceneBlockView (SC-008-035, SC-008-036)', () => {
  it('[REQ-UX8-002][SC-008-036] con imagen vigente hay un enlace «Descargar imagen» con href download=1, nombre de archivo y aria-label', () => {
    const link = anchor(render(sceneView()));
    expect(link).toContain(`href="/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}&amp;download=1"`);
    expect(link).toContain('download="tipi-hogar-2026-11-18.png"');
    expect(link).toContain('aria-label="Descargar imagen del hogar"');
    expect(link).toContain('min-h-12');
  });

  it('[SC-008-036] sin imagen vigente no se pinta el botón', () => {
    expect(render(sceneViewSinImagen())).not.toContain('Descargar imagen');
  });

  it('[SC-008-035] en el ámbito del propietario sin hogar el enlace usa /api/me', () => {
    const html = render(sceneView({ owner: 'OWNER' }), { kind: 'OWNER' });
    expect(anchor(html)).toContain(`href="/api/me/scene/image?v=${IMAGE_TAG}&amp;download=1"`);
  });

  it('[SC-008-035] ni el enlace ni su nombre llevan datos de mascotas ni del hogar', () => {
    const link = anchor(render(sceneView()));
    expect(link).not.toMatch(/Luna|Argos"|Casa/);
    expect(link.match(/download="([^"]*)"/)?.[1]).toBe('tipi-hogar-2026-11-18.png');
  });

  it('[SC-008-036] el DOM no guarda URL firmadas: el href es una ruta propia relativa', () => {
    expect(anchor(render(sceneView()))).not.toMatch(/https?:\/\//);
  });
});
