/**
 * T1570 [Bloque I, #64] pruebas de REQ-HOG11-008 / SC-011-065 (opción B de Neo): pestañas «Mascotas» y «Resumen» del hogar con datos cortos,
 * sin avatar ni petición de imagen, sin correos ni nombres de usuario. Render estático de componentes puros y lectura de fuente.
 *
 * @implements REQ-HOG11-008
 */
import { countersText } from '../../../src/presentation/web/view-model';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HOUSEHOLD_TABS, HouseholdDetailView } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';

const noop = (): void => undefined;
const ME = 'u-me';
const member = (userId: string, role: string, status: string, isHouseholdOwner = false) => ({
  membership: { membershipId: `m-${userId}`, userId, displayName: `Nombre ${userId}`, username: `user_${userId}`, email: `${userId}@correo.test`, role, status, isHouseholdOwner },
  colorToken: null,
});
const card = (id: string, owner: string, species: string, over: Record<string, unknown> = {}) => ({
  profile: { id, name: `Mascota ${id}`, ownerUserId: owner, species, breed: 'Labrador', sex: 'MALE', lifeStatus: 'ALIVE', birthDateIsEstimate: false, ...(over.profile as object | undefined) },
  computedAge: { years: 3, months: 2 },
  latestWeightKg: 12.4,
  alertsSummary: { overdueCount: 1, dueSoonCount: 2, upToDateCount: 0 },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'profile')),
});
const PETS = [
  card('a', ME, 'CANINE'),
  card('b', 'u-otro', 'CANINE'),
  card('c', ME, 'FELINE'),
  card('d', ME, 'FELINE', { profile: { lifeStatus: 'DECEASED', deceasedAt: '2026-01-05' }, alertsSummary: { overdueCount: 9, dueSoonCount: 9, upToDateCount: 0 } }),
];
function detail(tab: string, over: { myRole?: string; isHouseholdOwner?: boolean; members?: unknown[] } = {}, pets: unknown = PETS): string {
  const view = {
    household: { id: 'h1', name: 'Hogar Z', createdAt: '2026-03-07T10:00:00.000Z' },
    members: over.members ?? [member('o', 'ADMIN', 'ACTIVE', true), member('c1', 'CAREGIVER', 'ACTIVE'), member('c2', 'CAREGIVER', 'ACTIVE'), member('r', 'READER', 'ACTIVE'), member('x', 'READER', 'REMOVED')],
    myRole: over.myRole ?? 'ADMIN',
    isHouseholdOwner: over.isHouseholdOwner ?? true,
  } as never;
  return renderToStaticMarkup(h(MemoryRouter, null, h(HouseholdDetailView, { view, tab: tab as never, onTab: noop, myUserId: ME, pets: pets as never, failed: false, children: null })));
}

describe('T1570 [REQ-HOG11-008][SC-011-065] pestaña «Mascotas» del hogar', () => {
  it('cada fila muestra «Especie · Raza · Sexo», «edad · peso» y la insignia de alertas, sin avatar ni imagen', () => {
    const markup = detail('mascotas');
    expect(markup).toContain('Mascota a');
    expect(markup).toContain('Perro · Labrador · Macho');
    expect(markup).toContain('Gato · Labrador · Macho');
    expect(markup).toContain('3 años, 2 meses · 12.40 kg');
    expect(markup).toContain('Alertas: 1 vencida · 2 próximas');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('/avatar');
  });

  it('una mascota fallecida muestra «Fallecido» en lugar de las alertas', () => {
    const markup = detail('mascotas');
    const row = markup.slice(markup.indexOf('data-pet-id="d"'));
    expect(row).toContain('Fallecido · 05/01/2026');
    expect(row).not.toContain('Alertas: 9');
  });

  it('no aparecen correos ni nombres de usuario', () => {
    const markup = detail('mascotas');
    expect(markup).not.toContain('@correo.test');
    expect(markup).not.toMatch(/user_/);
  });
});

describe('T1570 [REQ-HOG11-008][SC-011-065] pestaña «Resumen» del hogar', () => {
  it('muestra fecha de creación, propietario, tu rol y miembros activos por rol', () => {
    const markup = detail('resumen');
    expect(markup).toContain('Creado el 07/03/2026');
    expect(markup).toContain('Propietario: Nombre o');
    expect(markup).toContain('Tu rol: Administrador');
    expect(markup).toContain('4 miembros activos');
    expect(markup).toContain('1 Administrador · 2 Cuidadores · 1 Lector');
  });

  it('muestra el total de mascotas, cuántas son tuyas y por especie', () => {
    const markup = detail('resumen');
    expect(markup).toContain('4 mascotas asignadas');
    expect(markup).toContain('3 tuyas');
    expect(markup).toContain('Perro: 2 · Gato: 2');
  });

  it('las alertas agregadas cuentan solo mascotas vivas (la fallecida no suma)', () => {
    const markup = detail('resumen');
    expect(markup).toContain('Alertas: 3 vencidas · 6 próximas');
    expect(markup).not.toContain('Alertas: 12 vencidas');
  });

  it('sin alertas en las vivas dice que ninguna requiere atención', () => {
    const quiet = [card('a', ME, 'CANINE', { alertsSummary: { overdueCount: 0, dueSoonCount: 0, upToDateCount: 3 } })];
    expect(detail('resumen', {}, quiet)).toContain('Ninguna mascota requiere atención');
  });

  it('sin correos, nombres de usuario, «última actividad» ni próximos registros', () => {
    const markup = detail('resumen');
    expect(markup).not.toContain('@correo.test');
    expect(markup).not.toMatch(/user_|@user/);
    expect(markup).not.toMatch(/[Úú]ltima actividad|[Pp]róximos registros/);
  });

  it('el Lector ve lo mismo que en «Mis mascotas» y ningún rol ve invitaciones pendientes en el Resumen (la vista del hogar no las trae)', () => {
    const reader = detail('resumen', { myRole: 'READER', isHouseholdOwner: false });
    expect(reader).toContain('Tu rol: Lector');
    expect(reader).toContain('4 mascotas asignadas');
    expect(reader).not.toContain('invitación pendiente');
    expect(detail('resumen')).not.toContain('invitación pendiente');
  });
});

describe('T1570 [REQ-HOG11-008][SC-011-065] sin cambios de contrato, ruta ni petición extra', () => {
  it('el orden de las pestañas no cambia y la página no añade peticiones ni importa PetAvatar', () => {
    expect(HOUSEHOLD_TABS.map((t: { label: string }) => t.label)).toEqual(['Resumen', 'Miembros', 'Mascotas', 'Compartir', 'Álbum', 'Escena']);
    const page = readFileSync('src/presentation/web/pages/HouseholdsPage.tsx', 'utf8');
    expect(page).not.toMatch(/PetAvatar/);
    expect((page.match(/\/households\/\{householdId\}\/pets/g) ?? []).length).toBe(1);
  });

  it('[OBS-1 Sati] concordancia de número: 1 vencida / 1 próxima en singular, plural desde 2 y con 0', () => {
    expect(countersText(1, 1)).toBe('1 vencida · 1 próxima');
    expect(countersText(2, 2)).toBe('2 vencidas · 2 próximas');
    expect(countersText(0, 1)).toBe('0 vencidas · 1 próxima');
  });

  it('[OBS-3 Sati] la sección de mascotas del Resumen se nombra por su h4 visible, sin aria-label divergente', () => {
    const markup = detail('resumen');
    expect(markup).not.toContain('Mascotas del hogar');
    expect(markup).toMatch(/<section aria-labelledby="hogar-resumen-mascotas"/);
    expect(markup).toMatch(/<h4 id="hogar-resumen-mascotas"[^>]*>Mascotas<\/h4>/);
  });
});
