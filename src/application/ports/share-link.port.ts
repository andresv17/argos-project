/**
 * Puertos del enlace veterinario (feature 005, US4): generación del token, repositorio de `share_links` y de `share_link_audit`.
 * - `ShareTokenGeneratorPort` SOLO genera (32 bytes aleatorios en base64url, 43 caracteres); el hash no pasa por puerto (MIF-005-09: `hashToken` vive en el dominio).
 * - `ShareLinkRepositoryPort` guarda solo `token_hash` (INV-005-005); el estado se deriva con el reloj inyectado, no se persiste.
 * - `lockScope` toma el candado del ALCANCE (la mascota para `PET`, el hogar para `HOUSEHOLD`), nunca el del usuario creador: dos creadores distintos sobre el mismo
 *   hogar deben serializarse para que el conteo de 20 activos sea autoritativo (EDGE-005-15, REQ-VET-012).
 * - La auditoría no tiene clave foránea al enlace (sobrevive a la purga de la fila dentro de sus 90 días) y nunca guarda el token, su hash ni un prefijo.
 *
 * @implements REQ-VET-003, REQ-VET-008, REQ-VET-012, REQ-VET-013, INV-005-005, MIF-005-09, EDGE-005-17-bis
 */
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { ShareLinkRecord, ShareScope } from '../../domain/sharing/share-link.ts';

export interface ShareTokenGeneratorPort {
  /** Token nuevo de 43 caracteres base64url con 256 bits de entropía. */
  nextShareToken(): string;
}

export type ShareAuditEventType = 'CREATED' | 'REVOKED' | 'ACCESS_OK' | 'ACCESS_FAILED';

/** Fila de `share_link_audit`: id del enlace (no su hash), HMAC de la IP (nunca la IP) y, en fallos, el contador agregado por (ip_hmac, ventana). */
export interface ShareAuditRecord {
  readonly id: string;
  readonly shareLinkId: string | null;
  readonly eventType: ShareAuditEventType;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly ipHmac: string | null;
  readonly failCount: number;
}

export interface ShareAuditRetention {
  /** Filas sin `ip_hmac` anteriores a este corte se purgan (90 días). */
  readonly withoutIpBefore: string;
  /** Filas con `ip_hmac` anteriores a este corte se purgan (30 días, PN-06). */
  readonly withIpBefore: string;
}

/**
 * El UNIQUE `(created_by_user_id, idempotency_key)` saltó en `insert` (carrera que la búsqueda previa no vio). Los adaptadores lo lanzan en lugar del error del motor,
 * para que el caso de uso lo traduzca al 422 del contrato sin exponer detalles de la base (EDGE-005-17-bis).
 */
export class ShareLinkIdempotencyConflictError extends Error {
  constructor() {
    super('UNIQUE constraint failed: share_links.created_by_user_id, share_links.idempotency_key');
    this.name = 'ShareLinkIdempotencyConflictError';
  }
}

export interface ShareLinkRepositoryPort {
  /** Candado hasta el final de la transacción (PostgreSQL: `SELECT … FOR UPDATE` de la fila; SQLite y memoria: la transacción ya es de escritura). No falla si el alcance no existe. */
  lockScope(scope: ShareScope, scopeId: string): Promise<void>;
  /** Bloqueo de la FILA del enlace (paso 3 del orden de §6, ENM-005-E): PostgreSQL `SELECT … FOR UPDATE`; SQLite y memoria: la transacción ya es de escritura. No falla si no existe. */
  lockLink(shareLinkId: string): Promise<void>;
  /**
   * Enlaces `PETS` del hogar de todos los creadores dentro de la retención (annex §5.5: `listByScope` NO devuelve `PETS`; esta es la única fuente), por `(createdAt DESC, id DESC)`.
   */
  listPetsByHousehold(householdId: string, retainedSince: string): Promise<ShareLinkRecord[]>;
  /** Enlaces `PETS` ACTIVOS (no revocados ni vencidos) de un creador en un hogar: insumo del disparador de la fila 3 de §5.1. */
  listActivePetsByCreator(householdId: string, createdByUserId: string, now: string): Promise<ShareLinkRecord[]>;
  /** Falla (con `ShareLinkIdempotencyConflictError` si el duplicado es `(created_by_user_id, idempotency_key)`) si `token_hash` o esa pareja ya existen, si el alcance es incoherente o si la mascota, el hogar o el creador no existen. */
  insert(link: ShareLinkRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ShareLinkRecord | null>;
  findById(id: string): Promise<ShareLinkRecord | null>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<ShareLinkRecord | null>;
  /** Enlaces del alcance dentro de la retención (ni vencidos ni revocados antes de `retainedSince`), por `(createdAt DESC, id DESC)`. */
  listByScope(scope: ShareScope, scopeId: string, retainedSince: string): Promise<ShareLinkRecord[]>;
  /**
   * Enlaces del alcance sin revocar y con `expires_at > now`, de cualquier creador. Para `HOUSEHOLD` y `PETS` cuenta `scope IN (HOUSEHOLD, PETS)` y `household_id = scopeId` (annex §5.5, D12-21,
   * cambio de semántica de `activeCount`): es el número que decide el `409 ERR-SHARE-LINK-LIMIT`.
   */
  countActive(scope: ShareScope, scopeId: string, now: string): Promise<number>;
  /** `UPDATE … SET revoked_at = now WHERE id = ? AND revoked_at IS NULL AND expires_at > now`; true si cambió una fila (ya revocado, vencido o inexistente: false). */
  revoke(id: string, now: string): Promise<boolean>;
  /** Borra los vencidos o revocados anteriores al corte y devuelve cuántos. */
  purge(cutoffExclusive: string): Promise<number>;
  /**
   * Supresión de cuenta (feature 012, rama R-04, SC-012-108): sustituye `pet_owner_user_id_at_creation = userId` por el seudónimo HMAC en los enlaces de OTROS creadores (la columna es NOT NULL en `PET` y no tiene clave
   * foránea; los enlaces del propio usuario caen por cascada con él). Devuelve cuántas filas cambió.
   */
  pseudonymizePetOwnerSnapshot(userId: string, pseudonym: string): Promise<number>;
  /** Todas las filas por id: solo para verificación y paridad de pruebas; ninguna ruta lo usa. */
  listAll(): Promise<ShareLinkRecord[]>;
}

export interface ShareLinkAuditRepositoryPort {
  insert(row: ShareAuditRecord): Promise<void>;
  /** Suma 1 a la fila `ACCESS_FAILED` de `(ipHmac, windowStart)` o la crea con `id` (agregación, no una fila por intento). */
  recordFailure(id: string, ipHmac: string, windowStart: string): Promise<void>;
  /** Pone a NULL el actor de las filas del usuario (eliminación de cuenta; la tabla no tiene clave foránea). */
  clearActor(userId: string): Promise<void>;
  purge(retention: ShareAuditRetention): Promise<number>;
  /** Todas las filas por id: solo para verificación y paridad de pruebas. */
  listAll(): Promise<ShareAuditRecord[]>;
}

/** Mascotas elegibles de un creador en un hogar (annex §3.3): `eligible` por `(name ASC, id ASC)` y si tiene alguna elegible en TODO el hogar (insumo del 403 independiente del cuerpo). */
export interface PetsEligibility {
  readonly eligible: PetProfile[];
  readonly hasAnyEligibleInHousehold: boolean;
}

/**
 * `share_link_pets` (ENM-005-E, feature 012): filas `(enlace, mascota)` sin posición. Las dos lecturas de elegibilidad son UNA sola consulta acotada a 20 ids (trinity H-19): la elegibilidad de la creación y la
 * revalidación por lote de cada acceso público.
 */
export interface ShareLinkPetRepositoryPort {
  insertMany(shareLinkId: string, petIds: readonly string[]): Promise<void>;
  /** Mascotas del enlace por `pet_id ASC` (sin revalidar). */
  listPetIds(shareLinkId: string): Promise<string[]>;
  /** Las mascotas de varios enlaces en una consulta (por `pet_id ASC`). */
  listPetIdsOfLinks(shareLinkIds: readonly string[]): Promise<Map<string, string[]>>;
  /** Enlaces `PETS` (cualquier estado) que contienen la mascota, por `share_link_id ASC`. */
  listLinkIdsByPet(petId: string): Promise<string[]>;
  /** Borra la fila `(enlace, mascota)`; true si existía. */
  deleteRow(shareLinkId: string, petId: string): Promise<boolean>;
  /** Elegibilidad de la creación (annex §3.3): asignada ahora al hogar y el creador es propietario principal o co-propietario ACTIVE. Una sola consulta. */
  resolveEligible(input: { readonly userId: string; readonly householdId: string; readonly petIds: readonly string[] }): Promise<PetsEligibility>;
  /**
   * Revalidación por lote de cada acceso (annex §4.1): de las filas del enlace, las mascotas que SIGUEN asignadas al hogar de origen, existen y de las que el creador es hoy propietario principal o
   * co-propietario ACTIVE, por `(name ASC, id ASC)`. Con un enlace inexistente (NIL) devuelve vacío: la consulta se ejecuta SIEMPRE (secuencia constante).
   */
  revalidateEligible(input: { readonly shareLinkId: string; readonly householdId: string; readonly creatorUserId: string }): Promise<PetProfile[]>;
}
