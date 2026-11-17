/**
 * Invariantes puras del perfil de mascota (sin límite de cantidad; 8 especies).
 * - REQ-PET2-001: alta y edición del perfil; el dueño es el usuario autenticado; la edad estimada (años y meses) se
 *   convierte a birthDate con el reloj inyectado y marca birthDateIsEstimate (ADR-002-16).
 * - INV-PET2-001: species de las 8 aprobadas y speciesOther solo con OTHER (esquema + estado resultante de la edición).
 * - REQ-PET2-001 / ERR-PET-MICROCHIP-DUPLICATE: el microchip es único por propietario, no entre cuentas.
 * - INV-PET-002: birthDate <= ClockPort.todayIsoDate() (delegado en date-utils).
 * - INV-PET-006: al editar birthDate, no puede quedar después de ningún registro de la mascota.
 * - INV-OWN-001: un único ownerUserId, que referencia un usuario existente y no se edita vía API.
 *
 * @implements REQ-PET2-001, INV-PET2-001, REQ-PET-002, INV-PET-002, INV-PET-006, INV-OWN-001, ERR-PET-BIRTHDATE-AFTER-RECORDS, ERR-PET-MICROCHIP-DUPLICATE, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  validateCreatePetInput,
  validatePetProfile,
  validateUpdatePetInput,
  type BackupEnvelopeV3,
  type CreatePetInput,
  type PetProfile,
  type UpdatePetInput,
} from '../../generated/index.ts';
import { diffInCalendarDays, validateBirthDateNotFuture } from '../shared/date-utils.ts';
import { estimatedAgeToBirthDate } from './estimated-age.ts';
import { assertCanonicalCreatedAt, getRecordEventDate } from '../sorting/deterministic-sorter.ts';

/** Las 6 colecciones de registros clínicos, con la forma del sobre de respaldo v3. */
export type PetRecordCollections = BackupEnvelopeV3['records'];

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
 * Lanza ERR-SCHEMA-VALIDATION-FAILED si el perfil no cumple el contrato PetProfile (incluye la coherencia
 * species/speciesOther del estado resultante de una edición, INV-PET2-001).
 * @implements REQ-PET2-001, INV-PET2-001, INV-OWN-001
 */
export function assertValidPetProfile(pet: unknown): asserts pet is PetProfile {
  if (!validatePetProfile(pet)) {
    failSchema('PetProfile', validatePetProfile as ValidatorWithErrors);
  }
}

/**
 * ERR-PET-MICROCHIP-DUPLICATE: ninguna otra mascota del propietario lleva ese microchip. `ownedPets` son solo las
 * mascotas de ese propietario (la unicidad es por propietario, no global); `exceptPetId` es la mascota que se guarda
 * (una edición que conserva su propio chip no choca). Un microchip nulo nunca choca. El mensaje no repite el número.
 * @implements REQ-PET2-001, ERR-PET-MICROCHIP-DUPLICATE
 */
export function assertMicrochipUniqueForOwner(
  ownedPets: ReadonlyArray<{ readonly id: string; readonly microchipId: string | null }>,
  microchipId: string | null | undefined,
  exceptPetId: string,
): void {
  if (microchipId === null || microchipId === undefined) return;
  if (ownedPets.some((other) => other.id !== exceptPetId && other.microchipId === microchipId)) {
    throw new DomainError('ERR-PET-MICROCHIP-DUPLICATE', undefined, 'microchipId');
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
 * REQ-PET2-001 (alta): valida CreatePetInput y birthDate (INV-PET-002); el dueño es el usuario autenticado.
 * Exactamente uno de birthDate o estimatedAge (lo exige el esquema); estimatedAge con birthDateIsEstimate = false se
 * rechaza aquí. No hay límite de cantidad.
 * @implements REQ-PET2-001, INV-PET2-001, INV-OWN-001, INV-PET-002
 */
export function createPetProfile(command: CreatePetCommand): PetProfile {
  const { input } = command;
  if (!validateCreatePetInput(input)) {
    failSchema('CreatePetInput', validateCreatePetInput as ValidatorWithErrors);
  }
  const valid: CreatePetInput = input;
  let birthDate: string;
  let birthDateIsEstimate: boolean;
  if (valid.estimatedAge !== undefined) {
    if (valid.birthDateIsEstimate === false) {
      throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'CreatePetInput: estimatedAge exige birthDateIsEstimate verdadero (REQ-PET2-001).', 'birthDateIsEstimate');
    }
    birthDate = estimatedAgeToBirthDate(command.today, valid.estimatedAge);
    birthDateIsEstimate = true;
  } else {
    // El esquema (oneOf) garantiza birthDate cuando no hay estimatedAge.
    birthDate = valid.birthDate!;
    birthDateIsEstimate = valid.birthDateIsEstimate ?? false;
  }
  validateBirthDateNotFuture(birthDate, command.today);
  assertCanonicalCreatedAt(command.nowIsoTimestamp, 'createdAt');
  const pet: PetProfile = {
    id: command.id,
    ownerUserId: command.ownerUserId,
    name: valid.name,
    species: valid.species,
    speciesOther: (valid.speciesOther ?? null) as PetProfile['speciesOther'], // el generador tipa el nulo como string
    breed: valid.breed,
    birthDate,
    birthDateIsEstimate,
    sex: valid.sex,
    neutered: valid.neutered ?? null,
    microchipId: valid.microchipId ?? null,
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
 * REQ-PET2-001 (edición): valida UpdatePetInput, rechaza id y ownerUserId (INV-OWN-001) y valida el estado resultante
 * (species/speciesOther, INV-PET2-001). Si cambia birthDate (directo o por estimatedAge) aplica INV-PET-002 e INV-PET-006.
 * Devuelve un perfil nuevo; la entrada no se modifica.
 * T226 PENDIENTE: birthDate y estimatedAge a la vez se rechazan (el contrato solo declara la exclusión en el alta), y un
 * birthDate editado sin birthDateIsEstimate conserva el indicador previo.
 * @implements REQ-PET2-001, INV-PET2-001, INV-PET-006, INV-OWN-001, ERR-PET-BIRTHDATE-AFTER-RECORDS
 */
export function updatePetProfile(command: UpdatePetCommand): PetProfile {
  const { input } = command;
  if (!validateUpdatePetInput(input)) {
    failSchema('UpdatePetInput', validateUpdatePetInput as ValidatorWithErrors);
  }
  const changes: UpdatePetInput = input;
  const { estimatedAge, ...profileChanges } = changes;
  if (estimatedAge !== undefined) {
    if (changes.birthDate !== undefined) {
      throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'UpdatePetInput: birthDate y estimatedAge son excluyentes.', 'estimatedAge');
    }
    if (changes.birthDateIsEstimate === false) {
      throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'UpdatePetInput: estimatedAge exige birthDateIsEstimate verdadero (REQ-PET2-001).', 'birthDateIsEstimate');
    }
    profileChanges.birthDate = estimatedAgeToBirthDate(command.today, estimatedAge);
    profileChanges.birthDateIsEstimate = true;
  }
  if (profileChanges.birthDate !== undefined) {
    validateBirthDateNotFuture(profileChanges.birthDate, command.today);
    assertBirthDateNotAfterRecords(profileChanges.birthDate, command.recordEventDates);
  }
  assertCanonicalCreatedAt(command.nowIsoTimestamp, 'updatedAt');
  const updated: PetProfile = {
    ...command.pet,
    ...profileChanges,
    id: command.pet.id,
    ownerUserId: command.pet.ownerUserId,
    createdAt: command.pet.createdAt,
    updatedAt: command.nowIsoTimestamp,
  } as PetProfile;
  assertValidPetProfile(updated);
  return updated;
}
