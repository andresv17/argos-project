/**
 * T1550 [Bloque H, #74] correcciones de /sati: S-1 (1.3.1, 3.3.2, 4.1.2) los botones deshabilitados por el tope traen `aria-describedby` hacia el aviso; S-2 (2.4.3) el foco no cae en `body`
 * al alcanzar el tope; OBS-1 un solo `role=status` por caso.
 *
 * @implements REQ-HOG11-004, SC-011-053, SC-011-056
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { limitFocusTarget } from '../../../src/presentation/web/household-limit.ts';
import { InvitationList } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { invitationView } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const render = (n: number, atLimit: boolean): string => renderToStaticMarkup(h(InvitationList, { invitations: Array.from({ length: n }, () => invitationView()), atLimit, onAccept: noop, onDecline: noop }));

describe('T1550 S-1: motivo accesible del botón deshabilitado', () => {
  it('«Aceptar» deshabilitado trae aria-describedby hacia el aviso con id existente', () => {
    const html = render(1, true);
    const button = /<button[^>]*disabled=""[^>]*>/.exec(html)?.[0] ?? '';
    const ref = /aria-describedby="([^"]+)"/.exec(button)?.[1];
    expect(ref).toBe('invitations-limit-notice');
    expect(html).toContain(`id="${ref}"`);
  });
  it('sin tope no hay aria-describedby ni botón deshabilitado', () => {
    const html = render(1, false);
    expect([html.includes('aria-describedby'), html.includes('disabled=""')]).toEqual([false, false]);
  });
  it('OBS-1: el aviso de invitaciones no es un role=status duplicado del aviso del formulario', () => {
    expect(render(2, true)).not.toContain('role="status"');
  });
});

describe('T1550 S-2: destino del foco al alcanzar el tope (2.4.3)', () => {
  it('crear el 5.º hogar lleva el foco al aviso del formulario', () => {
    expect(limitFocusTarget(false, true, 'CREATE', 0)).toBe('CREATE_NOTICE');
  });
  it('aceptar la única invitación lleva el foco al encabezado de invitaciones', () => {
    expect(limitFocusTarget(false, true, 'ACCEPT', 0)).toBe('INVITATIONS_HEADING');
  });
  it('aceptar una de dos lleva el foco al aviso de invitaciones', () => {
    expect(limitFocusTarget(false, true, 'ACCEPT', 1)).toBe('INVITATIONS_NOTICE');
  });
  it('sin transición al tope o sin acción propia no se mueve el foco', () => {
    expect([limitFocusTarget(true, true, 'CREATE', 0), limitFocusTarget(false, false, 'ACCEPT', 1), limitFocusTarget(false, true, null, 1), limitFocusTarget(true, false, 'ACCEPT', 0)]).toEqual([null, null, null, null]);
  });
  it('aviso y encabezado son enfocables por programa (tabindex=-1)', () => {
    const html = render(1, true);
    expect(html).toMatch(/<h2[^>]*id="invitations-title"[^>]*tabindex="-1"/);
    expect(html).toMatch(/<p[^>]*id="invitations-limit-notice"[^>]*tabindex="-1"/);
  });
});
