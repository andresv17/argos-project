/**
 * T1037 (007, Bloque B, [GH:#12]): séptima pestaña «Historial / Archivos» del `tablist`. Siete pestañas en orden, panel `history` solo con `mediaSlot`, sin «Registrar», sin sección
 * final duplicada, flechas/`Home`/`End` sobre siete y `editSlot` definido sin pestaña. Sin jsdom: `renderToStaticMarkup` e inspección de la fuente.
 * REQ-PES7-001, REQ-PES7-002, REQ-PES7-003, EDGE-007-003; SC-007-005, SC-007-006, SC-007-007.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { nextFocusIndex } from '../../../src/presentation/web/view-model.ts';
import { dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const SLOT = h('p', null, 'RANURA-ARCHIVOS');
const ORDER = ['Peso', 'Medidas', 'Vacunas', 'Desparasitación', 'Consultas', 'Parámetros', 'Historial / Archivos'];
const SOURCE = readFileSync('src/presentation/web/components/PetDashboard.tsx', 'utf8');
type Role = 'OWNER' | 'READER';
const render = (activeTab: string, extra: Record<string, unknown> = {}, role: Role = 'OWNER'): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: dashboard(role), activeTab, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop, mediaSlot: SLOT, ...extra } as never));
const tabs = (markup: string): string[] => [...markup.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]!);
const tabpanel = (markup: string): string => /<section[^>]*role="tabpanel".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('T1037 siete pestañas en orden (REQ-PES7-001; SC-007-005)', () => {
  it('[SC-007-005] con mediaSlot el tablist tiene 7 pestañas y «Historial / Archivos» es la última, tras Parámetros', () => {
    expect(tabs(render('weights'))).toEqual(ORDER);
  });

  it('[EDGE-007-003] sin mediaSlot la pestaña no se muestra (6 pestañas)', () => {
    expect(tabs(render('weights', { mediaSlot: undefined }))).toEqual(ORDER.slice(0, 6));
  });

  it('[EDGE-007-003] con editSlot definido (edición de la mascota) no hay pestaña «Historial / Archivos»', () => {
    const markup = render('weights', { editSlot: h('p', null, 'FORM') });
    expect(tabs(markup)).toEqual(ORDER.slice(0, 6));
    expect(markup).not.toContain('Historial / Archivos');
  });

  it('[REQ-PES7-003] la pestaña activa por defecto sigue siendo Peso y solo la activa es enfocable (tabindex 0)', () => {
    const markup = render('weights');
    expect(markup.match(/role="tab"/g)).toHaveLength(7);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(/id="module-tab-weights"[^>]*aria-selected="true"/.test(markup)).toBe(true);
    // Solo las pestañas (el `<input type="date">` oculto del calendario de la fecha también lleva tabindex -1 y no es una pestaña).
    expect((markup.match(/<[^>]*role="tab"[^>]*>/g) ?? []).filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(6);
  });
});

describe('T1037 panel history (REQ-PES7-002; SC-007-006)', () => {
  it('[SC-007-006] con history activa el tabpanel enlaza con su pestaña, contiene solo mediaSlot y ningún formulario ni «Registrar»', () => {
    const markup = render('history');
    const panel = tabpanel(markup);
    expect(panel).toContain('id="module-panel-history"');
    expect(panel).toContain('aria-labelledby="module-tab-history"');
    expect(panel).toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('<form');
    expect(panel).not.toContain('<details');
    expect(panel).not.toContain('Registrar');
    expect(markup).not.toContain('Registrar');
    expect(/id="module-tab-history"[^>]*aria-selected="true"/.test(markup)).toBe(true);
  });

  it('[SC-007-006] con history activa tampoco hay lista de registros ni «Sin registros» del módulo anterior', () => {
    const panel = tabpanel(render('history'));
    expect(panel).not.toContain('Sin registros');
    expect(panel).not.toContain('<table');
  });

  it('[SC-007-006] la ranura no se pinta en las pestañas de módulos y no hay ningún h3 «Historial / Archivos» ni sección final', () => {
    for (const tab of ['weights', 'vaccinations', 'customParameters']) {
      const markup = render(tab);
      expect(markup).not.toContain('RANURA-ARCHIVOS');
      expect(markup).not.toContain('history-files-title');
      expect(markup).not.toMatch(/<h3[^>]*>\s*Historial \/ Archivos/);
    }
    expect(render('history')).not.toContain('history-files-title');
  });

  it('[SC-007-006] «Registrar»: con permiso de solo lectura, history sigue mostrando la ranura sin formulario', () => {
    const panel = tabpanel(render('history', {}, 'READER'));
    expect(panel).toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('<form');
  });

  it('[REQ-PES7-002] si history está activa pero no hay pestaña (editSlot o sin mediaSlot) se muestra el módulo Peso, no un panel vacío', () => {
    for (const extra of [{ mediaSlot: undefined }, { editSlot: h('p', null, 'FORM') }]) {
      const markup = render('history', extra);
      expect(markup).toContain('id="module-panel-weights"');
      expect(markup).not.toContain('module-panel-history');
    }
  });
});

describe('T1037 teclado sobre siete pestañas (REQ-PES7-003; SC-007-007)', () => {
  it('[SC-007-007] flechas, Home y End recorren 7 pestañas con vuelta circular', () => {
    expect(nextFocusIndex('End', 0, 7)).toBe(6);
    expect(nextFocusIndex('Home', 6, 7)).toBe(0);
    expect(nextFocusIndex('ArrowRight', 6, 7)).toBe(0);
    expect(nextFocusIndex('ArrowLeft', 0, 7)).toBe(6);
  });

  it('[SC-007-007] el manejador del tablist usa el número real de pestañas, no RECORD_MODULES.length', () => {
    expect(SOURCE).not.toMatch(/nextFocusIndex\(event\.key, index, RECORD_MODULES\.length\)/);
    expect(SOURCE).toMatch(/nextFocusIndex\(event\.key, index, tabs\.length\)/);
  });

  it('[REQ-PES7-003][NFR-007-002] al cambiar de pestaña la activa se desplaza dentro del tablist (con 7 pestañas el tablist desborda a 1024 px y la negrita ensancha la activa; hallazgo del E2E de T1040)', () => {
    expect(SOURCE).toMatch(/scrollIntoView\(\{[^}]*inline: 'nearest'/);
    expect(SOURCE).toMatch(/block: 'nearest'/);
  });

  it('[REQ-PES7-001] RECORD_MODULES no se modifica: el historial es una pestaña extra del render (ADR-007-02)', () => {
    const records = readFileSync('src/presentation/web/records.ts', 'utf8');
    expect(records).not.toMatch(/history|Historial/);
  });
});
