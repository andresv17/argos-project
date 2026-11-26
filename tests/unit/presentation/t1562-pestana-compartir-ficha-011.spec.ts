/**
 * T1562 (011, [GH:#64]): pestaña propia «Compartir» en la ficha de mascota. REQ-PET11-001; SC-011-063.
 * @implements REQ-PET11-001 SC-011-063
 * La pestaña es la última (8 en total), existe solo con `shareSlot` (la página lo pasa a OWNER/ADMIN) y fuera de la edición; «Historial / Archivos» conserva
 * solo `mediaSlot` (sin controles de compartir). Sin jsdom: `renderToStaticMarkup` e inspección de las fuentes.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { nextFocusIndex } from '../../../src/presentation/web/view-model.ts';
import { dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const MEDIA = h('p', null, 'RANURA-ARCHIVOS');
const SHARE = h('p', null, 'RANURA-COMPARTIR');
const ORDER = ['Peso', 'Medidas', 'Vacunas', 'Desparasitación', 'Consultas', 'Parámetros', 'Historial / Archivos', 'Compartir'];
const DASH = readFileSync('src/presentation/web/components/PetDashboard.tsx', 'utf8');
const PAGE = readFileSync('src/presentation/web/pages/PetsPage.tsx', 'utf8');
const render = (activeTab: string, extra: Record<string, unknown> = {}, role: 'OWNER' | 'ADMIN' | 'READER' = 'OWNER'): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: dashboard(role), activeTab, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop, mediaSlot: MEDIA, shareSlot: SHARE, ...extra } as never));
const tabs = (markup: string): string[] => [...markup.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]!);
const tabpanel = (markup: string): string => /<section[^>]*role="tabpanel".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('T1562 pestaña Compartir (REQ-PET11-001; SC-011-063)', () => {
  it('[SC-011-063] con shareSlot hay 8 pestañas y «Compartir» es la última, tras «Historial / Archivos»', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) expect(tabs(render('weights', {}, role))).toEqual(ORDER);
  });

  it('[SC-011-063] sin shareSlot (rol sin permiso) no hay pestaña «Compartir» y quedan 7', () => {
    expect(tabs(render('weights', { shareSlot: undefined }, 'READER'))).toEqual(ORDER.slice(0, 7));
  });

  it('[SC-011-063] en modo edición (editSlot) no hay pestaña «Compartir»', () => {
    const markup = render('weights', { editSlot: h('p', null, 'FORM') });
    expect(tabs(markup)).toEqual(ORDER.slice(0, 6));
    expect(markup).not.toContain('Compartir');
  });

  it('[SC-011-063] con share activa el tabpanel enlaza con su pestaña y contiene solo shareSlot', () => {
    const markup = render('share');
    const panel = tabpanel(markup);
    expect(panel).toContain('id="module-panel-share"');
    expect(panel).toContain('aria-labelledby="module-tab-share"');
    expect(panel).toContain('RANURA-COMPARTIR');
    expect(panel).not.toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('<form');
    expect(/id="module-tab-share"[^>]*aria-selected="true"/.test(markup)).toBe(true);
    expect(/id="module-tab-share"[^>]*aria-controls="module-panel-share"/.test(markup)).toBe(true);
  });

  it('[SC-011-063] «Historial / Archivos» solo trae mediaSlot, sin la ranura de compartir', () => {
    const panel = tabpanel(render('history'));
    expect(panel).toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('RANURA-COMPARTIR');
    expect(panel).not.toContain('Compartir');
  });

  it('[SC-011-063] si share está activa sin pestaña (sin shareSlot o en edición) se muestra Peso, no un panel vacío', () => {
    for (const extra of [{ shareSlot: undefined }, { editSlot: h('p', null, 'FORM') }]) {
      const markup = render('share', extra);
      expect(markup).toContain('id="module-panel-weights"');
      expect(markup).not.toContain('module-panel-share');
    }
  });

  it('[SC-011-063] el teclado recorre las 8 pestañas con vuelta circular', () => {
    expect(nextFocusIndex('End', 0, 8)).toBe(7);
    expect(nextFocusIndex('Home', 7, 8)).toBe(0);
    expect(nextFocusIndex('ArrowRight', 7, 8)).toBe(0);
    expect(nextFocusIndex('ArrowLeft', 0, 8)).toBe(7);
    expect(DASH).toMatch(/nextFocusIndex\(event\.key, index, tabs\.length\)/);
  });
});

describe('T1562 PetsPage: ShareLinksPanel fuera de mediaSlot (REQ-PET11-001)', () => {
  const mediaStart = PAGE.indexOf('mediaSlot={');
  const shareStart = PAGE.indexOf('shareSlot:');
  const media = PAGE.slice(mediaStart, shareStart);

  it('[SC-011-063] mediaSlot contiene ClinicalFilesPanel y no ShareLinksPanel (el álbum vive en su pestaña, T1566)', () => {
    expect(mediaStart).toBeGreaterThan(0);
    expect(shareStart).toBeGreaterThan(mediaStart);
    expect(media).toContain('ClinicalFilesPanel');
    expect(media).not.toContain('ShareLinksPanel');
  });

  it('[SC-011-063] shareSlot se pasa solo a OWNER/ADMIN con el mismo ShareLinksPanel y sin el texto «¿Qué quieres compartir?» fuera del panel', () => {
    const after = PAGE.slice(shareStart - 200, shareStart + 500);
    expect(after).toMatch(/myRole === 'OWNER' \|\| dashboard\.myRole === 'ADMIN'/);
    expect(after).toContain('<ShareLinksPanel');
    expect(after).toContain('household={shareHousehold}');
    expect(PAGE).not.toContain('¿Qué quieres compartir?');
  });
});
