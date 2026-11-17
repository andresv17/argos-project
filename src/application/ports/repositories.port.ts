/**
 * Puertos de repositorio. Todas las operaciones devuelven Promise. Los repositorios solo
 * se obtienen dentro de `UnitOfWorkPort.runInTransaction`, de modo que toda lectura y escritura es transaccional.
 * Ninguna lista garantiza orden: los casos de uso ordenan con las reglas de dominio (INV-SORT-001, REQ-PET-005,
 * INV-HOUSE-005).
 *
 * @implements INV-ARCH-004, INV-ARCH-005, INV-PET-003
 */

import type { MediaKind } from '../../domain/media/index.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { Household, HouseholdInvitation, UserSelfProfile } from '../../generated/index.ts';
import type { AuditEntry } from '../../generated/v31/index.ts';
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
  /**
   * Lee el usuario y toma el candado del propietario hasta el final de la transacción (`SELECT … FOR UPDATE` en Postgres; en SQLite
   * y en memoria el candado de la transacción ya es de escritura). Va ANTES que el de la mascota (REQ-BOR-005, ADR-004-05).
   */
  findByIdForUpdate(userId: string): Promise<UserAccount | null>;
  /**
   * Búsqueda por username SIN distinguir mayúsculas (`LOWER(username)`; el índice único `users_username_lower` garantiza a lo sumo una
   * cuenta, INV-LOG-001, REQ-LOG-002). El valor guardado conserva la capitalización con que se registró.
   */
  findByUsername(username: string): Promise<UserAccount | null>;
  /**
   * Cuentas cuyo correo coincide con `normalizedEmail` (recortado y en minúsculas) sin distinguir mayúsculas (`LOWER(email)`). El correo NO es
   * único (002): devuelve hasta 2 filas, de modo que quien llama distingue «una sola cuenta» de «ambiguo» (REQ-LOG-001, EDGE-007).
   */
  listByEmail(normalizedEmail: string): Promise<UserAccount[]>;
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
  /** Instantes de los fallos registrados para el identificador normalizado, en minúsculas (INV-AUTH-005, REQ-LOG-001). */
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

export type RateLimitScope = 'EXPORT' | 'INVITE' | 'MICROCHIP_DUPLICATE';

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
  /** La invitación INVITED del hogar para ese username (sin distinguir mayúsculas, REQ-LOG-002), o null. */
  findOpen(householdId: string, inviteeUsername: string): Promise<InvitationRecord | null>;
  /** Inserta o reemplaza por invitationId. Una segunda INVITED del mismo (hogar, username) se rechaza (INV-HOUSE-003). */
  save(invitation: InvitationRecord): Promise<void>;
  /** Invitaciones INVITED dirigidas al usuario (inviteeUserId), por createdAt y householdId ASC. Las inertes (sin usuario) nunca salen. */
  listOpenForUser(userId: string): Promise<InvitationRecord[]>;
  listByHousehold(householdId: string): Promise<InvitationRecord[]>;
  /** Borra las invitaciones emitidas o recibidas por el usuario. */
  deleteForUser(userId: string): Promise<void>;
  deleteForHousehold(householdId: string): Promise<void>;
}

export interface PetRepositoryPort {
  findById(petId: string): Promise<PetProfile | null>;
  /**
   * Lee la mascota y toma su candado hasta el final de la transacción (`SELECT … FOR UPDATE` en Postgres; `BEGIN IMMEDIATE` ya es el
   * candado en SQLite y las transacciones de memoria van en serie). Toda mutación de registros, medios o avatar lo toma primero
   * (REQ-BOR-005, INV-REG-003).
   */
  findByIdForUpdate(petId: string): Promise<PetProfile | null>;
  listByOwners(ownerUserIds: readonly string[]): Promise<PetProfile[]>;
  /** Inserta o reemplaza por id. NO toca las columnas de avatar: un `PATCH` de la mascota no puede revertir el avatar (INV-AVA-001). */
  save(pet: PetProfile): Promise<void>;
  delete(petId: string): Promise<void>;
  /** Estado del avatar de la mascota (`avatar_version`, `avatar_object_id`); null si la mascota no existe. */
  findAvatar(petId: string): Promise<AvatarState | null>;
  /**
   * Cambia el avatar: `avatar_version = avatar_version + 1` y `avatar_object_id = :objectId` en una sola sentencia y devuelve el estado nuevo
   * (INV-AVA-001: la versión solo crece). Falla si la mascota no existe.
   */
  replaceAvatar(petId: string, objectId: string): Promise<AvatarState>;
  /** Quita el avatar: `avatar_object_id = NULL`; `avatar_version` NO cambia ni se reinicia (INV-AVA-001). */
  clearAvatar(petId: string): Promise<void>;
}

/** Avatar de la mascota: la versión nunca decrece; `objectId` nulo = sin avatar (REQ-AVA-001). */
export interface AvatarState {
  readonly version: number;
  readonly objectId: string | null;
}

/** Metadatos de un archivo o foto (`pet_media`, REQ-GCS-005): sin clave de objeto, sin hash y sin autoría; la clave se deriva (INV-ARC-003). */
export interface PetMediaRecord {
  readonly id: string;
  readonly petId: string;
  readonly kind: MediaKind;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly originalName: string;
  readonly createdAt: string;
}

export interface PetMediaRepositoryPort {
  /** Falla si el id ya existe o si la mascota no existe (clave foránea). */
  insert(media: PetMediaRecord): Promise<void>;
  /** El medio con ese id SOLO si pertenece a la mascota; null en otro caso. */
  findById(petId: string, mediaId: string): Promise<PetMediaRecord | null>;
  /** Página de la mascota (y del tipo, o de ambos si `kind` es null) ordenada por `(createdAt DESC, id DESC)` (INV-ALB-001) más el `total` del filtro. */
  listPage(petId: string, kind: MediaKind | null, limit: number, offset: number): Promise<{ readonly items: PetMediaRecord[]; readonly total: number }>;
  /** Suma de `size_bytes` de todas las mascotas del propietario legal; el avatar no cuenta (REQ-ARC-005). */
  countBytesOfOwner(ownerUserId: string): Promise<number>;
  /** Borra la fila de esa mascota con ese id; true si existía. */
  remove(petId: string, mediaId: string): Promise<boolean>;
  /** Objetos que se borrarían: filas de `pet_media` más avatares no nulos de esas mascotas (vista previa de importación, D-15 A). */
  countObjectsOfPets(petIds: readonly string[]): Promise<number>;
}

export type MediaDeletionReason = 'INTENT' | 'DELETE';

/** Fila de `media_deletion_queue`: solo claves con UUID (INV-ARC-003), sin datos personales. */
export interface MediaDeletionEntry {
  readonly objectKey: string;
  readonly reason: MediaDeletionReason;
  readonly enqueuedAt: string;
  readonly attempts: number;
}

/** Cola de borrado de objetos de GCS (REQ-GCS-004, REQ-GCS-006): GCS no participa de la transacción de base de datos. */
export interface MediaDeletionQueuePort {
  /** Inserta la clave; si ya existe, `DELETE` sustituye a `INTENT` y un `INTENT` nunca degrada un `DELETE`. */
  enqueue(objectKey: string, reason: MediaDeletionReason, enqueuedAt: string): Promise<void>;
  /**
   * Encola con `DELETE` la clave derivada de cada medio de la mascota y la de su avatar (si lo hay) y devuelve esas claves; es lo primero que
   * se hace al eliminar la mascota, la cuenta o importar por reemplazo (REQ-GCS-004).
   */
  enqueueObjectsOfPet(petId: string, enqueuedAt: string): Promise<string[]>;
  findByKey(objectKey: string): Promise<MediaDeletionEntry | null>;
  /** Hasta `limit` filas por `(enqueuedAt, objectKey)` ascendente. */
  listPending(limit: number): Promise<MediaDeletionEntry[]>;
  /** Borra la fila (idempotente). */
  remove(objectKey: string): Promise<void>;
  /** Suma 1 a `attempts` (sin tope, REQ-GCS-004). */
  recordFailure(objectKey: string): Promise<void>;
  /** Convierte en `DELETE` los `INTENT` con `enqueuedAt` estrictamente anterior al corte (REQ-GCS-006) y devuelve cuántos. */
  promoteStaleIntents(olderThanExclusive: string): Promise<number>;
  /** Filas con `enqueuedAt` estrictamente anterior al corte (alerta a las 48 h, REQ-GCS-004); solo un conteo. */
  countOlderThan(cutoffExclusive: string): Promise<number>;
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
  /** Reemplaza el registro con ese id (REQ-REC2-003). Falla si no existe en el módulo. */
  replace<M extends RecordModule>(module: M, record: RecordOf<M>): Promise<void>;
  /** Borra el registro de la mascota con ese id; devuelve false si no existía (REQ-REC2-003). */
  remove(module: RecordModule, petId: string, recordId: string): Promise<boolean>;
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
  /** Cambia el propietario del hogar (TRANSFER_OWNERSHIP, INV-HOUSE2-001). Falla si el hogar no existe. */
  updateOwner(householdId: string, ownerUserId: string): Promise<void>;
}

/** Asignación de una mascota a un hogar (REQ-HOUSE2-003; tabla pet_assignments). */
export interface PetAssignmentRecord {
  readonly petId: string;
  readonly householdId: string;
  readonly assignedByUserId: string;
  readonly assignedAt: string;
}

export interface PetAssignmentRepositoryPort {
  listByHousehold(householdId: string): Promise<PetAssignmentRecord[]>;
  listByPet(petId: string): Promise<PetAssignmentRecord[]>;
  /** Inserta o reemplaza por (petId, householdId). */
  save(assignment: PetAssignmentRecord): Promise<void>;
  /** Borra la asignación (petId, householdId) si existe. */
  remove(petId: string, householdId: string): Promise<void>;
  deleteForHousehold(householdId: string): Promise<void>;
  deleteForPet(petId: string): Promise<void>;
}

/**
 * Almacén de la tabla `audit_log` (REQ-AUD-001, ADR-002-05). Solo inserta y seudonimiza: ni lectura de negocio, ni
 * actualización, ni borrado (la purga de retención es de mantenimiento, T266). Lo usa `AuditLogPort`.
 */
export interface AuditLogRepositoryPort {
  insert(entry: AuditEntry): Promise<void>;
  /** Sustituye `userId` por `hmac` en `executor_user_id` y en `entity_id` de todas las filas donde aparezca. */
  pseudonymizeUser(userId: string, hmac: string): Promise<void>;
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
  readonly assignments: PetAssignmentRepositoryPort;
  readonly media: PetMediaRepositoryPort;
  readonly mediaQueue: MediaDeletionQueuePort;
  readonly auditLog: AuditLogRepositoryPort;
}
