/**
 * T936 (006, Fase 13; D6-21): botón único de generación en «Escena del hogar». Etiqueta por estado, siempre `POST generate` con `action = REGENERATE`, habilitación por
 * `canRegenerate` sin leer `NO_CHANGES` ni `canUpdate`, motivos de deshabilitado, accesibilidad y responsivo. Sin jsdom (limitación OBS-3 de T923): `SceneBlockView` con
 * `renderToStaticMarkup`, inspección de la fuente del contenedor y cliente HTTP con `fetch` simulado (0 llamadas de red).
 * REQ-ESC6-019, REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-034; NFR-ESC6-004; SC-ESC6-131, SC-ESC6-132, SC-ESC6-133.
 */
import { readFileSync } from 'node:fs';
import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView, type SceneBlockViewProps } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { createSceneApi, type SceneBlockedReason, type SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { sceneGenerateState } from '../../../src/presentation/web/scene-view.ts';
import { HOUSEHOLD_ID, sceneView, sceneViewSinImagen } from './escena-fixtures.ts';

const noop = (): void => undefined;
const BLOCK_SOURCE = readFileSync('src/presentation/web/components/SceneBlock.tsx', 'utf8');
const VIEW_SOURCE = readFileSync('src/presentation/web/scene-view.ts', 'utf8');
const IDLE_TEXT = 'Agrega una mascota o la foto del hogar para crear la imagen.';
const OLD_STRINGS = ['Actualizar imagen del hogar', 'Regenerar escena desde cero', 'Úsalo cuando quieras actualizar contenido sobre tu imagen actual.', 'Úsalo cuando quieras generar una imagen totalmente nueva.', 'No hay cambios pendientes desde la última imagen.'];

const props = (view: SceneViewData | null, overrides: Partial<SceneBlockViewProps> = {}): SceneBlockViewProps => ({
  idPrefix: 'escena-h1',
  scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID },
  view,
  status: view === null ? 'LOADING' : 'READY',
  error: null,
  busy: false,
  onRegenerate: noop,
  ...overrides,
});
const render = (view: SceneViewData | null, overrides: Partial<SceneBlockViewProps> = {}): string => renderToStaticMarkup(h(SceneBlockView, props(view, overrides)));
const buttons = (html: string): string[] => html.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? [];
const labelOf = (tag: string): string => tag.match(/>([^<]*)<\/button>$/)?.[1] ?? '';
const attrs = (tag: string): string => tag.replace(/class="[^"]*"/, '');
const isDisabled = (tag: string): boolean => /\sdisabled(=|\s|>)/.test(attrs(tag));
const describedBy = (tag: string): string[] => (tag.match(/aria-describedby="([^"]*)"/)?.[1] ?? '').split(' ').filter((x) => x !== '');
const actions = (blockedReason: SceneBlockedReason | null, canRegenerate: boolean, retryAfterSeconds: number | null = null): SceneViewData['actions'] => ({ canUpdate: false, canRegenerate, canUploadHouseholdPhoto: true, blockedReason, retryAfterSeconds });

describe('T936 etiqueta única por estado (SC-ESC6-131)', () => {
  it('[SC-ESC6-131] (a) imageTag = null y estado distinto de failed: exactamente 1 botón «Crear imagen del hogar»', () => {
    for (const status of ['outdated', 'ready'] as const) {
      const found = buttons(render(sceneView({ imageTag: null, status })));
      expect(found.map(labelOf)).toEqual(['Crear imagen del hogar']);
    }
  });

  it('[SC-ESC6-131] (b) imageTag no nulo y estado distinto de failed: exactamente 1 botón «Regenerar imagen del hogar»', () => {
    for (const status of ['idle', 'outdated', 'generating', 'ready'] as const) {
      expect(buttons(render(sceneView({ status }))).map(labelOf)).toEqual(['Regenerar imagen del hogar']);
    }
  });

  it('[SC-ESC6-131] (c) con status failed, con o sin imagen: exactamente 1 botón «Reintentar»', () => {
    expect(buttons(render(sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' }))).map(labelOf)).toEqual(['Reintentar']);
    expect(buttons(render(sceneView({ status: 'failed', imageTag: null, lastError: 'ERR-SCENE-GENERATION-FAILED' }))).map(labelOf)).toEqual(['Reintentar']);
  });

  it('[SC-ESC6-131] la función pura entrega la misma etiqueta y precedencia failed > imagen > creación', () => {
    expect(sceneGenerateState(sceneView({ imageTag: null, status: 'ready' })).label).toBe('Crear imagen del hogar');
    expect(sceneGenerateState(sceneView()).label).toBe('Regenerar imagen del hogar');
    expect(sceneGenerateState(sceneView({ status: 'failed' })).label).toBe('Reintentar');
    expect(sceneGenerateState(sceneView({ status: 'failed', imageTag: null })).label).toBe('Reintentar');
  });

  it('[SC-ESC6-131] las cadenas viejas aparecen 0 veces en el DOM (todos los estados) y en la fuente de SceneBlock.tsx y scene-view.ts', () => {
    const views = [sceneView(), sceneView({ status: 'failed' }), sceneViewSinImagen(), sceneView({ status: 'generating' }), sceneView({ actions: actions('ROLE', false) }), sceneView({ actions: actions('COOLDOWN', false, 90) })];
    for (const view of views) for (const old of OLD_STRINGS) expect(render(view)).not.toContain(old);
    for (const source of [BLOCK_SOURCE, VIEW_SOURCE]) for (const old of OLD_STRINGS) expect(source).not.toContain(old);
  });

  it('[SC-ESC6-131] se eliminan SCENE_UPDATE_HELP_TEXT, SCENE_REGENERATE_HELP_TEXT, la propiedad onUpdate y sceneUpdateState', () => {
    for (const source of [BLOCK_SOURCE, VIEW_SOURCE]) expect(source).not.toMatch(/SCENE_UPDATE_HELP_TEXT|SCENE_REGENERATE_HELP_TEXT|onUpdate|sceneUpdateState/);
    expect(BLOCK_SOURCE).not.toMatch(/update-help|regenerate-help/);
  });

  it('[SC-ESC6-131] no hay ningún párrafo de ayuda bajo el botón: el único texto junto a él es el motivo de deshabilitado, ausente si está habilitado', () => {
    const html = render(sceneView());
    expect(html).not.toMatch(/-help"/);
    expect(html).not.toContain('Úsalo cuando');
    expect(html).not.toContain('id="escena-h1-reason"');
  });

  it('[SC-ESC6-131] con la vista aún sin cargar no hay ningún botón de generación', () => {
    expect(buttons(render(null))).toEqual([]);
  });
});

describe('T936 un clic, un POST REGENERATE (SC-ESC6-132)', () => {
  it('[SC-ESC6-132] el contenedor conecta el botón solo a run(REGENERATE), con clave nueva por clic y sin ninguna acción UPDATE', () => {
    expect(BLOCK_SOURCE).toMatch(/onRegenerate=\{\(\) => void run\('REGENERATE'\)\}/);
    expect(BLOCK_SOURCE).toMatch(/api\.generate\(stable, action, newKey\(\)\)/);
    expect(BLOCK_SOURCE).toMatch(/const newKey = \(\): string => crypto\.randomUUID\(\)/);
    expect(BLOCK_SOURCE).not.toContain("'UPDATE'");
    expect(BLOCK_SOURCE).not.toContain('"UPDATE"');
  });

  it('[SC-ESC6-132] el cliente emite 1 POST a /households/{id}/scene/generate (y /me/…) con cuerpo {"action":"REGENERATE"} y la Idempotency-Key recibida; 0 con UPDATE', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createSceneApi(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(sceneView({ status: 'generating' })), { status: 200, headers: { 'content-type': 'application/json' } });
    }, '/api');
    const k1 = '11111111-1111-4111-8111-111111111111';
    const k2 = '22222222-2222-4222-8222-222222222222';
    await api.generate({ kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, 'REGENERATE', k1);
    await api.generate({ kind: 'OWNER' }, 'REGENERATE', k2);
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([['POST', `/api/households/${HOUSEHOLD_ID}/scene/generate`], ['POST', '/api/me/scene/generate']]);
    expect(calls.map((c) => c.init.body)).toEqual(['{"action":"REGENERATE"}', '{"action":"REGENERATE"}']);
    expect(calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key'])).toEqual([k1, k2]);
    expect(calls.filter((c) => String(c.init.body).includes('UPDATE'))).toHaveLength(0);
  });

  it('[SC-ESC6-132] (a) ready sin cambios con canUpdate = false y NO_CHANGES, (b) outdated con imagen, (c) failed y (d) outdated sin imagen: botón habilitado con canRegenerate', () => {
    const cases = [
      sceneView(),
      sceneView({ status: 'outdated', pending: 2, stale: true, actions: { ...actions(null, true), canUpdate: true } }),
      sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' }),
      sceneView({ status: 'outdated', imageTag: null, pending: 1 }),
    ];
    for (const view of cases) {
      const found = buttons(render(view));
      expect(found).toHaveLength(1);
      expect(isDisabled(found[0]!)).toBe(false);
      expect(sceneGenerateState(view)).toMatchObject({ disabled: false, reason: null });
    }
  });

  it('[SC-ESC6-132] NO_CHANGES y canUpdate no deshabilitan ni muestran texto alguno', () => {
    const view = sceneView({ actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES', retryAfterSeconds: null } });
    expect(sceneGenerateState(view)).toEqual({ label: 'Regenerar imagen del hogar', disabled: false, reason: null });
    expect(render(view)).not.toContain('No hay cambios pendientes');
    const withUpdate = sceneView({ actions: { canUpdate: true, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'ROLE', retryAfterSeconds: null } });
    expect(sceneGenerateState(withUpdate).disabled).toBe(true);
  });

  it.each([
    ['ROLE', 'Solo el propietario del hogar o un administrador puede crear la imagen.'],
    ['CONSENT_REQUIRED', 'Falta tu consentimiento para enviar fotos al servicio de inteligencia artificial.'],
    ['GENERATING', 'La imagen se está generando; espera a que termine.'],
  ] as const)('[SC-ESC6-132] blockedReason %s con canRegenerate = false: deshabilitado con su motivo visible', (reason, text) => {
    const view = sceneView({ actions: actions(reason, false) });
    expect(sceneGenerateState(view)).toMatchObject({ disabled: true, reason: text });
    const html = render(view);
    expect(isDisabled(buttons(html)[0]!)).toBe(true);
    expect(html).toContain(`<p id="escena-h1-reason"`);
    expect(html).toContain(text);
  });

  it('[SC-ESC6-132] QUOTA_EXHAUSTED: deshabilitado con el motivo y la fecha de reinicio; la imagen se conserva', () => {
    const view = sceneView({ status: 'outdated', quota: { max: 10, remaining: 0, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' }, actions: actions('QUOTA_EXHAUSTED', false) });
    const state = sceneGenerateState(view);
    expect(state.disabled).toBe(true);
    expect(state.reason).toContain('1 dic 2026');
    expect(render(view)).toContain('src="/api/households');
  });

  it('[SC-ESC6-132] un estado generating deshabilita el botón con el motivo de generación', () => {
    const view = sceneView({ status: 'generating' });
    expect(sceneGenerateState(view)).toMatchObject({ disabled: true, reason: 'La imagen se está generando; espera a que termine.' });
    expect(isDisabled(buttons(render(view))[0]!)).toBe(true);
  });

  it('[SC-ESC6-132] status = idle: deshabilitado con «Agrega una mascota o la foto del hogar para crear la imagen.», aunque canRegenerate sea verdadero', () => {
    for (const view of [sceneView({ status: 'idle', imageTag: null }), sceneViewSinImagen()]) {
      expect(sceneGenerateState(view)).toEqual({ label: 'Crear imagen del hogar', disabled: true, reason: IDLE_TEXT });
      const html = render(view);
      expect(isDisabled(buttons(html)[0]!)).toBe(true);
      expect(html).toContain(IDLE_TEXT);
    }
  });

  it('[SC-ESC6-132] con retryAfterSeconds no nulo queda deshabilitado con el texto de espera, aun con canRegenerate verdadero; ROLE ignora la espera', () => {
    const waiting = sceneView({ actions: actions('NO_CHANGES', true, 30) });
    expect(sceneGenerateState(waiting)).toMatchObject({ disabled: true, reason: 'Espera 30 s para volver a intentarlo' });
    const html = render(waiting);
    expect(isDisabled(buttons(html)[0]!)).toBe(true);
    expect(html).toContain('Espera 30 s para volver a intentarlo');
    const cooldown = sceneGenerateState(sceneView({ actions: actions('COOLDOWN', false, 90) }));
    expect(cooldown).toMatchObject({ disabled: true, reason: 'Espera 2 min para volver a intentarlo' });
    expect(sceneGenerateState(sceneView({ actions: actions('ROLE', false, 30) })).reason).not.toContain('Espera');
  });

  it('[SC-ESC6-132] busy deshabilita el botón sin inventar un motivo', () => {
    const html = render(sceneView(), { busy: true });
    expect(isDisabled(buttons(html)[0]!)).toBe(true);
    expect(html).not.toContain('id="escena-h1-reason"');
  });
});

describe('T936 accesibilidad y responsivo (SC-ESC6-133)', () => {
  it('[SC-ESC6-133] con motivo el botón tiene aria-describedby solo con el id del motivo, que existe; sin motivo no tiene el atributo', () => {
    const blocked = render(sceneView({ actions: actions('ROLE', false) }));
    const button = buttons(blocked)[0]!;
    expect(describedBy(button)).toEqual(['escena-h1-reason']);
    expect(blocked).toContain('id="escena-h1-reason"');
    expect(buttons(render(sceneView()))[0]!).not.toContain('aria-describedby');
  });

  it('[SC-ESC6-133] con 2 instancias en la misma página los id son únicos y cada id referenciado existe', () => {
    const view = sceneView({ actions: actions('ROLE', false) });
    const html = renderToStaticMarkup(h(Fragment, null, h(SceneBlockView, props(view, { idPrefix: 'escena-h1' })), h(SceneBlockView, props(view, { idPrefix: 'escena-h2' }))));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...html.matchAll(/aria-describedby="([^"]*)"/g)].flatMap((m) => m[1]!.split(' '));
    // 011 (T1514, D11-07): cada imagen referencia además su etiqueta de IA (`-ia`).
    expect(refs).toEqual(['escena-h1-ia', 'escena-h1-reason', 'escena-h2-ia', 'escena-h2-reason']);
    for (const ref of refs) expect(ids).toContain(ref);
  });

  it('[SC-ESC6-133] el botón no lleva role="alert" ni aria-live, no hay tabindex y el único control de generación es el botón único', () => {
    const html = render(sceneView({ actions: actions('ROLE', false) }));
    const button = buttons(html)[0]!;
    expect(button).not.toMatch(/role="|aria-live/);
    expect(html).not.toMatch(/tabindex/i);
    expect(buttons(html)).toHaveLength(1);
  });

  it('[SC-ESC6-133] el contenedor de acciones apila a 320 px y pasa a fila con salto desde sm (1024 y 1280 px); el grupo conserva min-w-0 y max-w-full', () => {
    const html = render(sceneView({ actions: actions('ROLE', false) }));
    const container = html.match(/<div class="([^"]*)"><div class="([^"]*)"><button\b/);
    expect(container?.length).toBe(3);
    expect(container![1]!.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-col', 'sm:flex-row', 'sm:flex-wrap', 'min-w-0', 'max-w-full']));
    expect(container![2]!.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
  });

  it('[SC-ESC6-133] el motivo usa 14 px (text-sm) con slate-800 sobre blanco, contraste ≥ 4.5:1, y la fuente no fija anchos en px ni oculta desbordes', () => {
    const html = render(sceneView({ actions: actions('ROLE', false) }));
    const reason = html.match(/<p id="escena-h1-reason"[^>]*>/)?.[0] ?? '';
    expect(reason).toContain('text-sm');
    expect(reason).toContain('text-slate-800');
    expect(reason).toContain('max-w-full');
    const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    expect((lum(255, 255, 255) + 0.05) / (lum(0x1e, 0x29, 0x3b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(BLOCK_SOURCE).not.toMatch(/\bw-\[\d+px\]|\bwhitespace-nowrap|\btruncate\b|overflow-hidden/);
  });

  it('[SC-ESC6-133] la cuenta atrás con relectura al llegar a 0 y el sondeo de 3 s siguen en el contenedor', () => {
    expect(BLOCK_SOURCE).toMatch(/return startCooldownCountdown\(\{ seconds: [^}]*scheduler: browserScheduler/);
    expect(BLOCK_SOURCE).toMatch(/pollerRef\.current\?\.start\(\)/);
  });

  it('[SC-ESC6-133] con waitSeconds la vista pinta el contador en el motivo; sin él usa el valor de la vista, y el motivo sigue enlazado por aria-describedby', () => {
    const view = sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED', actions: actions('COOLDOWN', false, 45) });
    const live = render(view, { waitSeconds: 44 });
    expect(live).toContain('Espera 44 s para volver a intentarlo');
    expect(describedBy(buttons(live)[0] ?? '')).toEqual(['escena-h1-reason']);
    expect(render(view)).toContain('Espera 45 s para volver a intentarlo');
  });
});
