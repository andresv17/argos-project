import { describe, expect, it } from 'vitest';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import errorCatalog from '../../../specs/002-plataforma-v21/contracts/errors/error-catalog.json';
import fixtures002 from '../../../specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json';
import authSessionMachine from '../../../specs/002-plataforma-v21/contracts/state-machines/auth-session.machine.json';
import backupMachine from '../../../specs/002-plataforma-v21/contracts/state-machines/backup-import.machine.json';
import householdMachine from '../../../specs/002-plataforma-v21/contracts/state-machines/household-membership.machine.json';
import alertMachine from '../../../specs/002-plataforma-v21/contracts/state-machines/sanitary-alert.machine.json';
// Fixtures de la 001: solo para los sobres legados (BackupEnvelopeV1Legacy/V2Legacy), fila 35 de la tabla de sustitución.
import fixtures from '../../../specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json';
import * as generated from '../../../src/generated/index.ts';
import {
  DomainError,
  ERROR_CODES,
  resolveFieldErrorCode,
  STATE_ALERT_001_STATES,
  STATE_AUTH_SESSION_001_STATES,
  STATE_BACKUP_001_STATES,
  STATE_HOUSE_MEMBERSHIP_001_STATES,
  validateBackupEnvelopeV1Legacy,
  validateBackupEnvelopeV2Legacy,
  validateCreateBodyMeasurementInput,
  validateCreatePetInput,
  validateCreateWeightInput,
  validateHousehold,
  validateHouseholdMember,
  validateLegacyWeightRecordV1,
  validatePetProfile,
  validateProblemDetails,
  validateRegisterUserInput,
  validateUserPublicProfile,
} from '../../../src/generated/index.ts';

type AjvValidator = ((data: unknown) => boolean) & { errors?: { instancePath: string }[] | null };

function expectValid(validate: AjvValidator, data: unknown): void {
  expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
}

/** Nombres de estado de una máquina: lista de nombres o mapa nombre -> definición. */
function statesOf(states: unknown): string[] {
  return Array.isArray(states) ? (states as string[]) : Object.keys(states as object);
}

function firstErrorPath(validate: AjvValidator, field: string): string | undefined {
  return validate.errors?.find((e) => e.instancePath === field)?.instancePath;
}

describe('contratos generados', () => {
  it('INV-ARCH-003: los fixtures canónicos válidos pasan sus validadores generados', () => {
    const entities = fixtures002.entities;
    for (const user of entities.users) expectValid(validateUserPublicProfile, user);
    expectValid(validateHousehold, entities.household);
    for (const member of entities.householdMembers) expectValid(validateHouseholdMember, member);
    for (const pet of entities.pets) expectValid(validatePetProfile, pet);
    // Sobres legados de la 001: sus mascotas se elevan con upgradePet antes de validar contra PetProfile 3.0.0.
    for (const pet of fixtures.otherUserPets) expectValid(validatePetProfile, upgradePet(pet as never));
    expectValid(validateBackupEnvelopeV2Legacy, fixtures.validBackupEnvelopeV2);
    expectValid(validateBackupEnvelopeV1Legacy, fixtures.validLegacyBackupEnvelopeV1);
  });

  it('INV-REC2-002: la envolvente del peso admite 0.001 a 150 con máximo 3 decimales y mapea ERR-REC-WEIGHT-OUT-OF-RANGE (el dominio estrecha por especie)', () => {
    for (const weightKg of [0.001, 0.028, 0.05, 0.1, 70.555, 150]) {
      expectValid(validateCreateWeightInput, { recordedAt: '2026-11-01', weightKg });
    }
    for (const weightKg of [-2.5, 0, 0.0005, 150.001, 70.5555]) {
      expect(validateCreateWeightInput({ recordedAt: '2026-11-01', weightKg }), `weightKg=${weightKg}`).toBe(false);
      const path = firstErrorPath(validateCreateWeightInput, '/weightKg');
      expect(path).toBe('/weightKg');
      expect(resolveFieldErrorCode('CreateWeightInput', path ?? '')).toBe('ERR-REC-WEIGHT-OUT-OF-RANGE');
    }
  });

  it('INV-REC-003: las medidas corporales admiten 1.00 a 250.00 y mapean ERR-REC-MEASUREMENT-OUT-OF-RANGE', () => {
    const base = { recordedAt: '2026-11-01', neckCm: 35.5, chestCm: 60, backLengthCm: 45, waistCm: 50 };
    expectValid(validateCreateBodyMeasurementInput, base);
    expectValid(validateCreateBodyMeasurementInput, { ...base, neckCm: 1 });
    expectValid(validateCreateBodyMeasurementInput, { ...base, chestCm: 250 });
    for (const neckCm of [0.99, 250.01, 10.555]) {
      expect(validateCreateBodyMeasurementInput({ ...base, neckCm }), `neckCm=${neckCm}`).toBe(false);
      const path = firstErrorPath(validateCreateBodyMeasurementInput, '/neckCm');
      expect(path).toBe('/neckCm');
      expect(resolveFieldErrorCode('CreateBodyMeasurementInput', path ?? '')).toBe('ERR-REC-MEASUREMENT-OUT-OF-RANGE');
    }
  });

  it('INV-AUTH2-001: la contraseña exige 10 a 128 caracteres con mayúscula, número y símbolo, y mapea ERR-AUTH-WEAK-PASSWORD', () => {
    const user = { username: 'carlos_88', displayName: 'Carlos', password: 'Abcdef12!x', confirmPassword: 'Abcdef12!x' };
    expectValid(validateRegisterUserInput, user);
    for (const password of ['abcdefgh1!', 'Abcdefghi!', 'Abcdefghi1', 'Abcdef1!x', `A1!${'b'.repeat(126)}`]) {
      expect(validateRegisterUserInput({ ...user, password }), `password=${password}`).toBe(false);
      const path = firstErrorPath(validateRegisterUserInput, '/password');
      expect(path).toBe('/password');
      expect(resolveFieldErrorCode('RegisterUserInput', path ?? '')).toBe('ERR-AUTH-WEAK-PASSWORD');
    }
    expect(validateRegisterUserInput({ ...user, username: 'Carlos_88' })).toBe(false);
  });

  it('INV-REC-006: additionalProperties=false rechaza propiedades no autorizadas, también en ítems legacy v1', () => {
    const pet = { name: 'Luna', species: 'CANINE', breed: 'Mestizo', birthDate: '2020-01-01', sex: 'FEMALE' };
    expectValid(validateCreatePetInput, pet);
    expect(validateCreatePetInput({ ...pet, ownerUserId: fixtures.users[0]?.id })).toBe(false);

    const legacyWeight = fixtures.validLegacyBackupEnvelopeV1.records.weights[0];
    expectValid(validateLegacyWeightRecordV1, legacyWeight);
    expect(validateLegacyWeightRecordV1({ ...legacyWeight, extra: 1 })).toBe(false);
  });

  it('INV-ARCH-003: el catálogo generado coincide con error-catalog.json y cada ProblemDetails generado es válido', () => {
    const entries = errorCatalog.errors as Record<string, { status: number }>;
    expect(ERROR_CODES).toEqual(Object.keys(entries).sort());
    expect(ERROR_CODES).toHaveLength(41); // 35 + ERR-PET-VERSION-CONFLICT (007) + ERR-AUTH-GOOGLE-FAILED y ERR-AUTH-GOOGLE-LINK-CONFLICT (008, catálogo 3.2.0) + ERR-ACCOUNT-PENDING, ERR-ACCOUNT-REJECTED y ERR-ACCOUNT-REGISTRATION-RATE-LIMITED (009 T1241, catálogo 3.3.0)
    for (const code of ERROR_CODES) {
      const error = new DomainError(code);
      expect(error.status).toBe(entries[code]?.status);
      expectValid(validateProblemDetails, error.toProblemDetails('/api/test'));
    }
  });

  it('ERR-BACKUP-ATOMIC-ROLLBACK: finalState admite ROLLED_BACK y UNKNOWN y rechaza otros valores', () => {
    for (const finalState of ['ROLLED_BACK', 'UNKNOWN'] as const) {
      const problem = new DomainError('ERR-BACKUP-ATOMIC-ROLLBACK', undefined, null, finalState).toProblemDetails(
        '/api/backup/import',
      );
      expect(problem.finalState).toBe(finalState);
      expectValid(validateProblemDetails, problem);
    }
    const base = new DomainError('ERR-BACKUP-ATOMIC-ROLLBACK').toProblemDetails('/api/backup/import');
    expect(validateProblemDetails({ ...base, finalState: 'OTHER' })).toBe(false);
    expect('finalState' in base).toBe(false);
  });

  it('INV-ARCH-003: cada máquina se genera desde su propio archivo y no existe máquina de cupo', () => {
    // Los estados generados coinciden con los de cada archivo de máquina de la 002 (INV-ARCH-003).
    expect([...STATE_ALERT_001_STATES]).toEqual(statesOf(alertMachine.machines['STATE-ALERT-001'].states));
    expect([...STATE_AUTH_SESSION_001_STATES]).toEqual(statesOf(authSessionMachine.machines['STATE-AUTH-SESSION-001'].states));
    expect([...STATE_HOUSE_MEMBERSHIP_001_STATES]).toEqual(statesOf(householdMachine.machines['STATE-HOUSE-MEMBERSHIP-001'].states));
    expect([...STATE_BACKUP_001_STATES]).toEqual(statesOf(backupMachine.machines['STATE-BACKUP-001'].states));
    expect(STATE_ALERT_001_STATES).toEqual(['SUPERSEDED', 'OVERDUE', 'DUE_SOON', 'UP_TO_DATE']);
    expect(STATE_AUTH_SESSION_001_STATES).toEqual(['ANONYMOUS', 'AUTHENTICATED', 'EXPIRED_IDLE', 'EXPIRED', 'LOGGED_OUT', 'REVOKED']);
    expect(STATE_HOUSE_MEMBERSHIP_001_STATES).toEqual(['INVITED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'LEFT', 'REMOVED']);
    expect(STATE_BACKUP_001_STATES).toEqual([
      'IDLE',
      'CHECKING_PAYLOAD_SIZE',
      'PARSING_JSON',
      'VALIDATING_VERSION_AND_SCHEMA',
      'MIGRATING_LEGACY_ENVELOPE',
      'CHECKING_DOMAIN_INVARIANTS',
      'COMMITTING_SNAPSHOT',
      'COMPLETED',
      'ROLLED_BACK',
      'PREVIEW_READY',
    ]);
    expect(Object.keys(generated).filter((name) => name.includes('QUOTA'))).toEqual([]);
  });
});
