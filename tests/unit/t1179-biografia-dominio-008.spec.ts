import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError, type BackupEnvelopeV3 } from '../../src/generated/index.ts';
import { normalizeBiographyInput, updatePetProfile, type PetProfile } from '../../src/domain/pet/pet-invariants.ts';
import { upgradePet } from '../fixtures/storage-upgrade.ts';

/**
 * T1179 (008, bloque I, `[GH:#21]`): reglas de dominio de la biografía en `updatePetProfile` (REQ-BIO8-001, EDGE-008-041): texto plano de 0 a 280 caracteres, recortado,
 * sin caracteres de control, vacío = sin biografía; el resto de la ficha no cambia y la entrada no se modifica.
 */
const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));
const argos = ((fixtures.validBackupEnvelopeV2 as BackupEnvelopeV3).pets as unknown as PetProfile[]).map(upgradePet)[0]!;
const NOW = '2026-11-05T13:00:00.000Z';
const update = (input: unknown, pet: PetProfile = argos) => updatePetProfile({ pet, input, today: '2026-11-05', nowIsoTimestamp: NOW, recordEventDates: [] });
const failure = (action: () => unknown): DomainError => {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
};

describe('normalizeBiographyInput (T1179)', () => {
  it('[GH:#21][REQ-BIO8-001][EDGE-008-041] recorta, convierte vacío o solo espacios en null y no toca lo que no es texto ni el resto de la entrada', () => {
    expect([
      normalizeBiographyInput({ biography: '  hola  ' }),
      normalizeBiographyInput({ biography: '' }),
      normalizeBiographyInput({ biography: ' \t ' }),
      normalizeBiographyInput({ biography: null }),
      normalizeBiographyInput({ name: 'x' }),
      normalizeBiographyInput({ biography: 7 }),
      normalizeBiographyInput(null),
      normalizeBiographyInput([1]),
    ]).toEqual([{ biography: 'hola' }, { biography: null }, { biography: null }, { biography: null }, { name: 'x' }, { biography: 7 }, null, [1]]);
  });

  it('[GH:#21][REQ-BIO8-001] no muta la entrada', () => {
    const input = Object.freeze({ biography: '  hola  ', name: 'N' });
    expect(normalizeBiographyInput(input)).toEqual({ biography: 'hola', name: 'N' });
    expect(input.biography).toBe('  hola  ');
  });
});

describe('updatePetProfile con biografía (T1179)', () => {
  it('[GH:#21][REQ-BIO8-001][SC-008-043] guarda la biografía recortada, sube la versión y no cambia el resto de la ficha', () => {
    const updated = update({ biography: '  Adora el queso  ' });
    expect(updated.biography).toBe('Adora el queso');
    expect([updated.version, updated.name, updated.species, updated.breed]).toEqual([(argos.version ?? 1) + 1, argos.name, argos.species, argos.breed]);
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-008-041] vacía, solo espacios o null deja la ficha sin la clave; borrar una biografía previa también', () => {
    const withBio = update({ biography: 'algo' });
    for (const input of [{ biography: '' }, { biography: '   ' }, { biography: null }]) {
      expect('biography' in update(input, withBio), JSON.stringify(input)).toBe(false);
    }
    expect('biography' in update({ name: 'Otro' }), 'una edición ajena no inventa la clave').toBe(false);
    expect(update({ name: 'Otro' }, withBio).biography, 'una edición ajena conserva la biografía').toBe('algo');
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-008-041] admite exactamente 280 caracteres (también emojis) y rechaza 281, sin repetir el texto', () => {
    expect(update({ biography: 'a'.repeat(280) }).biography).toHaveLength(280);
    expect([...update({ biography: '🐾'.repeat(280) }).biography!]).toHaveLength(280);
    const long = 'z'.repeat(281);
    const error = failure(() => update({ biography: long }));
    expect([error.code, error.message.includes('zzzz')]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', false]);
    expect(failure(() => update({ biography: '🐾'.repeat(281) })).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-008-041] los saltos de línea y los caracteres de control se rechazan, también dentro del texto', () => {
    for (const bad of ['uno\ndos', 'uno\r\ndos', 'uno\tdos', 'uno\u0000dos', 'uno\u001fdos', 'uno\u007fdos']) {
      expect(failure(() => update({ biography: bad })).code, JSON.stringify(bad)).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
  });

  it('[GH:#21][REQ-BIO8-001] una biografía que no es texto o un campo desconocido se rechaza (esquema cerrado)', () => {
    for (const input of [{ biography: 7 }, { biography: ['x'] }, { biography: {} }, { biografia: 'x' }]) {
      expect(failure(() => update(input)).code, JSON.stringify(input)).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
  });

  it('[GH:#21][REQ-BIO8-002] el texto con marcado se guarda tal cual como texto plano (se escapa al mostrarlo, nunca se interpreta)', () => {
    expect(update({ biography: '<script>alert(1)</script> & <b>x</b>' }).biography).toBe('<script>alert(1)</script> & <b>x</b>');
  });
});
