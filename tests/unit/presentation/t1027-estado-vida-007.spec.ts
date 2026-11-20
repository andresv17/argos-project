/**
 * T1027 (007, Bloque C, [GH:#13]) pruebas de UI del estado de vida: selector `Estado: Vivo | Fallecido`, «Fecha de fallecimiento» condicional, insignia «Fallecido»,
 * «Vivió …» (con «aprox.»), `DateField` sin cálculo de «hoy» en el cliente (EDGE-007-022), mensaje «Esta ficha cambió, recarga» (412) y confirmación al volver a Vivo (T1068).
 * Sin jsdom: marcado con `renderToStaticMarkup` e inspección de la fuente; el comportamiento con teclado real lo cubre el E2E de T1029.
 *
 * @implements REQ-FAL7-003, REQ-FAL7-007
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetForm, ReviveConfirmation, petFormBody, petFormInitial } from '../../../src/presentation/web/components/PetForm.tsx';
import { PetCardList } from '../../../src/presentation/web/components/PetCards.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { ApiProblem, catalogProblem, isPetVersionConflict, problemMessage } from '../../../src/presentation/web/api.ts';
import {
  REVIVE_CONFIRMATION_TEXT,
  deceasedBadgeText,
  formatIsoDateEs,
  livedText,
  requiresReviveConfirmation,
  type PetProfile,
} from '../../../src/presentation/web/view-model.ts';
import { card, dashboard, profile } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const withLife = (base: ReturnType<typeof profile>, lifeStatus: 'ALIVE' | 'DECEASED', deceasedAt: string | null, extra: Record<string, unknown> = {}): PetProfile =>
  ({ ...base, lifeStatus, deceasedAt, version: 3, ...extra }) as unknown as PetProfile;
const deceased = (): PetProfile => withLife(profile('p1', 'Kiwi'), 'DECEASED', '2026-06-10');
const alive = (): PetProfile => withLife(profile('p1', 'Kiwi'), 'ALIVE', null);
const AGE = { years: 4, months: 1, totalDays: 1492 };

describe('T1027: lenguaje del estado de vida (REQ-FAL7-003, REQ-FAL7-007)', () => {
  it('[REQ-FAL7-003] la insignia dice «Fallecido» con la fecha en DD/MM/AAAA y no existe para una viva', () => {
    expect(deceasedBadgeText(deceased())).toBe('Fallecido · 10/06/2026');
    expect(deceasedBadgeText(alive())).toBeNull();
    expect(formatIsoDateEs('2026-06-10')).toBe('10/06/2026');
  });

  it('[REQ-FAL7-007] «Vivió …» usa la edad entregada por la API y añade «aprox.» si la fecha de nacimiento es estimada', () => {
    expect(livedText(deceased(), AGE)).toBe('Vivió 4 años, 1 mes');
    expect(livedText(withLife(profile('p1', 'Kiwi'), 'DECEASED', '2026-06-10', { birthDateIsEstimate: true }), AGE)).toBe('Vivió aprox. 4 años, 1 mes');
    expect(livedText(alive(), AGE)).toBeNull();
  });

  it('[REQ-FAL7-003][EDGE-007-016] solo Fallecido → Vivo pide confirmación explícita, con el texto fijado por Neo', () => {
    expect(REVIVE_CONFIRMATION_TEXT).toBe('Al volver a Vivo se reactivarán las alertas');
    expect(requiresReviveConfirmation(deceased(), 'ALIVE')).toBe(true);
    expect(requiresReviveConfirmation(deceased(), 'DECEASED')).toBe(false);
    expect(requiresReviveConfirmation(alive(), 'DECEASED')).toBe(false);
    expect(requiresReviveConfirmation(null, 'ALIVE')).toBe(false);
  });
});

describe('T1027: PetForm con selector Estado (REQ-FAL7-003)', () => {
  const form = (p: PetProfile | null): string => renderToStaticMarkup(h(PetForm, { profile: p, onSubmit: asyncNoop, onCancel: noop }));

  it('[REQ-FAL7-003][SC-007-011] el formulario trae el selector «Estado» con Vivo y Fallecido, y una viva no muestra la fecha de fallecimiento', () => {
    const markup = form(alive());
    expect(markup).toMatch(/<label[^>]*for="edit-pet-p1-lifeStatus"[^>]*>[^<]*Estado/);
    expect(markup).toMatch(/<select[^>]*id="edit-pet-p1-lifeStatus"[^>]*name="lifeStatus"/);
    expect(markup).toContain('>Vivo</option>');
    expect(markup).toContain('>Fallecido</option>');
    expect(markup).not.toContain('Fecha de fallecimiento');
    expect(form(null)).toMatch(/id="new-pet-lifeStatus"/);
  });

  it('[REQ-FAL7-003][SC-007-011] una fallecida muestra «Fecha de fallecimiento» como DateField (segmentos Día, Mes, Año) con la fecha cargada', () => {
    const markup = form(deceased());
    expect(markup).toMatch(/<fieldset id="edit-pet-p1-deceasedAt"/);
    expect(markup).toMatch(/<legend[^>]*>Fecha de fallecimiento/);
    expect(markup).toMatch(/name="deceasedAt-day"[^>]*value="10"/);
    expect(markup).toMatch(/name="deceasedAt-year"[^>]*value="2026"/);
  });

  it('[REQ-FAL7-003] el estado de partida sale de la ficha (ALIVE por defecto) y la fecha vacía si no hay', () => {
    expect(petFormInitial(deceased())).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' });
    expect(petFormInitial(null)).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: '' });
    expect(petFormInitial(profile('p2', 'Sin campos'))).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: '' });
  });

  it('[REQ-FAL7-003] al volver a Vivo el cuerpo manda deceasedAt: null (la fecha se borra); estando Vivo sin fecha previa no se envía', () => {
    expect(petFormBody(deceased(), { lifeStatus: 'ALIVE', name: 'Kiwi' })).toMatchObject({ lifeStatus: 'ALIVE', deceasedAt: null });
    expect(petFormBody(alive(), { lifeStatus: 'ALIVE', name: 'Kiwi' })).not.toHaveProperty('deceasedAt');
    expect(petFormBody(alive(), { lifeStatus: 'DECEASED', deceasedAt: '2026-06-10', name: 'Kiwi' })).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' });
  });

  it('[REQ-FAL7-003][EDGE-007-004] la confirmación al volver a Vivo muestra el texto exacto y dos acciones, con rol de alerta', () => {
    const markup = renderToStaticMarkup(h(ReviveConfirmation, { petName: 'Kiwi', onConfirm: noop, onCancel: noop }));
    expect(markup).toContain('Al volver a Vivo se reactivarán las alertas');
    expect(markup).toMatch(/role="alert"/);
    expect(markup).toContain('Confirmar y volver a Vivo');
    expect(markup).toContain('Mantener Fallecido');
  });

  it('[EDGE-007-022] el formulario y el DateField no calculan «hoy» en el cliente (la cota superior la valida el servidor)', () => {
    for (const path of ['src/presentation/web/components/PetForm.tsx', 'src/presentation/web/components/DateField.tsx', 'src/presentation/web/view-model.ts']) {
      const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(source, path).not.toMatch(/new Date\(|Date\.now\(|\btoday\b|todayIso/i);
    }
  });
});

describe('T1027: tarjeta y ficha con el estado (REQ-FAL7-003, REQ-FAL7-007)', () => {
  const deceasedCard = { ...card('p1', 'Kiwi'), profile: deceased(), computedAge: AGE };

  it('[REQ-FAL7-003][SC-007-012] la tarjeta de una fallecida muestra la insignia «Fallecido» y «Vivió …» en lugar de la edad; la de una viva no', () => {
    const markup = renderToStaticMarkup(h(PetCardList, { cards: [deceasedCard], activePetId: 'p1', onSelect: noop }));
    expect(markup).toContain('Fallecido');
    expect(markup).toContain('Vivió 4 años, 1 mes');
    const live = renderToStaticMarkup(h(PetCardList, { cards: [card('p1', 'Kiwi')], activePetId: 'p1', onSelect: noop }));
    expect(live).not.toContain('Fallecido');
    expect(live).not.toContain('Vivió');
  });

  it('[REQ-FAL7-003][SC-007-012] la ficha de una fallecida muestra la insignia con la fecha y «Vivió …»; una viva muestra «Edad»', () => {
    const base = dashboard('OWNER');
    const dead = renderToStaticMarkup(h(PetDashboard, { dashboard: { ...base, profile: deceased(), computedAge: AGE }, activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect(dead).toContain('Fallecido · 10/06/2026');
    expect(dead).toContain('Vivió 4 años, 1 mes');
    const live = renderToStaticMarkup(h(PetDashboard, { dashboard: base, activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
    expect(live).not.toContain('Fallecido');
    expect(live).toContain('aria-label="Edad"');
  });
});

describe('T1027: edición obsoleta 412 (EDGE-007-009)', () => {
  it('[REQ-FAL7-003][SC-007-034] el 412 se reconoce por su código y se muestra «Esta ficha cambió, recarga» sin datos de la mascota', () => {
    const problem = catalogProblem('ERR-PET-VERSION-CONFLICT');
    expect(problemMessage(problem)).toContain('Esta ficha cambió, recarga');
    expect(isPetVersionConflict(new ApiProblem(problem))).toBe(true);
    expect(isPetVersionConflict(new ApiProblem(catalogProblem('ERR-INTERNAL-UNEXPECTED')))).toBe(false);
    expect(isPetVersionConflict(new Error('x'))).toBe(false);
  });

  it('[REQ-FAL7-003] la página recarga la ficha ante el 412 (la versión vigente reinicia el formulario)', () => {
    const source = readFileSync('src/presentation/web/pages/PetsPage.tsx', 'utf8');
    expect(source).toMatch(/isPetVersionConflict\(/);
    expect(source).toMatch(/key=\{`edit-\$\{dashboard\.profile\.id\}-v\$\{dashboard\.profile\.version/);
  });
});
