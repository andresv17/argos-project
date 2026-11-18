/**
 * T875 (006, Fase 7, pruebas rojas de presentación; WCAG 2.1 AA): bloque «Escena del hogar». Imagen con texto alternativo que cuenta las mascotas, estado en
 * región `aria-live`, «cambios pendientes: P · generaciones restantes: R», «Se muestran N de M mascotas», aviso «desactualizada», botón «Actualizar imagen del
 * hogar» deshabilitado con motivo visible y asociado, «Regenerar escena desde cero» (secundaria), sondeo único cada 3 s y ningún dato personal ni URL firmada en el DOM.
 * REQ-ESC6-005, REQ-ESC6-019, REQ-ESC6-021; NFR-ESC6-003, NFR-ESC6-004; SC-ESC6-014, SC-ESC6-015, SC-ESC6-029, SC-ESC6-030.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SceneBlockView, type SceneBlockViewProps } from '../../../src/presentation/web/components/SceneBlock.tsx';
import {
  ARGOS_SCENE_POLL_SECONDS,
  createScenePoller,
  sceneAltText,
  sceneImagePath,
  scenePendingText,
  scenePetsShownText,
  sceneProblemMessage,
  sceneStatusText,
  sceneUpdateState,
} from '../../../src/presentation/web/scene-view.ts';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, IMAGE_TAG, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
function render(view: SceneViewData | null, overrides: Partial<SceneBlockViewProps> = {}): string {
  const props: SceneBlockViewProps = {
    idPrefix: 'escena-h1',
    scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID },
    view,
    status: view === null ? 'LOADING' : 'READY',
    error: null,
    busy: false,
    onUpdate: noop,
    onRegenerate: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(SceneBlockView, props));
}

/** Atributos del botón sin la clase (Tailwind lleva «disabled:opacity-60»). */
const attrs = (button: string): string => button.replace(/class="[^"]*"/, '');
const isDisabled = (button: string): boolean => /\sdisabled(=|\s|>)/.test(attrs(button));

describe('T875 textos y reglas puras (REQ-ESC6-005, REQ-ESC6-019)', () => {
  it('[SC-ESC6-029] texto alternativo con el número de mascotas, singular y plural', () => {
    expect(sceneAltText(3)).toBe('Escena del hogar en pixel art con 3 mascotas');
    expect(sceneAltText(1)).toBe('Escena del hogar en pixel art con 1 mascota');
    expect(sceneAltText(0)).toBe('Escena del hogar en pixel art sin mascotas');
  });

  it('[SC-ESC6-029][REQ-ESC6-005] «cambios pendientes: P · generaciones restantes: R» y «Se muestran N de M mascotas» solo si M > N', () => {
    expect(scenePendingText(sceneView({ pending: 2, quota: { max: 10, remaining: 7, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' } }))).toBe('cambios pendientes: 2 · generaciones restantes: 7');
    expect(scenePetsShownText({ shown: 8, total: 11, maxPets: 8 })).toBe('Se muestran 8 de 11 mascotas');
    expect(scenePetsShownText({ shown: 3, total: 3, maxPets: 8 })).toBeNull();
  });

  it('[SC-ESC6-014][SC-ESC6-015] el botón Actualizar se habilita solo con canUpdate y, deshabilitado, dice el motivo de cada blockedReason', () => {
    expect(sceneUpdateState(sceneView({ actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null } }))).toEqual({ disabled: false, reason: null });
    const reasons = (['NO_CHANGES', 'QUOTA_EXHAUSTED', 'GENERATING', 'CONSENT_REQUIRED', 'ROLE', 'COOLDOWN'] as const).map((blockedReason) => sceneUpdateState(sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason } })));
    expect(reasons.every((r) => r.disabled && typeof r.reason === 'string' && r.reason.length > 10)).toBe(true);
    expect(new Set(reasons.map((r) => r.reason)).size).toBe(6);
    expect(reasons[1]?.reason).toContain('1 dic 2026'); // la fecha de reinicio de la cuota (D6-03)
  });

  it('[REQ-ESC6-019] un estado por cada valor de SceneStatus y el aviso «desactualizada» con imagen vigente', () => {
    const texts = (['idle', 'outdated', 'generating', 'ready', 'failed'] as const).map((status) => sceneStatusText(sceneView({ status, lastError: status === 'failed' ? 'ERR-SCENE-GENERATION-FAILED' : null })));
    expect(new Set(texts).size).toBe(5);
    expect(texts[2]).toMatch(/Generando/);
  });

  it('[INV-ESC6-016][NFR-ESC6-003] los mensajes de error son textos estables por código: nunca el detalle del servidor ni datos personales', () => {
    for (const code of ['ERR-SCENE-CONSENT-REQUIRED', 'ERR-SCENE-QUOTA-EXCEEDED', 'ERR-SCENE-NOTICE-OUTDATED', 'ERR-RATE-LIMITED', 'ERR-ACC-FORBIDDEN', 'ERR-HOUSE-NOT-FOUND', 'ERR-INTERNAL-UNEXPECTED', 'ERR-NO-EXISTE']) {
      const text = sceneProblemMessage(code, 42);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/prompt|Luna|gemini|googleapis|stack/i);
    }
    expect(sceneProblemMessage('ERR-RATE-LIMITED', 42)).toContain('42');
    expect(sceneProblemMessage('ERR-NO-EXISTE')).toBe(sceneProblemMessage('ERR-INTERNAL-UNEXPECTED'));
  });

  it('[INV-ESC6-019][REQ-ESC6-019] la imagen se pide a la ruta del ámbito con v = imageTag (etiqueta de caché): ruta propia, nunca una URL firmada', () => {
    expect(sceneImagePath({ kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, IMAGE_TAG)).toBe(`/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}`);
    expect(sceneImagePath({ kind: 'OWNER' }, IMAGE_TAG)).toBe(`/api/me/scene/image?v=${IMAGE_TAG}`);
    expect(sceneImagePath({ kind: 'OWNER' }, null)).toBeNull();
  });
});

describe('T875 bloque «Escena del hogar» (REQ-ESC6-019, NFR-ESC6-004)', () => {
  it('[SC-ESC6-029] imagen con alt de N mascotas, cambios y cuota, región aria-live y sin URL firmada ni parámetros X-Goog en el DOM', () => {
    const html = render(sceneView({ pending: 2, actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null }, status: 'outdated', stale: true }));
    expect(html).toContain(`src="/api/households/${HOUSEHOLD_ID}/scene/image?v=${IMAGE_TAG}"`);
    expect(html).toContain('alt="Escena del hogar en pixel art con 3 mascotas"');
    expect(html).toContain('cambios pendientes: 2 · generaciones restantes: 7');
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toMatch(/role="status"/);
    expect(html).not.toMatch(/googleapis|X-Goog|Signature|https?:\/\//i);
    expect(html).toContain('desactualizada');
  });

  it('[SC-ESC6-030] «Se muestran N de M mascotas» cuando hay más mascotas que las dibujadas', () => {
    expect(render(sceneView({ pets: { shown: 8, total: 11, maxPets: 8 } }))).toContain('Se muestran 8 de 11 mascotas');
    expect(render(sceneView())).not.toContain('Se muestran');
  });

  it('[SC-ESC6-014] «Actualizar imagen del hogar» deshabilitado con el motivo visible y asociado por aria-describedby; habilitado no lleva motivo', () => {
    const blocked = render(sceneView({ actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES' } }));
    const button = /<button[^>]*>Actualizar imagen del hogar<\/button>/.exec(blocked)?.[0] ?? '';
    expect(isDisabled(button)).toBe(true);
    const describedBy = /aria-describedby="([^"]+)"/.exec(button)?.[1] ?? '';
    expect(describedBy).not.toBe('');
    expect(blocked).toContain(`id="${describedBy}"`);
    const enabled = render(sceneView({ pending: 1, actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null } }));
    expect(isDisabled(/<button[^>]*>Actualizar imagen del hogar<\/button>/.exec(enabled)?.[0] ?? '')).toBe(false);
  });

  it('[SC-ESC6-015] «Regenerar escena desde cero» es la acción secundaria y se habilita con canRegenerate aunque no haya cambios', () => {
    const html = render(sceneView());
    const button = /<button[^>]*>Regenerar escena desde cero<\/button>/.exec(html)?.[0] ?? '';
    expect(button).not.toBe('');
    expect(isDisabled(button)).toBe(false);
    expect(button).toContain('border-primary'); // variante secundaria
    const roleBlocked = render(sceneView({ actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'ROLE' } }));
    expect(isDisabled(/<button[^>]*>Regenerar escena desde cero<\/button>/.exec(roleBlocked)?.[0] ?? '')).toBe(true);
  });

  it('[REQ-ESC6-019] failed muestra el mensaje estable y «Reintentar»; la cuota agotada conserva la imagen y dice cuándo se reinicia', () => {
    const failed = render(sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-TIMEOUT', actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null } }));
    expect(failed).toContain('Reintentar');
    expect(failed).toMatch(/role="alert"/);
    expect(failed).not.toMatch(/prompt|Luna|gemini/i);
    const exhausted = render(sceneView({ stale: true, status: 'outdated', quota: { max: 10, remaining: 0, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' }, actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'QUOTA_EXHAUSTED' } }));
    expect(exhausted).toContain('src="/api/households');
    expect(exhausted).toContain('1 dic 2026');
  });

  it('[NFR-ESC6-004] ids únicos con dos bloques en la misma página y todo aria-labelledby o describedby apunta a un elemento', () => {
    const markup = render(sceneView({ pending: 1 }), { idPrefix: 'a' }) + render(sceneView({ pending: 1 }), { idPrefix: 'b' });
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
    for (const m of markup.matchAll(/(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) expect(ids).toContain(m[1]);
  });

  it('[NFR-ESC6-004] reflujo y foco: sin ancho fijo en px, rejilla de una columna en móvil y clases de foco visible en los controles', () => {
    const html = render(sceneView({ pending: 1, actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null } }));
    expect(html).not.toMatch(/style="[^"]*width:\s*\d+px/);
    expect(html).toContain('max-w-full');
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain('focus-visible:ring-2');
  });

  it('[REQ-ESC6-019] cargando y con error de lectura: estado anunciado, sin imagen ni botones inventados', () => {
    expect(render(null)).toMatch(/role="status"[^>]*>[^<]*Cargando/);
    const error = render(null, { status: 'ERROR', error: sceneProblemMessage('ERR-INTERNAL-UNEXPECTED') });
    expect(error).toMatch(/role="alert"/);
    expect(error).not.toContain('Actualizar imagen del hogar');
  });

  it('[SC-ESC6-029] sin imagen vigente muestra un marcador textual (no una imagen rota) y la imagen se oculta ante un error de carga', () => {
    const html = render(sceneView({ imageTag: null, status: 'idle', actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES' } }));
    expect(html).not.toContain('<img');
    expect(html).toContain('Aún no hay imagen del hogar');
  });
});

describe('T875 sondeo único cada 3 s (REQ-ESC6-019, H-MIF-006-06)', () => {
  const fakeScheduler = () => {
    const queue: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
    return {
      queue,
      scheduler: { after: (run: () => void, ms: number) => { const entry = { run, ms, cancelled: false }; queue.push(entry); return () => { entry.cancelled = true; }; } },
      fire: async () => { const next = queue.filter((e) => !e.cancelled).shift(); if (next !== undefined) { queue.splice(queue.indexOf(next), 1); next.run(); await Promise.resolve(); await Promise.resolve(); } },
    };
  };

  it('[REQ-ESC6-019] ARGOS_SCENE_POLL_SECONDS = 3 y el sondeo se reprograma cada 3000 ms solo mientras generating; termina con ready', async () => {
    expect(ARGOS_SCENE_POLL_SECONDS).toBe(3);
    const s = fakeScheduler();
    const views = [sceneView({ status: 'generating' }), sceneView({ status: 'generating' }), sceneView({ status: 'ready' })];
    const seen: string[] = [];
    const fetchScene = vi.fn(async () => views.shift()!);
    const poller = createScenePoller({ fetchScene, onView: (v) => seen.push(v.status), onError: noop, scheduler: s.scheduler });
    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.queue.map((e) => e.ms)).toEqual([3000]);
    await s.fire();
    expect(s.queue.map((e) => e.ms)).toEqual([3000]);
    await s.fire();
    expect(seen).toEqual(['generating', 'generating', 'ready']);
    expect(s.queue).toEqual([]);
    expect(fetchScene).toHaveBeenCalledTimes(3);
  });

  it('[REQ-ESC6-019] un solo hilo por pestaña: start repetido no duplica el sondeo y stop cancela el temporizador pendiente', async () => {
    const s = fakeScheduler();
    const fetchScene = vi.fn(async () => sceneView({ status: 'generating' }));
    const poller = createScenePoller({ fetchScene, onView: noop, onError: noop, scheduler: s.scheduler });
    poller.start();
    poller.start();
    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchScene).toHaveBeenCalledTimes(1);
    expect(s.queue).toHaveLength(1);
    poller.stop();
    expect(s.queue[0]?.cancelled).toBe(true);
  });

  it('[NFR-ESC6-003] tras 3 errores seguidos el sondeo se detiene e informa el último error; no reintenta sin fin', async () => {
    const s = fakeScheduler();
    const errors: unknown[] = [];
    const poller = createScenePoller({ fetchScene: async () => { throw new Error('red'); }, onView: noop, onError: (e) => errors.push(e), scheduler: s.scheduler });
    poller.start();
    for (let i = 0; i < 5; i += 1) { await Promise.resolve(); await Promise.resolve(); await s.fire(); }
    expect(errors).toHaveLength(1);
    expect(s.queue.filter((e) => !e.cancelled)).toEqual([]);
  });
});
