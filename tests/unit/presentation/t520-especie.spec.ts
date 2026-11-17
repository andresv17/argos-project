/**
 * T520 [US1] SC-CAT-001 (REQ-ESP-001): las opciones de «Especie» del alta y de la edición son exactamente las 8 del dominio
 * (`SPECIES`) y del enum del contrato 3.1.0, con los rótulos de `SPECIES_LABEL`. El filtro del listado (Perros, Gatos, Otros)
 * agrupa; el formulario no.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SPECIES } from '../../../src/domain/pet/species.ts';
import { PetForm } from '../../../src/presentation/web/components/PetForm.tsx';
import { PET_FILTER_OPTIONS, SPECIES_LABEL } from '../../../src/presentation/web/view-model.ts';
import { profile } from './presentation-fixtures.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const html = (el: ReactElement): string => renderToStaticMarkup(el);
const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

function speciesOptions(markup: string): { value: string; label: string }[] {
  const select = /<select[^>]*name="species"[^>]*>(.*?)<\/select>/s.exec(markup);
  if (!select) throw new Error('no hay selector de especie');
  return [...select[1]!.matchAll(/<option value="([A-Z_]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({ value: m[1]!, label: m[2]! }));
}
const contractEnum = (): string[] => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'specs/004-catalogos-registros-archivos/contracts/schemas/pet.schema.json'), 'utf8')) as { $defs: { Species: { enum: string[] } } };
  return schema.$defs.Species.enum;
};

describe('T520 SC-CAT-001: «Especie» del alta y de la edición', () => {
  const expected = SPECIES.map((value) => ({ value, label: SPECIES_LABEL[value] }));

  it('el alta ofrece exactamente SPECIES, en orden, con SPECIES_LABEL', () => {
    expect(speciesOptions(html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop })))).toEqual(expected);
  });

  it('la edición ofrece la misma lista que el alta (perro, gato y especie «Otro»)', () => {
    for (const species of ['CANINE', 'FELINE', 'OTHER'] as const) {
      expect(speciesOptions(html(h(PetForm, { profile: profile('p1', 'Kiwi', undefined, species), onSubmit: asyncNoop, onCancel: noop }))), species).toEqual(expected);
    }
  });

  it('SPECIES coincide con el enum Species del contrato 3.1.0 (8 valores)', () => {
    expect([...SPECIES]).toEqual(contractEnum());
    expect(SPECIES).toHaveLength(8);
  });

  it('el filtro del listado agrupa (Perros, Gatos, Otros); el formulario no ofrece «solo Perro y Gato»', () => {
    const filter = PET_FILTER_OPTIONS.map((o) => o.value);
    expect(filter).toEqual(['ALL', 'CANINE', 'FELINE', 'OTHERS', 'WITH_ALERTS']);
    expect(speciesOptions(html(h(PetForm, { profile: null, onSubmit: asyncNoop, onCancel: noop }))).map((o) => o.value)).not.toContain('OTHERS');
  });
});
