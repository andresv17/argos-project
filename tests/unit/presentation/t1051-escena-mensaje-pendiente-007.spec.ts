/**
 * T1051 (007, Bloque F, [GH:#51]): `scenePendingMessage` sustituye a `scenePendingText`. Texto neutral decidido por Neo (D7-01 / EDGE-007-017), línea aparte de
 * «Generaciones restantes: R» y conteo numérico en el `aria-label`. Sin jsdom: `SceneBlockView` con `renderToStaticMarkup`.
 * REQ-ESC7-001, REQ-ESC7-002, EDGE-007-008, EDGE-007-017; SC-007-024, SC-007-025, SC-007-026.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { scenePendingMessage } from '../../../src/presentation/web/scene-view.ts';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const NEUTRAL = 'Hubo cambios en tu hogar o en tus mascotas. Puedes volver a generar tu hogar para ver los cambios.';
const NEUTRAL_SIN_INVITACION = 'Hubo cambios en tu hogar o en tus mascotas.';
const noop = (): void => undefined;
const render = (view: SceneViewData): string =>
  renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'escena-h1', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view, status: 'READY', error: null, busy: false, onRegenerate: noop }));
const quotaWith = (remaining: number): SceneViewData['quota'] => ({ max: 10, remaining, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' });

describe('T1051 scenePendingMessage (REQ-ESC7-001, REQ-ESC7-002)', () => {
  it('[SC-007-025][REQ-ESC7-001] pending = 0: sin aviso (null)', () => {
    expect(scenePendingMessage(sceneView({ pending: 0 }))).toBeNull();
  });

  it('[SC-007-024][REQ-ESC7-001] pending >= 1: texto neutral decidido por Neo y línea aparte de generaciones restantes', () => {
    expect(scenePendingMessage(sceneView({ pending: 2, quota: quotaWith(7) }))).toEqual({
      changes: NEUTRAL,
      remaining: 'Generaciones restantes: 7',
      ariaLabel: '2 cambios pendientes',
    });
  });

  it('[SC-007-024][REQ-ESC7-002] el conteo va en el aria-label, en singular con 1 cambio', () => {
    expect(scenePendingMessage(sceneView({ pending: 1 }))?.ariaLabel).toBe('1 cambio pendiente');
    expect(scenePendingMessage(sceneView({ pending: 5 }))?.ariaLabel).toBe('5 cambios pendientes');
  });

  it('[SC-007-024][EDGE-007-017] el caso de cambio de estado de vida usa el mismo texto neutral (sin afirmar «Actualizaste la foto»)', () => {
    const message = scenePendingMessage(sceneView({ pending: 1 }));
    expect(message?.changes).toBe(NEUTRAL);
    expect(message?.changes).not.toMatch(/Actualizaste|foto/);
  });

  it('[EDGE-007-008] cuota agotada o botón deshabilitado: el texto no invita a regenerar', () => {
    const blocked = (blockedReason: 'QUOTA_EXHAUSTED' | 'GENERATING' | 'COOLDOWN' | 'ROLE' | 'CONSENT_REQUIRED'): SceneViewData =>
      sceneView({ pending: 3, quota: quotaWith(0), actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason, retryAfterSeconds: null } });
    for (const reason of ['QUOTA_EXHAUSTED', 'GENERATING', 'COOLDOWN', 'ROLE', 'CONSENT_REQUIRED'] as const) {
      const message = scenePendingMessage(blocked(reason));
      expect(message?.changes).toBe(NEUTRAL_SIN_INVITACION);
      expect(message?.remaining).toBe('Generaciones restantes: 0');
    }
  });
});

describe('T1051 SceneBlockView (SC-007-024..026)', () => {
  it('[SC-007-024] con pending >= 1 renderiza el texto neutral, la línea de generaciones restantes aparte y el aria-label con el conteo', () => {
    const html = render(sceneView({ pending: 2, quota: quotaWith(7) }));
    expect(html).toContain(NEUTRAL);
    expect(html).toContain('<p class="text-sm text-slate-900">Generaciones restantes: 7</p>');
    expect(html).toContain('aria-label="2 cambios pendientes"');
  });

  it('[SC-007-025] con pending = 0 no hay aviso de cambios ni «Generaciones restantes»', () => {
    const html = render(sceneView({ pending: 0 }));
    expect(html).not.toContain('Hubo cambios');
    expect(html).not.toContain('Generaciones restantes');
    expect(html).not.toContain('cambios pendientes');
  });

  it('[SC-007-026] la cadena «cambios pendientes:» y scenePendingText ya no existen en src/presentation', () => {
    const sources = ['src/presentation/web/scene-view.ts', 'src/presentation/web/components/SceneBlock.tsx'].map((path) => readFileSync(path, 'utf8'));
    for (const source of sources) {
      expect(source).not.toContain('cambios pendientes:');
      expect(source).not.toContain('scenePendingText');
    }
  });
});
