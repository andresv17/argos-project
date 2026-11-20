/**
 * M2 (007, producto aprobado por Neo): la tarjeta «Estado de vacunación» de una mascota fallecida sigue visible y muestra «Sin alertas (fallecida)»
 * en lugar de «0 alertas activas» / «Todo al día». Sin jsdom: `PetDashboard` con `renderToStaticMarkup`. REQ-FAL7-004; SC-007-013.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
type View = ReturnType<typeof dashboard>;
const withLife = (lifeStatus: 'ALIVE' | 'DECEASED', totalActiveAlerts: number): View => {
  const base = dashboard('OWNER');
  return {
    ...base,
    profile: { ...base.profile, lifeStatus, deceasedAt: lifeStatus === 'DECEASED' ? '2026-06-10' : null } as unknown as View['profile'],
    alertsSummary: { overdueCount: 0, dueSoonCount: 0, upToDateCount: 0, totalActiveAlerts },
  };
};
const render = (view: View): string => renderToStaticMarkup(h(PetDashboard, { dashboard: view, activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
const card = (markup: string): string => /<section aria-labelledby="alerts-title".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('M2 tarjeta «Estado de vacunación» de una fallecida (REQ-FAL7-004)', () => {
  it('[SC-007-013][REQ-FAL7-004] fallecida: la tarjeta sigue visible y dice «Sin alertas (fallecida)», sin «0 alertas activas» ni «Todo al día»', () => {
    const markup = card(render(withLife('DECEASED', 0)));
    expect(markup).toContain('>Estado de vacunación</h3>');
    expect(markup).toContain('Sin alertas (fallecida)');
    expect(markup).not.toContain('0 alertas activas');
    expect(markup).not.toContain('Todo al día');
  });

  it('[REQ-FAL7-004] viva sin alertas: conserva «0 alertas activas» y «Todo al día»', () => {
    const markup = card(render(withLife('ALIVE', 0)));
    expect(markup).toContain('0 alertas activas');
    expect(markup).toContain('Todo al día');
    expect(markup).not.toContain('Sin alertas (fallecida)');
  });

  it('[REQ-FAL7-004] viva con alertas: sin cambios', () => {
    const markup = card(render(withLife('ALIVE', 3)));
    expect(markup).toContain('3 alertas activas');
    expect(markup).not.toContain('Sin alertas (fallecida)');
  });
});
