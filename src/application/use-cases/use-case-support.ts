/**
 * Dependencias y piezas comunes de los casos de uso.
 * - Todo caso de uso autenticado recibe el userId como primer argumento y aplica el rol efectivo y la matriz
 *   (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002) antes de leer o escribir: sin visibilidad, ERR-PET-NOT-FOUND (404);
 *   visible pero sin la acción, ERR-ACC-FORBIDDEN (403).
 * - Fechas e identificadores salen solo de ClockPort e IdGeneratorPort (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements INV-ACC-001, INV-ACC-002, INV-PET-003, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */

import { normalizePetProfile, type PetProfile } from '../../domain/pet/pet-invariants.ts';
import {
  DomainError,
  resolveFieldErrorCode,
  type components,
  type OwnerTag,
  type UserPublicProfile,
  type UserSelfProfile,
} from '../../generated/index.ts';
import { effectiveRole } from '../../domain/access/effective-role.ts';
import { can, petPermissionsFor, type PetAction, type RbacRole } from '../../domain/access/rbac.ts';
import { toRoleMembership } from '../../domain/households/household-policies.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import type { MediaStoragePort } from '../ports/media-storage.port.ts';
import type { AuditLogPort } from '../ports/audit-log.port.ts';
import type { AuditPseudonymPort } from '../ports/audit-pseudonym.port.ts';
import type { BackupTokenPort } from '../ports/backup-token.port.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { IdGeneratorPort } from '../ports/id-generator.port.ts';
import type { PasswordHasherPort } from '../ports/password-hasher.port.ts';
import type { PlatformParameterPort } from '../ports/platform-parameter.port.ts';
import type { RateLimiterPort } from '../ports/rate-limiter.port.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import type { SceneImageGeneratorPort } from '../ports/scene-image-generator.port.ts';
import type { SceneJobDispatcherPort } from '../ports/scene-job-dispatcher.port.ts';
import type { ScenePrivacyHooksPort } from '../ports/scene-privacy-hooks.port.ts';
import type { SecureTokenPort } from '../ports/secure-token.port.ts';
import type { ShareTokenGeneratorPort } from '../ports/share-link.port.ts';
import type { SharedAccessLimiter } from '../sharing/shared-access-limiter.ts';
import type { UnitOfWorkPort } from '../ports/unit-of-work.port.ts';

/**
 * PetCardView del OpenAPI con `profile` tipado como PetProfile: el tipo generado de `profile`
 * ($ref al archivo pet.schema.json completo) incluye una propiedad `$defs` obligatoria (H-108-3).
 */
export type PetCardView = Omit<components['schemas']['PetCardView'], 'profile'> & { profile: PetProfileView };

/** Perfil de la API 3.1.0: el de dominio más `avatarVersion` (solo lectura; `avatar_version` si hay avatar y `null` si no, REQ-AVA-001). */
export type PetProfileView = PetProfile & { readonly avatarVersion: number | null };

/** Topes de medios que entrega la composición desde `ARGOS_MEDIA_*` (REQ-ARC-001, REQ-ARC-003, REQ-ARC-005). */
export interface MediaLimits {
  /** Tamaño máximo de un archivo o foto en bytes (`ARGOS_MEDIA_MAX_BYTES`, <= 10 MiB). */
  readonly maxBytes: number;
  /** Cuota por propietario legal (`ARGOS_MEDIA_MAX_BYTES_PER_OWNER`, 1 GiB). */
  readonly maxBytesPerOwner: number;
  /** Subidas simultáneas por instancia (`ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS`, 4); lo aplica la capa HTTP. */
  readonly maxConcurrentUploads: number;
  /** Caducidad de la URL firmada (`ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS`, 30-900). */
  readonly signedUrlTtlSeconds: number;
}

/** Almacenamiento de objetos y topes; ausente cuando la composición no conecta medios (los casos de uso de medios fallan cerrado). */
export interface MediaServices {
  readonly storage: MediaStoragePort;
  readonly limits: MediaLimits;
}

/**
 * Enlace veterinario (feature 005, US4): generador del token (el hash vive en el dominio), clave HMAC DEDICADA de la IP (hexadecimal, >= 32 bytes; sin rotación
 * en 005, PN-06) y límite de tasa en memoria de la superficie pública. Opcional: sin él las rutas del enlace fallan cerrado.
 */
export interface SharingServices {
  readonly tokens: ShareTokenGeneratorPort;
  readonly ipHmacSecret: string;
  readonly limiter: SharedAccessLimiter;
}

/**
 * Escena del hogar (feature 006, plan §1.3): configuración ya validada por `app-config` (INV-ARCH-006), identidad del aviso de consentimiento (constantes del código,
 * REQ-ESC6-026) y los puertos del generador y del despachador. Opcional: sin él los casos de uso de la escena fallan cerrado.
 */
/** Herramientas de imagen inyectadas (función, no puerto; `infrastructure/adapters/image-metadata-stripper.ts`): normalizan referencias y validan la salida por firma. */
export interface SceneImageTools {
  /** Reescribe el contenedor con lista blanca; `ok: false` = referencia ausente (REQ-ESC6-027). */
  readonly strip: (mime: string, bytes: Uint8Array) => { readonly ok: true; readonly mime: string; readonly bytes: Uint8Array } | { readonly ok: false };
  /** Mayor prefijo de referencias (por prioridad) que cabe en el tope agregado (EDGE-ESC6-028). */
  readonly fit: (sizes: readonly number[]) => { readonly kept: number; readonly degraded: boolean };
  /** Tope de ancho × alto (25 MP) y de lado (8192 px) en la subida de la foto del hogar (REQ-ESC6-027). */
  readonly withinLimits: (mime: string, bytes: Uint8Array) => boolean;
  /** Valida la imagen generada por firma (REQ-ESC6-035). */
  readonly validateOutput: (mime: string, bytes: Uint8Array) => { readonly ok: true; readonly mime: 'image/png' | 'image/webp' } | { readonly ok: false; readonly code: 'ERR-SCENE-INVALID-IMAGE' };
}

export interface SceneServices {
  readonly maxPets: number;
  readonly quotaMax: number;
  /** T_GEN en segundos. */
  readonly genTimeoutSeconds: number;
  /** T_LEASE = T_GEN + 60 s, desde el claim. */
  readonly leaseSeconds: number;
  /** T_QUEUE: espera máxima en cola antes del claim. */
  readonly queueWaitSeconds: number;
  /** `true` con `ARGOS_SCENE_DRIVER=real`: exige consentimiento vigente (INV-ESC6-014). */
  readonly realDriver: boolean;
  /** Desfase de `APP_TIMEZONE` respecto de UTC en minutos (p. ej. -300) para `quota.resetsAt`. */
  readonly utcOffsetMinutes: number;
  readonly noticeVersion: string;
  readonly providerId: string;
  readonly images: SceneImageTools;
  readonly generator: SceneImageGeneratorPort;
  readonly dispatcher: SceneJobDispatcherPort;
}

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
  /** Auditoría de mutaciones (REQ-AUD-001): una fila por operación, en la transacción de la mutación (ADR-002-05). */
  readonly auditLog: AuditLogPort;
  /** Seudónimo HMAC del `entityId` de PET_ASSIGNMENT: `hmacUserId("<petId>:<householdId>", auditHmacSecret)`. */
  readonly auditPseudonym: AuditPseudonymPort;
  /** Clave hexadecimal (>= 32 bytes) de `ARGOS_AUDIT_HMAC_SECRET`; la entrega la composición, nunca el dominio (INV-ARCH-006). */
  readonly auditHmacSecret: string;
  /** Identificadores de las filas de auditoría: generador aparte para no alterar la secuencia de ids de las entidades. */
  readonly auditIds: IdGeneratorPort;
  /** Medios (feature 004, REQ-GCS-003): almacenamiento de objetos y topes. Opcional hasta que la composición lo conecta. */
  readonly media?: MediaServices;
  /**
   * Parámetros de plataforma con caché (feature 005, REQ-PRM-002). Ausente en una composición sin ellos: rige el valor por defecto del código
   * (`PARAMETER_CATALOG`), nunca un valor cableado en el caso de uso.
   */
  readonly platformParameters?: PlatformParameterPort;
  /** Enlace veterinario (feature 005, US4): token, clave HMAC de IP y límite de tasa. Ausente: las rutas del enlace fallan cerrado. */
  readonly sharing?: SharingServices;
  /** Ganchos de privacidad de la escena (feature 006, T827, plan §1.2): los casos de uso de 002/004/005 los invocan en la transacción de la causa. Ausente: comportamiento actual de 001..005. */
  readonly sceneHooks?: ScenePrivacyHooksPort;
  /** Servicios de la escena (feature 006, T852). Ausente: los casos de uso de la escena fallan cerrado con un error interno. */
  readonly scene?: SceneServices;
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
 * Candado de mascota (REQ-BOR-005, INV-REG-003, ADR-004-05): primera lectura de toda transacción que cree, edite, borre o supersede
 * registros, suba o borre medios o cambie el avatar. Si la mascota no existe no bloquea nada y el caso de uso responde ERR-PET-NOT-FOUND.
 * @implements REQ-BOR-005, INV-REG-003
 */
export async function lockPet(repositories: RepositorySet, petId: string): Promise<void> {
  await repositories.pets.findByIdForUpdate(petId);
}

/**
 * Candado de propietario y luego de mascota, en ESE orden (usuario → mascota, sin ciclos), para las transacciones que además validan la
 * cuota del propietario (REQ-BOR-005). El propietario se conoce leyendo la mascota; tras bloquearlo se vuelve a leer con el candado de la
 * mascota y, si el propietario cambió entre medias (traspaso), se repite con el nuevo (como máximo 3 intentos; después falla cerrado).
 * @implements REQ-BOR-005, INV-REG-003
 */
export async function lockOwnerThenPet(repositories: RepositorySet, petId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const unlocked = await repositories.pets.findById(petId);
    if (unlocked === null) return;
    await repositories.users.findByIdForUpdate(unlocked.ownerUserId);
    const locked = await repositories.pets.findByIdForUpdate(petId);
    if (locked === null || locked.ownerUserId === unlocked.ownerUserId) return;
  }
  throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'El propietario de la mascota cambió durante el bloqueo; reintenta.');
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
export async function requirePetAction(repositories: RepositorySet, userId: string, petId: string, action: PetAction): Promise<PetAccess> {
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

export function buildPetCard(pet: PetProfile, owner: OwnerTag, role: RbacRole, records: PetRecordCollections, today: string, avatarVersion: number | null = null): PetCardView {
  const weights = computeWeightEvolutionSeries(records.weights);
  const alertsSummary = summarizeSanitaryAlerts(evaluateVaccinationAlerts(records.vaccinations, today), evaluateDewormingAlerts(records.dewormings, today));
  return {
    profile: { ...normalizePetProfile(pet), avatarVersion },
    owner,
    myRole: role,
    permissions: petPermissionsFor(role),
    computedAge: calculatePetAge(pet.birthDate, today),
    alertsSummary,
    globalAlertStatus: globalAlertStatusOf(alertsSummary),
    latestWeightKg: weights[0]?.record.weightKg ?? null,
  };
}
