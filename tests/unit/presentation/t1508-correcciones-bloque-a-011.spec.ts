/**
 * T1508 [Bloque A, #64] correcciones K-1 (conteo del enlace de hogar), K-3 (error al cargar mascotas), K-4 (RBAC de la pestaña Compartir) y OBS-2 (aria-describedby).
 * Render estático de componentes puros.
 *
 * @implements REQ-HOG11-001, REQ-HOG11-005, EDGE-011-014
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { HouseholdDetailView } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';

const noop = (): void => undefined;
const LINK_ID = '5a5a5a5a-0000-4000-8000-000000000001';
const hhLink = { id: LINK_ID, scope: 'HOUSEHOLD', petId: null, householdId: 'h1', status: 'ACTIVE', createdAt: '2026-11-25T12:00:00.000Z', expiresAt: '2026-12-02T12:00:00.000Z', revokedAt: null, includeMicrochip: false, includeClinicalFiles: false };

function share(over: Partial<ShareLinksViewProps> = {}): string {
  const props = {
    petName: 'Hogar Z', household: { petCount: 1 }, now: '2026-11-25T12:00:00.000Z', scope: 'HOUSEHOLD', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
    busy: false, error: null, created: null, copyStatus: 'IDLE', list: { items: [], activeCount: 0, maxActiveLinks: 20 }, confirmRevokeId: null, notice: null,
    onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop,
    ...over,
  } as ShareLinksViewProps;
  return renderToStaticMarkup(h(ShareLinksView, props));
}

const ME = 'u-me';
const pet = (ownerUserId: string) => ({ profile: { id: 'p1', name: 'Luna', ownerUserId } });
function detail(myRole: string, isHouseholdOwner: boolean, pets: unknown, failed = false, tab = 'compartir'): string {
  const view = { household: { id: 'h1', name: 'Hogar Z' }, members: [], myRole, isHouseholdOwner } as never;
  return renderToStaticMarkup(h(MemoryRouter, null, h(HouseholdDetailView, { view, tab: tab as never, onTab: noop, myUserId: ME, pets: pets as never, failed, children: null })));
}

describe('T1508 K-1 el enlace de hogar no revela el conteo de mascotas del creador', () => {
  it('[EDGE-011-014] la fila de un enlace HOUSEHOLD dice «Hogar compartido» sin «mascotas»; el formulario conserva «Todo el hogar (N mascotas)»', () => {
    const markup = share({ list: { items: [hhLink], activeCount: 1, maxActiveLinks: 20 } } as never);
    const row = markup.slice(markup.indexOf('<li'), markup.lastIndexOf('</li>'));
    expect(row).toContain('Hogar compartido');
    expect(row).not.toContain('mascotas');
    expect(share({ scope: 'PET', household: { petCount: 3 } })).toContain('Todo el hogar (3 mascotas)');
  });
});

describe('T1508 OBS-2 el botón «Crear enlace» del hogar queda asociado al aviso dinámico', () => {
  it('[REQ-HOG11-005] aria-describedby="share-household-dynamic" en el botón con alcance fijo de hogar', () => {
    const markup = share({ hideScopeChoice: true } as never);
    expect(markup).toContain('id="share-household-dynamic"');
    expect(markup).toMatch(/<button[^>]*aria-describedby="share-household-dynamic"[^>]*>\s*Crear enlace/);
  });
});

describe('T1508 K-3 un error al cargar mascotas no se muestra como estado vacío', () => {
  it('[REQ-HOG11-001] con failed=true hay role="alert" y no el texto de hogar sin mascotas; sin fallo y lista vacía sigue el estado vacío', () => {
    const bad = detail('ADMIN', true, [], true, 'mascotas');
    expect(bad).toContain('role="alert"');
    expect(bad).not.toContain('aún no tiene mascotas');
    const empty = detail('ADMIN', true, [], false, 'mascotas');
    expect(empty).toContain('aún no tiene mascotas');
    expect(empty).not.toContain('role="alert"');
  });
});

describe('T1508 K-4 RBAC de la pestaña Compartir', () => {
  const PANEL_MARK = 'Crear enlace';
  it('[REQ-HOG11-005] propietario o ADMIN con mascota propia ven el panel de Compartir', () => {
    expect(detail('ADMIN', true, [pet(ME)])).toContain(PANEL_MARK);
    expect(detail('ADMIN', false, [pet(ME)])).toContain(PANEL_MARK);
  });
  it('[REQ-HOG11-005] CAREGIVER y READER no lo ven, aunque tengan mascota propia', () => {
    for (const role of ['CAREGIVER', 'READER']) {
      const markup = detail(role, false, [pet(ME)]);
      expect(markup).not.toContain(PANEL_MARK);
      expect(markup).toContain('Solo el propietario o un Administrador');
    }
  });
  it('[REQ-HOG11-005] un ADMIN sin mascota propia no lo ve y recibe la guía para asignar una', () => {
    const markup = detail('ADMIN', false, [pet('u-other')]);
    expect(markup).not.toContain(PANEL_MARK);
    expect(markup).toContain('asigna al hogar al menos una mascota tuya');
  });
});
