/**
 * Puertos de repositorio. Todas las operaciones devuelven Promise. Los repositorios solo
 * se obtienen dentro de `UnitOfWorkPort.runInTransaction`, de modo que toda lectura y escritura es transaccional.
 * Ninguna lista garantiza orden: los casos de uso ordenan con las reglas de dominio (INV-SORT-001, REQ-PET-005,
 * INV-HOUSE-005).
 *
 * @implements INV-ARCH-004, INV-ARCH-005, INV-PET-003, REQ-VIN8-003
 */

import type { AccountStatus } from '../../domain/account/account-status.ts';
import type { MediaKind } from '../../domain/media/index.ts';
import type { ShareLinkAuditRepositoryPort, ShareLinkRepositoryPort } from './share-link.port.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { Household, HouseholdInvitation, UserSelfProfile } from '../../generated/index.ts';
import type { AuditEntry } from '../../generated/v31/index.ts';
import type { LegacyHouseholdMember } from '../../domain/households/household-policies.ts';
import type { SessionRecord } from '../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../domain/records/record-invariants.ts';
import type { SceneConsentRepository, SceneRepository } from './scene-repositories.port.ts';
import type { AuthIdentityRepositoryPort, OAuthFlowStateRepositoryPort } from './auth-identity.port.ts';
import type { AboutContentRepositoryPort } from './about.port.ts';
import type { CoOwnerRepositoryPort, OwnerRequestRepositoryPort } from './co-ownership.port.ts';
import type { AdminAuditRepositoryPort, AdminDelegateRepositoryPort, AdminFlowStateRepositoryPort, AdminIdentityRepositoryPort, AdminParameterRepositoryPort, AdminSessionRepositoryPort, RegistrationDecisionRepositoryPort } from './admin.port.ts';

/** Usuario persistido: perfil propio (con correo, idioma y zona horaria) más el hash de su contraseña (INV-AUTH-003: nunca en claro). */
export interface UserAccount extends UserSelfProfile {
  readonly passwordHash: string;
  /**
   * Instante en que Google verificó el correo (feature 008, REQ-SSO8-003). Ausente = correo sin verificar (toda cuenta heredada, EDGE-008-036). Solo lo fija `insert`;
   * `update` NUNCA lo modifica.
   */
  readonly emailVerifiedAt?: string;
  /**
   * Estado de aprobación (009, STATE-ACCT9-001). Ausente = `ACTIVE` (toda cuenta heredada y toda cuenta de prueba previa a 009); el registro la crea `PENDING` de forma explícita.
   * Solo `insert` lo fija; `update` NUNCA lo modifica (lo cambia la decisión atómica de T1247).
   */
  readonly accountStatus?: AccountStatus;
  /**
   * Declaración de mayoría de edad (010, REQ-MEN10-001): instante (reloj inyectado) y versión SemVer del texto aceptado. Ausentes = cuenta anterior a 010 (REQ-MEN10-002, sin
   * declaración retroactiva). Solo `insert` los fija; `update` NUNCA los modifica. Sin fecha de nacimiento ni documento (REQ-MEN10-003).
   */
  readonly adultDeclaredAt?: string;
  readonly adultNoticeVersion?: string;
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
  /**
   * Titular VERIFICADO del correo (`email_verified_at` no nulo, sin distinguir mayúsculas), o null. Un índice único parcial garantiza a lo sumo uno (REQ-VIN8-003,
   * INV-VIN8-001); `listByEmail` no sirve para esto porque devuelve a lo sumo 2 filas y podría ocultar al titular verificado entre cuentas sin verificar.
   */
  findVerifiedByEmail(normalizedEmail: string): Promise<UserAccount | null>;
  /**
   * D8-14, EDGE-008-023: pone `email = NULL` en TODAS las cuentas con ese correo (sin distinguir mayúsculas) y `email_verified_at` nulo; conserva usuario y contraseña.
   * Devuelve cuántas cuentas liberó. Nunca toca a un titular verificado.
   */
  releaseUnverifiedEmail(normalizedEmail: string): Promise<number>;
  /**
   * Usernames (capitalización guardada) cuyo `LOWER(username)` empieza por `lowerPrefix`, ordenados por `LOWER(username)` y limitados a `limit`
   * (autocompletado de colaboradores, REQ-INV8-001). El prefijo ya viene validado (`[A-Za-z0-9._-]{3,30}`) y en minúsculas; el `_` NO es comodín.
   */
  searchUsernamesByPrefix(lowerPrefix: string, limit: number): Promise<string[]>;
  listByIds(userIds: readonly string[]): Promise<UserAccount[]>;
  /** Falla si el id o el username ya existen. */
  insert(user: UserAccount): Promise<void>;
  /** Reemplaza perfil y hash del usuario con ese id (el username no cambia). Falla si no existe. REQ-ACC-001, REQ-AUTH2-003. */
  update(user: UserAccount): Promise<void>;
  /** Borra la fila del usuario (B9 (j) de STATE-ACCOUNT-DELETE-001). */
  delete(userId: string): Promise<void>;
  /**
   * Estado de la foto de perfil (`avatar_version`, `avatar_object_id`; feature 011, #78, REQ-PRF11-001); null si el usuario no existe. Sin tabla ni puerto nuevo (MIF-011-02): son columnas de `users`
   * y NO viven en `users.data`, de modo que `update` (perfil) no puede revertirlas.
   */
  findAvatar(userId: string): Promise<AvatarState | null>;
  /** Cambia la foto: `avatar_version = avatar_version + 1` y `avatar_object_id = :objectId` en una sola sentencia y devuelve el estado nuevo (la versión solo crece). Falla si el usuario no existe. */
  replaceAvatar(userId: string, objectId: string): Promise<AvatarState>;
  /** Quita la foto: `avatar_object_id = NULL`; `avatar_version` NO cambia ni se reinicia. */
  clearAvatar(userId: string): Promise<void>;
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
  /** Sesión por el SHA-256 hex de su token (el valor de `sessions.token_hash`); `null` si no existe. No renueva ni modifica nada (REQ-VIN8-004). */
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Igual que `revokeOthers`, pero la sesión conservada se identifica por su hash (el callback de Google no tiene el token en claro). */
  revokeOthersByTokenHash(userId: string, keepTokenHash: string, nowIsoTimestamp: string): Promise<number>;
  /** Borra todas las sesiones del usuario, incluida la actual (B9 (h)). */
  deleteByUser(userId: string): Promise<void>;
  /**
   * Estado de aprobación de la cuenta dueña de la sesión (009, la guarda exige `ACTIVE`, REQ-APR9-001); `null` si la cuenta no existe. Vive aquí y no en `users` para que la guarda
   * decida sin cargar el perfil ni mezclarse con las lecturas de cuentas de la ruta.
   */
  findOwnerAccountStatus(userId: string): Promise<AccountStatus | null>;
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
  /**
   * `avatarVersion` de la API de cada mascota existente en UNA lectura: `avatar_version` si `avatar_object_id` no es nulo y `null` en otro caso
   * (REQ-AVA-001). Las mascotas inexistentes no aparecen en el mapa.
   */
  findAvatarVersions(petIds: readonly string[]): Promise<ReadonlyMap<string, number | null>>;
  /** Estado del avatar de la mascota (`avatar_version`, `avatar_object_id`); null si la mascota no existe. */
  findAvatar(petId: string): Promise<AvatarState | null>;
  /**
   * Cambia el avatar: `avatar_version = avatar_version + 1` y `avatar_object_id = :objectId` en una sola sentencia y devuelve el estado nuevo
   * (INV-AVA-001: la versión solo crece). Falla si la mascota no existe.
   */
  replaceAvatar(petId: string, objectId: string): Promise<AvatarState>;
  /** Quita el avatar: `avatar_object_id = NULL`; `avatar_version` NO cambia ni se reinicia (INV-AVA-001). */
  clearAvatar(petId: string): Promise<void>;
  /**
   * Lleva `avatar_version` a `max(actual, version)` sin tocar `avatar_object_id`: la importación por reemplazo recrea la fila de la mascota y debe
   * conservar la versión de la existente con el mismo `id` para que la caché `?v=` no sirva una imagen antigua (REQ-IMP-001, INV-AVA-001).
   */
  raiseAvatarVersion(petId: string, version: number): Promise<void>;
  /** Principal y `ownership_version` de la mascota sin tomar candado (REQ-OWN12-004); null si no existe. */
  findOwnership(petId: string): Promise<OwnershipState | null>;
  /**
   * Como `findOwnership` pero con el bloqueo de la fila de la mascota (`SELECT … FOR UPDATE` en PostgreSQL con `lock_timeout` = `OWNERSHIP_LOCK_TIMEOUT_MS`, que vencido lanza `ERR-OWN12-RETRYABLE`;
   * `BEGIN IMMEDIATE` ya es el candado en SQLite y las transacciones de memoria van en serie, REQ-OWN12-011). Primera lectura de toda transición de propiedad, DESPUÉS de autorizar.
   */
  findOwnershipForUpdate(petId: string): Promise<OwnershipState | null>;
  /**
   * `UPDATE pets SET owner_user_id = :nuevo, ownership_version = ownership_version + 1 WHERE id = :id AND owner_user_id = :esperado AND ownership_version = :leída` (REQ-OWN12-011);
   * devuelve las filas afectadas (0 = otra transición se adelantó). Mantiene `data.ownerUserId` coherente con la columna.
   */
  compareAndSetOwner(petId: string, expectedOwnerUserId: string, expectedOwnershipVersion: number, newOwnerUserId: string): Promise<number>;
  /** `ownership_version + 1` sin cambiar el principal (entra o sale un co-propietario, se ejecuta una acción), condicionado a la versión leída; devuelve las filas afectadas. */
  bumpOwnershipVersion(petId: string, expectedOwnershipVersion: number): Promise<number>;
}

/** Principal actual y versión de propiedad de la mascota (`pets.owner_user_id`, `pets.ownership_version`). */
export interface OwnershipState {
  readonly ownerUserId: string;
  readonly ownershipVersion: number;
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
  /** Número de filas de la mascota de ese tipo (`PHOTO` = álbum, `FILE` = archivos clínicos); 0 si no hay ninguna o la mascota no existe (REQ-ALB5-002). */
  countByPetAndKind(petId: string, kind: MediaKind): Promise<number>;
  /**
   * Suma de `size_bytes` de todas las mascotas del propietario legal más la foto de los hogares que posee (`households.owner_user_id`); el avatar y las escenas no
   * cuentan (REQ-ARC-005; enmienda MINOR (c) de N2-06, REQ-ESC6-018). Quien sube la foto del hogar no es el que la consume: cuenta el propietario del hogar.
   */
  countBytesOfOwner(ownerUserId: string): Promise<number>;
  /** Borra la fila de esa mascota con ese id; true si existía. */
  remove(petId: string, mediaId: string): Promise<boolean>;
  /** Objetos que se borrarían: filas de `pet_media` más avatares no nulos de esas mascotas (vista previa de importación, D-15 A). */
  countObjectsOfPets(petIds: readonly string[]): Promise<number>;
  /**
   * El medio con ese id SOLO si pertenece a alguna de esas mascotas (UNA consulta; ruta pública de archivos del enlace, REQ-VET-009, INV-005-001); null en
   * otro caso, también con la lista vacía.
   */
  findInPets(petIds: readonly string[], mediaId: string): Promise<PetMediaRecord | null>;
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
  /** Quien asignó la mascota (REQ-OWN12-007); `null` tras la supresión de su cuenta (FK `ON DELETE SET NULL`, NFR-012-009). */
  readonly assignedByUserId: string | null;
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
  /** Enlaces de solo lectura para el veterinario (feature 005, REQ-VET-*). */
  readonly shareLinks: ShareLinkRepositoryPort;
  /** Auditoría del enlace: creación, revocación y accesos (REQ-VET-008). */
  readonly shareAudit: ShareLinkAuditRepositoryPort;
  /** Escena del hogar (feature 006, ADR-006-07). Orden de candados: propietario -> mascota -> hogar -> escena (`SCENE_LOCK_ORDER`). */
  readonly scenes: SceneRepository;
  /** Consentimientos de la escena (feature 006, ADR-006-07). */
  readonly sceneConsents: SceneConsentRepository;
  /** Identidades externas de Google (feature 008, REQ-SSO8-001): ancladas en `sub`. */
  readonly authIdentities: AuthIdentityRepositoryPort;
  /** Estado del flujo OIDC de Google (feature 008, REQ-SSO8-004): un solo uso, 900 s. */
  readonly oauthFlows: OAuthFlowStateRepositoryPort;
  /** Portal de administración (feature 009, Fase 3, REQ-ADM9-*): identidad, sesión, estado del flujo OIDC y auditoría propios, sin relación con `users`. */
  readonly adminIdentities: AdminIdentityRepositoryPort;
  readonly adminSessions: AdminSessionRepositoryPort;
  readonly adminFlows: AdminFlowStateRepositoryPort;
  readonly adminAudit: AdminAuditRepositoryPort;
  /** Administradores delegados y sus roles de plataforma (feature 011, REQ-ADM11-001..007). */
  readonly adminDelegates: AdminDelegateRepositoryPort;
  /** Decisión atómica de aprobación de cuentas (feature 009, T1247, REQ-APR9-003). */
  readonly registrations: RegistrationDecisionRepositoryPort;
  /** Edición de parámetros de plataforma desde `/admin` (feature 009, Fase 5a, T1264, REQ-CFG9-007). */
  readonly adminParameters: AdminParameterRepositoryPort;
  /** Sección pública «Acerca de» (feature 010, T1430, REQ-ACE10-004): singleton con compare-and-set por versión. */
  readonly aboutContent: AboutContentRepositoryPort;
  /** Co-propiedad de mascotas (feature 012, Bloque A, #22): filas de `pet_co_owners`. */
  readonly coOwners: CoOwnerRepositoryPort;
  /** Solicitudes de propietarios (feature 012): aprobación conjunta, reclamación y disputa en una sola tabla `owner_requests`. */
  readonly ownerRequests: OwnerRequestRepositoryPort;
}
