import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlertBadge } from '../../../src/presentation/web/components/AlertBadge.tsx';
import { ContextSelector } from '../../../src/presentation/web/components/ContextSelector.tsx';
import { PetCardList } from '../../../src/presentation/web/components/PetCards.tsx';
import { DeletePetDialog, PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { PetForm } from '../../../src/presentation/web/components/PetForm.tsx';
import { ShellHeader } from '../../../src/presentation/web/pages/AppShell.tsx';
import { HouseholdCard, InvitationList } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { contextOptions } from '../../../src/presentation/web/view-model.ts';
import { alert, card, dashboard, household, ME, OTHER, profile } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const count = (markup: string, re: RegExp): number => (markup.match(new RegExp(re.source, 'g')) ?? []).length;
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

describe('componentes de la SPA (render estático)', () => {
  it('[REQ-UI-001] las tarjetas forman un listbox con una sola opción enfocable y la activa marcada', () => {
    const markup = html(h(PetCardList, { cards: [card('p1', 'Argos'), card('p2', 'Kira')], activePetId: 'p2', onSelect: noop }));
    expect([count(markup, /role="listbox"/), count(markup, /role="option"/), count(markup, /tabindex="0"/), count(markup, /aria-selected="true"/), /data-pet-id="p2"[^>]*>/.test(markup)]).toEqual([1, 2, 1, 1, true]);
    expect(markup).toMatch(/aria-selected="true" tabindex="0" data-pet-id="p2"/);
  });

  it('[REQ-UI-001] cada tarjeta muestra especie, nombre, edad, dueño y contador de alertas', () => {
    const markup = html(h(PetCardList, { cards: [card('p1', 'Argos')], activePetId: 'p1', onSelect: noop }));
    expect(['Argos', 'Perro · 6 años, 6 meses · 32.40 kg', 'Alertas: 1 vencidas · 2 próximas', 'Dueño: Andrés'].map((t) => markup.includes(t))).toEqual([true, true, true, true]);
  });

  it('[REQ-UI-001] el selector de contexto es un tablist con "Mis mascotas" y los hogares, y solo la pestaña activa es enfocable', () => {
    const markup = html(h(ContextSelector, { options: contextOptions([household('OWNER')]), activeId: 'mine', onSelect: noop }));
    expect([count(markup, /role="tablist"/), count(markup, /role="tab"/), count(markup, /tabindex="0"/), markup.indexOf('Mis mascotas') < markup.indexOf('Casa'), count(markup, /aria-selected="true"/)]).toEqual([1, 2, 1, true, 1]);
  });

  it('[REQ-UI-007] en hogar la tarjeta ajena lleva insignia de color con texto y "Solo lectura"; la propia fuera de hogar, sin color', () => {
    const foreign = html(h(PetCardList, { cards: [card('p9', 'Luna', { owner: OTHER, ownerName: 'María', color: 'OWNER_COLOR_2', canEdit: false })], activePetId: null, onSelect: noop }));
    const own = html(h(PetCardList, { cards: [card('p1', 'Argos')], activePetId: null, onSelect: noop }));
    expect([
      foreign.includes('data-owner-badge="OWNER_COLOR_2"'),
      foreign.includes('background-color:#047857;color:#ffffff'),
      foreign.includes('Dueño: María'),
      foreign.includes('Solo lectura'),
      own.includes('data-owner-badge="none"'),
      own.includes('Solo lectura'),
      own.includes('background-color'),
    ]).toEqual([true, true, true, true, true, false, false]);
  });

  it('[REQ-UI-002][REQ-UI-007] la ficha ajena (canEdit false) no tiene Editar, Eliminar ni formularios de alta', () => {
    const markup = html(h(PetDashboard, { dashboard: dashboard(false, 'OWNER_COLOR_2'), activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect([markup.includes('>Editar<'), markup.includes('>Eliminar<'), count(markup, /<form/), markup.includes('Solo lectura'), markup.includes('Dueño: María')]).toEqual([false, false, 0, true, true]);
  });

  it('[REQ-UI-002] la ficha propia tiene 6 pestañas, un panel aislado para el módulo activo y su formulario de alta', () => {
    const markup = html(h(PetDashboard, { dashboard: dashboard(true), activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect([
      count(markup, /role="tab"/),
      count(markup, /role="tabpanel"/),
      markup.includes('id="module-panel-weights"'),
      count(markup, /<form/),
      markup.includes('Registrar peso'),
      markup.includes('>Editar<') && markup.includes('>Eliminar<'),
      markup.includes('data-pet-id="44444444-4444-4444-8444-444444444401"'),
    ]).toEqual([6, 1, true, 1, true, true, true]);
  });

  it('[REQ-UI-002] la pestaña de peso muestra el gráfico SVG y la tabla con la variación de la API', () => {
    const markup = html(h(PetDashboard, { dashboard: dashboard(false), activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect([count(markup, /<svg role="img"/), count(markup, /<circle/), markup.includes('<td class="px-2 py-1">−0.45 kg</td><td class="px-2 py-1">−1.37 %</td>'), markup.includes('<path d="M300 32 L')]).toEqual([1, 2, true, false]);
  });

  it('[REQ-UI-003][STATE-ALERT-001] la pestaña de vacunas muestra la insignia del semáforo con color y texto', () => {
    const markup = html(h(PetDashboard, { dashboard: dashboard(true), activeTab: 'vaccinations', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    const badge = html(h(AlertBadge, { alert: alert('DUE_SOON', 7, 'Próxima a vencer (<= 15 días)', 'WARNING_AMBER') }));
    expect([markup.includes('data-alert-status="OVERDUE" data-ui-badge="DANGER_RED"'), markup.includes('Semáforo Rojo: </span>Vencida · 5 días de retraso'), badge.includes('data-ui-badge="WARNING_AMBER"'), badge.includes('7 días restantes')]).toEqual([true, true, true, true]);
  });

  it('[REQ-UI-004] cada campo del formulario tiene etiqueta asociada por id', () => {
    const markup = html(h(PetForm, { profile: profile('p1', 'Argos'), onSubmit: asyncNoop, onCancel: noop }));
    const ids = [...markup.matchAll(/<(?:input|select)[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect([ids.length, ids.every((id) => markup.includes(`for="${id}"`)), markup.includes('value="Argos"')]).toEqual([6, true, true]);
  });

  it('[REQ-PET-004] la confirmación de eliminación arranca con el botón deshabilitado', () => {
    const markup = html(h(DeletePetDialog, { petName: 'Argos', onConfirm: noop, onCancel: noop }));
    expect([markup.includes('role="alertdialog"'), /<button[^>]*disabled=""[^>]*>Eliminar definitivamente/.test(markup)]).toEqual([true, true]);
  });

  it('[REQ-UI-005] estando autenticado el botón de cierre de sesión está siempre en la cabecera', () => {
    // NavLink usa useLayoutEffect: React lo avisa en render de servidor; el aviso no afecta al marcado.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const markup = html(h(MemoryRouter, { initialEntries: ['/households'] }, h(ShellHeader, { displayName: 'Andrés', pendingInvitations: 2, onLogout: noop })));
    const warnings = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(warnings.every((w) => w.includes('useLayoutEffect does nothing on the server'))).toBe(true);
    expect([markup.includes('>Cerrar sesión<'), markup.includes('Andrés'), markup.includes('data-pending-invitations="2"'), markup.includes('2 invitaciones pendientes')]).toEqual([true, true, true, true]);
  });

  it('[REQ-UI-006] el OWNER ve miembros con estado, INVITED incluidos, y las acciones de retirar, cancelar y eliminar', () => {
    const markup = html(h(HouseholdCard, { view: household('OWNER'), myUserId: ME, onMemberAction: noop, onDelete: noop, inviteForm: null }));
    expect([
      count(markup, /data-membership-status="ACTIVE"/),
      count(markup, /data-membership-status="INVITED"/),
      markup.includes('Invitación pendiente'),
      markup.includes('>Retirar<'),
      markup.includes('>Cancelar invitación<'),
      markup.includes('>Eliminar hogar<'),
      markup.includes('>Abandonar hogar<'),
    ]).toEqual([2, 1, true, true, true, true, false]);
  });

  it('[REQ-UI-006] el MEMBER solo ve miembros ACTIVE y puede abandonar, sin eliminar el hogar', () => {
    const markup = html(h(HouseholdCard, { view: household('MEMBER'), myUserId: OTHER, onMemberAction: noop, onDelete: noop, inviteForm: null }));
    expect([count(markup, /data-membership-status="INVITED"/), markup.includes('>Abandonar hogar<'), markup.includes('>Eliminar hogar<'), markup.includes('>Retirar<')]).toEqual([0, true, false, false]);
  });

  it('[REQ-UI-006] las invitaciones pendientes muestran contador y acciones de aceptar y rechazar', () => {
    const invitation = { household: household('OWNER').household, invitedBy: household('OWNER').members[0]!.user, invitedAt: '2026-11-01T10:00:00.000Z' };
    const markup = html(h(InvitationList, { invitations: [invitation], onAccept: noop, onDecline: noop }));
    const empty = html(h(InvitationList, { invitations: [], onAccept: noop, onDecline: noop }));
    expect([markup.includes('1 invitación pendiente'), markup.includes('>Aceptar<'), markup.includes('>Rechazar<'), empty.includes('No tienes invitaciones pendientes.')]).toEqual([true, true, true, true]);
  });
});
