/**
 * T1506 [Bloque A, #64] pruebas de la página única «Hogares» y de «Compartir» por hogar (011): lista y detalle con pestañas internas, una sola entrada en el menú,
 * ficha de la mascota sin «¿Qué quieres compartir?», enlace de hogar sin selección de subconjunto y aviso de alcance dinámico. Render estático y lectura de fuente.
 *
 * @implements REQ-HOG11-001, REQ-HOG11-002, REQ-HOG11-005, REQ-HOG11-006, EDGE-011-014, EDGE-011-005
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { ShellHeader } from '../../../src/presentation/web/pages/AppShell.tsx';
import { HOUSEHOLD_TABS, HouseholdTabs } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';

const read = (path: string): string => readFileSync(path, 'utf8');
const noop = (): void => undefined;
const AVISO = 'Incluye todas las mascotas asignadas a este hogar mientras esté activo';

function share(over: Partial<ShareLinksViewProps> = {}): string {
  const props = {
    petName: 'Luna', household: null, now: '2026-11-25T12:00:00.000Z', scope: 'PET', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
    busy: false, error: null, created: null, copyStatus: 'IDLE', list: { items: [], activeCount: 0, maxActiveLinks: 20 }, confirmRevokeId: null, notice: null,
    onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop,
    ...over,
  } as ShareLinksViewProps;
  return renderToStaticMarkup(h(ShareLinksView, props));
}

describe('T1506 página única «Hogares» (REQ-HOG11-001, D11-05 = A)', () => {
  it('[REQ-HOG11-001] el detalle por hogar ofrece las pestañas Resumen, Miembros, Mascotas, Compartir, Álbum y Escena, en ese orden, como tablist con una seleccionada', () => {
    expect(HOUSEHOLD_TABS.map((t: { label: string }) => t.label)).toEqual(['Resumen', 'Miembros', 'Mascotas', 'Compartir', 'Álbum', 'Escena']);
    const markup = renderToStaticMarkup(h(HouseholdTabs, { householdId: 'h1', active: 'compartir', onSelect: noop }));
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(6);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-selected="true"[^>]*>Compartir</);
  });

  it('[REQ-HOG11-001] el menú principal tiene una sola entrada «Hogares» hacia /households y ninguna entrada de pestaña interna', () => {
    const markup = renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/households'] }, h(ShellHeader, { displayName: 'Ana', pendingInvitations: 0, onLogout: noop })));
    expect(markup.match(/href="\/households"/g)).toHaveLength(1);
    expect(markup.match(/Hogares/g)).toHaveLength(1);
    for (const inner of ['Miembros', 'Compartir', 'Álbum', 'Escena']) expect(markup).not.toContain(inner);
  });

  it('[REQ-HOG11-001][D11-06 = A] HouseholdsPage lista los hogares y monta el detalle con pestañas; no se añade ninguna ruta nueva (solo /households)', () => {
    const page = read('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(page).toMatch(/<HouseholdTabs\b/);
    expect(page).toMatch(/<ShareLinksPanel\b[^>]*hideScopeChoice/);
    expect(page).toMatch(/<HomeScene[^>]*kind: 'HOUSEHOLD'/);
    const app = read('src/presentation/web/App.tsx');
    expect(app.match(/path="\/households[^"]*"/g)).toEqual(['path="/households/:householdId/resumen"', 'path="/households"']);
  });

  it('[REQ-HOG11-002] sin pérdida de funciones: invitar, aceptar/rechazar, retirar/salir, transferir propiedad, escena y foto siguen en la página', () => {
    const page = read('src/presentation/web/pages/HouseholdsPage.tsx');
    for (const needle of ['/households/{householdId}/invitations', '/invitations/{householdId}/accept', '/invitations/{householdId}/decline', '/households/{householdId}/members/{userId}', '/households/{householdId}/ownership-transfer', '<InviteForm', '<HouseholdCard', 'transferHouseholdText', 'kind: \'OWNER\'']) {
      expect(page, needle).toContain(needle);
    }
  });
});

describe('T1506 compartir sin pregunta inútil (REQ-HOG11-006, REQ-HOG11-005, EDGE-011-014)', () => {
  it('[REQ-HOG11-006] la ficha de la mascota (prop hideScopeChoice) no muestra «¿Qué quieres compartir?» y sí el nombre de la mascota', () => {
    const markup = share({ hideScopeChoice: true } as Partial<ShareLinksViewProps>);
    expect(markup).not.toContain('¿Qué quieres compartir?');
    expect(markup).toContain('Luna');
    expect(markup).not.toContain('name="scope"');
  });

  it('[REQ-HOG11-006] regresión: sin la prop, con elección real (mascota u hogar), la pregunta se conserva', () => {
    const markup = share({ household: { petCount: 3 } });
    expect(markup).toContain('¿Qué quieres compartir?');
    expect(markup).toContain('Todo el hogar (3 mascotas)');
  });

  it('[REQ-HOG11-005][EDGE-011-014] el hogar crea el enlace sin selector de subconjunto, con el aviso de alcance dinámico', () => {
    const markup = share({ hideScopeChoice: true, household: { petCount: 2 }, scope: 'HOUSEHOLD' } as Partial<ShareLinksViewProps>);
    expect(markup).not.toContain('¿Qué quieres compartir?');
    expect(markup).not.toContain('name="scope"');
    expect(markup).not.toContain('Solo esta mascota');
    expect(markup).toContain(AVISO);
    expect(markup).toContain('Crear enlace');
  });

  it('[EDGE-011-014] el aviso solo aparece en el enlace de hogar, no en el de una mascota', () => {
    expect(share({ hideScopeChoice: true } as Partial<ShareLinksViewProps>)).not.toContain(AVISO);
  });

  it('[REQ-HOG11-006] la ficha de la mascota pasa la prop cuando el alcance elegible es una sola mascota y no hay contrato nuevo', () => {
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).toMatch(/<ShareLinksPanel\b[^>]*hideScopeChoice=\{/);
    const shareLinks = read('src/presentation/web/components/ShareLinks.tsx');
    expect(shareLinks).toContain(AVISO);
  });
});
