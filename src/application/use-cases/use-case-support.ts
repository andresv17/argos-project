/**
 * Dependencias y piezas comunes de los casos de uso (plan §3).
 * - Todo caso de uso autenticado recibe el userId como primer argumento y aplica access-policy antes de leer o
 *   escribir (INV-ACC-001, INV-ACC-002): sin lectura, ERR-PET-NOT-FOUND (404, constitución §6.4); con lectura pero
 *   sin escritura, ERR-ACC-FORBIDDEN (403).
 * - Fechas e identificadores salen solo de ClockPort e IdGeneratorPort (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements INV-ACC-001, INV-ACC-002, INV-PET-003, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */

import {
  DomainError,
  type components,
  type HouseholdMember,
  type OwnerTag,
  type PetProfile,
  type UserPublicProfile,
} from '../../generated/index.ts';
import { assertCanRead, assertCanWrite } from '../../domain/access/access-policy.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { IdGeneratorPort } from '../ports/id-generator.port.ts';
import type { PasswordHasherPort } from '../ports/password-hasher.port.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import type { SecureTokenPort } from '../ports/secure-token.port.ts';
import type { UnitOfWorkPort } from '../ports/unit-of-work.port.ts';

/**
 * PetCardView del OpenAPI con `profile` tipado como PetProfile: el tipo generado de `profile`
 * ($ref al archivo pet.schema.json completo) incluye una propiedad `$defs` obligatoria (H-108-3).
 */
export type PetCardView = Omit<components['schemas']['PetCardView'], 'profile'> & { profile: PetProfile };

export interface ApplicationDeps {
  readonly uow: UnitOfWorkPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly tokens: SecureTokenPort;
  readonly hasher: PasswordHasherPort;
  /** Hash ficticio con el coste de uno real; LoginUseCase lo verifica cuando el username no existe (INV-AUTH-006). */
  readonly dummyPasswordHash: string;
}

interface ValidatorWithErrors {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; message?: string; params: Record<string, unknown> }> | null;
}

/**
 * Regla 4 de la spec §5.1 para las entradas que valida la capa de aplicación (LoginInput, InviteMemberInput), que no
 * tienen campos con x-sdd-error: todo fallo de esquema es ERR-SCHEMA-VALIDATION-FAILED con el campo afectado.
 * Ajv siempre llena `errors` cuando la validación falla.
 */
export function assertMatchesSchema<T>(schemaName: string, validator: unknown, value: unknown): T {
  const validate = validator as ValidatorWithErrors;
  if (validate(value)) return value as T;
  const error = validate.errors![0]!;
  const named = (error.params['missingProperty'] ?? error.params['additionalProperty']) as string | undefined;
  const field = named ?? error.instancePath.split('/')[1] ?? null;
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${schemaName}: ${field ?? '(raíz)'} ${String(error.message)}.`, field);
}

export function toPublicProfile(account: UserAccount): UserPublicProfile {
  return { id: account.id, username: account.username, displayName: account.displayName, createdAt: account.createdAt };
}

export async function publicProfilesById(repositories: RepositorySet, userIds: readonly string[]): Promise<Map<string, UserPublicProfile>> {
  const accounts = await repositories.users.listByIds([...new Set(userIds)]);
  return new Map(accounts.map((account) => [account.id, toPublicProfile(account)]));
}

export interface PetAccess {
  readonly pet: PetProfile;
  readonly memberships: HouseholdMember[];
}

/** Mascota y membresías del usuario y del dueño; una mascota inexistente es ERR-PET-NOT-FOUND (INV-PET-003). */
async function loadPetAccess(repositories: RepositorySet, userId: string, petId: string): Promise<PetAccess> {
  const pet = await repositories.pets.findById(petId);
  if (pet === null) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  return { pet, memberships: await repositories.households.listMembershipsOfUsers([userId, pet.ownerUserId]) };
}

/**
 * Mascota legible por el usuario (dueño o miembro ACTIVE de un hogar compartido con el dueño); si no existe o no es
 * legible, ERR-PET-NOT-FOUND (INV-PET-003, INV-ACC-001).
 * @implements INV-ACC-001, INV-PET-003, ERR-PET-NOT-FOUND
 */
export async function requireReadablePet(repositories: RepositorySet, userId: string, petId: string): Promise<PetAccess> {
  const { pet, memberships } = await loadPetAccess(repositories, userId, petId);
  return { pet: assertCanRead({ id: userId }, pet, memberships), memberships };
}

/**
 * Mascota escribible (solo el dueño, INV-ACC-002): no legible, ERR-PET-NOT-FOUND; legible sin ser dueño, ERR-ACC-FORBIDDEN.
 * @implements INV-ACC-002, INV-PET-003, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */
export async function requireWritablePet(repositories: RepositorySet, userId: string, petId: string): Promise<PetAccess> {
  const { pet, memberships } = await loadPetAccess(repositories, userId, petId);
  return { pet: assertCanWrite({ id: userId }, pet, memberships), memberships };
}

/**
 * Tarjeta de mascota (PetCardView) con edad, resumen de alertas y último peso según INV-SORT-001.
 * @implements REQ-PET-002, REQ-PET-005
 */
export function buildPetCard(pet: PetProfile, owner: OwnerTag, canEdit: boolean, records: PetRecordCollections, today: string): PetCardView {
  const weights = computeWeightEvolutionSeries(records.weights);
  return {
    profile: pet,
    owner,
    canEdit,
    computedAge: calculatePetAge(pet.birthDate, today),
    alertsSummary: summarizeSanitaryAlerts(evaluateVaccinationAlerts(records.vaccinations, today), evaluateDewormingAlerts(records.dewormings, today)),
    latestWeightKg: weights[0]?.record.weightKg ?? null,
  };
}
