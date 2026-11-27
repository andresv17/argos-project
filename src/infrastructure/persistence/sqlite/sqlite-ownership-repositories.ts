/**
 * Repositorios SQLite de la co-propiedad (Feature 012, Bloque A, #22): `pet_co_owners`, `owner_requests` y las operaciones de propiedad de `pets` (`ownership_version`).
 * Mismo contrato que PostgreSQL y memoria (los tres pasan las mismas pruebas de paridad). `BEGIN IMMEDIATE` (SqliteUnitOfWork) ya es el bloqueo por mascota (REQ-OWN12-011).
 *
 * @implements REQ-OWN12-001, REQ-OWN12-004, REQ-OWN12-011, NFR-012-006, NFR-012-008, STATE-COOWN12-001, STATE-OWNREQ12-001
 */

import type { CoOwnerPatch, CoOwnerRepositoryPort, OwnerRequestRecord, OwnerRequestRepositoryPort } from '../../../application/ports/co-ownership.port.ts';
import type { OwnershipState } from '../../../application/ports/repositories.port.ts';
import { CO_OWNER_COLUMNS, OWNER_REQUEST_COLUMNS, TERMINAL_CO_OWNER_STATUSES, coOwnerParams, mentionsUser, ownerRequestParams, scrubUserFromRequest, toCoOwnerRecord, toOwnerRequestRecord, type SqlRow } from '../ownership-rows.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

export function sqliteCoOwnerRepository(db: SqliteDatabase): CoOwnerRepositoryPort {
  const ofPet = db.prepare<[string], SqlRow>(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE pet_id = ? ORDER BY invited_at, id`);
  const byId = db.prepare<[string], SqlRow>(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE id = ?`);
  const ofUser = db.prepare<[string], SqlRow>(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE user_id = ? ORDER BY invited_at, id`);
  const insert = db.prepare(`INSERT INTO pet_co_owners (${CO_OWNER_COLUMNS}) VALUES (${placeholders(13)})`);
  const transition = db.prepare(
    `UPDATE pet_co_owners SET status = ?, joined_at = CASE WHEN ? = 1 THEN ? ELSE joined_at END, left_at = CASE WHEN ? = 1 THEN ? ELSE left_at END,
       promotion_kind = CASE WHEN ? = 1 THEN ? ELSE promotion_kind END, version = version + 1 WHERE id = ? AND status = ?`,
  );
  const ack = db.prepare("UPDATE pet_co_owners SET promotion_notice_ack_at = ?, version = version + 1 WHERE id = ? AND status = 'PROMOTED' AND promotion_notice_ack_at IS NULL");
  const scrubUser = db.prepare('UPDATE pet_co_owners SET user_pseudonym = ?, user_id = NULL, version = version + 1 WHERE user_id = ?');
  const scrubInviter = db.prepare('UPDATE pet_co_owners SET invited_by_user_id = NULL WHERE invited_by_user_id = ?');
  const purge = db.prepare(`DELETE FROM pet_co_owners WHERE status IN (${placeholders(TERMINAL_CO_OWNER_STATUSES.length)}) AND COALESCE(left_at, expires_at) < ?`);
  return {
    async listByPet(petId) {
      return ofPet.all(petId).map(toCoOwnerRecord);
    },
    async findById(id) {
      const row = byId.get(id);
      return row === undefined ? null : toCoOwnerRecord(row);
    },
    async listByUser(userId) {
      return ofUser.all(userId).map(toCoOwnerRecord);
    },
    async insert(row) {
      insert.run(...coOwnerParams(row));
    },
    async transition(id, expectedStatus, patch: CoOwnerPatch) {
      const has = (value: unknown): number => (value === undefined ? 0 : 1);
      return transition.run(patch.status, has(patch.joinedAt), patch.joinedAt ?? null, has(patch.leftAt), patch.leftAt ?? null, has(patch.promotionKind), patch.promotionKind ?? null, id, expectedStatus).changes === 1;
    },
    async acknowledgePromotion(id, at) {
      return ack.run(at, id).changes === 1;
    },
    async pseudonymizeUser(userId, pseudonym) {
      scrubUser.run(pseudonym, userId);
      scrubInviter.run(userId);
    },
    async purgeTerminalBefore(cutoffExclusive) {
      return purge.run(...TERMINAL_CO_OWNER_STATUSES, cutoffExclusive).changes;
    },
  };
}

export function sqliteOwnerRequestRepository(db: SqliteDatabase): OwnerRequestRepositoryPort {
  const ofPet = db.prepare<[string], SqlRow>(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE pet_id = ? ORDER BY created_at, id`);
  const ofPets = db.prepare<[string], SqlRow>(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE pet_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, id`);
  const all = db.prepare<[], SqlRow>(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests ORDER BY created_at, id`);
  const byId = db.prepare<[string], SqlRow>(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE id = ?`);
  const insert = db.prepare(`INSERT INTO owner_requests (${OWNER_REQUEST_COLUMNS}) VALUES (${placeholders(34)})`);
  const update = db.prepare(
    `UPDATE owner_requests SET status = ?, approver_set = ?, approvals = ?, rejected_by = ?, rejected_by_pseudonym = ?, message = ?, decided_at = ?, stale_reason = ?, target_username_sealed = ?,
       target_response = ?, requester_user_id = ?, requester_pseudonym = ?, target_user_id = ?, frozen_until = ?, freeze_extended_at = ?, sla_due_at = ?, escalated_at = ?, resolved_at = ?,
       resolution = ?, moot_reason = ?, resolved_by_user_id = ?, second_approver_user_id = ?, executes_after = ?, version = version + 1 WHERE id = ? AND status = ?`,
  );
  const deleteById = db.prepare('DELETE FROM owner_requests WHERE id = ?');
  const mentioning = db.prepare<[string, string, string, string, string, string, string], SqlRow>(
    `SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE requester_user_id = ? OR target_user_id = ? OR rejected_by = ? OR resolved_by_user_id = ? OR second_approver_user_id = ? OR approver_set LIKE ? OR approvals LIKE ?`,
  );
  return {
    async listByPet(petId) {
      return ofPet.all(petId).map(toOwnerRequestRecord);
    },
    async listByPets(petIds) {
      return ofPets.all(JSON.stringify([...petIds])).map(toOwnerRequestRecord);
    },
    async listAll() {
      return all.all().map(toOwnerRequestRecord);
    },
    async findById(id) {
      const row = byId.get(id);
      return row === undefined ? null : toOwnerRequestRecord(row);
    },
    async insert(row) {
      insert.run(...ownerRequestParams(row));
    },
    async update(row: OwnerRequestRecord, expectedStatus) {
      return (
        update.run(
          row.status, JSON.stringify(row.approverSet), JSON.stringify(row.approvals), row.rejectedBy, row.rejectedByPseudonym, row.message, row.decidedAt, row.staleReason, row.targetUsernameSealed,
          row.targetResponse, row.requesterUserId, row.requesterPseudonym, row.targetUserId, row.frozenUntil, row.freezeExtendedAt, row.slaDueAt, row.escalatedAt, row.resolvedAt,
          row.resolution, row.mootReason, row.resolvedByUserId, row.secondApproverUserId, row.executesAfter, row.id, expectedStatus,
        ).changes === 1
      );
    },
    async pseudonymizeUser(userId, pseudonym) {
      const like = `%${userId}%`;
      for (const raw of mentioning.all(userId, userId, userId, userId, userId, like, like)) {
        const row = toOwnerRequestRecord(raw);
        if (!mentionsUser(row, userId)) continue;
        const next = scrubUserFromRequest(row, userId, pseudonym);
        // Seudonimización dentro de la fila SIN la guarda de estado (cualquier estado conserva la identidad en claro cero).
        db.prepare(
          `UPDATE owner_requests SET requester_user_id = ?, requester_pseudonym = ?, target_user_id = ?, rejected_by = ?, rejected_by_pseudonym = ?, resolved_by_user_id = ?, second_approver_user_id = ?, approver_set = ?, approvals = ? WHERE id = ?`,
        ).run(next.requesterUserId, next.requesterPseudonym, next.targetUserId, next.rejectedBy, next.rejectedByPseudonym, next.resolvedByUserId, next.secondApproverUserId, JSON.stringify(next.approverSet), JSON.stringify(next.approvals), row.id);
      }
    },
    async deleteByIds(ids) {
      let removed = 0;
      for (const id of ids) removed += deleteById.run(id).changes;
      return removed;
    },
  };
}

/** Operaciones de propiedad de `pets` (SQLite). */
export function sqliteOwnershipOps(db: SqliteDatabase) {
  const find = db.prepare<[string], { owner_user_id: string; ownership_version: number }>('SELECT owner_user_id, ownership_version FROM pets WHERE id = ?');
  const cas = db.prepare(
    "UPDATE pets SET owner_user_id = ?, data = json_set(data, '$.ownerUserId', ?), ownership_version = ownership_version + 1 WHERE id = ? AND owner_user_id = ? AND ownership_version = ?",
  );
  const bump = db.prepare('UPDATE pets SET ownership_version = ownership_version + 1 WHERE id = ? AND ownership_version = ?');
  const toState = (row: { owner_user_id: string; ownership_version: number } | undefined): OwnershipState | null => (row === undefined ? null : { ownerUserId: row.owner_user_id, ownershipVersion: row.ownership_version });
  return {
    async findOwnership(petId: string): Promise<OwnershipState | null> {
      return toState(find.get(petId));
    },
    async findOwnershipForUpdate(petId: string): Promise<OwnershipState | null> {
      return toState(find.get(petId)); // BEGIN IMMEDIATE ya es el candado (REQ-OWN12-011)
    },
    async compareAndSetOwner(petId: string, expectedOwnerUserId: string, expectedOwnershipVersion: number, newOwnerUserId: string): Promise<number> {
      return cas.run(newOwnerUserId, newOwnerUserId, petId, expectedOwnerUserId, expectedOwnershipVersion).changes;
    },
    async bumpOwnershipVersion(petId: string, expectedOwnershipVersion: number): Promise<number> {
      return bump.run(petId, expectedOwnershipVersion).changes;
    },
  };
}
