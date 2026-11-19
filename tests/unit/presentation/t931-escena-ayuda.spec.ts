/**
 * T931 (006, Fase 12; D6-20): textos de ayuda bajo «Actualizar imagen del hogar» y «Regenerar escena desde cero», asociados con `aria-describedby`, y diseño responsivo.
 * Sin jsdom (limitación OBS-3 de T923): `SceneBlockView` con `renderToStaticMarkup` e inspección de las clases de la fuente.
 * REQ-ESC6-019; NFR-ESC6-004; SC-ESC6-128, SC-ESC6-129, SC-ESC6-130.
 */
import { readFileSync } from 'node:fs';
import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneBlockView, type SceneBlockViewProps } from '../../../src/presentation/web/components/SceneBlock.tsx';
import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { HOUSEHOLD_ID, sceneView, sceneViewSinImagen } from './escena-fixtures.ts';

const UPDATE_HELP = 'Úsalo cuando quieras actualizar contenido sobre tu imagen actual.';
const REGENERATE_HELP = 'Úsalo cuando quieras generar una imagen totalmente nueva.';
const noop = (): void => undefined;

const props = (view: SceneViewData | null, overrides: Partial<SceneBlockViewProps> = {}): SceneBlockViewProps => ({
  idPrefix: 'escena-h1',
  scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID },
  view,
  status: view === null ? 'LOADING' : 'READY',
  error: null,
  busy: false,
  onUpdate: noop,
  onRegenerate: noop,
  ...overrides,
});
const render = (view: SceneViewData | null, overrides: Partial<SceneBlockViewProps> = {}): string => renderToStaticMarkup(h(SceneBlockView, props(view, overrides)));
const count = (html: string, text: string): number => html.split(text).length - 1;
const button = (html: string, label: string): string => html.match(new RegExp(`<button\\b[^>]*>${label}</button>`))?.[0] ?? '';
const describedBy = (tag: string): string[] => (tag.match(/aria-describedby="([^"]*)"/)?.[1] ?? '').split(' ').filter((x) => x !== '');
const paragraphWithText = (html: string, text: string): string => html.match(new RegExp(`<p\\b[^>]*>${text}</p>`))?.[0] ?? '';
const idOf = (tag: string): string => tag.match(/\sid="([^"]*)"/)?.[1] ?? '';

const withImage = sceneView({ status: 'outdated', pending: 2, actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null, retryAfterSeconds: null } });

describe('T931 textos de ayuda (SC-ESC6-128)', () => {
  it('[SC-ESC6-128] (a) con imagen y estado distinto de failed: cada texto aparece 1 vez, inmediatamente después de su botón', () => {
    const html = render(withImage);
    expect(count(html, UPDATE_HELP)).toBe(1);
    expect(count(html, REGENERATE_HELP)).toBe(1);
    const updateButton = button(html, 'Actualizar imagen del hogar');
    const regenerateButton = button(html, 'Regenerar escena desde cero');
    expect(updateButton).not.toBe('');
    expect(regenerateButton).not.toBe('');
    const afterUpdate = html.slice(html.indexOf(updateButton) + updateButton.length);
    expect(afterUpdate).toMatch(new RegExp(`^<p\\b[^>]*>${UPDATE_HELP}</p>`));
    const afterRegenerate = html.slice(html.indexOf(regenerateButton) + regenerateButton.length);
    expect(afterRegenerate).toMatch(new RegExp(`^<p\\b[^>]*>${REGENERATE_HELP}</p>`));
  });

  it('[SC-ESC6-128] (b) sin imagen vigente el botón de regenerar no se renderiza y su texto aparece 0 veces; el de actualizar sí', () => {
    const html = render(sceneViewSinImagen());
    expect(count(html, REGENERATE_HELP)).toBe(0);
    expect(html).not.toContain('Regenerar escena desde cero');
    expect(count(html, UPDATE_HELP)).toBe(1);
  });

  it('[SC-ESC6-128] (c) con estado failed el botón dice «Reintentar» y el texto de actualizar aparece 0 veces; el de regenerar sigue', () => {
    const html = render(sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' }));
    expect(button(html, 'Reintentar')).not.toBe('');
    expect(count(html, UPDATE_HELP)).toBe(0);
    expect(count(html, REGENERATE_HELP)).toBe(1);
  });

  it('[SC-ESC6-128] los textos siguen visibles con los botones deshabilitados (generando, cuota agotada, espera) y no repiten el motivo de deshabilitado', () => {
    const generating = render(sceneView({ status: 'generating' }));
    const noChanges = render(sceneView());
    const quota = render(sceneView({ status: 'outdated', pending: 1, quota: { max: 10, remaining: 0, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' }, actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'QUOTA_EXHAUSTED', retryAfterSeconds: null } }));
    const waiting = render(sceneView({ status: 'outdated', pending: 1, actions: { canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'COOLDOWN', retryAfterSeconds: 90 } }));
    for (const html of [generating, noChanges, quota, waiting]) {
      expect(count(html, UPDATE_HELP)).toBe(1);
      expect(count(html, REGENERATE_HELP)).toBe(1);
      expect(button(html, 'Actualizar imagen del hogar')).toMatch(/\sdisabled(=|\s|>)/);
    }
    const reason = noChanges.match(/<p id="escena-h1-reason"[^>]*>([^<]*)<\/p>/)?.[1] ?? '';
    expect(reason).not.toBe('');
    expect(reason).not.toBe(UPDATE_HELP);
    expect(reason).not.toBe(REGENERATE_HELP);
  });

  it('[SC-ESC6-128] con la vista aún sin cargar no hay ningún texto de ayuda', () => {
    const html = render(null);
    expect(count(html, UPDATE_HELP) + count(html, REGENERATE_HELP)).toBe(0);
  });
});

describe('T931 accesibilidad (SC-ESC6-129)', () => {
  it('[SC-ESC6-129] cada botón referencia por aria-describedby el id de su texto, que existe, está fuera del botón y no es alerta ni aria-live', () => {
    const html = render(withImage);
    const updateButton = button(html, 'Actualizar imagen del hogar');
    const regenerateButton = button(html, 'Regenerar escena desde cero');
    const updateHelp = paragraphWithText(html, UPDATE_HELP);
    const regenerateHelp = paragraphWithText(html, REGENERATE_HELP);
    expect(updateHelp).not.toBe('');
    expect(regenerateHelp).not.toBe('');
    expect(describedBy(updateButton)).toContain(idOf(updateHelp));
    expect(describedBy(regenerateButton)).toContain(idOf(regenerateHelp));
    expect(idOf(updateHelp)).not.toBe(idOf(regenerateHelp));
    expect(idOf(updateHelp)).not.toBe('');
    for (const help of [updateHelp, regenerateHelp]) {
      expect(help).not.toMatch(/role="|aria-live/);
      expect(updateButton).not.toContain(help);
      expect(regenerateButton).not.toContain(help);
    }
    expect(updateButton).not.toContain(UPDATE_HELP);
    expect(regenerateButton).not.toContain(REGENERATE_HELP);
  });

  it('[SC-ESC6-129] el botón de actualizar con motivo de deshabilitado combina ambos ids separados por un espacio, motivo primero', () => {
    const html = render(sceneView());
    const updateButton = button(html, 'Actualizar imagen del hogar');
    const ids = describedBy(updateButton);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('escena-h1-reason');
    expect(ids[1]).toBe(idOf(paragraphWithText(html, UPDATE_HELP)));
    expect(updateButton).toMatch(/aria-describedby="escena-h1-reason [^" ]+"/);
    expect(html).toContain('id="escena-h1-reason"');
  });

  it('[SC-ESC6-129] sin motivo de deshabilitado aria-describedby contiene solo el id de la ayuda; el de regenerar nunca incluye el motivo', () => {
    const html = render(withImage);
    expect(describedBy(button(html, 'Actualizar imagen del hogar'))).toEqual([idOf(paragraphWithText(html, UPDATE_HELP))]);
    expect(describedBy(button(html, 'Regenerar escena desde cero'))).toEqual([idOf(paragraphWithText(html, REGENERATE_HELP))]);
  });

  it('[SC-ESC6-129] con «Reintentar» el botón no referencia ninguna ayuda de actualizar (solo el motivo, si existe)', () => {
    const html = render(sceneView({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' }));
    const retry = button(html, 'Reintentar');
    expect(describedBy(retry).every((id) => html.includes(`id="${id}"`))).toBe(true);
    expect(describedBy(retry).some((id) => paragraphWithText(html, UPDATE_HELP).includes(`id="${id}"`))).toBe(false);
  });

  it('[SC-ESC6-129] con 2 instancias en la misma página los id son únicos y cada id referenciado existe', () => {
    const html = renderToStaticMarkup(h(Fragment, null, h(SceneBlockView, props(withImage, { idPrefix: 'escena-h1' })), h(SceneBlockView, props(withImage, { idPrefix: 'escena-h2' }))));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...html.matchAll(/aria-describedby="([^"]*)"/g)].flatMap((m) => m[1]!.split(' '));
    expect(refs).toHaveLength(4);
    for (const ref of refs) expect(ids).toContain(ref);
  });

  it('[SC-ESC6-129] el orden de tabulación sigue siendo actualizar y luego regenerar (orden del DOM, sin tabindex)', () => {
    const html = render(withImage);
    expect(html.indexOf('Actualizar imagen del hogar')).toBeGreaterThan(-1);
    expect(html.indexOf('Actualizar imagen del hogar')).toBeLessThan(html.indexOf('Regenerar escena desde cero'));
    expect(html).not.toMatch(/tabindex/i);
  });
});

describe('T931 responsive (SC-ESC6-130)', () => {
  const source = readFileSync('src/presentation/web/components/SceneBlock.tsx', 'utf8');
  const html = render(withImage);

  it('[SC-ESC6-130] el contenedor de acciones apila a 320 px y pasa a fila con salto a partir de sm (1024 y 1280 px)', () => {
    const container = html.match(/<div class="([^"]*)"><div class="[^"]*"><button[^>]*>Actualizar imagen del hogar/)?.[1] ?? '';
    expect(container).not.toBe('');
    const classes = container.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['flex', 'flex-col', 'sm:flex-row', 'sm:flex-wrap']));
  });

  it('[SC-ESC6-130] cada grupo (botón más texto) y cada texto usan min-w-0 y max-w-full para no desbordar', () => {
    for (const label of ['Actualizar imagen del hogar', 'Regenerar escena desde cero']) {
      const group = html.match(new RegExp(`<div class="([^"]*)"><button[^>]*>${label}`))?.[1] ?? '';
      expect(group.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
    }
    for (const text of [UPDATE_HELP, REGENERATE_HELP]) {
      const classes = paragraphWithText(html, text).match(/class="([^"]*)"/)?.[1]?.split(' ') ?? [];
      expect(classes).toEqual(expect.arrayContaining(['text-sm', 'text-slate-800', 'min-w-0', 'max-w-full']));
    }
  });

  it('[SC-ESC6-130] el color del texto (slate-800 sobre blanco) cumple contraste ≥ 4.5:1', () => {
    const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const slate800 = lum(0x1e, 0x29, 0x3b);
    const white = lum(255, 255, 255);
    expect((white + 0.05) / (slate800 + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(paragraphWithText(html, UPDATE_HELP)).toContain('text-slate-800');
  });

  it('[SC-ESC6-130] la fuente no fija anchos en píxeles ni overflow oculto en los grupos de ayuda', () => {
    const block = source.slice(source.indexOf('Actualizar imagen del hogar') - 900, source.indexOf('Regenerar escena desde cero') + 900);
    expect(block).not.toMatch(/\bw-\[\d+px\]|\bwhitespace-nowrap|\btruncate\b|overflow-hidden/);
  });
});
