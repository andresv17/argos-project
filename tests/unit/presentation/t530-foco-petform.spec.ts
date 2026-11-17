/**
 * T530 [US1] SC-CAT-006 (REQ-FRM-002): orden de foco de `PetForm`. «Fecha de nacimiento aproximada (estimada)» sigue
 * inmediatamente a «Fecha de nacimiento» y precede a «Sexo».
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetForm } from '../../../src/presentation/web/components/PetForm.tsx';
import { profile } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

/** Controles enfocables en orden de documento: `name` de input/select/textarea. */
function focusOrder(markup: string): string[] {
  return [...markup.matchAll(/<(?:input|select|textarea)\b[^>]*?\bname="([A-Za-z]+)"/g)].map((m) => m[1]!);
}

describe('T530 orden de foco de PetForm (SC-CAT-006)', () => {
  it('el alta: birthDate → birthDateIsEstimate → sex, sin nada en medio', () => {
    const order = focusOrder(html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop })));
    const at = order.indexOf('birthDate');
    expect(at).toBeGreaterThan(-1);
    expect(order.slice(at, at + 3)).toEqual(['birthDate', 'birthDateIsEstimate', 'sex']);
  });

  it('la edición conserva el mismo orden', () => {
    const order = focusOrder(html(h(PetForm, { profile: profile('p1', 'Kiwi'), onSubmit: asyncNoop, onCancel: noop })));
    const at = order.indexOf('birthDate');
    expect(order.slice(at, at + 3)).toEqual(['birthDate', 'birthDateIsEstimate', 'sex']);
  });

  it('el rótulo de la casilla es exactamente «Fecha de nacimiento aproximada (estimada)» y sigue a su campo en el DOM', () => {
    const markup = html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }));
    expect(markup).toContain('Fecha de nacimiento aproximada (estimada)');
    expect(markup).not.toContain('Es una fecha estimada');
    const birth = markup.indexOf('id="new-pet-birthDate"');
    const estimate = markup.indexOf('id="new-pet-birthDateIsEstimate"');
    const sex = markup.indexOf('id="new-pet-sex"');
    expect([birth < estimate, estimate < sex]).toEqual([true, true]);
  });

  it('la etiqueta de la casilla está asociada a su control (clic en el rótulo la marca)', () => {
    const markup = html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }));
    expect(markup).toMatch(/<label for="new-pet-birthDateIsEstimate"[^>]*>.*Fecha de nacimiento aproximada \(estimada\)<\/label>/s);
  });
});
