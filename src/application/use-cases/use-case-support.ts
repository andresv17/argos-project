/**
 * Dependencias y piezas comunes de los casos de uso.
 * - Todo caso de uso autenticado recibe el userId como primer argumento y aplica el rol efectivo y la matriz
 *   (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002) antes de leer o escribir: sin visibilidad, ERR-PET-NOT-FOUND (404);
 *   visible pero sin la acción, ERR-ACC-FORBIDDEN (403).
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
import { effectiveRole } from '../../domain/access/effective-role.ts';
import { can, petPermissionsFor, type RbacAction, type RbacRole } from '../../domain/access/rbac.ts';
import { toRoleMembership } from '../../domain/households/household-policies.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import type { AccountDeletionAuditPort } from '../ports/account-deletion-audit.port.ts';
import type { AuditLogPort } from '../ports/audit-log.port.ts';
import type { AuditPseudonymPort } from '../ports/audit-pseudonym.port.ts';
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
  /** Auditoría de eliminación de cuenta (transitoria, nula hasta T265). */
  readonly audit: AccountDeletionAuditPort;
  /** Auditoría de mutaciones (REQ-AUD-001): una fila por operación, en la transacción de la mutación (ADR-002-05). */
  readonly auditLog: AuditLogPort;
  /** Seudónimo HMAC del `entityId` de PET_ASSIGNMENT: `hmacUserId("<petId>:<householdId>", auditHmacSecret)`. */
  readonly auditPseudonym: AuditPseudonymPort;
  /** Clave hexadecimal (>= 32 bytes) de `ARGOS_AUDIT_HMAC_SECRET`; la entrega la composición, nunca el dominio (INV-ARCH-006). */
  readonly auditHmacSecret: string;
  /** Identificadores de las filas de auditoría: generador aparte para no alterar la secuencia de ids de las entidades. */
  readonly auditIds: IdGeneratorPort;
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
  /** Rol efectivo del usuario sobre la mascota (REQ-RBAC-001); nunca nulo: sin rol la mascota no es visible. */
  readonly role: RbacRole;
}

/**
 * Rol efectivo del usuario sobre una mascota ya cargada: Propietario Legal, o el mayor rol de sus membresías ACTIVE en
 * los hogares donde la mascota está asignada (INV-ACC2-001). Null si no tiene acceso.
 */
export async function effectiveRoleOf(repositories: RepositorySet, userId: string, pet: PetProfile): Promise<RbacRole | null> {
  if (pet.ownerUserId === userId) return 'OWNER';
  const assignments = await repositories.assignments.listByPet(pet.id);
  const memberships = (await repositories.households.listMembershipsOfUsers([userId])).map(toRoleMembership);
  return effectiveRole({ id: userId }, pet, memberships, assignments);
}

/** Mascota visible con el rol efectivo del usuario. */
export interface VisiblePet {
  readonly pet: PetProfile;
  readonly role: RbacRole;
}

/**
 * Mascotas visibles: las propias y las asignadas a hogares donde el usuario es miembro ACTIVE (REQ-PET2-002,
 * REQ-HOUSE2-004, INV-ACC2-001), cada una con su rol efectivo. Sin orden garantizado.
 * @implements REQ-PET2-002, REQ-HOUSE2-004, INV-ACC2-001
 */
export async function listVisiblePets(repositories: RepositorySet, userId: string): Promise<VisiblePet[]> {
  const pets = new Map<string, PetProfile>();
  for (const pet of await repositories.pets.listByOwners([userId])) pets.set(pet.id, pet);
  const memberships = await repositories.households.listMembershipsOfUsers([userId]);
  for (const membership of memberships.filter((m) => m.status === 'ACTIVE')) {
    for (const assignment of await repositories.assignments.listByHousehold(membership.householdId)) {
      if (pets.has(assignment.petId)) continue;
      const pet = await repositories.pets.findById(assignment.petId);
      if (pet !== null) pets.set(pet.id, pet);
    }
  }
  const roleRows = memberships.map(toRoleMembership);
  const visible: VisiblePet[] = [];
  for (const pet of pets.values()) {
    const role = pet.ownerUserId === userId ? 'OWNER' : effectiveRole({ id: userId }, pet, roleRows, await repositories.assignments.listByPet(pet.id));
    if (role !== null) visible.push({ pet, role });
  }
  return visible;
}

/**
 * Mascota visible por el usuario (propietario o miembro ACTIVE de un hogar al que está asignada); si no existe o no es
 * visible, ERR-PET-NOT-FOUND (INV-PET-003, INV-ACC2-001).
 * @implements INV-ACC2-001, INV-PET-003, ERR-PET-NOT-FOUND
 */
export async function requireReadablePet(repositories: RepositorySet, userId: string, petId: string): Promise<PetAccess> {
  const pet = await repositories.pets.findById(petId);
  if (pet === null) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  const role = await effectiveRoleOf(repositories, userId, pet);
  if (role === null) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  return { pet, role };
}

/**
 * Mascota sobre la que el usuario puede ejecutar la acción de la matriz: no visible, ERR-PET-NOT-FOUND (404 antes
 * que 403); visible sin la acción, ERR-ACC-FORBIDDEN.
 * @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, INV-PET-003, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */
export async function requirePetAction(repositories: RepositorySet, userId: string, petId: string, action: RbacAction): Promise<PetAccess> {
  const access = await requireReadablePet(repositories, userId, petId);
  if (!can(access.role, action)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'petId');
  return access;
}

/**
 * Tarjeta de mascota (PetCardView) con edad, resumen de alertas y último peso según INV-SORT-001.
 * @implements REQ-PET-002, REQ-PET-005
 */
/** Estado más grave entre vacunas y desparasitaciones; null si no hay registros evaluables (REQ-PET2-002). */
export function globalAlertStatusOf(summary: PetCardView['alertsSummary']): PetCardView['globalAlertStatus'] {
  if (summary.overdueCount > 0) return 'OVERDUE';
  if (summary.dueSoonCount > 0) return 'DUE_SOON';
  if (summary.upToDateCount > 0) return 'UP_TO_DATE';
  return null;
}

export function buildPetCard(pet: PetProfile, owner: OwnerTag, role: RbacRole, records: PetRecordCollections, today: string): PetCardView {
  const weights = computeWeightEvolutionSeries(records.weights);
  const alertsSummary = summarizeSanitaryAlerts(evaluateVaccinationAlerts(records.vaccinations, today), evaluateDewormingAlerts(records.dewormings, today));
  return {
    profile: pet,
    owner,
    myRole: role,
    permissions: petPermissionsFor(role),
    computedAge: calculatePetAge(pet.birthDate, today),
    alertsSummary,
    globalAlertStatus: globalAlertStatusOf(alertsSummary),
    latestWeightKg: weights[0]?.record.weightKg ?? null,
  };
}
