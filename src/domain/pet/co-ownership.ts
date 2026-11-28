/**
 * Dominio de la co-propiedad (Feature 012, Bloque A, #22): funciones PURAS, sin reloj ni I/O (`now` entra por parámetro).
 * - Estados cerrados de `STATE-COOWN12-001` y su tabla de transiciones.
 * - Tope con pendientes incluidos (`REQ-OWN12-003`).
 * - Quórum sellado y revalidación de solicitudes críticas (`REQ-OWN12-004`, `INV-OWN12-001`): la solicitud sella `(action, target, pet_version, approver_set)`.
 * - Sucesión determinista del principal y plan de salida (`REQ-OWN12-006`, `INV-OWN12-003`, `INV-OWN12-007`): nunca se bloquea por la inacción de otro; nadie elimina a otro (`INV-OWN12-002`).
 * Los errores usan el `DomainError` de la 012 (catálogo 004..012, `src/generated/v38`).
 *
 * @implements REQ-OWN12-001, REQ-OWN12-003, REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-001, INV-OWN12-002, INV-OWN12-003, INV-OWN12-007, STATE-COOWN12-001, STATE-OWNREQ12-001, ERR-OWN12-CO-OWNER-LIMIT, ERR-OWN12-LAST-OWNER, ERR-OWN12-STALE, ERR-OWN12-APPROVAL-EXPIRED
 */

import { DomainError } from '../../generated/v38/index.ts';
import { MAX_CO_OWNERS_PER_PET } from '../platform/feature-012-limits.ts';

export const CO_OWNER_STATUSES = ['INVITED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'EXPIRED', 'LEFT', 'PROMOTED', 'ENDED'] as const;
export type CoOwnerStatus = (typeof CO_OWNER_STATUSES)[number];

export type CoOwnerEvent =
  | 'INVITE'
  | 'ACCEPT'
  | 'DECLINE'
  | 'CANCEL'
  | 'EXPIRE'
  | 'LEAVE'
  | 'ERASE_ACCOUNT'
  | 'PROMOTE'
  | 'CHANGE_PRINCIPAL_EXECUTED'
  | 'END_CO_OWNERSHIP'
  | 'ADD_CO_OWNER'
  | 'DEMOTE_PRINCIPAL';

/** Fila de co-propiedad que el dominio necesita (el puerto añade el resto de columnas). */
export interface CoOwnerRow {
  readonly id: string;
  readonly petId: string;
  readonly userId: string | null;
  readonly status: CoOwnerStatus;
  readonly invitedByUserId: string | null;
  readonly joinedAt: string | null;
}

const TRANSITIONS: Readonly<Record<string, CoOwnerStatus>> = {
  'null|INVITE': 'INVITED',
  'INVITED|ACCEPT': 'ACTIVE',
  'INVITED|DECLINE': 'DECLINED',
  'INVITED|CANCEL': 'CANCELLED',
  'INVITED|EXPIRE': 'EXPIRED',
  'ACTIVE|LEAVE': 'LEFT',
  'ACTIVE|ERASE_ACCOUNT': 'LEFT',
  'ACTIVE|PROMOTE': 'PROMOTED',
  'ACTIVE|CHANGE_PRINCIPAL_EXECUTED': 'PROMOTED',
  'ACTIVE|END_CO_OWNERSHIP': 'ENDED',
  'null|ADD_CO_OWNER': 'ACTIVE',
  'null|DEMOTE_PRINCIPAL': 'ACTIVE',
};

/** Estado siguiente de `STATE-COOWN12-001`, o `null` si la combinación (estado × evento) no existe (los terminales no aceptan nada). */
export function nextCoOwnerStatus(from: CoOwnerStatus | null, event: CoOwnerEvent): CoOwnerStatus | null {
  return TRANSITIONS[`${from}|${event}`] ?? null;
}

/** Una fila ocupa plaza si está `ACTIVE` o `INVITED` (las pendientes cuentan, REQ-OWN12-003). */
export const occupiesSlot = (row: Pick<CoOwnerRow, 'status'>): boolean => row.status === 'ACTIVE' || row.status === 'INVITED';

/** Rechaza con `ERR-OWN12-CO-OWNER-LIMIT` (409) si, con el principal, ya no cabe otra persona. */
export function assertRoomForCoOwner(rows: readonly CoOwnerRow[]): void {
  if (rows.filter(occupiesSlot).length >= MAX_CO_OWNERS_PER_PET - 1) throw new DomainError('ERR-OWN12-CO-OWNER-LIMIT');
}

export type OwnerRequestAction = 'DELETE_PET' | 'TRANSFER_PRINCIPAL' | 'CHANGE_PRINCIPAL' | 'INVITE_CO_OWNER' | 'CLAIM_CO_OWNERSHIP' | 'CHIP_DISPUTE';
export type OwnerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'UNDER_REVIEW' | 'RESOLVED';

export interface OwnerApproval {
  readonly u: string;
  readonly at: string;
}

/** Datos de una solicitud que el dominio evalúa; los sellados (`action`, `targetUserId`, `petVersion`, `approverSet`) son inmutables. */
export interface SealedOwnerRequest {
  readonly id: string;
  readonly action: OwnerRequestAction;
  readonly petId: string | null;
  readonly petVersion: number;
  readonly requesterUserId: string | null;
  readonly targetUserId: string | null;
  readonly approverSet: readonly string[];
  readonly approvals: readonly OwnerApproval[];
  readonly status: OwnerRequestStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** Principal vigente al crear la solicitud, si quien llama lo conoce; `ownership_version` ya lo cubre porque todo cambio de principal la sube. */
  readonly principalUserId?: string | null;
}

/** Estado vivo de la mascota bajo el bloqueo (leído dentro de la transacción). */
export interface OwnerRequestContext {
  readonly petVersion: number;
  readonly principalUserId: string;
  /** Principal más co-propietarios `ACTIVE` HOY. */
  readonly currentOwners: readonly string[];
  readonly coOwnerRows: readonly CoOwnerRow[];
}

export type OwnerRequestVote = { readonly type: 'APPROVE'; readonly userId: string } | { readonly type: 'REJECT'; readonly userId: string };

export interface OwnerRequestOutcome {
  readonly status: OwnerRequestStatus;
  readonly execute: boolean;
  readonly approvals: readonly OwnerApproval[];
  readonly rejectedBy?: string;
  readonly staleReason?: 'ERR-OWN12-STALE';
  readonly errorCode?: 'ERR-OWN12-CO-OWNER-LIMIT';
}

/** Aprobadores sellados: todos los propietarios distintos del solicitante, sin duplicados y en orden estable. */
export function sealApproverSet(requesterUserId: string, owners: readonly string[]): string[] {
  return [...new Set(owners.filter((owner) => owner !== requesterUserId))].sort();
}

/** Con un único propietario no hay aprobación: la acción se ejecuta directo (REQ-OWN12-004 (j)). */
export const requiresJointApproval = (ownerCount: number): boolean => ownerCount >= 2;

/** Conjunto vacío nunca se autoejecuta (REQ-OWN12-004 (d)): nace `EXPIRED`. */
export const initialRequestStatus = (approverSet: readonly string[]): 'PENDING' | 'EXPIRED' => (approverSet.length === 0 ? 'EXPIRED' : 'PENDING');

/** Solo un aprobador del conjunto sellado, nunca el solicitante, y solo mientras la solicitud sigue `PENDING`. */
export function canApprove(request: Pick<SealedOwnerRequest, 'approverSet' | 'status' | 'requesterUserId'>, userId: string): boolean {
  return request.status === 'PENDING' && userId !== request.requesterUserId && request.approverSet.includes(userId);
}

/** Expiración perezosa: `PENDING` con `expires_at <= now` se lee `EXPIRED` (vigencia `[created_at, expires_at)`, lock R-15). */
export function effectiveRequestStatus(request: Pick<SealedOwnerRequest, 'status' | 'expiresAt'>, now: string): OwnerRequestStatus {
  return request.status === 'PENDING' && now >= request.expiresAt ? 'EXPIRED' : request.status;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

/**
 * Revalida una solicitud `PENDING` contra el estado vivo (REQ-OWN12-004 (c)/(d)): si cambió la versión de la mascota, el principal o el conjunto de aprobadores, o el conjunto
 * queda vacío, pasa a `EXPIRED` con `ERR-OWN12-STALE` sin ejecutar nada (falla cerrada).
 */
export function revalidateOwnerRequest(request: SealedOwnerRequest, context: OwnerRequestContext, _now: string): { readonly status: OwnerRequestStatus; readonly execute: false; readonly staleReason?: 'ERR-OWN12-STALE' } {
  const requester = request.requesterUserId;
  const currentApprovers = requester === null ? [...context.currentOwners] : sealApproverSet(requester, context.currentOwners);
  const stale =
    request.approverSet.length === 0 ||
    context.petVersion !== request.petVersion ||
    (request.principalUserId != null && request.principalUserId !== context.principalUserId) ||
    !sameSet(request.approverSet, currentApprovers);
  return stale ? { status: 'EXPIRED', execute: false, staleReason: 'ERR-OWN12-STALE' } : { status: 'PENDING', execute: false };
}

/**
 * Evalúa un voto sobre una solicitud bajo el bloqueo de la mascota. Orden: no propietario (404 uniforme) → el solicitante no vota (403) → solicitud ya decidida (`ERR-OWN12-STALE`) →
 * frontera de vigencia (`ERR-OWN12-APPROVAL-EXPIRED`) → revalidación (`EXPIRED`/`STALE`) → voto. No modifica la solicitud recibida.
 */
export function evaluateOwnerRequest(request: SealedOwnerRequest, vote: OwnerRequestVote, context: OwnerRequestContext, now: string): OwnerRequestOutcome {
  if (!context.currentOwners.includes(vote.userId)) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  if (vote.userId === request.requesterUserId) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'requestId');
  if (request.status !== 'PENDING') throw new DomainError('ERR-OWN12-STALE');
  if (now >= request.expiresAt) throw new DomainError('ERR-OWN12-APPROVAL-EXPIRED');
  const revalidated = revalidateOwnerRequest(request, context, now);
  if (revalidated.status === 'EXPIRED') return { status: 'EXPIRED', execute: false, approvals: request.approvals, staleReason: 'ERR-OWN12-STALE' };
  if (!request.approverSet.includes(vote.userId)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'requestId');
  if (vote.type === 'REJECT') return { status: 'REJECTED', execute: false, approvals: request.approvals, rejectedBy: vote.userId };
  const approvals = request.approvals.some((approval) => approval.u === vote.userId) ? [...request.approvals] : [...request.approvals, { u: vote.userId, at: now }];
  const everyone = request.approverSet.every((approver) => approvals.some((approval) => approval.u === approver));
  if (!everyone) return { status: 'PENDING', execute: false, approvals };
  if ((request.action === 'INVITE_CO_OWNER' || request.action === 'CLAIM_CO_OWNERSHIP') && context.coOwnerRows.filter(occupiesSlot).length >= MAX_CO_OWNERS_PER_PET - 1) {
    return { status: 'REJECTED', execute: false, approvals, errorCode: 'ERR-OWN12-CO-OWNER-LIMIT' };
  }
  return { status: 'APPROVED', execute: true, approvals };
}

export interface SuccessorChoice {
  readonly successorUserId: string;
  readonly successorRowId: string;
  readonly kind: 'AUTO' | 'DESIGNATED';
  readonly audit: 'PRINCIPAL_AUTO_PROMOTED' | 'PRINCIPAL_SUCCESSOR_DESIGNATED';
}

/**
 * Sucesión híbrida (REQ-OWN12-006, N2-R3): una designación válida (co-propietario `ACTIVE` de ESA mascota distinto de quien sale) prevalece; si no, hereda el `ACTIVE` de menor
 * `joined_at` (empate: `user_id` ascendente). La supresión de cuenta no admite designación. Una fila `ACTIVE` sin `user_id` (cuenta suprimida) nunca sucede. `null` = no hay sucesor.
 */
export function chooseSuccessor(input: { readonly leavingUserId: string; readonly coOwners: readonly CoOwnerRow[]; readonly designatedUserId?: string | null; readonly accountDeletion?: boolean }): SuccessorChoice | null {
  const candidates = input.coOwners.filter((row) => row.status === 'ACTIVE' && row.userId !== null && row.userId !== input.leavingUserId);
  if (input.accountDeletion !== true && input.designatedUserId != null) {
    const designated = candidates.find((row) => row.userId === input.designatedUserId);
    if (designated !== undefined) return { successorUserId: designated.userId!, successorRowId: designated.id, kind: 'DESIGNATED', audit: 'PRINCIPAL_SUCCESSOR_DESIGNATED' };
  }
  const ordered = [...candidates].sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') || a.userId!.localeCompare(b.userId!));
  const first = ordered[0];
  return first === undefined ? null : { successorUserId: first.userId!, successorRowId: first.id, kind: 'AUTO', audit: 'PRINCIPAL_AUTO_PROMOTED' };
}

export type LeavePlan =
  | { readonly outcome: 'PRINCIPAL_SUCCEEDED'; readonly resultingPrincipalUserId: string; readonly successorRowId: string; readonly kind: 'AUTO' | 'DESIGNATED'; readonly audit: SuccessorChoice['audit']; readonly ownershipVersionIncrement: 1; readonly cancelInvitedRowIds: readonly string[] }
  | { readonly outcome: 'CO_OWNER_LEFT'; readonly leavingRowId: string; readonly resultingPrincipalUserId: string; readonly ownershipVersionIncrement: 1; readonly cancelInvitedRowIds: readonly string[] }
  | { readonly outcome: 'PET_DELETED'; readonly cancelInvitedRowIds: readonly string[] };

/**
 * Plan de salida (`LEAVE` o supresión de cuenta) sin aprobación (INV-OWN12-003, INV-OWN12-007): el principal con un co-propietario `ACTIVE` cede el principal; sin él es el último dueño
 * (`ERR-OWN12-LAST-OWNER`, o `PET_DELETED` en la supresión de cuenta, REQ-PET-004); un co-propietario `ACTIVE` simplemente sale (`LEFT`). Quien no es propietario recibe el 404 uniforme.
 * Una designación de quien no es principal o enviada por una supresión de cuenta se descarta sin error ni efecto.
 */
export function planLeave(input: { readonly petId: string; readonly principalUserId: string; readonly leavingUserId: string; readonly coOwners: readonly CoOwnerRow[]; readonly designatedUserId?: string | null; readonly accountDeletion?: boolean }): LeavePlan {
  const invitedBy = (userId: string): string[] => input.coOwners.filter((row) => row.status === 'INVITED' && row.invitedByUserId === userId).map((row) => row.id);
  if (input.leavingUserId === input.principalUserId) {
    const successor = chooseSuccessor({ leavingUserId: input.leavingUserId, coOwners: input.coOwners, designatedUserId: input.designatedUserId ?? null, accountDeletion: input.accountDeletion === true });
    if (successor !== null) {
      return { outcome: 'PRINCIPAL_SUCCEEDED', resultingPrincipalUserId: successor.successorUserId, successorRowId: successor.successorRowId, kind: successor.kind, audit: successor.audit, ownershipVersionIncrement: 1, cancelInvitedRowIds: invitedBy(input.leavingUserId) };
    }
    if (input.accountDeletion === true) return { outcome: 'PET_DELETED', cancelInvitedRowIds: input.coOwners.filter((row) => row.status === 'INVITED').map((row) => row.id) };
    throw new DomainError('ERR-OWN12-LAST-OWNER');
  }
  const own = input.coOwners.find((row) => row.status === 'ACTIVE' && row.userId === input.leavingUserId);
  if (own === undefined) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  return { outcome: 'CO_OWNER_LEFT', leavingRowId: own.id, resultingPrincipalUserId: input.principalUserId, ownershipVersionIncrement: 1, cancelInvitedRowIds: invitedBy(input.leavingUserId) };
}
