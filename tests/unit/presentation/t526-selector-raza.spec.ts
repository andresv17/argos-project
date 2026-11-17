/**
 * T526 [US1] selector de raza (SC-CAT-002, SC-CAT-003; REQ-RAZ-001, REQ-RAZ-002, REQ-RAZ-003): orden, «Otra» con campo libre
 * opcional que se envía como `breed`, «Raza actual» para mascotas antiguas y raza libre solo para las 6 especies sin catálogo.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { breedOptions } from '../../../src/domain/pet/breed-catalog.ts';
import { PetForm, breedFieldsForSpecies, petFormBody, petFormInitial } from '../../../src/presentation/web/components/PetForm.tsx';
import { formValues, validateInput } from '../../../src/presentation/web/validation.ts';
import { profile } from './presentation-fixtures.ts';

const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;
const form = (p: ReturnType<typeof profile> | null): string => html(h(PetForm, { profile: p, onSubmit: asyncNoop, onCancel: noop }));
const withBreed = (species: 'CANINE' | 'FELINE' | 'RABBIT', extra: Record<string, unknown>): ReturnType<typeof profile> => ({ ...profile('p1', 'Kiwi', undefined, species), ...extra }) as ReturnType<typeof profile>;

function breedSelect(markup: string): { value: string; label: string; selected: boolean }[] {
  const select = /<select[^>]*name="breedCode"[^>]*>(.*?)<\/select>/s.exec(markup);
  if (!select) throw new Error('no hay selector de raza');
  return [...select[1]!.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map((m) => ({ value: m[1]!, label: m[3]!, selected: m[2]!.includes('selected') }));
}

describe('T526 orden del selector (SC-CAT-002)', () => {
  it('CANINE en el alta: «Criolla» primera, «Otra» última y las intermedias alfabéticas sin tildes; todas las del catálogo', () => {
    const options = breedSelect(form(null));
    expect(options.map((o) => o.value)).toEqual(breedOptions('CANINE').map((o) => o.code));
    expect(options[0]).toMatchObject({ value: 'DOG_CRIOLLA', label: 'Criolla', selected: true });
    expect(options.at(-1)).toMatchObject({ value: 'DOG_OTHER', label: 'Otra' });
    const middle = options.slice(1, -1).map((o) => o.label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
    expect(middle).toEqual([...middle].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('FELINE en la edición con CAT_SIAMES: lista de gatos con «Siamés» seleccionado, «Criolla» primera y «Otra» última', () => {
    const options = breedSelect(form(withBreed('FELINE', { breedCode: 'CAT_SIAMES', breed: 'Siamés' })));
    expect([options[0]?.label, options.at(-1)?.label]).toEqual(['Criolla', 'Otra']);
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(['CAT_SIAMES']);
  });
});

describe('T526 «Otra» con campo libre opcional (SC-CAT-003, REQ-RAZ-002)', () => {
  it('con una raza de catálogo no hay campo libre de raza; con «Otra» aparece, opcional, con el texto guardado', () => {
    expect(form(withBreed('CANINE', { breedCode: 'DOG_BEAGLE', breed: 'Beagle' }))).not.toContain('name="breed"');
    const other = form(withBreed('CANINE', { breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano' }));
    expect(other).toMatch(/<input[^>]*name="breed"[^>]*value="Pastor Maremmano"/);
    expect(other).not.toMatch(/<input[^>]*name="breed"[^>]*required/);
    expect(other).toContain('Otra raza (opcional)');
  });

  it('«Otra» guardada sin texto (breed = «Otra») deja el campo libre vacío', () => {
    expect(petFormInitial(withBreed('CANINE', { breedCode: 'DOG_OTHER', breed: 'Otra' }))).toMatchObject({ breedCode: 'DOG_OTHER', breed: '' });
  });

  it('SC-CAT-003: «Pastor Maremmano » con espacio final se envía recortado como breed junto a DOG_OTHER y el contrato lo acepta', () => {
    const raw = { name: 'Rocky', species: 'CANINE', breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano ', birthDate: '2024-06-01', sex: 'MALE' };
    const body = formValues(raw);
    expect(validateInput('CreatePetInput', body)).toEqual({});
    expect(petFormBody(null, body)).toMatchObject({ breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano' });
  });

  it('SC-CAT-003: sin texto libre no se envía breed (el servidor deriva «Otra») y con DOG_CRIOLLA tampoco', () => {
    const base = { name: 'Rocky', species: 'CANINE', birthDate: '2024-06-01', sex: 'MALE' };
    for (const breedCode of ['DOG_OTHER', 'DOG_CRIOLLA']) {
      const body = petFormBody(null, formValues({ ...base, breedCode, breed: '' }));
      expect('breed' in body, breedCode).toBe(false);
      expect(validateInput('CreatePetInput', body), breedCode).toEqual({});
    }
  });

  it('una raza de catálogo descarta el texto libre que haya quedado en el estado del formulario', () => {
    const body = petFormBody(null, { name: 'Rocky', species: 'CANINE', breedCode: 'DOG_BEAGLE', breed: 'texto viejo', birthDate: '2024-06-01', sex: 'MALE' });
    expect(body).toEqual({ name: 'Rocky', species: 'CANINE', breedCode: 'DOG_BEAGLE', birthDate: '2024-06-01', sex: 'MALE' });
  });

  it('en la edición, vaciar el texto libre de «Otra» envía breed «Otra» para que no se conserve el anterior', () => {
    const had = withBreed('CANINE', { breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano' });
    expect(petFormBody(had, { name: 'Kiwi', species: 'CANINE', breedCode: 'DOG_OTHER', birthDate: '2020-05-01', sex: 'MALE' })).toMatchObject({ breedCode: 'DOG_OTHER', breed: 'Otra' });
  });
});

describe('T526 «Raza actual» para mascotas antiguas (SC-CAT-004, REQ-RAZ-003)', () => {
  const legacy = withBreed('CANINE', { breed: 'Golden', breedCode: null });

  it('una mascota sin breedCode muestra «Raza actual: Golden» como primera opción, seleccionada, antes de «Criolla»', () => {
    const options = breedSelect(form(legacy));
    expect(options[0]).toEqual({ value: '', label: 'Raza actual: Golden', selected: true });
    expect(options[1]?.label).toBe('Criolla');
  });

  it('no obliga a elegir del catálogo: editar solo el nombre reenvía la misma raza y ningún breedCode', () => {
    expect(petFormInitial(legacy)).toMatchObject({ breedCode: '', breed: 'Golden' });
    const body = petFormBody(legacy, formValues({ ...petFormInitial(legacy), name: 'Kiwi II' }, [], ['birthDateIsEstimate']));
    expect(body).toMatchObject({ name: 'Kiwi II', breed: 'Golden' });
    expect('breedCode' in body).toBe(false);
    expect(validateInput('UpdatePetInput', body)).toEqual({});
  });

  it('el alta no muestra «Raza actual»', () => {
    expect(form(null)).not.toContain('Raza actual');
  });
});

describe('T526 raza libre solo para las 6 especies sin catálogo (REQ-RAZ-003)', () => {
  it('RABBIT: campo de raza obligatorio y ningún selector de catálogo', () => {
    const markup = form(withBreed('RABBIT', { breed: 'Cabeza de león', breedCode: null }));
    expect(markup).not.toContain('name="breedCode"');
    expect(markup).toMatch(/<input[^>]*name="breed"[^>]*value="Cabeza de león"/);
    expect(markup).toMatch(/<input[^>]*name="breed"[^>]*required/);
  });

  it('cambiar de especie reinicia la raza: perro/gato a su «Criolla»; las demás a vacío', () => {
    expect(breedFieldsForSpecies('CANINE')).toEqual({ breedCode: 'DOG_CRIOLLA', breed: '' });
    expect(breedFieldsForSpecies('FELINE')).toEqual({ breedCode: 'CAT_CRIOLLA', breed: '' });
    for (const species of ['RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER']) expect(breedFieldsForSpecies(species)).toEqual({ breedCode: '', breed: '' });
  });

  it('pasar de perro con raza de catálogo a conejo envía breedCode null y la raza libre', () => {
    const had = withBreed('CANINE', { breedCode: 'DOG_BEAGLE', breed: 'Beagle' });
    const body = petFormBody(had, formValues({ name: 'Kiwi', species: 'RABBIT', breedCode: '', breed: 'Enano', birthDate: '2020-05-01', sex: 'MALE' }));
    expect(body).toMatchObject({ species: 'RABBIT', breed: 'Enano', breedCode: null });
  });

  it('el alta de un conejo no envía breedCode', () => {
    const body = petFormBody(null, formValues({ name: 'Kiwi', species: 'RABBIT', breedCode: '', breed: 'Enano', birthDate: '2020-05-01', sex: 'MALE' }));
    expect('breedCode' in body).toBe(false);
  });
});
