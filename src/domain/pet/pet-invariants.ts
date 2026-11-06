/**
 * Invariantes puras del perfil de mascota (v2: sin límite de cantidad ni de especie).
 * - REQ-PET-001: alta y edición del perfil; el dueño es el usuario autenticado.
 * - INV-PET-002: birthDate <= ClockPort.todayIsoDate() (delegado en date-utils).
 * - INV-PET-006: al editar birthDate, no puede quedar después de ningún registro de la mascota.
 * - INV-OWN-001: un único ownerUserId, que referencia un usuario existente y no se edita vía API.
 *
 * @implements REQ-PET-001, INV-PET-006, INV-OWN-001, ERR-PET-BIRTHDATE-AFTER-RECORDS, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  validateCreatePetInput,
  validatePetProfile,
  validateUpdatePetInput,
  type BackupEnvelopeV2,
  type CreatePetInput,
  type PetProfile,
  type UpdatePetInput,
} from '../../generated/index.ts';
import { diffInCalendarDays, validateBirthDateNotFuture } from '../shared/date-utils.ts';
import { assertCanonicalCreatedAt, getRecordEventDate } from '../sorting/deterministic-sorter.ts';

/** Las 6 colecciones de registros clínicos, con la forma del sobre de respaldo v2. */
export type PetRecordCollections = BackupEnvelopeV2['records'];

/** Campos que la API nunca permite editar (INV-OWN-001). */
export const IMMUTABLE_PET_FIELDS = ['id', 'ownerUserId', 'createdAt', 'updatedAt'] as const;

interface ValidatorWithErrors {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; message?: string; params: Record<string, unknown> }> | null;
}

/**
 * Convierte el primer error de Ajv en ERR-SCHEMA-VALIDATION-FAILED con el campo afectado.
 * Los contratos de mascota no definen x-sdd-error, así que el código es siempre ERR-SCHEMA-VALIDATION-FAILED.
 * Ajv siempre llena `errors` cuando la validación falla.
 */
function failSchema(schemaName: string, validator: ValidatorWithErrors): never {
  const error = validator.errors![0]!;
  const paramField = error.params['additionalProperty'] ?? error.params['missingProperty'];
  const field = typeof paramField === 'string' ? paramField : (error.instancePath.split('/').pop() || null);
  const immutable = (IMMUTABLE_PET_FIELDS as readonly string[]).includes(field ?? '');
  const reason = immutable ? 'no es editable (INV-OWN-001)' : String(error.message);
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${schemaName}: ${field ?? '(raíz)'} ${reason}.`, field);
}

/**
 * Lanza ERR-SCHEMA-VALIDATION-FAILED si el perfil no cumple el contrato PetProfile.
 * @implements REQ-PET-001, INV-OWN-001
 */
export function assertValidPetProfile(pet: unknown): asserts pet is PetProfile {
  if (!validatePetProfile(pet)) {
    failSchema('PetProfile', validatePetProfile as ValidatorWithErrors);
  }
}

/**
 * INV-OWN-001: el dueño debe ser un usuario existente.
 * @implements INV-OWN-001
 */
export function assertOwnerExists(pet: Pick<PetProfile, 'ownerUserId'>, existingUserIds: ReadonlySet<string>): void {
  if (!existingUserIds.has(pet.ownerUserId)) {
    throw new DomainError(
      'ERR-SCHEMA-VALIDATION-FAILED',
      `ownerUserId ${pet.ownerUserId} no referencia un usuario existente (INV-OWN-001).`,
      'ownerUserId',
    );
  }
}

/**
 * Fechas de evento de todos los registros de la mascota, en las 6 colecciones.
 * @implements INV-PET-006
 */
export function collectRecordEventDates(petId: string, records: PetRecordCollections): string[] {
  const dates: string[] = [];
  for (const collection of Object.values(records)) {
    for (const record of collection) {
      if (record.petId === petId) {
        dates.push(getRecordEventDate(record));
      }
    }
  }
  return dates;
}

/**
 * INV-PET-006: birthDate <= min(fecha de evento de los registros). Una fecha igual es válida.
 * @implements INV-PET-006, ERR-PET-BIRTHDATE-AFTER-RECORDS
 */
export function assertBirthDateNotAfterRecords(birthDate: string, recordEventDates: readonly string[]): void {
  let earliest: string | null = null;
  for (const eventDate of recordEventDates) {
    if (earliest === null || diffInCalendarDays(eventDate, earliest) < 0) {
      earliest = eventDate;
    }
  }
  if (earliest !== null && diffInCalendarDays(birthDate, earliest) > 0) {
    throw new DomainError(
      'ERR-PET-BIRTHDATE-AFTER-RECORDS',
      `La fecha de nacimiento ${birthDate} es posterior al registro más antiguo (${earliest}).`,
      'birthDate',
    );
  }
}

export interface CreatePetCommand {
  readonly id: string;
  readonly ownerUserId: string;
  readonly input: unknown;
  readonly today: string;
  readonly nowIsoTimestamp: string;
}

/**
 * REQ-PET-001 (alta): valida CreatePetInput y birthDate (INV-PET-002); el dueño es el usuario autenticado.
 * No hay límite de cantidad ni de especie.
 * @implements REQ-PET-001, INV-OWN-001
 */
export function createPetProfile(command: CreatePetCommand): PetProfile {
  const { input } = command;
  if (!validateCreatePetInput(input)) {
    failSchema('CreatePetInput', validateCreatePetInput as ValidatorWithErrors);
  }
  const valid: CreatePetInput = input;
  validateBirthDateNotFuture(valid.birthDate, command.today);
  assertCanonicalCreatedAt(command.nowIsoTimestamp, 'createdAt');
  const pet: PetProfile = {
    id: command.id,
    ownerUserId: command.ownerUserId,
    name: valid.name,
    species: valid.species,
    breed: valid.breed,
    birthDate: valid.birthDate,
    sex: valid.sex,
    avatarUrl: valid.avatarUrl ?? null,
    createdAt: command.nowIsoTimestamp,
    updatedAt: command.nowIsoTimestamp,
  };
  assertValidPetProfile(pet);
  return pet;
}

export interface UpdatePetCommand {
  readonly pet: PetProfile;
  readonly input: unknown;
  readonly today: string;
  readonly nowIsoTimestamp: string;
  /** Fechas de evento de los registros de la mascota (collectRecordEventDates). */
  readonly recordEventDates: readonly string[];
}

/**
 * REQ-PET-001 (edición): valida UpdatePetInput, rechaza id y ownerUserId (INV-OWN-001) y, si cambia birthDate,
 * aplica INV-PET-002 e INV-PET-006. Devuelve un perfil nuevo; la entrada no se modifica.
 * @implements REQ-PET-001, INV-PET-006, INV-OWN-001, ERR-PET-BIRTHDATE-AFTER-RECORDS
 */
export function updatePetProfile(command: UpdatePetCommand): PetProfile {
  const { input } = command;
  if (!validateUpdatePetInput(input)) {
    failSchema('UpdatePetInput', validateUpdatePetInput as ValidatorWithErrors);
  }
  const changes: UpdatePetInput = input;
  if (changes.birthDate !== undefined) {
    validateBirthDateNotFuture(changes.birthDate, command.today);
    assertBirthDateNotAfterRecords(changes.birthDate, command.recordEventDates);
  }
  assertCanonicalCreatedAt(command.nowIsoTimestamp, 'updatedAt');
  const updated: PetProfile = {
    ...command.pet,
    ...changes,
    id: command.pet.id,
    ownerUserId: command.pet.ownerUserId,
    createdAt: command.pet.createdAt,
    updatedAt: command.nowIsoTimestamp,
  };
  assertValidPetProfile(updated);
  return updated;
}
