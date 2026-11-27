/**
 * Mapeo común (SQLite y PostgreSQL) de `pet_co_owners` y `owner_requests` entre filas SQL (snake_case, JSON como TEXT) y los registros camelCase de los puertos
 * (`co-ownership.port.ts`). Función pura sin I/O. Los JSON (`approver_set`, `approvals`, `trigger_request_ids`) se validan al leer: dato corrupto = `ERR-INTERNAL-UNEXPECTED` controlado.
 *
 * @implements INV-ARCH-004, REQ-OWN12-001, REQ-OWN12-004, ERR-INTERNAL-UNEXPECTED
 */

import { DomainError } from '../../generated/index.ts';
import type { OwnerRequestRecord, PetCoOwnerRecord } from '../../application/ports/co-ownership.port.ts';

export type SqlRow = Record<string, unknown>;

export const CO_OWNER_COLUMNS = 'id, pet_id, user_id, user_pseudonym, status, invited_by_user_id, invited_at, expires_at, joined_at, left_at, promotion_kind, promotion_notice_ack_at, version';
export const OWNER_REQUEST_COLUMNS =
  'id, action, pet_id, pet_version, requester_user_id, requester_pseudonym, target_user_id, target_username_sealed, target_response, trigger_request_ids, status, approver_set, approvals, rejected_by, rejected_by_pseudonym, message, created_at, expires_at, decided_at, stale_reason, dispute_reason, chip_last4, chip_hmac, frozen_until, freeze_extended_at, sla_due_at, escalated_at, resolved_at, resolution, moot_reason, resolved_by_user_id, second_approver_user_id, executes_after, version';

const corrupt = (table: string, key: string): DomainError => new DomainError('ERR-INTERNAL-UNEXPECTED', `Dato corrupto en ${table} (${key}); la transacción se descarta.`);
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function parseJson(table: string, key: string, raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw corrupt(table, key);
  }
}

export function toCoOwnerRecord(row: SqlRow): PetCoOwnerRecord {
  return {
    id: String(row['id']),
    petId: String(row['pet_id']),
    userId: str(row['user_id']),
    userPseudonym: str(row['user_pseudonym']),
    status: row['status'] as PetCoOwnerRecord['status'],
    invitedByUserId: str(row['invited_by_user_id']),
    invitedAt: String(row['invited_at']),
    expiresAt: String(row['expires_at']),
    joinedAt: str(row['joined_at']),
    leftAt: str(row['left_at']),
    promotionKind: str(row['promotion_kind']) as PetCoOwnerRecord['promotionKind'],
    promotionNoticeAckAt: str(row['promotion_notice_ack_at']),
    version: Number(row['version']),
  };
}

export const coOwnerParams = (r: PetCoOwnerRecord): unknown[] => [r.id, r.petId, r.userId, r.userPseudonym, r.status, r.invitedByUserId, r.invitedAt, r.expiresAt, r.joinedAt, r.leftAt, r.promotionKind, r.promotionNoticeAckAt, r.version];

export function toOwnerRequestRecord(row: SqlRow): OwnerRequestRecord {
  const id = String(row['id']);
  const approverSet = parseJson('owner_requests', id, row['approver_set']);
  const approvals = parseJson('owner_requests', id, row['approvals']);
  const triggers = row['trigger_request_ids'] === null || row['trigger_request_ids'] === undefined ? null : parseJson('owner_requests', id, row['trigger_request_ids']);
  const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((x) => typeof x === 'string');
  const isApprovals = (value: unknown): value is Array<{ u: string; at: string }> => Array.isArray(value) && value.every((x) => typeof x === 'object' && x !== null && typeof (x as { u?: unknown }).u === 'string' && typeof (x as { at?: unknown }).at === 'string');
  if (!isStrings(approverSet) || !isApprovals(approvals) || (triggers !== null && !isStrings(triggers))) throw corrupt('owner_requests', id);
  return {
    id,
    action: row['action'] as OwnerRequestRecord['action'],
    petId: str(row['pet_id']),
    petVersion: Number(row['pet_version']),
    requesterUserId: str(row['requester_user_id']),
    requesterPseudonym: str(row['requester_pseudonym']),
    targetUserId: str(row['target_user_id']),
    targetUsernameSealed: str(row['target_username_sealed']),
    targetResponse: str(row['target_response']),
    triggerRequestIds: triggers,
    status: row['status'] as OwnerRequestRecord['status'],
    approverSet,
    approvals,
    rejectedBy: str(row['rejected_by']),
    rejectedByPseudonym: str(row['rejected_by_pseudonym']),
    message: str(row['message']),
    createdAt: String(row['created_at']),
    expiresAt: String(row['expires_at']),
    decidedAt: str(row['decided_at']),
    staleReason: str(row['stale_reason']),
    disputeReason: str(row['dispute_reason']) as OwnerRequestRecord['disputeReason'],
    chipLast4: str(row['chip_last4']),
    chipHmac: str(row['chip_hmac']),
    frozenUntil: str(row['frozen_until']),
    freezeExtendedAt: str(row['freeze_extended_at']),
    slaDueAt: str(row['sla_due_at']),
    escalatedAt: str(row['escalated_at']),
    resolvedAt: str(row['resolved_at']),
    resolution: str(row['resolution']) as OwnerRequestRecord['resolution'],
    mootReason: str(row['moot_reason']) as OwnerRequestRecord['mootReason'],
    resolvedByUserId: str(row['resolved_by_user_id']),
    secondApproverUserId: str(row['second_approver_user_id']),
    executesAfter: str(row['executes_after']),
    version: Number(row['version']),
  };
}

export const ownerRequestParams = (r: OwnerRequestRecord): unknown[] => [
  r.id, r.action, r.petId, r.petVersion, r.requesterUserId, r.requesterPseudonym, r.targetUserId, r.targetUsernameSealed, r.targetResponse,
  r.triggerRequestIds === null ? null : JSON.stringify(r.triggerRequestIds), r.status, JSON.stringify(r.approverSet), JSON.stringify(r.approvals),
  r.rejectedBy, r.rejectedByPseudonym, r.message, r.createdAt, r.expiresAt, r.decidedAt, r.staleReason, r.disputeReason, r.chipLast4, r.chipHmac,
  r.frozenUntil, r.freezeExtendedAt, r.slaDueAt, r.escalatedAt, r.resolvedAt, r.resolution, r.mootReason, r.resolvedByUserId, r.secondApproverUserId, r.executesAfter, r.version,
];

/** Terminales de `pet_co_owners` (sin `INVITED`/`ACTIVE`). */
export const TERMINAL_CO_OWNER_STATUSES = ['DECLINED', 'CANCELLED', 'EXPIRED', 'LEFT', 'PROMOTED', 'ENDED'] as const;

/** Reemplaza `userId` por `pseudonym` en un JSON de IDs/aprobaciones (supresión de cuenta, SC-012-076/108). */
export function scrubUserFromRequest(row: OwnerRequestRecord, userId: string, pseudonym: string): OwnerRequestRecord {
  const swap = (value: string | null): string | null => (value === userId ? null : value);
  return {
    ...row,
    requesterUserId: swap(row.requesterUserId),
    requesterPseudonym: row.requesterUserId === userId ? pseudonym : row.requesterPseudonym,
    targetUserId: swap(row.targetUserId),
    rejectedBy: swap(row.rejectedBy),
    rejectedByPseudonym: row.rejectedBy === userId ? pseudonym : row.rejectedByPseudonym,
    resolvedByUserId: swap(row.resolvedByUserId),
    secondApproverUserId: swap(row.secondApproverUserId),
    approverSet: row.approverSet.map((id) => (id === userId ? pseudonym : id)),
    approvals: row.approvals.map((approval) => (approval.u === userId ? { ...approval, u: pseudonym } : approval)),
    triggerRequestIds: row.triggerRequestIds,
  };
}

/** ¿La fila menciona al usuario en alguna columna de usuario o JSON? */
export const mentionsUser = (row: OwnerRequestRecord, userId: string): boolean =>
  [row.requesterUserId, row.targetUserId, row.rejectedBy, row.resolvedByUserId, row.secondApproverUserId].includes(userId) || row.approverSet.includes(userId) || row.approvals.some((a) => a.u === userId);
