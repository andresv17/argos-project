/**
 * Puertos de repositorio. Todas las operaciones devuelven Promise. Los repositorios solo
 * se obtienen dentro de `UnitOfWorkPort.runInTransaction`, de modo que toda lectura y escritura es transaccional.
 * Ninguna lista garantiza orden: los casos de uso ordenan con las reglas de dominio (INV-SORT-001, REQ-PET-005,
 * INV-HOUSE-005).
 *
 * @implements INV-ARCH-004, INV-ARCH-005, INV-PET-003
 */

import type { Household, HouseholdInvitation, PetProfile, UserSelfProfile } from '../../generated/index.ts';
import type { LegacyHouseholdMember } from '../../domain/households/household-policies.ts';
import type { SessionRecord } from '../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../domain/records/record-invariants.ts';

/** Usuario persistido: perfil propio (con correo, idioma y zona horaria) más el hash de su contraseña (INV-AUTH-003: nunca en claro). */
export interface UserAccount extends UserSelfProfile {
  readonly passwordHash: string;
}

export interface UserRepositoryPort {
  findById(userId: string): Promise<UserAccount | null>;
  /** Búsqueda exacta por username ya normalizado (recortado y en minúsculas, INV-AUTH-001). */
  findByUsername(username: string): Promise<UserAccount | null>;
  listByIds(userIds: readonly string[]): Promise<UserAccount[]>;
  /** Falla si el id o el username ya existen. */
  insert(user: UserAccount): Promise<void>;
  /** Reemplaza perfil y hash del usuario con ese id (el username no cambia). Falla si no existe. REQ-ACC-001, REQ-AUTH2-003. */
  update(user: UserAccount): Promise<void>;
  /** Borra la fila del usuario (B9 (j) de STATE-ACCOUNT-DELETE-001). */
  delete(userId: string): Promise<void>;
  /**
   * Filas de cualquier tabla que referencian al usuario por id (mascotas, hogares, membresías, sesiones, invitaciones,
   * token, eventos de frecuencia) más su propia fila. Postcondición B10: 0 tras eliminar la cuenta.
   */
  countReferences(userId: string): Promise<number>;
}

export interface SessionRepositoryPort {
  findByToken(token: string): Promise<SessionRecord | null>;
  /** Inserta o reemplaza la sesión del token. */
  save(token: string, session: SessionRecord): Promise<void>;
  /**
   * Revoca (revokedAt = ahora) las sesiones vigentes del usuario salvo la del token dado y devuelve cuántas revocó
   * (REQ-AUTH2-003: las demás sesiones; la actual se conserva).
   */
  revokeOthers(userId: string, keepToken: string, nowIsoTimestamp: string): Promise<number>;
  /** Borra todas las sesiones del usuario, incluida la actual (B9 (h)). */
  deleteByUser(userId: string): Promise<void>;
}

export interface LoginAttemptRepositoryPort {
  /** Instantes de los fallos registrados para el username normalizado (INV-AUTH-005). */
  listFailures(username: string): Promise<string[]>;
  replaceFailures(username: string, failures: readonly string[]): Promise<void>;
  /** Borra la entrada del username (la elimina de la cuenta, REQ-ACC-002). */
  deleteFailures(username: string): Promise<void>;
}

/** Token de confirmación de respaldo (REQ-ACC-002 (5)): una fila por usuario; se guarda solo el SHA-256. */
export interface ConfirmationTokenRepositoryPort {
  /** El token nuevo reemplaza al anterior del mismo usuario. */
  replaceForUser(userId: string, tokenHash: string, createdAt: string, expiresAt: string): Promise<void>;
  /**
   * Consumo condicional (B3): marca usedAt = ahora donde tokenHash y userId coinciden, usedAt es nulo y
   * expiresAt > ahora. true si afectó exactamente 1 fila.
   */
  consume(userId: string, tokenHash: string, nowIsoTimestamp: string): Promise<boolean>;
  deleteForUser(userId: string): Promise<void>;
}

export type RateLimitScope = 'EXPORT' | 'INVITE';

export interface RateLimitEvent {
  readonly id: string;
  readonly scope: RateLimitScope;
  readonly userId: string;
  readonly occurredAt: string;
}

/** Eventos de límite de frecuencia (ADR-002-12). */
export interface RateLimitRepositoryPort {
  record(event: RateLimitEvent): Promise<void>;
  /** Eventos del ámbito y del usuario con occurredAt estrictamente posterior a `sinceExclusive`. */
  countSince(scope: RateLimitScope, userId: string, sinceExclusive: string): Promise<number>;
  deleteForUser(userId: string): Promise<void>;
}

/** Invitación a un hogar (REQ-HOUSE2-001): `inviteeUserId` nulo es una invitación inerte (el username no existía). */
export interface InvitationRecord extends HouseholdInvitation {
  readonly inviteeUserId: string | null;
}

export interface InvitationRepositoryPort {
  /** La invitación INVITED del hogar para ese username, o null. */
  findOpen(householdId: string, inviteeUsername: string): Promise<InvitationRecord | null>;
  /** Inserta o reemplaza por invitationId. Una segunda INVITED del mismo (hogar, username) se rechaza (INV-HOUSE-003). */
  save(invitation: InvitationRecord): Promise<void>;
  listByHousehold(householdId: string): Promise<InvitationRecord[]>;
  /** Borra las invitaciones emitidas o recibidas por el usuario. */
  deleteForUser(userId: string): Promise<void>;
  deleteForHousehold(householdId: string): Promise<void>;
}

export interface PetRepositoryPort {
  findById(petId: string): Promise<PetProfile | null>;
  listByOwners(ownerUserIds: readonly string[]): Promise<PetProfile[]>;
  /** Inserta o reemplaza por id. */
  save(pet: PetProfile): Promise<void>;
  delete(petId: string): Promise<void>;
}

export interface MedicalRecordRepositoryPort {
  /** Las 6 colecciones de la mascota; vacías si no tiene registros. */
  listForPet(petId: string): Promise<PetRecordCollections>;
  /**
   * petId del registro con ese id en cualquiera de los 6 módulos, o null si no existe. Lo usa la importación de
   * respaldo para detectar IDs de registro que pertenecen a otro usuario (INV-BACKUP-001).
   */
  findPetIdOfRecord(recordId: string): Promise<string | null>;
  /** Falla si el id ya existe en el módulo. */
  add<M extends RecordModule>(module: M, record: RecordOf<M>): Promise<void>;
  deleteForPet(petId: string): Promise<void>;
}

export interface HouseholdRepositoryPort {
  findById(householdId: string): Promise<Household | null>;
  insert(household: Household): Promise<void>;
  /** Borra el hogar y todas sus membresías; las mascotas no se tocan (REQ-HOUSE-004). */
  deleteWithMemberships(householdId: string): Promise<void>;
  listMemberships(householdId: string): Promise<LegacyHouseholdMember[]>;
  /** Todas las membresías (cualquier estado) de cualquiera de los usuarios, sin duplicados. */
  listMembershipsOfUsers(userIds: readonly string[]): Promise<LegacyHouseholdMember[]>;
  /** Inserta o reemplaza por membershipId. */
  saveMembership(membership: LegacyHouseholdMember): Promise<void>;
  /** Borra las membresías (cualquier estado) del usuario en todos los hogares (REQ-ACC-002). */
  deleteMembershipsOfUser(userId: string): Promise<void>;
}

export interface RepositorySet {
  readonly users: UserRepositoryPort;
  readonly sessions: SessionRepositoryPort;
  readonly loginAttempts: LoginAttemptRepositoryPort;
  readonly pets: PetRepositoryPort;
  readonly records: MedicalRecordRepositoryPort;
  readonly households: HouseholdRepositoryPort;
  readonly confirmationTokens: ConfirmationTokenRepositoryPort;
  readonly rateLimits: RateLimitRepositoryPort;
  readonly invitations: InvitationRepositoryPort;
}
