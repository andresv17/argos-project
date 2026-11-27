/**
 * Casos de uso de co-propiedad (Feature 012, Bloque A, #22): invitar (respuesta uniforme y límite por intento), aceptar, rechazar, cancelar, salir con sucesión, ver la propiedad y reconocer el aviso.
 * Todas las transiciones de propiedad (aceptar, salir, ejecutar) toman el bloqueo por mascota DESPUÉS de autorizar y revalidan dentro de la transacción (REQ-OWN12-011): una escritura condicional que
 * afecta 0 filas se reevalúa UNA vez; la segunda es `ERR-OWN12-RETRYABLE` sin escritura parcial ni bucle.
 *
 * @implements REQ-OWN12-001, REQ-OWN12-002, REQ-OWN12-003, REQ-OWN12-005, REQ-OWN12-006, REQ-OWN12-007, REQ-OWN12-011, INV-OWN12-002, INV-OWN12-003, INV-OWN12-004, INV-OWN12-005, INV-OWN12-007, SC-012-001..011, SC-012-071, SC-012-075, SC-012-094
 */

import { DomainError } from '../../generated/v38/index.ts';
import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { validateInviteCoOwnerRequest, validateLeavePetRequest, type InviteCoOwnerAccepted, type InviteCoOwnerRequest, type LeavePetRequest, type LeavePetResult, type OwnershipState, type PetCoOwner } from '../../generated/v38/index.ts';
import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { assertRoomForCoOwner, planLeave, requiresJointApproval, sealApproverSet, type LeavePlan } from '../../domain/pet/co-ownership.ts';
import { CO_OWNER_INVITES_PER_USER_PER_DAY, CO_OWNER_INVITE_TTL_DAYS, DAY_MS, OWNER_APPROVAL_TTL_DAYS } from '../../domain/platform/feature-012-limits.ts';
import type { PetCoOwnerRecord } from '../ports/co-ownership.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { recordAssignmentRemoved } from './audit-support.ts';
import {
  effectiveCoOwnerStatus,
  assertPetNotFrozen,
  liveSlots,
  materializeExpiredInvitations,
  materializeExpiredRequests,
  mootAbsenceDisputesOnLeave,
  openAbsenceDisputes,
  ownersOf,
  recordOwnershipAudit,
  requireOwner,
  retryable,
  revokeLinksOfNonOwners,
  settledRequest,
  withEffectiveStatus,
} from './co-ownership-support.ts';
import { assertMatchesSchema, type ApplicationDeps } from './use-case-support.ts';

const notFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
const RATE_WINDOW_MS = DAY_MS;

/** Normaliza el `username` digitado (NFC, recortado, minúsculas): `Bob` y `bob` dan la misma respuesta (H-11). */
const normalizeUsername = (value: unknown): unknown => (typeof value === 'string' ? value.normalize('NFC').trim().toLowerCase() : value);

/** Retira las asignaciones a hogares hechas por quien sale y cancela sus solicitudes `PENDING` y sus invitaciones emitidas (REQ-OWN12-006 (f), REQ-OWN12-007, INV-OWN12-005). */
async function withdrawDepartingOwner(deps: ApplicationDeps, repositories: RepositorySet, petId: string, leavingUserId: string, now: string): Promise<void> {
  for (const assignment of (await repositories.assignments.listByPet(petId)).filter((a) => a.assignedByUserId === leavingUserId)) {
    await deps.sceneHooks?.onPetUnassigned(repositories, { petId, householdId: assignment.householdId, now });
    await repositories.assignments.remove(petId, assignment.householdId);
    await recordAssignmentRemoved(deps, repositories, leavingUserId, assignment);
  }
  for (const request of await materializeExpiredRequests(repositories, await repositories.ownerRequests.listByPet(petId), now)) {
    if (request.status === 'PENDING' && request.requesterUserId === leavingUserId) {
      if (await repositories.ownerRequests.update(settledRequest(request, { status: 'CANCELLED', decidedAt: now }), 'PENDING')) {
        await recordOwnershipAudit(deps, repositories, leavingUserId, 'OWNER_REQUEST_CANCELLED', petId, null, null);
      }
    }
  }
}

/** Aviso de promoción y vista de una fila (sin `username` ajeno antes de ser propietario). */
async function usernamesOf(repositories: RepositorySet, userIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  return new Map((await repositories.users.listByIds(ids)).map((u) => [u.id, u.username]));
}

/** @implements REQ-OWN12-002, REQ-OWN12-003, REQ-OWN12-004, INV-OWN12-004, SC-012-001, SC-012-004, SC-012-075 */
export class InviteCoOwnerUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `202` uniforme: el mismo cuerpo exista o no el `username`; solo cambia el estado interno. Todo intento cuenta ANTES de resolver el `username` (H-02). */
  async execute(actorUserId: string, petId: string, input: unknown): Promise<InviteCoOwnerAccepted> {
    const normalized = typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>), username: normalizeUsername((input as Record<string, unknown>)['username']) } : input;
    const { username } = assertMatchesSchema<InviteCoOwnerRequest>('InviteCoOwnerRequest', validateInviteCoOwnerRequest, normalized);
    const { deps } = this;
    // Transacción 1 (confirma aunque el intento falle después): autorización y contador por intento. Rechazado con 429 no registra nada (la ventana no se prolonga).
    await deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const now = deps.clock.nowIsoTimestamp();
      // El contador de la 012 comparte ámbito `INVITE` con las invitaciones de hogar hasta que una migración (Nivel 2) añada el ámbito propio; se evalúa con SUS cifras (5 por día).
      const used = await repositories.rateLimits.countSince('INVITE', actorUserId, addMillis(now, -RATE_WINDOW_MS));
      if (used >= CO_OWNER_INVITES_PER_USER_PER_DAY) throw new DomainErrorRoot('ERR-RATE-LIMITED');
      await deps.rateLimiter.record(repositories, 'INVITE', actorUserId, now);
    });
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const state = await repositories.pets.findOwnershipForUpdate(petId);
      if (state === null) throw notFound();
      const now = deps.clock.nowIsoTimestamp();
      const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
      if (!ownersOf(state.ownerUserId, rows).includes(actorUserId)) throw notFound();
      await assertPetNotFrozen(repositories, petId, now);
      const target = await repositories.users.findByUsername(username);
      const eligible = target !== null && (target.accountStatus ?? 'ACTIVE') === 'ACTIVE'; // PENDING_APPROVAL y cuentas no activas no son elegibles (misma respuesta)
      if (target !== null && (isPrincipalOfPet(target.id, state) || rows.some((row) => row.userId === target.id && (row.status === 'ACTIVE' || row.status === 'INVITED')))) throw new DomainError('ERR-OWN12-ALREADY-OWNER');
      assertRoomForCoOwner(rows);
      const owners = ownersOf(state.ownerUserId, rows);
      if (requiresJointApproval(owners.length)) {
        // Con más de un propietario ACTIVE, invitar es una acción crítica: solicitud sellada (con el username digitado) para que los demás decidan informados.
        const requests = await materializeExpiredRequests(repositories, await repositories.ownerRequests.listByPet(petId), now);
        if (requests.some((r) => r.status === 'PENDING' && r.action === 'INVITE_CO_OWNER')) throw new DomainError('ERR-OWN12-APPROVAL-PENDING');
        const request = {
          id: deps.ids.nextId(),
          action: 'INVITE_CO_OWNER' as const,
          petId,
          petVersion: state.ownershipVersion,
          requesterUserId: actorUserId,
          requesterPseudonym: null,
          targetUserId: eligible ? target!.id : null,
          targetUsernameSealed: username,
          targetResponse: null,
          triggerRequestIds: null,
          status: 'PENDING' as const,
          approverSet: sealApproverSet(actorUserId, owners),
          approvals: [],
          rejectedBy: null,
          rejectedByPseudonym: null,
          message: null,
          createdAt: now,
          expiresAt: addMillis(now, OWNER_APPROVAL_TTL_DAYS * DAY_MS),
          decidedAt: null,
          staleReason: null,
          disputeReason: null,
          chipLast4: null,
          chipHmac: null,
          frozenUntil: null,
          freezeExtendedAt: null,
          slaDueAt: null,
          escalatedAt: null,
          resolvedAt: null,
          resolution: null,
          mootReason: null,
          resolvedByUserId: null,
          secondApproverUserId: null,
          executesAfter: null,
          version: 1,
        };
        await repositories.ownerRequests.insert(request);
        await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_CREATED', petId, null, { action: request.action, status: request.status });
        return { status: 'RECEIVED' } as const;
      }
      if (eligible) {
        const row: PetCoOwnerRecord = {
          id: deps.ids.nextId(),
          petId,
          userId: target!.id,
          userPseudonym: null,
          status: 'INVITED',
          invitedByUserId: actorUserId,
          invitedAt: now,
          expiresAt: addMillis(now, CO_OWNER_INVITE_TTL_DAYS * DAY_MS),
          joinedAt: null,
          leftAt: null,
          promotionKind: null,
          promotionNoticeAckAt: null,
          version: 1,
        };
        await repositories.coOwners.insert(row);
        await recordOwnershipAudit(deps, repositories, actorUserId, 'CO_OWNER_INVITED', petId, null, { status: 'INVITED' });
      }
      return { status: 'RECEIVED' } as const;
    });
  }
}

/** Fila de co-propiedad que el destinatario puede resolver (404 uniforme si es ajena, vencida o inexistente). */
async function ownInvitation(repositories: RepositorySet, userId: string, coOwnerId: string, now: string): Promise<PetCoOwnerRecord> {
  const row = await repositories.coOwners.findById(coOwnerId);
  if (row === null || row.userId !== userId) throw notFound();
  if (effectiveCoOwnerStatus(row, now) === 'EXPIRED') throw notFound();
  return row;
}

function coOwnerView(row: PetCoOwnerRecord, usernames: ReadonlyMap<string, string>, now: string): PetCoOwner {
  return {
    id: row.id,
    petId: row.petId,
    userId: row.userId ?? '',
    username: usernames.get(row.userId ?? '') ?? '',
    status: effectiveCoOwnerStatus(row, now),
    invitedByUsername: row.invitedByUserId === null ? null : (usernames.get(row.invitedByUserId) ?? null),
    invitedAt: row.invitedAt,
    expiresAt: row.expiresAt,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    promotionKind: row.promotionKind,
  };
}

/** @implements REQ-OWN12-002, REQ-OWN12-003, REQ-OWN12-011, SC-012-001, SC-012-004 */
export class AcceptCoOwnerInvitationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, coOwnerId: string): Promise<PetCoOwner> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const first = await ownInvitation(repositories, actorUserId, coOwnerId, now);
      const state = await repositories.pets.findOwnershipForUpdate(first.petId);
      if (state === null) throw notFound();
      const row = await ownInvitation(repositories, actorUserId, coOwnerId, now);
      if (row.status !== 'INVITED') throw notFound();
      const rows = withEffectiveStatus(await repositories.coOwners.listByPet(row.petId), now);
      // Una invitación INVITED ya ocupa su plaza: aceptar no puede superar el tope (revalidado bajo el bloqueo, EDGE-012-035).
      if (liveSlots(rows) > 2) throw new DomainError('ERR-OWN12-CO-OWNER-LIMIT');
      for (let attempt = 0; ; attempt += 1) {
        const current = attempt === 0 ? state : await repositories.pets.findOwnershipForUpdate(row.petId);
        if (current === null) throw notFound();
        if ((await repositories.pets.bumpOwnershipVersion(row.petId, current.ownershipVersion)) === 1) break;
        if (attempt === 1) throw retryable();
      }
      if (!(await repositories.coOwners.transition(row.id, 'INVITED', { status: 'ACTIVE', joinedAt: now }))) throw new DomainError('ERR-OWN12-STALE');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'CO_OWNER_ACCEPTED', row.petId, { status: 'INVITED' }, { status: 'ACTIVE' });
      const usernames = await usernamesOf(repositories, [actorUserId, row.invitedByUserId]);
      return coOwnerView({ ...row, status: 'ACTIVE', joinedAt: now, version: row.version + 1 }, usernames, now);
    });
  }
}

/** @implements REQ-OWN12-002, SC-012-001 */
export class DeclineCoOwnerInvitationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, coOwnerId: string): Promise<204> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const row = await ownInvitation(repositories, actorUserId, coOwnerId, now);
      if (row.status === 'DECLINED') return 204 as const; // idempotente sobre el estado final propio (H-06)
      if (!(await repositories.coOwners.transition(row.id, 'INVITED', { status: 'DECLINED', leftAt: now }))) throw new DomainError('ERR-OWN12-STALE');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'CO_OWNER_DECLINED', row.petId, { status: 'INVITED' }, { status: 'DECLINED' });
      return 204 as const;
    });
  }
}

/** @implements REQ-OWN12-002, INV-OWN12-002 (solo cancela filas INVITED: no existe ruta que cambie una fila ACTIVE ajena) */
export class CancelCoOwnerInvitationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, coOwnerId: string): Promise<204> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const { rows } = await requireOwner(repositories, actorUserId, petId);
      const row = rows.find((r) => r.id === coOwnerId);
      if (row === undefined) throw notFound(); // par {petId}/{coOwnerId} cruzado o inexistente: 404 uniforme
      const now = deps.clock.nowIsoTimestamp();
      if (row.status === 'CANCELLED') return 204 as const;
      if (effectiveCoOwnerStatus(row, now) !== 'INVITED' || !(await repositories.coOwners.transition(row.id, 'INVITED', { status: 'CANCELLED', leftAt: now }))) throw new DomainError('ERR-OWN12-STALE');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'CO_OWNER_CANCELLED', petId, { status: 'INVITED' }, { status: 'CANCELLED' });
      return 204 as const;
    });
  }
}

/** Invitaciones vigentes del usuario: solo el nombre de la mascota y el `username` de quien invitó (nada clínico antes de aceptar). @implements REQ-OWN12-002, INV-OWN12-004 */
export class ListMyCoOwnerInvitationsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string): Promise<Array<{ coOwnerId: string; petName: string; invitedByUsername: string; expiresAt: string }>> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const live = (await repositories.coOwners.listByUser(actorUserId)).filter((row) => effectiveCoOwnerStatus(row, now) === 'INVITED');
      const usernames = await usernamesOf(repositories, live.map((row) => row.invitedByUserId));
      const items: Array<{ coOwnerId: string; petName: string; invitedByUsername: string; expiresAt: string }> = [];
      for (const row of live) {
        const pet = await repositories.pets.findById(row.petId);
        if (pet === null || row.invitedByUserId === null) continue;
        items.push({ coOwnerId: row.id, petName: pet.name, invitedByUsername: usernames.get(row.invitedByUserId) ?? '', expiresAt: row.expiresAt });
      }
      return items;
    });
  }
}

/** Resultado de ejecutar un plan de salida (también lo usa la supresión de cuenta). */
export interface AppliedLeave {
  readonly plan: LeavePlan;
  readonly resultingPrincipalUserId: string | null;
}

/**
 * Aplica `planLeave` bajo el bloqueo por mascota (REQ-OWN12-011): revalida, escribe con `UPDATE … WHERE` condicional y, si afecta 0 filas, reevalúa UNA vez; la segunda es `ERR-OWN12-RETRYABLE`.
 * No elimina la mascota (`PET_DELETED` lo resuelve quien llama: supresión de cuenta, REQ-PET-004). La usan `LEAVE` y `eraseAccountInTransaction`.
 * @implements REQ-OWN12-006, REQ-OWN12-011, INV-OWN12-003, INV-OWN12-007, SC-012-071, SC-012-072, SC-012-094
 */
export async function applyLeave(
  deps: ApplicationDeps,
  repositories: RepositorySet,
  input: { readonly petId: string; readonly leavingUserId: string; readonly designatedUserId?: string | null; readonly accountDeletion?: boolean },
): Promise<AppliedLeave> {
  const { petId, leavingUserId } = input;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await repositories.pets.findOwnershipForUpdate(petId);
    if (state === null) throw notFound();
    const now = deps.clock.nowIsoTimestamp();
    const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
    const plan = planLeave({ petId, principalUserId: state.ownerUserId, leavingUserId, coOwners: rows, designatedUserId: input.designatedUserId ?? null, accountDeletion: input.accountDeletion === true });
    if (plan.outcome === 'PET_DELETED') return { plan, resultingPrincipalUserId: null };
    if (plan.outcome === 'PRINCIPAL_SUCCEEDED') {
      // 006 (REQ-ESC6-024/025): ANTES de mutar, la escena retira las imágenes cuyas fuentes incluyan al principal que sale.
      await deps.sceneHooks?.onPetOwnershipTransferred(repositories, { petId, previousOwnerUserId: state.ownerUserId, newOwnerUserId: plan.resultingPrincipalUserId, now });
      if ((await repositories.pets.compareAndSetOwner(petId, state.ownerUserId, state.ownershipVersion, plan.resultingPrincipalUserId)) !== 1) continue;
      if (!(await repositories.coOwners.transition(plan.successorRowId, 'ACTIVE', { status: 'PROMOTED', leftAt: now, promotionKind: plan.kind }))) throw retryable();
      await recordOwnershipAudit(deps, repositories, leavingUserId, plan.audit, petId, { principal: 'LEAVING' }, { principal: 'SUCCESSOR', kind: plan.kind });
    } else {
      if ((await repositories.pets.bumpOwnershipVersion(petId, state.ownershipVersion)) !== 1) continue;
      if (!(await repositories.coOwners.transition(plan.leavingRowId, 'ACTIVE', { status: 'LEFT', leftAt: now }))) throw retryable();
      await recordOwnershipAudit(deps, repositories, leavingUserId, 'CO_OWNER_LEFT', petId, { status: 'ACTIVE' }, { status: 'LEFT' });
    }
    for (const rowId of plan.cancelInvitedRowIds) await repositories.coOwners.transition(rowId, 'INVITED', { status: 'CANCELLED', leftAt: now });
    await withdrawDepartingOwner(deps, repositories, petId, leavingUserId, now);
    await mootAbsenceDisputesOnLeave(deps, repositories, petId, leavingUserId, now);
    await revokeLinksOfNonOwners(deps, repositories, petId, leavingUserId, now);
    return { plan, resultingPrincipalUserId: plan.resultingPrincipalUserId };
  }
  throw retryable();
}

/** @implements REQ-OWN12-006, REQ-OWN12-011, INV-OWN12-003, INV-OWN12-007, SC-012-008, SC-012-009, SC-012-071, SC-012-094 */
export class LeavePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<LeavePetResult> {
    const { successorUserId } = assertMatchesSchema<LeavePetRequest>('LeavePetRequest', validateLeavePetRequest, input);
    return this.deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId); // autorización antes del bloqueo (H-03)
      const applied = await applyLeave(this.deps, repositories, { petId, leavingUserId: actorUserId, designatedUserId: successorUserId ?? null });
      const principalUserId = applied.resultingPrincipalUserId;
      if (principalUserId === null) throw notFound();
      const usernames = await usernamesOf(repositories, [principalUserId]);
      return { petId, principal: { userId: principalUserId, username: usernames.get(principalUserId) ?? '' } };
    });
  }
}

/** @implements REQ-OWN12-001, REQ-OWN12-005, REQ-OWN12-006, INV-OWN12-004, SC-012-002, SC-012-071 */
export class GetPetOwnershipUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string): Promise<OwnershipState> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const state = await repositories.pets.findOwnership(petId);
      if (state === null) throw notFound();
      const now = deps.clock.nowIsoTimestamp();
      const rows = withEffectiveStatus(await repositories.coOwners.listByPet(petId), now);
      const live = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'INVITED');
      const expired = rows.filter((r) => r.status === 'EXPIRED');
      const shown = [...live, ...expired].slice(0, 2);
      const usernames = await usernamesOf(repositories, [state.ownerUserId, ...shown.map((r) => r.userId), ...shown.map((r) => r.invitedByUserId)]);
      const pending = rows.some((r) => r.userId === actorUserId && r.status === 'PROMOTED' && r.promotionNoticeAckAt === null);
      // Aviso derivado de la disputa por ausencia: sin identidad del solicitante ni evidencia (Neo-K); solo el `target` puede responder y una sola vez.
      const disputes = (await openAbsenceDisputes(repositories, petId)).filter((d) => d.frozenUntil !== null);
      const mine = disputes.find((d) => d.targetUserId === actorUserId);
      const absenceNotice = { open: disputes.length > 0, respondable: mine !== undefined && mine.targetResponse === null, frozenUntil: (mine ?? disputes[0])?.frozenUntil ?? null };
      return {
        petId,
        ownershipVersion: state.ownershipVersion,
        principal: { userId: state.ownerUserId, username: usernames.get(state.ownerUserId) ?? '' },
        coOwners: shown.map((row) => coOwnerView(row, usernames, now)) as OwnershipState['coOwners'],
        promotionNotice: { pending },
        absenceNotice: absenceNotice,
      };
    });
  }
}

/** Reconoce el aviso derivado «Ahora eres propietario principal» (`promotion_notice_ack_at`); idempotente. @implements REQ-OWN12-006 */
export class AckPromotionNoticeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string): Promise<204> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const rows = (await repositories.coOwners.listByPet(petId)).filter((r) => r.userId === actorUserId && r.status === 'PROMOTED');
      if (rows.length === 0) throw notFound();
      for (const row of rows) if (row.promotionNoticeAckAt === null) await repositories.coOwners.acknowledgePromotion(row.id, deps.clock.nowIsoTimestamp());
      return 204 as const;
    });
  }
}
