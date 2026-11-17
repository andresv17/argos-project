import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PasswordField } from '../../../src/presentation/web/components/Field.tsx';

const noop = (): void => undefined;
const count = (markup: string, re: RegExp): number => (markup.match(new RegExp(re.source, 'g')) ?? []).length;

describe('campo de contraseña con "Mostrar contraseña" (hallazgo 1 de Neo)', () => {
  it('[REQ-UI-005][REQ-UI-004] el campo nace oculto, con botón de alternancia accesible (aria-pressed=false, aria-controls al input)', () => {
    const markup = renderToStaticMarkup(h(PasswordField, { id: 'pw', label: 'Contraseña', name: 'password', value: 'x', onChange: noop, errors: {}, required: true }));
    expect([
      /<input id="pw"[^>]*type="password"/.test(markup),
      /<button type="button" aria-pressed="false" aria-controls="pw"/.test(markup),
      markup.includes('>Mostrar contraseña</button>'),
      count(markup, /<label /),
    ]).toEqual([true, true, true, 1]);
  });

  it('[REQ-UI-005] el error de validación sigue asociado por aria-describedby al input', () => {
    const markup = renderToStaticMarkup(h(PasswordField, { id: 'pw', label: 'Contraseña', name: 'password', value: '', onChange: noop, errors: { password: 'Obligatoria' } }));
    expect([markup.includes('aria-invalid="true"'), markup.includes('aria-describedby="pw-error"'), markup.includes('id="pw-error"')]).toEqual([true, true, true]);
  });
});
