/**
 * T1676, hueco 1 [GH:#32]: la UI NO guarda cuando el dato vigente no llegó del servidor (campo ausente, distinto de `null` explícito y de lista vacía explícita), para no borrar alergias
 * ni teléfono que no pudo leer (REQ-QR12-001, REQ-QR12-002, REQ-QR12-009). Render estático de las vistas y pruebas de las funciones puras de guardado con un cliente simulado.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountPhoneSection, AccountPhoneSectionView, updatePhoneIfLoaded } from '../../../src/presentation/web/components/AccountPhone.tsx';
import { CriticalAllergiesEditor, CriticalAllergiesEditorView, updateAllergiesIfLoaded } from '../../../src/presentation/web/components/EmergencyAllergies.tsx';
import type { EmergencyApi } from '../../../src/presentation/web/emergency-api.ts';

const noop = (): void => undefined;
const ALLERGIES_MISSING = 'No se pudieron cargar las alergias; recarga la página.';
const PHONE_MISSING = 'No se pudo cargar tu teléfono; recarga la página.';

function spyApi(): { api: Pick<EmergencyApi, 'updateAllergies' | 'updatePhone'>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    api: {
      updateAllergies: async (petId, list) => (calls.push(`PUT /pets/${petId}/critical-allergies ${JSON.stringify(list)}`), { petId, criticalAllergies: [...list] }),
      updatePhone: async (phone) => (calls.push(`PUT /account/phone ${JSON.stringify(phone)}`), { phone }),
    } as Pick<EmergencyApi, 'updateAllergies' | 'updatePhone'>,
  };
}

describe('T1676 hueco 1: alergias sin dato cargado', () => {
  it('con el campo ausente el editor sale deshabilitado, con el texto neutro y sin botón de guardado activo', () => {
    const markup = renderToStaticMarkup(h(CriticalAllergiesEditor, { petId: 'p1' }));
    expect(markup).toContain(ALLERGIES_MISSING);
    expect(markup).toMatch(/<textarea[^>]*disabled/);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled/);
  });

  it('con la lista vacía explícita el editor está habilitado y sin aviso; con una lista cargada la muestra', () => {
    const empty = renderToStaticMarkup(h(CriticalAllergiesEditor, { petId: 'p1', initial: [] }));
    expect(empty).not.toContain(ALLERGIES_MISSING);
    expect(empty).not.toMatch(/<textarea[^>]*disabled/);
    expect(renderToStaticMarkup(h(CriticalAllergiesEditor, { petId: 'p1', initial: ['Penicilina'] }))).toContain('Penicilina');
  });

  it('la vista pura respeta unavailable y el guardado no emite PUT sin dato cargado (ni con texto vacío ni con texto escrito)', async () => {
    expect(renderToStaticMarkup(h(CriticalAllergiesEditorView, { text: '', busy: false, error: null, saved: null, onText: noop, onSave: noop, unavailable: true }))).toContain(ALLERGIES_MISSING);
    const { api, calls } = spyApi();
    expect(await updateAllergiesIfLoaded(api, 'p1', false, '')).toBeNull();
    expect(await updateAllergiesIfLoaded(api, 'p1', false, 'Penicilina')).toBeNull();
    expect(calls).toEqual([]);
    await updateAllergiesIfLoaded(api, 'p1', true, '');
    await updateAllergiesIfLoaded(api, 'p1', true, ' Penicilina \nLátex');
    expect(calls).toEqual(['PUT /pets/p1/critical-allergies []', 'PUT /pets/p1/critical-allergies ["Penicilina","Látex"]']);
  });
});

describe('T1676 hueco 1: teléfono sin dato cargado', () => {
  it('con el campo ausente no hay campo ni guardado y sale el texto neutro; con null explícito el campo está vacío y editable', () => {
    const missing = renderToStaticMarkup(h(AccountPhoneSection, {}));
    expect(missing).toContain(PHONE_MISSING);
    expect(missing).not.toContain('<input');
    expect(missing).not.toContain('<form');
    const none = renderToStaticMarkup(h(AccountPhoneSection, { initial: null }));
    expect(none).not.toContain(PHONE_MISSING);
    expect(none).toContain('<input');
    expect(renderToStaticMarkup(h(AccountPhoneSection, { initial: '+573001112233' }))).toContain('+573001112233');
    expect(renderToStaticMarkup(h(AccountPhoneSectionView, { value: '', busy: false, error: null, saved: null, onValue: noop, onSave: noop, unavailable: true }))).toContain(PHONE_MISSING);
  });

  it('el guardado no emite PUT sin dato cargado; con el dato cargado, vacío borra con null explícito', async () => {
    const { api, calls } = spyApi();
    expect(await updatePhoneIfLoaded(api, false, '')).toBeNull();
    expect(await updatePhoneIfLoaded(api, false, '+573001112233')).toBeNull();
    expect(calls).toEqual([]);
    await updatePhoneIfLoaded(api, true, '  ');
    await updatePhoneIfLoaded(api, true, ' +573001112233 ');
    expect(calls).toEqual(['PUT /account/phone null', 'PUT /account/phone "+573001112233"']);
  });
});
