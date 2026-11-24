/**
 * T1260 (Feature 009, Fase 5a, #20; PRUEBAS ROJAS hasta T1266): caja gris «Función deshabilitada» del bloque de escena cuando `SceneView.disabled = true` (contrato 006 1.2.0). La imagen
 * vigente sigue visible, no hay boton de generar habilitado y, sin el indicador, la caja no aparece. Sin jsdom: `SceneBlockView` con `renderToStaticMarkup`. El texto y la composicion
 * final los revisa `/sati` (320/1024/1280 px, WCAG 2.1 AA).
 * @implements REQ-CFG9-003, EDGE-009-019, SC-009-021
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const render = (view: SceneViewData): string =>
  renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'escena-h1', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
const disabledView = (overrides: Partial<SceneViewData> = {}): SceneViewData =>
  sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES', retryAfterSeconds: null }, ...overrides, ...({ disabled: true } as object) });
const BOX = 'Función deshabilitada';

describe('T1260 caja «Función deshabilitada» (REQ-CFG9-003, EDGE-009-019)', () => {
  it('[SC-009-021] con disabled = true muestra la caja con el texto «Función deshabilitada» en una superficie gris', () => {
    const html = render(disabledView());
    expect(html).toContain(BOX);
    const before = html.slice(Math.max(0, html.indexOf(BOX) - 400), html.indexOf(BOX));
    expect(before).toMatch(/(?:bg|border)-(?:slate|gray|neutral|zinc|stone)-\d{2,3}/);
  });

  it('la imagen vigente sigue visible con la funcion deshabilitada (misma ruta propia con v = imageTag)', () => {
    const html = render(disabledView());
    expect(html).toContain(`/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}`);
    expect(html).toContain('<img ');
  });

  it('no queda ningun boton de generar ni regenerar habilitado', () => {
    const html = render(disabledView());
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    for (const button of buttons) expect(button, 'todo boton debe estar deshabilitado').toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).not.toMatch(/<button\b(?![^>]*\sdisabled(?:=|\s|>))[^>]*>[^<]*(?:Regenerar|Generar|Actualizar|Crear)/);
  });

  it('sin el indicador (ausente o false) la caja NO aparece y el boton de regenerar sigue disponible', () => {
    expect(render(sceneView())).not.toContain(BOX);
    expect(render(sceneView(({ disabled: false } as object) as Partial<SceneViewData>))).not.toContain(BOX);
    expect(render(sceneView())).toMatch(/<button\b(?![^>]*\sdisabled(?:=|\s|>))[^>]*>[^<]*Regenerar/);
  });

  it('el texto de la caja no revela la causa ni la configuracion (sin «administrador», «parametro», «scene.enabled»)', () => {
    const html = render(disabledView());
    const start = html.indexOf(BOX);
    expect(start).toBeGreaterThanOrEqual(0);
    const around = html.slice(start, start + 300);
    expect(around).not.toMatch(/administrador|par[aá]metro|scene\.enabled|configuraci[oó]n/i);
  });
});
