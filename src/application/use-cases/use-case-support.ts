/**
 * Dependencias y piezas comunes de los casos de uso.
 * - Todo caso de uso autenticado recibe el userId como primer argumento y aplica access-policy antes de leer o
 *   escribir (INV-ACC-001, INV-ACC-002): sin lectura, ERR-PET-NOT-FOUND (404,); con lectura pero
 *   sin escritura, ERR-ACC-FORBIDDEN (403).
 * - Fechas e identificadores salen solo de ClockPort e IdGeneratorPort (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements INV-ACC-001, INV-ACC-002, INV-PET-003, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */

import {
  DomainError,
  resolveFieldErrorCode,
  type components,
  type OwnerTag,
  type PetProfile,
  type UserPublicProfile,
  type UserSelfProfile,
} from '../../generated/index.ts';
import type { LegacyHouseholdMember } from '../../domain/households/household-policies.ts';
import { assertCanRead, assertCanWrite } from '../../domain/access/access-policy.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import type { AuditLogPort } from '../ports/audit-log.port.ts';
import type { BackupTokenPort } from '../ports/backup-token.port.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { IdGeneratorPort } from '../ports/id-generator.port.ts';
import type { PasswordHasherPort } from '../ports/password-hasher.port.ts';
import type { RateLimiterPort } from '../ports/rate-limiter.port.ts';
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
  /** Límite de frecuencia de invitaciones y exportaciones (ADR-002-12). */
  readonly rateLimiter: RateLimiterPort;
  /** Token efímero de confirmación de respaldo (REQ-ACC-002). */
  readonly backupTokens: BackupTokenPort;
  /** Auditoría; nula hasta T265. */
  readonly audit: AuditLogPort;
}

interface ValidatorWithErrors {
  (data: unknown): boolean;
  errors?: ReadonlyArray<{ instancePath: string; message?: string; params: Record<string, unknown> }> | null;
}

/**
 * Regla 4 de la para las entradas que valida la capa de aplicación (LoginInput, InviteMemberInput), que no
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

/**
 * Como `assertMatchesSchema`, pero un fallo sobre el valor de un campo con `x-sdd-error` (p. ej. `newPassword` de
 * ChangePasswordInput) lanza el código anotado en lugar de ERR-SCHEMA-VALIDATION-FAILED (regla 4).
 */
export function assertMatchesAnnotatedSchema<T>(schemaName: string, validator: unknown, value: unknown): T {
  const validate = validator as ValidatorWithErrors;
  if (validate(value)) return value as T;
  const error = validate.errors![0]!;
  const named = (error.params['missingProperty'] ?? error.params['additionalProperty']) as string | undefined;
  if (named === undefined) {
    const annotated = resolveFieldErrorCode(schemaName, error.instancePath);
    if (annotated !== undefined) throw new DomainError(annotated, undefined, error.instancePath.split('/')[1] ?? null);
  }
  const field = named ?? error.instancePath.split('/')[1] ?? null;
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${schemaName}: ${field ?? '(raíz)'} ${String(error.message)}.`, field);
}

export function toPublicProfile(account: UserAccount): UserPublicProfile {
  return { id: account.id, username: account.username, displayName: account.displayName, createdAt: account.createdAt };
}

/** Perfil propio (REQ-AUTH-004): añade correo, idioma y zona horaria; nunca el hash. Solo para el propio usuario. */
export function toSelfProfile(account: UserAccount): UserSelfProfile {
  return { ...toPublicProfile(account), email: account.email, preferredLanguage: account.preferredLanguage, timezone: account.timezone };
}

export async function publicProfilesById(repositories: RepositorySet, userIds: readonly string[]): Promise<Map<string, UserPublicProfile>> {
  const accounts = await repositories.users.listByIds([...new Set(userIds)]);
  return new Map(accounts.map((account) => [account.id, toPublicProfile(account)]));
}

export interface PetAccess {
  readonly pet: PetProfile;
  readonly memberships: LegacyHouseholdMember[];
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
/**
 * Rol efectivo y permisos de la 002 derivados del `canEdit` de la 001.
 * T236 PENDIENTE: la matriz real de REQ-RBAC-001 (rol del Cuidador, Lector, Administrador) no se decide aquí; el
 * propietario legal recibe todos los permisos y quien solo lee, ninguno (comportamiento conservador).
 */
export function legacyRoleAndPermissions(canEdit: boolean): { myRole: PetCardView['myRole']; permissions: PetCardView['permissions'] } {
  return {
    myRole: canEdit ? 'OWNER' : 'READER',
    permissions: {
      editPetBasics: canEdit,
      deletePet: canEdit,
      writeHealthEvents: canEdit,
      deleteHealthEvents: canEdit,
      writeWeightsAndMeasurements: canEdit,
      writeAppointmentsAndParameters: canEdit,
      deleteOtherRecords: canEdit,
      transferPetOwnership: canEdit,
      assignPetToHouseholds: canEdit,
    },
  };
}

/** Estado más grave entre vacunas y desparasitaciones; null si no hay registros evaluables (REQ-PET2-002). */
export function globalAlertStatusOf(summary: PetCardView['alertsSummary']): PetCardView['globalAlertStatus'] {
  if (summary.overdueCount > 0) return 'OVERDUE';
  if (summary.dueSoonCount > 0) return 'DUE_SOON';
  if (summary.upToDateCount > 0) return 'UP_TO_DATE';
  return null;
}

export function buildPetCard(pet: PetProfile, owner: OwnerTag, canEdit: boolean, records: PetRecordCollections, today: string): PetCardView {
  const weights = computeWeightEvolutionSeries(records.weights);
  const alertsSummary = summarizeSanitaryAlerts(evaluateVaccinationAlerts(records.vaccinations, today), evaluateDewormingAlerts(records.dewormings, today));
  return {
    profile: pet,
    owner,
    ...legacyRoleAndPermissions(canEdit),
    computedAge: calculatePetAge(pet.birthDate, today),
    alertsSummary,
    globalAlertStatus: globalAlertStatusOf(alertsSummary),
    latestWeightKg: weights[0]?.record.weightKg ?? null,
  };
}
