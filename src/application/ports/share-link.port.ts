/**
 * Puertos del enlace veterinario (feature 005, US4): generación del token, repositorio de `share_links` y de `share_link_audit`.
 * - `ShareTokenGeneratorPort` SOLO genera (32 bytes aleatorios en base64url, 43 caracteres); el hash no pasa por puerto (MIF-005-09: `hashToken` vive en el dominio).
 * - `ShareLinkRepositoryPort` guarda solo `token_hash` (INV-005-005); el estado se deriva con el reloj inyectado, no se persiste.
 * - `lockScope` toma el candado del ALCANCE (la mascota para `PET`, el hogar para `HOUSEHOLD`), nunca el del usuario creador: dos creadores distintos sobre el mismo
 *   hogar deben serializarse para que el conteo de 20 activos sea autoritativo (EDGE-005-15, REQ-VET-012).
 * - La auditoría no tiene clave foránea al enlace (sobrevive a la purga de la fila dentro de sus 90 días) y nunca guarda el token, su hash ni un prefijo.
 *
 * @implements REQ-VET-003, REQ-VET-008, REQ-VET-012, REQ-VET-013, INV-005-005, MIF-005-09
 */
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

export interface ShareLinkRepositoryPort {
  /** Candado hasta el final de la transacción (PostgreSQL: `SELECT … FOR UPDATE` de la fila; SQLite y memoria: la transacción ya es de escritura). No falla si el alcance no existe. */
  lockScope(scope: ShareScope, scopeId: string): Promise<void>;
  /** Falla si `token_hash` o `(created_by_user_id, idempotency_key)` ya existen, si el alcance es incoherente o si la mascota, el hogar o el creador no existen. */
  insert(link: ShareLinkRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ShareLinkRecord | null>;
  findById(id: string): Promise<ShareLinkRecord | null>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<ShareLinkRecord | null>;
  /** Enlaces del alcance dentro de la retención (ni vencidos ni revocados antes de `retainedSince`), por `(createdAt DESC, id DESC)`. */
  listByScope(scope: ShareScope, scopeId: string, retainedSince: string): Promise<ShareLinkRecord[]>;
  /** Enlaces del alcance sin revocar y con `expires_at > now`, de cualquier creador. */
  countActive(scope: ShareScope, scopeId: string, now: string): Promise<number>;
  /** `UPDATE … SET revoked_at = now WHERE id = ? AND revoked_at IS NULL AND expires_at > now`; true si cambió una fila (ya revocado, vencido o inexistente: false). */
  revoke(id: string, now: string): Promise<boolean>;
  /** Borra los vencidos o revocados anteriores al corte y devuelve cuántos. */
  purge(cutoffExclusive: string): Promise<number>;
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
