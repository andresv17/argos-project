/**
 * T1424 OBS-1/OBS-2 de /sati (REQ-MEN10-001, WCAG 4.1.3 y 3.3.1): la casilla «Soy mayor de edad (18+)».
 * OBS-1: el error de la casilla se anuncia (role="alert") y, si solo falta la casilla, el foco va a ella.
 * OBS-2: al marcar la casilla, su error y su aria-invalid desaparecen sin esperar al siguiente envío.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckboxField } from '../../../src/presentation/web/components/Field.tsx';
import { ADULT_DECLARATION_REQUIRED_MESSAGE, adultErrorsFor, shouldFocusAdultCheckbox } from '../../../src/presentation/web/pages/AuthPages.tsx';

const noop = (): void => undefined;
const checkbox = (errors: Record<string, string>): string =>
  renderToStaticMarkup(h(CheckboxField, { id: 'register-adultDeclaration', label: 'Soy mayor de edad (18+)', name: 'adultDeclaration', required: true, checked: false, onChange: noop, errors }));

describe('T1424 OBS-1: el error de la casilla se anuncia', () => {
  it('el error lleva role="alert" y sigue enlazado por aria-describedby con el texto exacto', () => {
    const markup = checkbox({ adultDeclaration: ADULT_DECLARATION_REQUIRED_MESSAGE });
    expect(markup).toMatch(/<p id="register-adultDeclaration-error"[^>]*role="alert"[^>]*>Para crear la cuenta debes declarar que eres mayor de edad\.<\/p>/);
    expect(markup).toContain('aria-describedby="register-adultDeclaration-error"');
    expect(markup).toContain('aria-invalid="true"');
  });

  it('sin error no hay alerta ni aria-invalid', () => {
    const markup = checkbox({});
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain('aria-invalid');
  });
});

describe('T1424 OBS-1: foco a la casilla solo si es lo único que falta', () => {
  it('sin marcar y sin otros errores: enfoca la casilla', () => {
    expect(shouldFocusAdultCheckbox({}, false)).toBe(true);
  });
  it('sin marcar pero con otro campo inválido: no mueve el foco (comportamiento de los demás campos intacto)', () => {
    expect(shouldFocusAdultCheckbox({ username: 'x' }, false)).toBe(false);
  });
  it('marcada: no enfoca', () => {
    expect(shouldFocusAdultCheckbox({}, true)).toBe(false);
  });
});

describe('T1424 OBS-2: marcar la casilla limpia su error', () => {
  const errors = { adultDeclaration: ADULT_DECLARATION_REQUIRED_MESSAGE, username: 'Usuario inválido' };
  it('marcada, se quita solo el error de la casilla', () => {
    expect(adultErrorsFor(errors, true)).toEqual({ username: 'Usuario inválido' });
  });
  it('sin marcar, los errores se conservan tal cual', () => {
    expect(adultErrorsFor(errors, false)).toEqual(errors);
  });
  it('la casilla marcada con errores viejos se renderiza sin aria-invalid ni alerta', () => {
    const markup = checkbox(adultErrorsFor(errors, true));
    expect(markup).not.toContain('aria-invalid');
    expect(markup).not.toContain('role="alert"');
  });
});
