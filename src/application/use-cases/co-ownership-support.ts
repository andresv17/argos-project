/**
 * Piezas comunes de los casos de uso de co-propiedad (Feature 012, Bloque A, #22).
 * - Autorización uniforme: quien no es principal ni co-propietario `ACTIVE` recibe el 404 de `ERR-PET-NOT-FOUND`, también un miembro de hogar (H-05: nunca 403 en estas rutas).
 * - Expiración perezosa de invitaciones y solicitudes (`now >= expires_at` ⇒ EXPIRED), materializada bajo el bloqueo por mascota.
 * - Auditoría de propiedad (tipos de mutación de la 012, `data-model.md` §Auditoría): una fila por operación sobre la entidad `PET`, `entityId` = petId, en la transacción de la mutación.
 * - Reintento único de una escritura condicional (`REQ-OWN12-011`): una carrera se reevalúa UNA vez; la segunda vez es `ERR-OWN12-RETRYABLE` (rollback, sin bucle).
 *
 * @implements REQ-OWN12-004, REQ-OWN12-005, REQ-OWN12-011, INV-OWN12-004, INV-OWN12-005, REQ-AUD-001, ERR-OWN12-RETRYABLE
 */

import { DomainError } from '../../generated/v38/index.ts';
import type { AuditMutationType } from '../../generated/v31/index.ts';
import { isOwnerOfPet } from '../../domain/access/pet-ownership.ts';
import { occupiesSlot, type CoOwnerStatus } from '../../domain/pet/co-ownership.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { OwnerRequestRecord, PetCoOwnerRecord } from '../ports/co-ownership.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { stateHash } from '../../domain/audit/state-hash.ts';
import { deriveStatus, retentionCutoffs } from '../../domain/sharing/share-link.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Tipos de mutación de auditoría de la 012 (Bloque A). El CHECK de `audit_log.mutation_type` los admite desde la migración 0034 (SQLite) / 0030 (PostgreSQL). */
export const OWNERSHIP_AUDIT_TYPES = [
  'CO_OWNER_INVITED',
  'CO_OWNER_ACCEPTED',
  'CO_OWNER_DECLINED',
  'CO_OWNER_CANCELLED',
  'CO_OWNER_LEFT',
  'CO_OWNER_ENDED',
  'PRINCIPAL_AUTO_PROMOTED',
  'PRINCIPAL_SUCCESSOR_DESIGNATED',
  'PRINCIPAL_CHANGED_BY_DISPUTE',
  'OWNER_REQUEST_CREATED',
  'OWNER_REQUEST_APPROVED',
  'OWNER_REQUEST_REJECTED',
  'OWNER_REQUEST_EXPIRED',
  'OWNER_REQUEST_STALE',
  'OWNER_REQUEST_CANCELLED',
  'ABSENCE_DISPUTE_OPENED',
  'ABSENCE_DISPUTE_TARGET_RESPONDED',
] as const;
export type OwnershipAuditType = (typeof OWNERSHIP_AUDIT_TYPES)[number];

/**
 * Fila de auditoría de propiedad. El contrato 3.1.0 de `AuditMutationType` (004) no incluye estos valores: se castea en ESTE único punto (desviación declarada en el reporte de T1616;
 * la ampliación del contrato y del CHECK es una enmienda de Nivel 2).
 */
export async function recordOwnershipAudit(deps: ApplicationDeps, repositories: RepositorySet, executorUserId: string, type: OwnershipAuditType, petId: string, previous: unknown, next: unknown): Promise<void> {
  await deps.auditLog.append(repositories, {
    id: deps.auditIds.nextId(),
    timestamp: deps.clock.nowIsoTimestamp(),
    executorUserId,
    mutationType: type as unknown as AuditMutationType,
    entityType: 'PET',
    entityId: petId,
    previousStateHash: previous === null ? null : stateHash(previous),
    newStateHash: next === null ? null : stateHash(next),
  });
}

/** Resultado de leer la mascota con su co-propiedad vigente. */
export interface OwnedPet {
  readonly pet: PetProfile;
  readonly rows: PetCoOwnerRecord[];
}

const notFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');

/** Autoriza sin bloqueo: principal o co-propietario `ACTIVE`; si no, el 404 uniforme (la autorización precede SIEMPRE al `FOR UPDATE`, H-03). */
export async function requireOwner(repositories: RepositorySet, userId: string, petId: string): Promise<OwnedPet> {
  const pet = await repositories.pets.findById(petId);
  if (pet === null) throw notFound();
  const rows = await repositories.coOwners.listByPet(petId);
  if (!isOwnerOfPet(userId, { ownerUserId: pet.ownerUserId, coOwners: rows })) throw notFound();
  return { pet, rows };
}

/** Estado efectivo de una fila: una `INVITED` vencida se lee `EXPIRED` (vigencia `[invited_at, expires_at)`). */
export const effectiveCoOwnerStatus = (row: Pick<PetCoOwnerRecord, 'status' | 'expiresAt'>, now: string): CoOwnerStatus => (row.status === 'INVITED' && now >= row.expiresAt ? 'EXPIRED' : row.status);

export const withEffectiveStatus = (rows: readonly PetCoOwnerRecord[], now: string): PetCoOwnerRecord[] => rows.map((row) => ({ ...row, status: effectiveCoOwnerStatus(row, now) }));

/** Persiste `EXPIRED` en las invitaciones vencidas (bajo el bloqueo por mascota) y devuelve las filas ya con su estado efectivo. */
export async function materializeExpiredInvitations(repositories: RepositorySet, rows: readonly PetCoOwnerRecord[], now: string): Promise<PetCoOwnerRecord[]> {
  for (const row of rows) {
    if (row.status === 'INVITED' && now >= row.expiresAt) await repositories.coOwners.transition(row.id, 'INVITED', { status: 'EXPIRED' });
  }
  return withEffectiveStatus(rows, now);
}

/** Principal más co-propietarios `ACTIVE` (con `user_id` no nulo). */
export const ownersOf = (principalUserId: string, rows: readonly Pick<PetCoOwnerRecord, 'status' | 'userId'>[]): string[] => [principalUserId, ...rows.filter((r) => r.status === 'ACTIVE' && r.userId !== null).map((r) => r.userId!)];

export const liveSlots = (rows: readonly Pick<PetCoOwnerRecord, 'status'>[]): number => rows.filter(occupiesSlot).length;

export const retryable = (): DomainError => new DomainError('ERR-OWN12-RETRYABLE');

/** Cierra una solicitud en un estado terminal: borra `message`, el username sellado y la respuesta (INV-OWN12-005, CHECK de vida de E-3). */
export function settledRequest(request: OwnerRequestRecord, patch: Partial<OwnerRequestRecord> & { readonly status: OwnerRequestRecord['status'] }): OwnerRequestRecord {
  return { ...request, message: null, targetUsernameSealed: null, targetResponse: null, ...patch };
}

/** Materializa `EXPIRED` en las solicitudes `PENDING` vencidas de la mascota (así el UNIQUE por acción no las ve) y devuelve las filas vigentes. */
export async function materializeExpiredRequests(repositories: RepositorySet, requests: readonly OwnerRequestRecord[], now: string): Promise<OwnerRequestRecord[]> {
  const out: OwnerRequestRecord[] = [];
  for (const request of requests) {
    if (request.status === 'PENDING' && now >= request.expiresAt) {
      const next = settledRequest(request, { status: 'EXPIRED', decidedAt: request.expiresAt });
      if (await repositories.ownerRequests.update(next, 'PENDING')) {
        out.push({ ...next, version: request.version + 1 });
        continue;
      }
    }
    out.push(request);
  }
  return out;
}

/**
 * ENM-005-A §2.2 (INV-OWN12-005, B-1): tras CUALQUIER cambio de propiedad (salida, sucesión, cesión del principal) se revocan los enlaces `PET` ACTIVOS de la mascota cuyo creador ya no es propietario
 * ACTIVE (principal o co-propietario), incluidos los creados como ADMIN de hogar que nunca lo fueron; así A -> B -> A no reactiva ninguno. Misma transacción y bajo el bloqueo por mascota.
 */
export async function revokeLinksOfNonOwners(deps: ApplicationDeps, repositories: RepositorySet, petId: string, actorUserId: string, now: string): Promise<void> {
  const state = await repositories.pets.findOwnership(petId);
  if (state === null) return;
  const coOwners = await repositories.coOwners.listByPet(petId);
  await repositories.shareLinks.lockScope('PET', petId);
  for (const link of await repositories.shareLinks.listByScope('PET', petId, retentionCutoffs(now).links)) {
    if (deriveStatus(link, now) !== 'ACTIVE' || isOwnerOfPet(link.createdByUserId, { ownerUserId: state.ownerUserId, coOwners })) continue;
    if (await repositories.shareLinks.revoke(link.id, now)) {
      await repositories.shareAudit.insert({ id: deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'REVOKED', occurredAt: now, actorUserId, ipHmac: null, failCount: 1 });
    }
  }
}
