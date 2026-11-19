/**
 * T1042 (007, Bloque E, [GH:#15]): la tarjeta oliva del panel derecho se titula «Estado de vacunación» y ya no contiene «Registrar peso»; la pestaña Peso conserva su formulario.
 * Sin jsdom: `PetDashboard` con `renderToStaticMarkup`. REQ-PAN7-001, REQ-PAN7-002, REQ-PAN7-003; SC-007-021, SC-007-022, SC-007-023.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import type { RecordModule } from '../../../src/presentation/web/records.ts';
import { dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const render = (role: 'OWNER' | 'READER', activeTab: RecordModule): string => renderToStaticMarkup(h(PetDashboard, { dashboard: dashboard(role), activeTab, onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
/** Marcado de la tarjeta del panel derecho (`<section aria-labelledby="alerts-title" …>…</section>`). */
const card = (markup: string): string => /<section aria-labelledby="alerts-title".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('T1042 tarjeta «Estado de vacunación» (REQ-PAN7-001..003)', () => {
  it('[SC-007-021] la tarjeta se titula «Estado de vacunación» y conserva el recuento de alertas', () => {
    const markup = card(render('OWNER', 'weights'));
    expect(markup).toContain('>Estado de vacunación</h3>');
    expect(markup).toContain('3 alertas activas');
    expect(markup).toContain('1 vencidas');
  });

  it('[SC-007-022] la tarjeta no contiene «Registrar peso» ni ningún botón (con permiso de escritura y con solo lectura)', () => {
    for (const role of ['OWNER', 'READER'] as const) {
      const markup = card(render(role, 'weights'));
      expect(markup).not.toContain('Registrar peso');
      expect(markup).not.toContain('<button');
    }
  });

  it('[SC-007-022] la pestaña Peso sí conserva su formulario «Registrar peso»', () => {
    const markup = render('OWNER', 'weights');
    expect(markup).toContain('Registrar peso');
    expect(markup).toContain('<form');
  });

  it('[SC-007-023][REQ-PAN7-003] «Alertas sanitarias» y las propiedades del botón retirado ya no existen en la ficha ni en el DOM', () => {
    expect(render('OWNER', 'weights')).not.toContain('Alertas sanitarias');
    const source = readFileSync('src/presentation/web/components/PetDashboard.tsx', 'utf8');
    expect(source).not.toContain('Alertas sanitarias');
    expect(source).not.toMatch(/canRegisterWeight|onRegisterWeight/);
  });

  it('[REQ-PAN7-003] el aria-labelledby de la tarjeta apunta a su título', () => {
    const markup = card(render('OWNER', 'weights'));
    expect(markup).toContain('aria-labelledby="alerts-title"');
    expect(markup).toContain('id="alerts-title"');
  });
});
