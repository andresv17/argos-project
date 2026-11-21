/**
 * T1163 (008, Bloque F, [GH:#53]): la línea de cuota dice que las generaciones son mensuales y cuándo se renuevan, con la fecha tomada de `quota.resetsAt` del
 * servidor y formateada en la zona de la aplicación (nunca del reloj ni de la zona del navegador). Texto PROVISIONAL de la spec (D8-09, pendiente de Neo).
 * REQ-UX8-001, EDGE-008-019; SC-008-032, SC-008-033, SC-008-034.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { sceneRenewalDateText, scenePendingMessage } from '../../../src/presentation/web/scene-view.ts';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const render = (view: SceneViewData): string =>
  renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'escena-h1', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
const quota = (remaining: number, resetsAt: string): SceneViewData['quota'] => ({ max: 10, remaining, window: '2026-11', resetsAt });

describe('T1163 fecha de renovación (EDGE-008-019)', () => {
  it('[SC-008-032] el instante del servidor 2026-12-01T05:00Z (00:00 en America/Bogota) se dice «1 de diciembre»', () => {
    expect(sceneRenewalDateText('2026-12-01T05:00:00.000Z')).toBe('1 de diciembre');
  });

  it('[SC-008-032][EDGE-008-019] se formatea en la zona de la aplicación: 2027-01-01T05:00Z es «1 de enero» aunque en UTC-8 sería el 31 de diciembre', () => {
    expect(sceneRenewalDateText('2027-01-01T05:00:00.000Z')).toBe('1 de enero');
  });

  it('[EDGE-008-019] un instante ilegible no inventa fecha (null)', () => {
    expect(sceneRenewalDateText('no-es-una-fecha')).toBeNull();
  });
});

describe('T1163 scenePendingMessage (REQ-UX8-001)', () => {
  it('[SC-008-032] con pending >= 1 dice «este mes», el conteo y la fecha de renovación; sin «de por vida» ni «diario»', () => {
    const message = scenePendingMessage(sceneView({ pending: 2, quota: quota(7, '2026-12-01T05:00:00.000Z') }));
    expect(message?.remaining).toBe('Generaciones restantes este mes: 7. Se renuevan el 1 de diciembre.');
    expect(message?.remaining).not.toMatch(/de por vida|diari/i);
  });

  it('[SC-008-033] cuota agotada (0): conserva el texto con la fecha de renovación y no invita a regenerar', () => {
    const view = sceneView({ pending: 3, quota: quota(0, '2026-12-01T05:00:00.000Z'), actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason: 'QUOTA_EXHAUSTED', retryAfterSeconds: null } });
    const message = scenePendingMessage(view);
    expect(message?.remaining).toBe('Generaciones restantes este mes: 0. Se renuevan el 1 de diciembre.');
    expect(message?.changes).toBe('Hubo cambios en tu hogar o en tus mascotas.');
  });

  it('[SC-008-033] con pending = 0 no hay aviso (null)', () => {
    expect(scenePendingMessage(sceneView({ pending: 0, quota: quota(7, '2026-12-01T05:00:00.000Z') }))).toBeNull();
  });

  it('[EDGE-008-019] sin fecha legible queda solo la regla mensual, sin frase de renovación', () => {
    expect(scenePendingMessage(sceneView({ pending: 1, quota: quota(4, 'x') }))?.remaining).toBe('Generaciones restantes este mes: 4.');
  });

  it('[SC-008-034] el aria-label sigue con el conteo de cambios, no con la cuota', () => {
    expect(scenePendingMessage(sceneView({ pending: 2, quota: quota(7, '2026-12-01T05:00:00.000Z') }))?.ariaLabel).toBe('2 cambios pendientes');
  });
});

describe('T1163 SceneBlockView (SC-008-034)', () => {
  it('[SC-008-034] el bloque pinta la línea de cuota con la fecha y conserva el aria-label numérico', () => {
    const html = render(sceneView({ pending: 2, quota: quota(7, '2026-12-01T05:00:00.000Z') }));
    expect(html).toContain('<p class="text-sm text-slate-900">Generaciones restantes este mes: 7. Se renuevan el 1 de diciembre.</p>');
    expect(html).toContain('aria-label="2 cambios pendientes"');
  });

  it('[SC-008-033] con pending = 0 el bloque no menciona generaciones ni renovación', () => {
    const html = render(sceneView({ pending: 0 }));
    expect(html).not.toContain('Generaciones restantes');
    expect(html).not.toContain('Se renuevan');
  });
});
