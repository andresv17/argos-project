import { describe, expect, it } from 'vitest';
import { speciesToDoseGroup } from '../../src/domain/care/care-species-group.ts';
import { SPECIES } from '../../src/domain/pet/species.ts';

/**
 * T1655 tramo 2: mapeo especie a grupo de dosis. PENDIENTE APROBACIÓN NEO: la tabla es la propuesta del oráculo; esta prueba la fija como valor de trabajo.
 *
 * @implements REQ-CAR12-001, SC-012-088
 */
describe('speciesToDoseGroup (propuesta del oráculo, pendiente de Neo)', () => {
  it('[SC-012-088] CANINE y FELINE van a CANINE_FELINE y las otras seis especies a OTHER_SPECIES', () => {
    const mapped = Object.fromEntries(SPECIES.map((s) => [s, speciesToDoseGroup(s)]));
    expect(mapped).toEqual({ CANINE: 'CANINE_FELINE', FELINE: 'CANINE_FELINE', RABBIT: 'OTHER_SPECIES', FERRET: 'OTHER_SPECIES', BIRD: 'OTHER_SPECIES', REPTILE: 'OTHER_SPECIES', SMALL_MAMMAL: 'OTHER_SPECIES', OTHER: 'OTHER_SPECIES' });
  });
  it('[SC-012-088] una especie desconocida cae en OTHER_SPECIES (sin guarda numérica)', () => {
    expect(speciesToDoseGroup('DRAGON')).toBe('OTHER_SPECIES');
  });
});
