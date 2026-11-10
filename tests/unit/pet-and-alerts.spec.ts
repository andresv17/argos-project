import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  STATE_ALERT_001,
  validatePetProfile,
  type BackupEnvelopeV2,
  type DewormingRecord,
  type PetProfile,
  type VaccinationRecord,
} from '../../src/generated/index.ts';
import {
  assertBirthDateNotAfterRecords,
  assertOwnerExists,
  assertValidPetProfile,
  collectRecordEventDates,
  createPetProfile,
  updatePetProfile,
} from '../../src/domain/pet/pet-invariants.ts';
import { deletePetCascade } from '../../src/domain/pet/pet-deletion.ts';
import {
  ALERT_GUARDS,
  evaluateDewormingAlerts,
  evaluateSanitaryAlertState,
  evaluateVaccinationAlerts,
  normalizeVaccineKey,
  resolveAlertState,
  summarizeSanitaryAlerts,
} from '../../src/domain/alerts/sanitary-alert-evaluator.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
);
const envelope: BackupEnvelopeV2 = fixtures.validBackupEnvelopeV2;
const [argos, kira] = envelope.pets as [PetProfile, PetProfile];
const ANDRES = fixtures.users[0].id as string;
const MARIA = fixtures.users[1].id as string;
const clock = new FixedClockAdapter();
const TODAY = clock.todayIsoDate();
const NOW = clock.nowIsoTimestamp();
const NEW_PET_ID = '22222222-2222-4222-8222-222222222201';
const VALID_INPUT = { name: 'Rocky', species: 'DOG', breed: 'Mestizo', birthDate: '2024-06-01', sex: 'MALE' };

function catchDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const create = (input: unknown, ownerUserId = ANDRES, id = NEW_PET_ID) =>
  createPetProfile({ id, ownerUserId, input, today: TODAY, nowIsoTimestamp: NOW });

const update = (input: unknown, recordEventDates: readonly string[] = []) =>
  updatePetProfile({ pet: argos, input, today: TODAY, nowIsoTimestamp: '2026-11-05T13:00:00.000Z', recordEventDates });

describe('perfil de mascota (src/domain/pet/pet-invariants.ts)', () => {
  it('[REQ-PET-001][INV-OWN-001] el alta asigna como dueño al usuario autenticado y fija createdAt y updatedAt', () => {
    const pet = create(VALID_INPUT);
    expect(pet).toEqual({
      id: NEW_PET_ID,
      ownerUserId: ANDRES,
      name: 'Rocky',
      species: 'DOG',
      breed: 'Mestizo',
      birthDate: '2024-06-01',
      sex: 'MALE',
      avatarUrl: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(validatePetProfile(pet)).toBe(true);
    expect(create({ ...VALID_INPUT, avatarUrl: 'https://img.example/rocky.png' }).avatarUrl).toBe(
      'https://img.example/rocky.png',
    );
  });

  it('[REQ-PET-001] no hay límite de cantidad ni de especie: diez perros seguidos del mismo dueño', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `22222222-2222-4222-8222-2222222222${String(i).padStart(2, '0')}`);
    const pets = ids.map((id) => create(VALID_INPUT, ANDRES, id));
    expect(pets.map((p) => p.id)).toEqual(ids);
    expect(new Set(pets.map((p) => p.species))).toEqual(new Set(['DOG']));
  });

  it('[REQ-PET-001] los módulos de no contienen referencias al cupo ni a IDs retirados', () => {
    const retired = /INV-PET-001|INV-PET-004|STATE-PET-QUOTA-001|ERR-PET-QUOTA-EXCEEDED|quota|cupo|MAX_(TOTAL|DOGS|CATS)/i;
    for (const dir of ['src/domain/pet', 'src/domain/access', 'src/domain/alerts']) {
      for (const file of readdirSync(dir)) {
        const source = readFileSync(join(dir, file), 'utf8');
        expect({ file: `${dir}/${file}`, match: retired.exec(source)?.[0] ?? null }).toEqual({
          file: `${dir}/${file}`,
          match: null,
        });
      }
    }
  });

  it('[REQ-PET-001] rechaza entradas que no cumplen CreatePetInput y nombra el campo', () => {
    const cases: Array<[unknown, string | null]> = [
      [{ ...VALID_INPUT, name: '' }, 'name'],
      [{ ...VALID_INPUT, name: ' Rocky' }, 'name'],
      [{ ...VALID_INPUT, name: 'x'.repeat(51) }, 'name'],
      [{ ...VALID_INPUT, species: 'BIRD' }, 'species'],
      [{ ...VALID_INPUT, sex: 'OTHER' }, 'sex'],
      [{ ...VALID_INPUT, breed: undefined }, 'breed'],
      [{ ...VALID_INPUT, avatarUrl: 'javascript:alert(1)' }, 'avatarUrl'],
      [{ ...VALID_INPUT, color: 'negro' }, 'color'],
      [null, null],
    ];
    for (const [input, field] of cases) {
      const error = catchDomainError(() => create(input));
      expect({ field: error.field, code: error.code, status: error.status }).toEqual({
        field,
        code: 'ERR-SCHEMA-VALIDATION-FAILED',
        status: 422,
      });
      expect(error.detail.startsWith(`CreatePetInput: ${field ?? '(raíz)'} `)).toBe(true);
      expect(error.detail).not.toContain('INV-OWN-001');
    }
    const onUpdate = catchDomainError(() => update({ species: 'BIRD' }));
    expect(onUpdate.detail).toBe('UpdatePetInput: species must be equal to one of the allowed values.');
    const nullUpdate = catchDomainError(() => update(null));
    expect([nullUpdate.field, nullUpdate.detail]).toEqual([null, 'UpdatePetInput: (raíz) must be object.']);
  });

  it('[REQ-PET-001] el alta aplica INV-PET-002 con la fecha de ClockPort', () => {
    const error = catchDomainError(() => create({ ...VALID_INPUT, birthDate: '2026-11-06' }));
    expect(error.code).toBe('ERR-PET-FUTURE-BIRTHDATE');
    expect(error.field).toBe('birthDate');
    expect(create({ ...VALID_INPUT, birthDate: TODAY }).birthDate).toBe(TODAY);
    const badClock = catchDomainError(() =>
      createPetProfile({ id: NEW_PET_ID, ownerUserId: ANDRES, input: VALID_INPUT, today: TODAY, nowIsoTimestamp: '2026-11-05T12:00:00Z' }),
    );
    expect([badClock.code, badClock.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'createdAt']);
  });

  it('[INV-OWN-001] id, ownerUserId, createdAt y updatedAt no se aceptan en el alta ni en la edición', () => {
    for (const field of ['id', 'ownerUserId', 'createdAt', 'updatedAt']) {
      const onCreate = catchDomainError(() => create({ ...VALID_INPUT, [field]: MARIA }));
      const onUpdate = catchDomainError(() => update({ name: 'Argos II', [field]: MARIA }));
      expect([onCreate.code, onCreate.field, onUpdate.code, onUpdate.field]).toEqual([
        'ERR-SCHEMA-VALIDATION-FAILED',
        field,
        'ERR-SCHEMA-VALIDATION-FAILED',
        field,
      ]);
      expect(onCreate.detail).toBe(`CreatePetInput: ${field} no es editable (INV-OWN-001).`);
      expect(onUpdate.detail).toBe(`UpdatePetInput: ${field} no es editable (INV-OWN-001).`);
    }
  });

  it('[INV-OWN-001] el dueño debe existir y ser un UUID válido', () => {
    expect(() => assertOwnerExists(argos, new Set([ANDRES, MARIA]))).not.toThrow(DomainError);
    const missing = catchDomainError(() => assertOwnerExists(argos, new Set([MARIA])));
    expect([missing.code, missing.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'ownerUserId']);
    expect(missing.detail).toContain(ANDRES);
    const badUuid = catchDomainError(() => assertValidPetProfile({ ...argos, ownerUserId: 'andres' }));
    expect([badUuid.code, badUuid.field]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', 'ownerUserId']);
    expect(badUuid.detail.startsWith('PetProfile: ownerUserId ')).toBe(true);
    const corrupted = catchDomainError(() =>
      updatePetProfile({ pet: { ...argos, id: 'x' }, input: { name: 'Argos' }, today: TODAY, nowIsoTimestamp: NOW, recordEventDates: [] }),
    );
    expect([corrupted.field, corrupted.detail.startsWith('PetProfile: id ')]).toEqual(['id', true]);
    const missingOwner = catchDomainError(() => create(VALID_INPUT, ''));
    expect(missingOwner.field).toBe('ownerUserId');
  });

  it('[REQ-PET-001][INV-OWN-001] la edición cambia solo los campos enviados y conserva id, dueño y createdAt', () => {
    const frozen = deepFreeze(structuredClone(argos));
    const updated = updatePetProfile({
      pet: frozen,
      input: { name: 'Argos II', avatarUrl: null },
      today: TODAY,
      nowIsoTimestamp: '2026-11-05T13:00:00.000Z',
      recordEventDates: [],
    });
    expect(updated).toEqual({ ...argos, name: 'Argos II', avatarUrl: null, updatedAt: '2026-11-05T13:00:00.000Z' });
    expect(frozen).toEqual(argos);
    const empty = catchDomainError(() => update({}));
    expect(empty.code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    const badTimestamp = catchDomainError(() =>
      updatePetProfile({ pet: argos, input: { name: 'X' }, today: TODAY, nowIsoTimestamp: '2026-11-05', recordEventDates: [] }),
    );
    expect(badTimestamp.field).toBe('updatedAt');
  });

  it('[INV-PET-006][ERR-PET-BIRTHDATE-AFTER-RECORDS] rechaza un birthDate posterior a un registro de Argos (EDGE-007)', () => {
    const dates = collectRecordEventDates(argos.id, envelope.records);
    const error = catchDomainError(() => update({ birthDate: '2026-10-15' }, dates));
    expect(error.code).toBe('ERR-PET-BIRTHDATE-AFTER-RECORDS');
    expect(error.status).toBe(422);
    expect(error.invariantRef).toBe('INV-PET-006');
    expect(error.field).toBe('birthDate');
    expect(error.detail).toContain('2025-11-12');
  });

  it('[INV-PET-006] acepta un birthDate igual o anterior al registro más antiguo, y sin registros', () => {
    const dates = collectRecordEventDates(argos.id, envelope.records);
    expect(update({ birthDate: '2025-11-12' }, dates).birthDate).toBe('2025-11-12');
    expect(update({ birthDate: '2025-11-11' }, dates).birthDate).toBe('2025-11-11');
    expect(update({ birthDate: '2026-11-05' }, []).birthDate).toBe('2026-11-05');
    expect(catchDomainError(() => update({ birthDate: '2026-11-06' }, [])).code).toBe('ERR-PET-FUTURE-BIRTHDATE');
    expect(update({ name: 'Sin fecha' }, ['2000-01-01']).birthDate).toBe(argos.birthDate);
  });

  it('[INV-PET-006] toma el registro más antiguo de las 6 colecciones, en cualquier orden', () => {
    expect(collectRecordEventDates(argos.id, envelope.records).sort()).toEqual([
      '2025-11-12',
      '2026-10-01',
      '2026-10-15',
      '2026-11-01',
      '2026-11-01',
    ]);
    expect(collectRecordEventDates(kira.id, envelope.records)).toEqual(['2026-11-01']);
    const error = catchDomainError(() =>
      assertBirthDateNotAfterRecords('2026-01-01', ['2026-01-10', '2025-12-31', '2026-03-01']),
    );
    expect(error.detail).toContain('2025-12-31');
    expect(() => assertBirthDateNotAfterRecords('2025-12-31', ['2026-01-10', '2025-12-31'])).not.toThrow(DomainError);
  });
});

describe('eliminación en cascada (src/domain/pet/pet-deletion.ts)', () => {
  it('[REQ-PET-004][INV-PET-005] borrar Argos quita sus 2 pesos, 1 medida, 1 vacuna y 1 parámetro y nada más (EDGE-022)', () => {
    const state = deepFreeze(structuredClone({ pets: envelope.pets, records: envelope.records }));
    const result = deletePetCascade(state, argos.id);
    expect(result.removedPet).toEqual(argos);
    expect(result.removedRecords).toEqual({
      weights: 2,
      bodyMeasurements: 1,
      vaccinations: 1,
      dewormings: 0,
      medicalVisits: 0,
      customParameters: 1,
    });
    expect(result.state.pets.map((p) => p.name)).toEqual(['Kira', 'Nyx', 'Milo', 'Toby']);
    for (const [name, collection] of Object.entries(result.state.records)) {
      const original = envelope.records[name as keyof BackupEnvelopeV2['records']] as Array<{ petId: string }>;
      expect(collection).toEqual(original.filter((r) => r.petId !== argos.id));
    }
    expect(state).toEqual({ pets: envelope.pets, records: envelope.records });
  });

  it('[REQ-PET-004][INV-PET-005] una mascota inexistente da ERR-PET-NOT-FOUND y no se elimina nada', () => {
    const state = deepFreeze(structuredClone({ pets: envelope.pets, records: envelope.records }));
    const error = catchDomainError(() => deletePetCascade(state, NEW_PET_ID));
    expect([error.code, error.status, error.field]).toEqual(['ERR-PET-NOT-FOUND', 404, 'petId']);
    expect(state).toEqual({ pets: envelope.pets, records: envelope.records });
  });
});

const vaccine = (id: string, vaccineName: string, appliedAt: string, nextBoosterAt: string, extra: Partial<VaccinationRecord> = {}): VaccinationRecord => ({
  id,
  petId: argos.id,
  vaccineName,
  appliedAt,
  nextBoosterAt,
  batchOrClinic: null,
  notes: null,
  createdAt: `${appliedAt}T10:00:00.000Z`,
  ...extra,
});
const deworming = (id: string, dewormingType: 'INTERNAL' | 'EXTERNAL', appliedAt: string, nextSuggestedDoseAt: string): DewormingRecord => ({
  id,
  petId: argos.id,
  productBrand: 'Marca',
  dewormingType,
  appliedAt,
  nextSuggestedDoseAt,
  notes: null,
  createdAt: `${appliedAt}T10:00:00.000Z`,
});
const uuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

describe('alertas sanitarias (src/domain/alerts/sanitary-alert-evaluator.ts)', () => {
  it('[STATE-ALERT-001] umbrales exactos: -1 OVERDUE, 0 y 15 DUE_SOON, 16 UP_TO_DATE, con los datos del contrato', () => {
    const states = STATE_ALERT_001.states;
    expect(evaluateSanitaryAlertState('2026-11-04', TODAY, false)).toEqual({ status: 'OVERDUE', ...pick(states.OVERDUE), daysRemaining: -1 });
    expect(evaluateSanitaryAlertState('2026-11-05', TODAY, false)).toEqual({ status: 'DUE_SOON', ...pick(states.DUE_SOON), daysRemaining: 0 });
    expect(evaluateSanitaryAlertState('2026-11-20', TODAY, false)).toEqual({ status: 'DUE_SOON', ...pick(states.DUE_SOON), daysRemaining: 15 });
    expect(evaluateSanitaryAlertState('2026-11-21', TODAY, false)).toEqual({ status: 'UP_TO_DATE', ...pick(states.UP_TO_DATE), daysRemaining: 16 });
    expect(evaluateSanitaryAlertState('2025-01-01', TODAY, true)).toEqual({ status: 'SUPERSEDED', ...pick(states.SUPERSEDED), daysRemaining: -673 });
  });

  it('[STATE-ALERT-001] evalúa en el orden evaluationOrder del contrato, sin estado inicial ni transitorio', () => {
    expect(STATE_ALERT_001.evaluationOrder).toEqual(['SUPERSEDED', 'OVERDUE', 'DUE_SOON', 'UP_TO_DATE']);
    expect(Object.keys(STATE_ALERT_001)).not.toContain('initial');
    expect(Object.keys(STATE_ALERT_001.states)).toEqual(['SUPERSEDED', 'OVERDUE', 'DUE_SOON', 'UP_TO_DATE']);
    const guardsAt = (daysRemaining: number) =>
      Object.entries(ALERT_GUARDS).filter(([, guard]) => guard({ daysRemaining, hasNewerRecordOfSameKey: false })).map(([s]) => s);
    expect([-1, 0, 15, 16].map(guardsAt)).toEqual([['OVERDUE'], ['DUE_SOON'], ['DUE_SOON'], ['UP_TO_DATE']]);
    expect(resolveAlertState({ daysRemaining: -3, hasNewerRecordOfSameKey: true })).toBe('SUPERSEDED');
    expect(resolveAlertState({ daysRemaining: 20, hasNewerRecordOfSameKey: false }, ['SUPERSEDED', 'OVERDUE', 'UP_TO_DATE'])).toBe('UP_TO_DATE');
    expect(() => resolveAlertState({ daysRemaining: 20, hasNewerRecordOfSameKey: false }, ['SUPERSEDED', 'OVERDUE'])).toThrow(
      /Ningún guard de STATE-ALERT-001/,
    );
  });

  it('[STATE-ALERT-001] el registro antiguo queda SUPERSEDED aunque venza en 7 días; el nuevo, UP_TO_DATE (EDGE-036)', () => {
    const edge = fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId === 'EDGE-036-ALERT-SUPERSEDED-VS-UP-TO-DATE');
    const [older, newer] = edge.expectedResult.records as Array<{ vaccineName: string; appliedAt: string; nextBoosterAt: string; state: string; daysRemaining: number }>;
    const records = [vaccine(uuid(1), older!.vaccineName, older!.appliedAt, older!.nextBoosterAt), vaccine(uuid(2), newer!.vaccineName, newer!.appliedAt, newer!.nextBoosterAt)];
    const views = evaluateVaccinationAlerts(records, edge.referenceDate);
    expect(views.map((v) => [v.record.id, v.alert.status, v.alert.daysRemaining])).toEqual([
      [uuid(2), newer!.state, newer!.daysRemaining],
      [uuid(1), older!.state, older!.daysRemaining],
    ]);
    expect(views[0]!.record).toBe(records[1]);
  });

  it('[STATE-ALERT-001] la clave de vacuna ignora mayúsculas y espacios extremos, y no mezcla mascotas ni vacunas', () => {
    expect(normalizeVaccineKey('  Rabia ')).toBe('rabia');
    const records = [
      vaccine(uuid(1), 'Rabia', '2026-01-10', '2027-01-10'),
      vaccine(uuid(2), '  RABIA ', '2026-06-10', '2027-06-10'),
      vaccine(uuid(3), 'Moquillo', '2026-02-10', '2027-02-10'),
      vaccine(uuid(4), 'Rabia', '2026-03-10', '2027-03-10', { petId: kira.id }),
    ];
    const status = Object.fromEntries(evaluateVaccinationAlerts(records, TODAY).map((v) => [v.record.id, v.alert.status]));
    expect(status).toEqual({ [uuid(1)]: 'SUPERSEDED', [uuid(2)]: 'UP_TO_DATE', [uuid(3)]: 'UP_TO_DATE', [uuid(4)]: 'UP_TO_DATE' });
  });

  it('[STATE-ALERT-001] con la misma fecha de aplicación, decide createdAt y luego id (INV-SORT-001)', () => {
    const records = [
      vaccine(uuid(1), 'Rabia', '2026-10-01', '2026-11-10', { createdAt: '2026-10-01T09:00:00.000Z' }),
      vaccine(uuid(2), 'Rabia', '2026-10-01', '2026-11-12', { createdAt: '2026-10-01T11:00:00.000Z' }),
      vaccine(uuid(3), 'Rabia', '2026-10-01', '2026-11-14', { createdAt: '2026-10-01T11:00:00.000Z' }),
    ];
    const views = evaluateVaccinationAlerts(records, TODAY);
    expect(views.map((v) => [v.record.id, v.alert.status])).toEqual([
      [uuid(2), 'DUE_SOON'],
      [uuid(3), 'SUPERSEDED'],
      [uuid(1), 'SUPERSEDED'],
    ]);
  });

  it('[STATE-ALERT-001] en desparasitación la clave es dewormingType', () => {
    const records = [
      deworming(uuid(1), 'INTERNAL', '2026-05-01', '2026-08-01'),
      deworming(uuid(2), 'INTERNAL', '2026-08-01', '2026-11-01'),
      deworming(uuid(3), 'EXTERNAL', '2026-06-01', '2026-11-15'),
    ];
    const views = evaluateDewormingAlerts(records, TODAY);
    expect(views.map((v) => [v.record.id, v.alert.status, v.alert.daysRemaining])).toEqual([
      [uuid(2), 'OVERDUE', -4],
      [uuid(3), 'DUE_SOON', 10],
      [uuid(1), 'SUPERSEDED', -96],
    ]);
  });

  it('[STATE-ALERT-001] el resumen cuenta OVERDUE, DUE_SOON y UP_TO_DATE, sin SUPERSEDED', () => {
    const vaccinations = evaluateVaccinationAlerts(
      [
        vaccine(uuid(1), 'Rabia', '2025-01-01', '2026-01-01'),
        vaccine(uuid(2), 'Rabia', '2025-11-01', '2026-11-01'),
        vaccine(uuid(3), 'Moquillo', '2026-01-01', '2027-01-01'),
      ],
      TODAY,
    );
    const dewormings = evaluateDewormingAlerts([deworming(uuid(4), 'EXTERNAL', '2026-10-01', '2026-11-10')], TODAY);
    expect(summarizeSanitaryAlerts(vaccinations, dewormings)).toEqual({
      overdueCount: 1,
      dueSoonCount: 1,
      upToDateCount: 1,
      totalActiveAlerts: 2,
    });
    expect(summarizeSanitaryAlerts([], [])).toEqual({ overdueCount: 0, dueSoonCount: 0, upToDateCount: 0, totalActiveAlerts: 0 });
  });
});

function pick(state: { uiBadge: string; label: string; isActiveAlert: boolean }) {
  return { uiBadge: state.uiBadge, label: state.label, isActiveAlert: state.isActiveAlert };
}
