/**
 * T522 [US1] dominio del catálogo de razas (SC-CAT-002, SC-CAT-004): orden «Criolla» primero y «Otra» al final, códigos
 * únicos y estables, `deprecated`, y `assertBreedConsistency` con `breed` derivado (INV-RAZ-001).
 */
import { describe, expect, it } from 'vitest';
import { BREEDS } from '../../src/generated/catalogs/index.ts';
import { DomainError } from '../../src/generated/index.ts';
import { assertBreedConsistency, breedOptions, deriveBreed, hasBreedCatalog, isBreedOther } from '../../src/domain/pet/breed-catalog.ts';

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** 'OK' si no lanza; si lanza un DomainError, `código@campo`. */
function outcomeOf(run: () => unknown): string {
  try {
    run();
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}

function failure(run: () => unknown): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('no lanzó DomainError');
}

describe('T522 catálogo de razas (REQ-RAZ-001)', () => {
  it('SC-CAT-002: solo CANINE y FELINE tienen catálogo', () => {
    expect(['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'].map(hasBreedCatalog)).toEqual([true, true, false, false, false, false, false, false]);
  });

  it('SC-CAT-002: «Criolla» primero, «Otra» al final y las intermedias en orden alfabético sin tildes (perros y gatos)', () => {
    for (const [species, criolla, otra] of [['CANINE', 'DOG_CRIOLLA', 'DOG_OTHER'], ['FELINE', 'CAT_CRIOLLA', 'CAT_OTHER']] as const) {
      const options = breedOptions(species);
      expect(options[0]?.code).toBe(criolla);
      expect(options[0]?.label).toBe('Criolla');
      expect(options.at(-1)?.code).toBe(otra);
      expect(options.at(-1)?.label).toBe('Otra');
      const middle = options.slice(1, -1).map((o) => fold(o.label));
      expect(middle).toEqual([...middle].sort((a, b) => a.localeCompare(b, 'es')));
      expect(options.length).toBeGreaterThan(10);
    }
  });

  it('breedOptions devuelve [] para las 6 especies sin catálogo', () => {
    for (const species of ['RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER']) expect(breedOptions(species)).toEqual([]);
  });

  it('REQ-RAZ-001: códigos únicos, con prefijo de la especie, rótulos únicos por especie y 68 entradas', () => {
    expect(BREEDS).toHaveLength(68);
    expect(new Set(BREEDS.map((b) => b.code)).size).toBe(68);
    for (const b of BREEDS) expect(b.code.startsWith(b.species === 'CANINE' ? 'DOG_' : 'CAT_'), b.code).toBe(true);
    for (const species of ['CANINE', 'FELINE']) {
      const labels = BREEDS.filter((b) => b.species === species).map((b) => fold(b.label));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('REQ-RAZ-001: estabilidad de códigos publicados (no se renombran ni se eliminan)', () => {
    const codes = BREEDS.map((b) => b.code);
    for (const stable of ['DOG_CRIOLLA', 'DOG_OTHER', 'DOG_AKITA', 'DOG_BEAGLE', 'CAT_CRIOLLA', 'CAT_OTHER', 'CAT_SIAMES']) expect(codes).toContain(stable);
  });

  it('REQ-RAZ-001: `deprecated` no aparece en las opciones nuevas pero sigue siendo válido en datos existentes', () => {
    const retired = BREEDS.find((b) => b.code === 'DOG_AKITA');
    if (!retired) throw new Error('DOG_AKITA ausente');
    const deprecated = { ...retired, deprecated: true };
    expect(breedOptions('CANINE', [deprecated]).some((o) => o.code === 'DOG_AKITA')).toBe(false);
    expect(outcomeOf(() => assertBreedConsistency('CANINE', 'DOG_AKITA', 'Akita', [deprecated]))).toBe('OK');
  });
});

describe('T522 deriveBreed (REQ-RAZ-002)', () => {
  it('SC-CAT-003: con un código del catálogo la raza es el rótulo; «Criolla» sin breed queda «Criolla»', () => {
    expect(deriveBreed('DOG_CRIOLLA', undefined)).toBe('Criolla');
    expect(deriveBreed('DOG_AKITA', undefined)).toBe('Akita');
    expect(deriveBreed('DOG_AKITA', 'Akita')).toBe('Akita');
    expect(deriveBreed('CAT_SIAMES', undefined)).toBe('Siamés');
  });

  it('SC-CAT-003: con *_OTHER la raza es el texto libre recortado o «Otra» si no hay texto', () => {
    expect(deriveBreed('DOG_OTHER', 'Pastor Maremmano')).toBe('Pastor Maremmano');
    expect(deriveBreed('DOG_OTHER', undefined)).toBe('Otra');
    expect(deriveBreed('CAT_OTHER', 'Bengala')).toBe('Bengala');
    expect(isBreedOther('DOG_OTHER')).toBe(true);
    expect(isBreedOther('CAT_OTHER')).toBe(true);
    expect(isBreedOther('DOG_AKITA')).toBe(false);
  });

  it('SC-CAT-004: un breed distinto del rótulo con código de catálogo se rechaza en el campo breed', () => {
    const error = failure(() => deriveBreed('DOG_CRIOLLA', 'Golden'));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'breed']);
  });

  it('un código fuera del catálogo se rechaza en el campo breedCode', () => {
    const error = failure(() => deriveBreed('DOG_INEXISTENTE', undefined));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'breedCode']);
  });

  it('REQ-RAZ-002: el texto libre de *_OTHER mide entre 1 y 60 caracteres', () => {
    expect(deriveBreed('DOG_OTHER', 'x'.repeat(60))).toBe('x'.repeat(60));
    expect(failure(() => deriveBreed('DOG_OTHER', 'x'.repeat(61))).field).toBe('breed');
    expect(failure(() => deriveBreed('DOG_OTHER', '')).field).toBe('breed');
  });
});

describe('T522 assertBreedConsistency (INV-RAZ-001)', () => {
  it('SC-CAT-004: breedCode nulo con texto libre válido es coherente (mascota antigua «Golden»)', () => {
    expect(outcomeOf(() => assertBreedConsistency('CANINE', null, 'Golden'))).toBe('OK');
    expect(outcomeOf(() => assertBreedConsistency('RABBIT', null, 'Cabeza de león'))).toBe('OK');
    expect(outcomeOf(() => assertBreedConsistency('RABBIT', undefined, 'Cabeza de león'))).toBe('OK');
  });

  it('breedCode nulo con raza vacía o de más de 60 caracteres se rechaza en breed', () => {
    expect(failure(() => assertBreedConsistency('RABBIT', null, '')).field).toBe('breed');
    expect(failure(() => assertBreedConsistency('RABBIT', null, 'y'.repeat(61))).field).toBe('breed');
  });

  it('SC-CAT-004: RABBIT con DOG_CRIOLLA se rechaza (breedCode)', () => {
    const error = failure(() => assertBreedConsistency('RABBIT', 'DOG_CRIOLLA', 'Criolla'));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'breedCode']);
  });

  it('SC-CAT-004: FELINE con DOG_CRIOLLA se rechaza (breedCode)', () => {
    expect(failure(() => assertBreedConsistency('FELINE', 'DOG_CRIOLLA', 'Criolla')).field).toBe('breedCode');
    expect(failure(() => assertBreedConsistency('CANINE', 'CAT_CRIOLLA', 'Criolla')).field).toBe('breedCode');
  });

  it('SC-CAT-004: DOG_CRIOLLA con breed «Golden» se rechaza (breed)', () => {
    expect(failure(() => assertBreedConsistency('CANINE', 'DOG_CRIOLLA', 'Golden')).field).toBe('breed');
  });

  it('SC-CAT-003: coherentes: rótulo exacto, «Otra», y texto libre con *_OTHER', () => {
    expect(outcomeOf(() => assertBreedConsistency('CANINE', 'DOG_CRIOLLA', 'Criolla'))).toBe('OK');
    expect(outcomeOf(() => assertBreedConsistency('CANINE', 'DOG_OTHER', 'Otra'))).toBe('OK');
    expect(outcomeOf(() => assertBreedConsistency('CANINE', 'DOG_OTHER', 'Pastor Maremmano'))).toBe('OK');
    expect(outcomeOf(() => assertBreedConsistency('FELINE', 'CAT_SIAMES', 'Siamés'))).toBe('OK');
  });

  it('INV-RAZ-001: un texto libre de *_OTHER fuera de 1..60 se rechaza', () => {
    expect(failure(() => assertBreedConsistency('CANINE', 'DOG_OTHER', 'z'.repeat(61))).field).toBe('breed');
  });
});
