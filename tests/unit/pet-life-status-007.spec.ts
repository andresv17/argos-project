import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import {
  assertLifeStatusInvariant,
  assertNoRecordsAfterDeceasedAt,
  assertRecordDateNotAfterDeceasedAt,
  computedAgeOf,
  createPetProfile,
  normalizePetProfile,
  updatePetProfile,
  type PetProfile,
} from '../../src/domain/pet/pet-invariants.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';

const clock = new FixedClockAdapter();
const TODAY = clock.todayIsoDate();
const NOW = clock.nowIsoTimestamp();
const ID = '22222222-2222-4222-8222-222222222201';
const OWNER = '11111111-1111-4111-8111-111111111101';
const BASE = { name: 'Rocky', species: 'CANINE', breed: 'Mestizo', birthDate: '2020-06-01', sex: 'MALE' };

const create = (extra: Record<string, unknown> = {}): PetProfile => createPetProfile({ id: ID, ownerUserId: OWNER, input: { ...BASE, ...extra }, today: TODAY, nowIsoTimestamp: NOW });
const update = (pet: PetProfile, input: Record<string, unknown>, recordEventDates: string[] = []): PetProfile => updatePetProfile({ pet, input, today: TODAY, nowIsoTimestamp: NOW, recordEventDates });
/** `true` si la regla acepta (no lanza); el oráculo es el booleano, no la ausencia de excepción. */
function accepts(action: () => unknown): boolean {
  try {
    action();
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}
function fails(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

describe('REQ-FAL7-001: modelo lifeStatus/deceasedAt/version del perfil', () => {
  it('el alta sin los campos nuevos queda ALIVE, sin fecha y en versión 1 (retrocompatible)', () => {
    const pet = create();
    expect(pet.lifeStatus).toBe('ALIVE');
    expect(pet.deceasedAt).toBeNull();
    expect(pet.version).toBe(1);
  });

  it('normalizePetProfile completa una mascota anterior a 007 con ALIVE, fecha nula y versión 1', () => {
    const { lifeStatus: _l, deceasedAt: _d, version: _v, ...legacy } = create();
    const normalized = normalizePetProfile(legacy as PetProfile);
    expect([normalized.lifeStatus, normalized.deceasedAt, normalized.version]).toEqual(['ALIVE', null, 1]);
  });

  it('REQ-FAL7-011: cada edición incrementa la versión en 1, empezando en 1', () => {
    const first = update(create(), { name: 'Rocco' });
    expect(first.version).toBe(2);
    expect(update(first, { name: 'Rocky' }).version).toBe(3);
  });

  it('el alta con Fallecido y una fecha válida guarda ambos campos', () => {
    const pet = create({ lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    expect([pet.lifeStatus, pet.deceasedAt]).toEqual(['DECEASED', '2026-01-15']);
  });
});

describe('REQ-FAL7-002: invariante DECEASED <=> fecha, >= birthDate, <= hoy (EDGE-007-004, SC-007-009)', () => {
  it('rechaza Fallecido sin fecha, Vivo con fecha, fecha anterior al nacimiento y fecha futura con ERR-SCHEMA-VALIDATION-FAILED en deceasedAt', () => {
    const cases: Array<Record<string, unknown>> = [
      { lifeStatus: 'DECEASED' },
      { lifeStatus: 'DECEASED', deceasedAt: null },
      { lifeStatus: 'ALIVE', deceasedAt: '2026-01-15' },
      { deceasedAt: '2026-01-15' },
      { lifeStatus: 'DECEASED', deceasedAt: '2020-05-31' },
      { lifeStatus: 'DECEASED', deceasedAt: '2999-01-01' },
    ];
    for (const extra of cases) {
      const error = fails(() => create(extra));
      expect([error.code, error.field], JSON.stringify(extra)).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'deceasedAt']);
    }
  });

  it('acepta fecha igual al nacimiento y fecha igual a hoy (límites inclusivos)', () => {
    expect(create({ lifeStatus: 'DECEASED', deceasedAt: '2020-06-01' }).deceasedAt).toBe('2020-06-01');
    expect(create({ lifeStatus: 'DECEASED', deceasedAt: TODAY }).deceasedAt).toBe(TODAY);
  });

  it('assertLifeStatusInvariant rechaza el mensaje sin repetir el estado ni la fecha (REQ-FAL7-010)', () => {
    const error = fails(() => assertLifeStatusInvariant({ birthDate: '2020-06-01', lifeStatus: 'DECEASED', deceasedAt: '2999-01-01' }, TODAY));
    expect(error.detail).not.toContain('2999');
    expect(error.detail).not.toContain('DECEASED');
  });

  it('EDGE-007-011: editar birthDate de una fallecida se valida sobre el estado resultante (posterior a deceasedAt rechaza; compatible acepta)', () => {
    const dead = create({ lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    const error = fails(() => update(dead, { birthDate: '2026-02-01' }));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'deceasedAt']);
    expect(update(dead, { birthDate: '2019-01-01' }).birthDate).toBe('2019-01-01');
  });

  it('la transición ALIVE -> DECEASED exige la fecha y valida el estado resultante', () => {
    const alive = create();
    expect(fails(() => update(alive, { lifeStatus: 'DECEASED' })).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    const dead = update(alive, { lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    expect([dead.lifeStatus, dead.deceasedAt]).toEqual(['DECEASED', '2026-01-15']);
    expect(fails(() => update(alive, { lifeStatus: 'DECEASED', deceasedAt: '2019-01-01' })).field).toBe('deceasedAt');
  });

  it('la transición DECEASED -> ALIVE borra la fecha (corrección de error); con una fecha explícita se rechaza', () => {
    const dead = create({ lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    const revived = update(dead, { lifeStatus: 'ALIVE' });
    expect([revived.lifeStatus, revived.deceasedAt]).toEqual(['ALIVE', null]);
    expect(fails(() => update(dead, { lifeStatus: 'ALIVE', deceasedAt: '2026-01-15' })).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('una edición ajena al estado conserva lifeStatus y deceasedAt de la mascota', () => {
    const dead = create({ lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });
    const renamed = update(dead, { name: 'Rocco' });
    expect([renamed.lifeStatus, renamed.deceasedAt]).toEqual(['DECEASED', '2026-01-15']);
  });

  it('una mascota Vivo no acepta solo deceasedAt sin lifeStatus (estado resultante ALIVE con fecha)', () => {
    expect(fails(() => update(create(), { deceasedAt: '2026-01-15' })).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });
});

describe('REQ-FAL7-007: la edad de una fallecida se calcula entre birthDate y deceasedAt (EDGE-007-020, SC-007-012)', () => {
  it('REQ-FAL7-007: computedAgeOf usa deceasedAt para Fallecido y hoy para Vivo', () => {
    const dead = create({ lifeStatus: 'DECEASED', deceasedAt: '2024-06-01' });
    expect(computedAgeOf(dead, TODAY)).toMatchObject({ years: 4, months: 0 });
    expect(computedAgeOf(create(), TODAY).years).toBeGreaterThanOrEqual(6);
  });
});

describe('REQ-FAL7-005: registros posteriores a deceasedAt (EDGE-007-005, EDGE-007-012, EDGE-007-013, SC-007-014)', () => {
  const dead = (): PetProfile => create({ lifeStatus: 'DECEASED', deceasedAt: '2026-01-15' });

  it('REQ-FAL7-005: rechaza el alta con fecha posterior y acepta fecha igual o anterior', () => {
    expect(fails(() => assertRecordDateNotAfterDeceasedAt(dead(), '2026-01-16', 'recordedAt', true)).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(accepts(() => assertRecordDateNotAfterDeceasedAt(dead(), '2026-01-15', 'recordedAt', true))).toBe(true);
    expect(accepts(() => assertRecordDateNotAfterDeceasedAt(dead(), '2025-12-01', 'recordedAt', true))).toBe(true);
  });

  it('una edición que NO cambia la fecha (solo notas) de un registro ya posterior se acepta; si la cambia a otra posterior se rechaza', () => {
    expect(accepts(() => assertRecordDateNotAfterDeceasedAt(dead(), '2026-03-01', 'recordedAt', false))).toBe(true);
    expect(fails(() => assertRecordDateNotAfterDeceasedAt(dead(), '2026-03-01', 'recordedAt', true)).field).toBe('recordedAt');
  });

  it('una mascota Viva nunca rechaza por esta regla', () => {
    expect(accepts(() => assertRecordDateNotAfterDeceasedAt(create(), '2026-03-01', 'recordedAt', true))).toBe(true);
  });

  it('REQ-FAL7-005: marcar el fallecimiento con registros posteriores se rechaza y lista los registros en conflicto sin repetir la fecha de fallecimiento', () => {
    const records = {
      weights: [{ id: 'w1', petId: ID, recordedAt: '2026-02-01' }, { id: 'w2', petId: ID, recordedAt: '2025-01-01' }],
      vaccinations: [{ id: 'v1', petId: ID, appliedAt: '2026-03-05' }],
      bodyMeasurements: [],
      dewormings: [],
      medicalVisits: [],
      customParameters: [],
    } as never;
    const error = fails(() => assertNoRecordsAfterDeceasedAt('2026-01-15', ID, records));
    expect([error.code, error.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'deceasedAt']);
    expect(error.detail).toContain('w1');
    expect(error.detail).toContain('v1');
    expect(error.detail).not.toContain('w2');
    expect(error.detail).not.toContain('2026-01-15');
    expect(accepts(() => assertNoRecordsAfterDeceasedAt('2026-03-05', ID, records))).toBe(true);
  });
});
