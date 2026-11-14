import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetCardList } from '../../../src/presentation/web/components/PetCards.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { RECORD_MODULES, type RecordModule } from '../../../src/presentation/web/records.ts';
import { alertBadge } from '../../../src/presentation/web/view-model.ts';
import { cardAs, dashboardAs, type Role } from './rebanada6-fixtures.ts';

/**
 * T284 — acciones ocultas según `permissions` (REQ-UI2-003, REQ-UI2-006, REQ-RBAC-001) y semáforo de reemplazados
 * (REQ-UI-003). Las acciones que la matriz niega no deben existir en el marcado; la validación real es del servidor.
 */
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const render = (role: Role, tab: RecordModule): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: dashboardAs(role), activeTab: tab, onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));

/** Módulos cuyo formulario de alta debe existir para cada rol, según la matriz de la spec. */
const FORMS: Readonly<Record<Role, readonly RecordModule[]>> = {
  OWNER: ['weights', 'measurements', 'vaccinations', 'dewormings', 'visits', 'customParameters'],
  ADMIN: ['weights', 'measurements', 'vaccinations', 'dewormings', 'visits', 'customParameters'],
  CAREGIVER: ['weights', 'measurements', 'vaccinations', 'dewormings'],
  READER: [],
};
const HEADER: Readonly<Record<Role, { readonly edit: boolean; readonly remove: boolean }>> = {
  OWNER: { edit: true, remove: true },
  ADMIN: { edit: true, remove: false },
  CAREGIVER: { edit: false, remove: false },
  READER: { edit: false, remove: false },
};

describe('acciones de la ficha ocultas según permissions (T284)', () => {
  for (const role of ['OWNER', 'ADMIN', 'CAREGIVER', 'READER'] as const) {
    it(`[REQ-UI2-006][REQ-UI2-003][REQ-RBAC-001] rol ${role}: Editar, Eliminar y el formulario de cada módulo existen solo si la matriz lo permite`, () => {
      const modules = RECORD_MODULES.map((m) => m.id);
      const observed = {
        header: { edit: render(role, 'weights').includes('>Editar<'), remove: render(role, 'weights').includes('>Eliminar<') },
        forms: modules.filter((m) => render(role, m).includes('<form')),
      };
      expect(observed).toEqual({ header: HEADER[role], forms: modules.filter((m) => FORMS[role].includes(m)) });
    });
  }

  it('[REQ-UI2-003] «Solo lectura» lo ve únicamente el Lector; el Cuidador, que puede registrar pesos y vacunas, no', () => {
    const labels = (['OWNER', 'ADMIN', 'CAREGIVER', 'READER'] as const).map((role) => {
      const markup = renderToStaticMarkup(h(PetCardList, { cards: [cardAs(role, `p-${role}`, `Mascota ${role}`)], activePetId: null, onSelect: noop }));
      return [role, markup.includes('Solo lectura')];
    });
    expect(labels).toEqual([
      ['OWNER', false],
      ['ADMIN', false],
      ['CAREGIVER', false],
      ['READER', true],
    ]);
  });

  it('[REQ-UI-003][REQ-UI2-006] el semáforo de SUPERSEDED dice «Reemplazada por registro posterior» y la ficha lo agrupa en el acordeón «Registros anteriores»', () => {
    const badge = alertBadge({ status: 'SUPERSEDED', uiBadge: 'NEUTRAL_GRAY', label: 'Histórico reemplazado', isActiveAlert: false, daysRemaining: -44 });
    const markup = render('OWNER', 'vaccinations');
    const accordion = /<details[^>]*>\s*<summary[^>]*>[^<]*Registros anteriores[^<]*<\/summary>([\s\S]*?)<\/details>/.exec(markup);
    expect([badge.text.includes('Reemplazada por registro posterior'), accordion?.[1]?.includes('data-alert-status="SUPERSEDED"') ?? false, accordion?.[1]?.includes('Reemplazada por registro posterior') ?? false]).toEqual([true, true, true]);
  });
});
