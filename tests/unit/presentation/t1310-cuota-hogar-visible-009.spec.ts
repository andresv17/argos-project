/**
 * T1310 (009, Fase 5c, [GH:#20]; D9-28 (4); SC-009-055): quien puede generar ve SIEMPRE «Generaciones restantes este mes: R de M. Se renuevan el <fecha>.» (con pending = 0 y con
 * pending >= 1, incluso con cuota agotada); quien no puede generar (rol sin permiso) no la ve; la vista nunca muestra cifras de cuota global ni de costo.
 * @implements REQ-ESC6-019, REQ-ESC6-039, INV-LIM9-001
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { sceneQuotaLine } from '../../../src/presentation/web/scene-view.ts';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const render = (view: SceneViewData): string =>
  renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'escena-h1', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
const EXPECTED = 'Generaciones restantes este mes: 7 de 10. Se renuevan el 1 de diciembre.';
const forbidden: SceneViewData['actions'] = { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason: 'ROLE', retryAfterSeconds: null };

describe('T1310 [SC-009-055] cuota mensual del hogar siempre visible para quien puede generar', () => {
  it('pending = 0: la linea «R de M» y la fecha de renovacion aparecen', () => {
    const view = sceneView({ pending: 0 });
    expect(sceneQuotaLine(view)).toBe(EXPECTED);
    expect(render(view)).toContain(EXPECTED);
  });

  it('pending >= 1: aparece una sola vez (junto al aviso de cambios)', () => {
    const html = render(sceneView({ pending: 2 }));
    expect(html.split(EXPECTED).length - 1).toBe(1);
  });

  it('cuota agotada (0 de 10) y sin cambios: sigue visible con la fecha', () => {
    const view = sceneView({ pending: 0, quota: { max: 10, remaining: 0, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' }, actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'QUOTA_EXHAUSTED', retryAfterSeconds: null } });
    expect(render(view)).toContain('Generaciones restantes este mes: 0 de 10. Se renuevan el 1 de diciembre.');
  });

  it('con bloqueo por enfriamiento o consentimiento tambien se ve (solo el rol la oculta)', () => {
    for (const blockedReason of ['COOLDOWN', 'CONSENT_REQUIRED', 'GENERATING', 'NO_CHANGES', 'GLOBAL_QUOTA_EXHAUSTED'] as const) {
      expect(sceneQuotaLine(sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason, retryAfterSeconds: null } }))).toBe(EXPECTED);
    }
  });

  it('fecha ilegible: sin fecha inventada', () => {
    expect(sceneQuotaLine(sceneView({ quota: { max: 10, remaining: 4, window: '2026-11', resetsAt: 'x' } }))).toBe('Generaciones restantes este mes: 4 de 10.');
  });

  it('sin permiso de generar (rol): no se muestra, con pending = 0 ni con pending >= 1', () => {
    for (const pending of [0, 3]) {
      const view = sceneView({ pending, actions: forbidden });
      expect(sceneQuotaLine(view)).toBeNull();
      expect(render(view)).not.toContain('Generaciones restantes');
    }
  });

  it('no muestra cifras de cuota global ni de costo', () => {
    const html = render(sceneView({ pending: 0 }));
    expect(html).not.toMatch(/global|USD|µ|costo|coste|\$/i);
  });
});
