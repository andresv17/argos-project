/**
 * Repositorios PostgreSQL de la co-propiedad (Feature 012, Bloque A, #22): misma firma y reglas que SQLite y memoria. SQL siempre parametrizado con `$n`.
 * Dos niveles de bloqueo (REQ-OWN12-011): el primero es el candado asesor global del UnitOfWork, cuya espera se acota con `boundedLockWait` (3 s, 55P03 -> `ERR-OWN12-RETRYABLE`); el segundo, defensa en profundidad, es el de la fila de la mascota:
 * el bloqueo por mascota es `SELECT … FROM pets WHERE id = $1 FOR UPDATE` con `SET LOCAL lock_timeout = OWNERSHIP_LOCK_TIMEOUT_MS`; vencido (SQLSTATE 55P03) lanza `ERR-OWN12-RETRYABLE`.
 *
 * @implements REQ-OWN12-001, REQ-OWN12-004, REQ-OWN12-011, NFR-012-006, NFR-012-008, STATE-COOWN12-001, STATE-OWNREQ12-001
 */

import type { CoOwnerPatch, CoOwnerRepositoryPort, OwnerRequestRecord, OwnerRequestRepositoryPort } from '../../../application/ports/co-ownership.port.ts';
import type { OwnershipState } from '../../../application/ports/repositories.port.ts';
import { DomainError } from '../../../generated/v38/index.ts';
import { OWNERSHIP_LOCK_TIMEOUT_MS } from '../../../domain/platform/feature-012-limits.ts';
import { CO_OWNER_COLUMNS, OWNER_REQUEST_COLUMNS, TERMINAL_CO_OWNER_STATUSES, coOwnerParams, mentionsUser, ownerRequestParams, scrubUserFromRequest, toCoOwnerRecord, toOwnerRequestRecord } from '../ownership-rows.ts';
import type { PoolClientLike } from './postgres-database.ts';

const slots = (n: number, from = 1): string => Array.from({ length: n }, (_, i) => `$${i + from}`).join(', ');

export function postgresCoOwnerRepository(client: PoolClientLike): CoOwnerRepositoryPort {
  return {
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE pet_id = $1 ORDER BY invited_at, id`, [petId]);
      return rows.map(toCoOwnerRecord);
    },
    async findById(id) {
      const { rows } = await client.query(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE id = $1`, [id]);
      return rows[0] === undefined ? null : toCoOwnerRecord(rows[0]);
    },
    async listByUser(userId) {
      const { rows } = await client.query(`SELECT ${CO_OWNER_COLUMNS} FROM pet_co_owners WHERE user_id = $1 ORDER BY invited_at, id`, [userId]);
      return rows.map(toCoOwnerRecord);
    },
    async insert(row) {
      await client.query(`INSERT INTO pet_co_owners (${CO_OWNER_COLUMNS}) VALUES (${slots(13)})`, coOwnerParams(row));
    },
    async transition(id, expectedStatus, patch: CoOwnerPatch) {
      const has = (value: unknown): boolean => value !== undefined;
      const result = await client.query(
        `UPDATE pet_co_owners SET status = $1, joined_at = CASE WHEN $2::boolean THEN $3 ELSE joined_at END, left_at = CASE WHEN $4::boolean THEN $5 ELSE left_at END,
           promotion_kind = CASE WHEN $6::boolean THEN $7 ELSE promotion_kind END, version = version + 1 WHERE id = $8 AND status = $9`,
        [patch.status, has(patch.joinedAt), patch.joinedAt ?? null, has(patch.leftAt), patch.leftAt ?? null, has(patch.promotionKind), patch.promotionKind ?? null, id, expectedStatus],
      );
      return result.rowCount === 1;
    },
    async acknowledgePromotion(id, at) {
      const result = await client.query("UPDATE pet_co_owners SET promotion_notice_ack_at = $1, version = version + 1 WHERE id = $2 AND status = 'PROMOTED' AND promotion_notice_ack_at IS NULL", [at, id]);
      return result.rowCount === 1;
    },
    async pseudonymizeUser(userId, pseudonym) {
      await client.query('UPDATE pet_co_owners SET user_pseudonym = $1, user_id = NULL, version = version + 1 WHERE user_id = $2', [pseudonym, userId]);
      await client.query('UPDATE pet_co_owners SET invited_by_user_id = NULL WHERE invited_by_user_id = $1', [userId]);
    },
    async purgeTerminalBefore(cutoffExclusive) {
      const result = await client.query('DELETE FROM pet_co_owners WHERE status = ANY($1::text[]) AND COALESCE(left_at, expires_at) < $2', [[...TERMINAL_CO_OWNER_STATUSES], cutoffExclusive]);
      return result.rowCount ?? 0;
    },
  };
}

export function postgresOwnerRequestRepository(client: PoolClientLike): OwnerRequestRepositoryPort {
  return {
    async listByPet(petId) {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE pet_id = $1 ORDER BY created_at, id`, [petId]);
      return rows.map(toOwnerRequestRecord);
    },
    async listByPets(petIds) {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE pet_id = ANY($1::text[]) ORDER BY created_at, id`, [[...petIds]]);
      return rows.map(toOwnerRequestRecord);
    },
    async listByRequester(userId) {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE requester_user_id = $1 ORDER BY created_at, id`, [userId]);
      return rows.map(toOwnerRequestRecord);
    },
    async listAll() {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests ORDER BY created_at, id`);
      return rows.map(toOwnerRequestRecord);
    },
    async findById(id) {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE id = $1`, [id]);
      return rows[0] === undefined ? null : toOwnerRequestRecord(rows[0]);
    },
    async insert(row) {
      await client.query(`INSERT INTO owner_requests (${OWNER_REQUEST_COLUMNS}) VALUES (${slots(39)})`, ownerRequestParams(row));
    },
    async update(row: OwnerRequestRecord, expectedStatus) {
      const result = await client.query(
        `UPDATE owner_requests SET status = $1, approver_set = $2, approvals = $3, rejected_by = $4, rejected_by_pseudonym = $5, message = $6, decided_at = $7, stale_reason = $8, target_username_sealed = $9,
           target_response = $10, requester_user_id = $11, requester_pseudonym = $12, target_user_id = $13, frozen_until = $14, freeze_extended_at = $15, sla_due_at = $16, escalated_at = $17, resolved_at = $18,
           resolution = $19, moot_reason = $20, resolved_by_user_id = $21, second_approver_user_id = $22, executes_after = $23, resolved_by_admin_id = $24, second_approver_admin_id = $25, resolved_by_person_id = $26,
           second_approver_person_id = $27, second_approved_at = $28, version = version + 1 WHERE id = $29 AND status = $30`,
        [
          row.status, JSON.stringify(row.approverSet), JSON.stringify(row.approvals), row.rejectedBy, row.rejectedByPseudonym, row.message, row.decidedAt, row.staleReason, row.targetUsernameSealed,
          row.targetResponse, row.requesterUserId, row.requesterPseudonym, row.targetUserId, row.frozenUntil, row.freezeExtendedAt, row.slaDueAt, row.escalatedAt, row.resolvedAt,
          row.resolution, row.mootReason, row.resolvedByUserId, row.secondApproverUserId, row.executesAfter, row.resolvedByAdminId ?? null, row.secondApproverAdminId ?? null, row.resolvedByPersonId ?? null,
          row.secondApproverPersonId ?? null, row.secondApprovedAt ?? null, row.id, expectedStatus,
        ],
      );
      return result.rowCount === 1;
    },
    async pseudonymizeUser(userId, pseudonym) {
      const like = `%${userId}%`;
      const { rows } = await client.query(
        `SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE requester_user_id = $1 OR target_user_id = $1 OR rejected_by = $1 OR resolved_by_user_id = $1 OR second_approver_user_id = $1 OR approver_set LIKE $2 OR approvals LIKE $2`,
        [userId, like],
      );
      for (const raw of rows) {
        const row = toOwnerRequestRecord(raw);
        if (!mentionsUser(row, userId)) continue;
        const next = scrubUserFromRequest(row, userId, pseudonym);
        await client.query(
          'UPDATE owner_requests SET requester_user_id = $1, requester_pseudonym = $2, target_user_id = $3, rejected_by = $4, rejected_by_pseudonym = $5, resolved_by_user_id = $6, second_approver_user_id = $7, approver_set = $8, approvals = $9 WHERE id = $10',
          [next.requesterUserId, next.requesterPseudonym, next.targetUserId, next.rejectedBy, next.rejectedByPseudonym, next.resolvedByUserId, next.secondApproverUserId, JSON.stringify(next.approverSet), JSON.stringify(next.approvals), row.id],
        );
      }
    },
    async hasOpenChipReservation(chipHmac, nowIso) {
      const { rows } = await client.query("SELECT id FROM owner_requests WHERE chip_hmac = $1 AND action = 'CHIP_DISPUTE' AND dispute_reason = 'CHIP_APPROPRIATION' AND status = 'UNDER_REVIEW' AND expires_at > $2 LIMIT 1", [chipHmac, nowIso]);
      return rows.length > 0;
    },
    async listByChipHmac(chipHmac) {
      const { rows } = await client.query(`SELECT ${OWNER_REQUEST_COLUMNS} FROM owner_requests WHERE chip_hmac = $1 ORDER BY created_at, id`, [chipHmac]);
      return rows.map(toOwnerRequestRecord);
    },
    async deleteByIds(ids) {
      if (ids.length === 0) return 0;
      const result = await client.query('DELETE FROM owner_requests WHERE id = ANY($1::text[])', [[...ids]]);
      return result.rowCount ?? 0;
    },
  };
}

/** Operaciones de propiedad de `pets` (PostgreSQL). */
export function postgresOwnershipOps(client: PoolClientLike) {
  const toState = (row: Record<string, unknown> | undefined): OwnershipState | null => (row === undefined ? null : { ownerUserId: String(row['owner_user_id']), ownershipVersion: Number(row['ownership_version']) });
  return {
    async findOwnership(petId: string): Promise<OwnershipState | null> {
      const { rows } = await client.query('SELECT owner_user_id, ownership_version FROM pets WHERE id = $1', [petId]);
      return toState(rows[0]);
    },
    async findOwnershipForUpdate(petId: string): Promise<OwnershipState | null> {
      try {
        await client.query(`SET LOCAL lock_timeout = '${OWNERSHIP_LOCK_TIMEOUT_MS}ms'`);
        const { rows } = await client.query('SELECT owner_user_id, ownership_version FROM pets WHERE id = $1 FOR UPDATE', [petId]);
        return toState(rows[0]);
      } catch (error) {
        if ((error as { code?: unknown }).code === '55P03') throw new DomainError('ERR-OWN12-RETRYABLE');
        throw error;
      }
    },
    async compareAndSetOwner(petId: string, expectedOwnerUserId: string, expectedOwnershipVersion: number, newOwnerUserId: string): Promise<number> {
      const result = await client.query(
        "UPDATE pets SET owner_user_id = $1, data = jsonb_set(data, '{ownerUserId}', to_jsonb($1::text)), ownership_version = ownership_version + 1 WHERE id = $2 AND owner_user_id = $3 AND ownership_version = $4",
        [newOwnerUserId, petId, expectedOwnerUserId, expectedOwnershipVersion],
      );
      return result.rowCount ?? 0;
    },
    async bumpOwnershipVersion(petId: string, expectedOwnershipVersion: number): Promise<number> {
      const result = await client.query('UPDATE pets SET ownership_version = ownership_version + 1 WHERE id = $1 AND ownership_version = $2', [petId, expectedOwnershipVersion]);
      return result.rowCount ?? 0;
    },
    async findMicrochipHolder(microchipId: string): Promise<{ petId: string; ownerUserId: string } | null> {
      const { rows } = await client.query('SELECT id, owner_user_id FROM pets WHERE microchip_id = $1 LIMIT 1', [microchipId]);
      return rows[0] === undefined ? null : { petId: String(rows[0]['id']), ownerUserId: String(rows[0]['owner_user_id']) };
    },
  };
}
