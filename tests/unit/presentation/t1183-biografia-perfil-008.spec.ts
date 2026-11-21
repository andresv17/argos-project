/**
 * T1183 (008, bloque I, `[GH:#21]`) UI de la biografía: campo en la edición de la mascota (no en el alta) con contador de caracteres y ayuda asociada, lectura como texto plano en la
 * ficha para quien puede ver la mascota (Lector incluido, sin acción de editar), `null` al vaciarla y nunca en la tarjeta del listado. Render estático (`renderToStaticMarkup`);
 * el recorrido con navegador real es el E2E T1184.
 * REQ-BIO8-001, REQ-BIO8-002, NFR-008-002; SC-008-043, SC-008-044.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BIOGRAPHY_MAX_LENGTH, BiographyField, PetForm, petFormBody, petFormInitial } from '../../../src/presentation/web/components/PetForm.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { humanSchemaMessage } from '../../../src/presentation/web/schema-messages.ts';
import type { PetProfile } from '../../../src/presentation/web/view-model.ts';
import { dashboard, profile } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const withBio = (biography: string | null): PetProfile => ({ ...profile('p1', 'Kiwi'), biography }) as unknown as PetProfile;
const form = (p: PetProfile | null): string => renderToStaticMarkup(h(PetForm, { profile: p, onSubmit: asyncNoop, onCancel: noop }));
const view = (role: 'OWNER' | 'READER', biography: string | null): string => {
  const base = dashboard(role);
  return renderToStaticMarkup(h(PetDashboard, { dashboard: { ...base, profile: { ...base.profile, biography } as PetProfile }, activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop }));
};

describe('campo de biografía en la edición (T1183)', () => {
  it('[GH:#21][REQ-BIO8-001][SC-008-043] la edición trae «Biografía (opcional)» con la biografía cargada, contador «N de 280 caracteres» asociado por aria-describedby; el alta no la trae', () => {
    const markup = form(withBio('Adora el queso'));
    expect(markup).toMatch(/<label[^>]*for="edit-pet-p1-biography"[^>]*>Biografía \(opcional\)/);
    expect(markup).toMatch(/<input[^>]*id="edit-pet-p1-biography"[^>]*name="biography"[^>]*value="Adora el queso"/);
    expect(markup).toMatch(/<input[^>]*id="edit-pet-p1-biography"[^>]*aria-describedby="edit-pet-p1-biography-help"/);
    expect(markup).toMatch(/id="edit-pet-p1-biography-help"[^>]*>14 de 280 caracteres\./);
    expect(form(null)).not.toContain('biography');
    expect(BIOGRAPHY_MAX_LENGTH).toBe(280);
  });

  it('[GH:#21][REQ-BIO8-001][SC-008-044] una ficha sin biografía parte con el campo vacío y el contador en 0; el error del campo se asocia y el exceso marca el campo inválido', () => {
    expect(petFormInitial(withBio(null))).toMatchObject({ biography: '' });
    expect(petFormInitial(profile('p2', 'Sin campo'))).toMatchObject({ biography: '' });
    expect(petFormInitial(null)).toMatchObject({ biography: '' });
    expect(form(withBio(null))).toMatch(/>0 de 280 caracteres\./);
    const over = renderToStaticMarkup(h(BiographyField, { id: 'b', value: 'a'.repeat(281), onChange: noop, errors: {} }));
    expect(over).toMatch(/aria-invalid="true"/);
    expect(over).toContain('281 de 280 caracteres.');
    const withError = renderToStaticMarkup(h(BiographyField, { id: 'b', value: 'x', onChange: noop, errors: { biography: humanSchemaMessage('biography') } }));
    expect(withError).toMatch(/aria-describedby="b-help b-error"/);
    expect(withError).toContain('Revisa la biografía');
  });

  it('[GH:#21][REQ-BIO8-001] el cuerpo: vaciar la biografía de una ficha que la tenía envía null; sin biografía previa no envía nada; el alta nunca la envía', () => {
    expect(petFormBody(withBio('algo'), { name: 'Kiwi' })).toMatchObject({ biography: null });
    expect(petFormBody(withBio(null), { name: 'Kiwi' })).not.toHaveProperty('biography');
    expect(petFormBody(withBio('algo'), { name: 'Kiwi', biography: 'nueva' })).toMatchObject({ biography: 'nueva' });
    expect(petFormBody(null, { name: 'Kiwi', biography: 'x' })).not.toHaveProperty('biography');
  });
});

describe('lectura de la biografía en la ficha (T1183)', () => {
  it('[GH:#21][REQ-BIO8-002][SC-008-043] la ficha muestra la biografía como texto; sin biografía (null o vacía) no pinta nada', () => {
    expect(view('OWNER', 'Adora el queso')).toMatch(/<p[^>]*data-pet-biography[^>]*>Adora el queso<\/p>/);
    expect(view('OWNER', null)).not.toContain('data-pet-biography');
    expect(view('OWNER', '')).not.toContain('data-pet-biography');
  });

  it('[GH:#21][REQ-BIO8-002][EDGE-008-042] el marcado de la biografía se escapa: nunca se interpreta como HTML', () => {
    const markup = view('OWNER', '<img src=x onerror=alert(1)> & <b>hola</b>');
    expect(markup).not.toContain('<img src=x');
    expect(markup).not.toContain('<b>hola</b>');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;hola&lt;/b&gt;');
  });

  it('[GH:#21][REQ-BIO8-002][SC-008-044] un Lector ve la biografía y no tiene acción de editarla (sin botón Editar)', () => {
    const markup = view('READER', 'Adora el queso');
    expect(markup).toContain('Adora el queso');
    expect(markup).not.toContain('>Editar<');
    expect(markup).not.toContain('name="biography"');
  });
});

describe('contador de biografía por puntos de código (O-2)', () => {
  const emoji = '😀';
  it('[GH:#21][REQ-BIO8-001] 280 emojis cuentan 280 (no 560): sin marca de exceso; 281 sí exceden', () => {
    const exact = renderToStaticMarkup(h(BiographyField, { id: 'b', value: emoji.repeat(280), onChange: noop, errors: {} }));
    expect(exact).toContain('280 de 280 caracteres.');
    expect(exact).not.toContain('aria-invalid');
    const over = renderToStaticMarkup(h(BiographyField, { id: 'b', value: emoji.repeat(281), onChange: noop, errors: {} }));
    expect(over).toContain('281 de 280 caracteres.');
    expect(over).toContain('aria-invalid="true"');
  });
});
