/**
 * Solicitudes de acciones críticas con quórum sellado (Feature 012, Bloque A, #22; REQ-OWN12-004, INV-OWN12-001): crear, listar «mis solicitudes», aprobar, rechazar y cancelar.
 * Una sola tabla `owner_requests` y una sola máquina `STATE-OWNREQ12-001`. Todo voto toma el bloqueo por mascota DESPUÉS de autorizar, revalida (versión por mascota, principal, aprobadores) y
 * ejecuta en la MISMA transacción que el último voto. Una solicitud vencida, rechazada u obsoleta no ejecuta nada (falla cerrada); el estado terminal se CONFIRMA y el error se lanza DESPUÉS del
 * commit, para que `EXPIRED`/`REJECTED` no se pierdan con el rollback.
 *
 * @implements REQ-OWN12-004, REQ-OWN12-011, INV-OWN12-001, INV-OWN12-002, INV-OWN12-004, INV-OWN12-005, STATE-OWNREQ12-001, SC-012-005, SC-012-006, SC-012-010, SC-012-073, SC-012-074, SC-012-103
 */

import { DomainError } from '../../generated/v38/index.ts';
import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { validateCreateOwnerRequest, type CreateOwnerRequest, type OwnerRequestView } from '../../generated/v38/index.ts';
import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { evaluateOwnerRequest, initialRequestStatus, requiresJointApproval, sealApproverSet, type OwnerRequestVote, type SealedOwnerRequest } from '../../domain/pet/co-ownership.ts';
import { CO_OWNER_INVITE_TTL_DAYS, DAY_MS, MAX_CO_OWNERS_PER_PET, OWNER_APPROVAL_TTL_DAYS } from '../../domain/platform/feature-012-limits.ts';
import type { OwnerRequestRecord, PetCoOwnerRecord } from '../ports/co-ownership.port.ts';
import type { OwnershipState, RepositorySet } from '../ports/repositories.port.ts';
import { transferPetOwnership } from '../../domain/pet/ownership-transfer.ts';
import { assertPetNotFrozen, effectiveCoOwnerStatus, materializeExpiredInvitations, materializeExpiredRequests, ownersOf, recordOwnershipAudit, requireOwner, retryable, revokeLinksOfNonOwners, settledRequest } from './co-ownership-support.ts';
import { recordAudit } from './audit-support.ts';
import { purgeObjects, reinforcePrefix } from './media-use-cases.ts';
import { deletePetInTransaction } from './pet-use-cases.ts';
import { assertMatchesSchema, type ApplicationDeps } from './use-case-support.ts';

const notFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');

/** Vista de una solicitud para quien la mira, según la tabla «campos por acción × rol» (H-01/H-07): reducida si ya no es propietario ACTIVE de la mascota. */
type OwnerRequestListItem = OwnerRequestView & { readonly canVote: boolean };

async function toView(repositories: RepositorySet, request: OwnerRequestRecord, viewerUserId: string, now: string): Promise<OwnerRequestListItem> {
  const status = request.status === 'PENDING' && now >= request.expiresAt ? 'EXPIRED' : request.status;
  const role = request.requesterUserId === viewerUserId ? 'REQUESTER' : request.approverSet.includes(viewerUserId) ? 'APPROVER' : request.targetUserId === viewerUserId ? 'TARGET' : 'APPROVER';
  const reduced = { id: request.id, action: request.action, status, role, createdAt: request.createdAt, expiresAt: request.expiresAt, decidedAt: request.decidedAt, canVote: false } as OwnerRequestListItem;
  if (request.petId === null) return reduced;
  const state = await repositories.pets.findOwnership(request.petId);
  const rows = await repositories.coOwners.listByPet(request.petId);
  if (state === null || !ownersOf(state.ownerUserId, rows).includes(viewerUserId)) return reduced;
  const pet = await repositories.pets.findById(request.petId);
  const ids = [request.requesterUserId, request.targetUserId, ...request.approverSet].filter((id): id is string => id !== null);
  const usernames = new Map((await repositories.users.listByIds([...new Set(ids)])).map((u) => [u.id, u.username]));
  const terminal = status !== 'PENDING' && status !== 'UNDER_REVIEW';
  const voteOf = (userId: string): 'PENDING' | 'APPROVED' | 'REJECTED' => (request.rejectedBy === userId ? 'REJECTED' : request.approvals.some((a) => a.u === userId) ? 'APPROVED' : 'PENDING');
  const approvers = request.approverSet.map((userId) => ({ username: usernames.get(userId) ?? '', vote: voteOf(userId) }));
  return {
    ...reduced,
    petId: request.petId,
    petName: pet?.name ?? null,
    requesterUsername: request.requesterUserId === null ? null : (usernames.get(request.requesterUserId) ?? null),
    targetUsername: terminal ? null : (request.targetUserId === null ? request.targetUsernameSealed : (usernames.get(request.targetUserId) ?? request.targetUsernameSealed)),
    approvers,
    canVote: status === 'PENDING' && request.approverSet.includes(viewerUserId) && voteOf(viewerUserId) === 'PENDING',
    message: terminal ? null : request.message,
    staleReason: request.staleReason === null ? null : 'OWNERSHIP_VERSION_CHANGED',
    disputeReason: null,
    frozenUntil: null,
    mootReason: null,
  } as OwnerRequestListItem;
}

const sealedOf = (r: OwnerRequestRecord): SealedOwnerRequest => ({
  id: r.id,
  action: r.action,
  petId: r.petId,
  petVersion: r.petVersion,
  requesterUserId: r.requesterUserId,
  targetUserId: r.targetUserId,
  approverSet: r.approverSet,
  approvals: r.approvals,
  status: r.status,
  createdAt: r.createdAt,
  expiresAt: r.expiresAt,
});

/** @implements REQ-OWN12-004, REQ-OWN12-011, INV-OWN12-001, EDGE-012-030, SC-012-005 */
export class CreateOwnerRequestUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<OwnerRequestView> {
    const body = assertMatchesSchema<CreateOwnerRequest>('CreateOwnerRequest', validateCreateOwnerRequest, input);
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId); // autorización antes del bloqueo
      const state = await repositories.pets.findOwnershipForUpdate(petId);
      if (state === null) throw notFound();
      const now = deps.clock.nowIsoTimestamp();
      const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
      const owners = ownersOf(state.ownerUserId, rows);
      if (!owners.includes(actorUserId)) throw notFound();
      // REQ-OWN12-004 (j): con un solo propietario ACTIVE no hay aprobaciones; la acción se ejecuta por las rutas de 002/004.
      await assertPetNotFrozen(repositories, petId, now);
      if (!requiresJointApproval(owners.length)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Con un único propietario no se crean solicitudes: la acción se ejecuta directamente.', 'action');
      const target = body.targetUserId ?? null;
      if (body.action === 'CHANGE_PRINCIPAL') {
        // Promueve a quien YA es co-propietario ACTIVE (EDGE-012-009); el principal actual no puede ser el destino.
        if (target === null || isPrincipalOfPet(target, state) || !owners.includes(target)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'El destino debe ser un co-propietario activo.', 'targetUserId');
      }
      if (body.action === 'TRANSFER_PRINCIPAL') {
        if (!isPrincipalOfPet(actorUserId, state)) throw new DomainErrorRoot('ERR-ACC-FORBIDDEN', undefined, 'petId');
        if (target === null || owners.includes(target)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Para promover a un co-propietario usa CHANGE_PRINCIPAL.', 'targetUserId');
        // Mismas reglas de elegibilidad que la transferencia de 002 (miembro ACTIVE de un hogar con la mascota).
        transferPetOwnership({
          pet: { id: petId, ownerUserId: state.ownerUserId },
          actorUserId,
          newOwnerUserId: target,
          memberships: await repositories.households.listMembershipsOfUsers([target]),
          assignments: await repositories.assignments.listByPet(petId),
        });
      }
      const requests = await materializeExpiredRequests(repositories, await repositories.ownerRequests.listByPet(petId), now);
      if (requests.some((r) => r.status === 'PENDING' && r.action === body.action)) throw new DomainError('ERR-OWN12-APPROVAL-PENDING');
      const approverSet = sealApproverSet(actorUserId, owners);
      const status = initialRequestStatus(approverSet);
      const request: OwnerRequestRecord = {
        id: deps.ids.nextId(),
        action: body.action,
        petId,
        petVersion: state.ownershipVersion,
        requesterUserId: actorUserId,
        requesterPseudonym: null,
        targetUserId: target,
        targetUsernameSealed: null,
        targetResponse: null,
        triggerRequestIds: null,
        status,
        approverSet,
        approvals: [],
        rejectedBy: null,
        rejectedByPseudonym: null,
        message: status === 'PENDING' ? (body.message ?? null) : null,
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
      return toView(repositories, request, actorUserId, now);
    });
  }
}

/** «Mis solicitudes»: las propias y las que debo decidir, de las mascotas donde soy propietario ACTIVE (R-11). Terceros nunca aparecen. @implements REQ-OWN12-004, INV-OWN12-004 */
export class ListMyOwnerRequestsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string): Promise<OwnerRequestListItem[]> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const petIds = new Set<string>((await repositories.pets.listByOwners([actorUserId])).map((p) => p.id));
      for (const row of await repositories.coOwners.listByUser(actorUserId)) if (row.status === 'ACTIVE') petIds.add(row.petId);
      const mine = (await repositories.ownerRequests.listByPets([...petIds])).filter((r) => r.requesterUserId === actorUserId || r.approverSet.includes(actorUserId));
      const views: OwnerRequestListItem[] = [];
      for (const request of mine) views.push(await toView(repositories, request, actorUserId, now));
      return views;
    });
  }
}

/** Resultado de un voto: el estado final se confirma y, si hay error, se lanza tras el commit. */
interface VoteResult {
  readonly view: OwnerRequestListItem;
  readonly error: Error | null;
  readonly objectKeys: readonly string[];
  readonly deletedPetId: string | null;
}

abstract class VoteOnOwnerRequest {
  constructor(protected readonly deps: ApplicationDeps) {}

  protected async vote(actorUserId: string, requestId: string, type: OwnerRequestVote['type']): Promise<OwnerRequestView> {
    const { deps } = this;
    const result = await deps.uow.runInTransaction<VoteResult>(async (repositories) => {
      const found = await repositories.ownerRequests.findById(requestId);
      if (found === null || found.petId === null) throw notFound();
      const petId = found.petId;
      await requireOwner(repositories, actorUserId, petId); // autorización (404) ANTES del bloqueo (H-03)
      const state = await repositories.pets.findOwnershipForUpdate(petId);
      if (state === null) throw notFound();
      const request = await repositories.ownerRequests.findById(requestId);
      if (request === null) throw notFound();
      const now = deps.clock.nowIsoTimestamp();
      const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
      const owners = ownersOf(state.ownerUserId, rows);
      const context = { petVersion: state.ownershipVersion, principalUserId: state.ownerUserId, currentOwners: owners, coOwnerRows: rows };
      if (type === 'APPROVE') await assertPetNotFrozen(repositories, petId, now);
      let outcome;
      try {
        outcome = evaluateOwnerRequest(sealedOf(request), { type, userId: actorUserId }, context, now);
      } catch (error) {
        // Voto en o después de `expires_at`: la solicitud se materializa EXPIRED (confirmada) y el voto se rechaza sin contarse.
        if (error instanceof DomainError && error.code === 'ERR-OWN12-APPROVAL-EXPIRED') {
          const next = settledRequest(request, { status: 'EXPIRED', decidedAt: request.expiresAt });
          if (request.status === 'PENDING') await repositories.ownerRequests.update(next, 'PENDING');
          await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_EXPIRED', petId, null, null);
          return { view: await toView(repositories, next, actorUserId, now), error, objectKeys: [], deletedPetId: null };
        }
        throw error;
      }
      if (outcome.status === 'EXPIRED') {
        const next = settledRequest(request, { status: 'EXPIRED', decidedAt: now, staleReason: 'ERR-OWN12-STALE', approvals: [...outcome.approvals] });
        await repositories.ownerRequests.update(next, 'PENDING');
        await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_STALE', petId, null, null);
        return { view: await toView(repositories, next, actorUserId, now), error: new DomainError('ERR-OWN12-STALE'), objectKeys: [], deletedPetId: null };
      }
      if (outcome.status === 'REJECTED') {
        const next = settledRequest(request, { status: 'REJECTED', decidedAt: now, approvals: [...outcome.approvals], rejectedBy: outcome.rejectedBy ?? null });
        await repositories.ownerRequests.update(next, 'PENDING');
        await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_REJECTED', petId, null, null);
        const error = outcome.errorCode === undefined ? null : new DomainError(outcome.errorCode);
        return { view: await toView(repositories, next, actorUserId, now), error, objectKeys: [], deletedPetId: null };
      }
      if (!outcome.execute) {
        const next = { ...request, approvals: [...outcome.approvals] };
        if (!(await repositories.ownerRequests.update(next, 'PENDING'))) throw new DomainError('ERR-OWN12-STALE');
        return { view: await toView(repositories, next, actorUserId, now), error: null, objectKeys: [], deletedPetId: null };
      }
      // Ejecución en la MISMA transacción que el último voto (REQ-OWN12-004, REQ-OWN12-011).
      const executed = await executeCritical(deps, repositories, request, state, rows, actorUserId, now);
      if (executed.rejectedWith !== null) {
        const next = settledRequest(request, { status: 'REJECTED', decidedAt: now, approvals: [...outcome.approvals] });
        await repositories.ownerRequests.update(next, 'PENDING');
        await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_REJECTED', petId, null, null);
        return { view: await toView(repositories, next, actorUserId, now), error: new DomainError(executed.rejectedWith), objectKeys: [], deletedPetId: null };
      }
      const next = settledRequest(request, { status: 'APPROVED', decidedAt: now, approvals: [...outcome.approvals] });
      await repositories.ownerRequests.update(next, 'PENDING');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_APPROVED', petId, null, { action: request.action });
      return { view: await toView(repositories, next, actorUserId, now), error: null, objectKeys: executed.objectKeys, deletedPetId: executed.deletedPetId };
    });
    if (result.objectKeys.length > 0) await purgeObjects(deps, [...result.objectKeys]);
    if (result.deletedPetId !== null) await reinforcePrefix(deps, [result.deletedPetId]);
    if (result.error !== null) throw result.error;
    return result.view;
  }
}

/** @implements REQ-OWN12-004, REQ-OWN12-011, INV-OWN12-001, SC-012-005, SC-012-006, SC-012-010, SC-012-073, SC-012-074, SC-012-103 */
export class ApproveOwnerRequestUseCase extends VoteOnOwnerRequest {
  execute(actorUserId: string, requestId: string): Promise<OwnerRequestView> {
    return this.vote(actorUserId, requestId, 'APPROVE');
  }
}

/** Un «no» explícito termina la solicitud en `REJECTED`; nunca cuenta como ausencia (REQ-OWN12-009). @implements REQ-OWN12-004, SC-012-006 */
export class RejectOwnerRequestUseCase extends VoteOnOwnerRequest {
  execute(actorUserId: string, requestId: string): Promise<OwnerRequestView> {
    return this.vote(actorUserId, requestId, 'REJECT');
  }
}

/** El solicitante cancela su solicitud `PENDING`; 204 solo si el estado final es `CANCELLED`. @implements REQ-OWN12-004, EDGE-012-033, EDGE-012-031 */
export class CancelOwnerRequestUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, requestId: string): Promise<204> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const found = await repositories.ownerRequests.findById(requestId);
      if (found === null || found.requesterUserId !== actorUserId || found.petId === null || found.action === 'CHIP_DISPUTE') throw notFound();
      if (found.status === 'CANCELLED') return 204 as const;
      const now = deps.clock.nowIsoTimestamp();
      if (found.status !== 'PENDING' || now >= found.expiresAt) throw new DomainError('ERR-OWN12-STALE');
      if (!(await repositories.ownerRequests.update(settledRequest(found, { status: 'CANCELLED', decidedAt: now }), 'PENDING'))) throw new DomainError('ERR-OWN12-STALE');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_CANCELLED', found.petId, null, null);
      return 204 as const;
    });
  }
}

/** Resultado de ejecutar una acción aprobada. */
interface Executed {
  readonly objectKeys: readonly string[];
  readonly deletedPetId: string | null;
  /** Código con el que la solicitud termina `REJECTED` sin ejecutar (p. ej. tope alcanzado al ejecutar). */
  readonly rejectedWith: 'ERR-OWN12-CO-OWNER-LIMIT' | null;
}

/** Sube `ownership_version` (una acción crítica surte efecto por vez, EDGE-012-030) o falla reintentable si otra transición se adelantó bajo el bloqueo. */
async function bumpOrRetry(repositories: RepositorySet, petId: string, state: OwnershipState): Promise<void> {
  if ((await repositories.pets.bumpOwnershipVersion(petId, state.ownershipVersion)) !== 1) throw retryable();
}

/** Ejecuta la acción de una solicitud ya aprobada por todos, bajo el bloqueo por mascota. */
async function executeCritical(deps: ApplicationDeps, repositories: RepositorySet, request: OwnerRequestRecord, state: OwnershipState, rows: readonly PetCoOwnerRecord[], actorUserId: string, now: string): Promise<Executed> {
  const petId = request.petId!;
  const owners = ownersOf(state.ownerUserId, rows);
  switch (request.action) {
    case 'DELETE_PET': {
      // EDGE-012-034: al aprobarse la baja, todas las demás solicitudes de la mascota pasan a CANCELLED (antes de que la mascota desaparezca).
      for (const other of await materializeExpiredRequests(repositories, await repositories.ownerRequests.listByPet(petId), now)) {
        if (other.id !== request.id && other.status === 'PENDING') await repositories.ownerRequests.update(settledRequest(other, { status: 'CANCELLED', decidedAt: now }), 'PENDING');
      }
      const pet = await repositories.pets.findById(petId);
      if (pet === null) throw notFound();
      for (const row of rows) if (row.status === 'INVITED') await repositories.coOwners.transition(row.id, 'INVITED', { status: 'CANCELLED', leftAt: now });
      const objectKeys = await deletePetInTransaction(deps, repositories, actorUserId, pet);
      return { objectKeys, deletedPetId: petId, rejectedWith: null };
    }
    case 'CHANGE_PRINCIPAL':
    case 'TRANSFER_PRINCIPAL': {
      const target = request.targetUserId;
      if (target === null) throw new DomainError('ERR-OWN12-STALE');
      const targetRow = rows.find((row) => row.status === 'ACTIVE' && row.userId === target);
      if (request.action === 'CHANGE_PRINCIPAL' && targetRow === undefined) throw new DomainError('ERR-OWN12-STALE');
      // TRANSFER a quien aún no es propietario: el principal anterior queda como co-propietario y NO puede superarse el tope.
      if (targetRow === undefined && owners.length >= MAX_CO_OWNERS_PER_PET) return { objectKeys: [], deletedPetId: null, rejectedWith: 'ERR-OWN12-CO-OWNER-LIMIT' };
      await deps.sceneHooks?.onPetOwnershipTransferred(repositories, { petId, previousOwnerUserId: state.ownerUserId, newOwnerUserId: target, now });
      if ((await repositories.pets.compareAndSetOwner(petId, state.ownerUserId, state.ownershipVersion, target)) !== 1) throw retryable();
      if (targetRow !== undefined && !(await repositories.coOwners.transition(targetRow.id, 'ACTIVE', { status: 'PROMOTED', leftAt: now, promotionKind: 'DESIGNATED' }))) throw retryable();
      // El principal anterior sigue siendo propietario: pasa a co-propietario ACTIVE (DEMOTE_PRINCIPAL); su antigüedad empieza ahora.
      await repositories.coOwners.insert({
        id: deps.ids.nextId(),
        petId,
        userId: state.ownerUserId,
        userPseudonym: null,
        status: 'ACTIVE',
        invitedByUserId: null,
        invitedAt: now,
        expiresAt: now,
        joinedAt: now,
        leftAt: null,
        promotionKind: null,
        promotionNoticeAckAt: null,
        version: 1,
      });
      await recordAudit(deps, repositories, { executorUserId: actorUserId, mutationType: 'OWNERSHIP_TRANSFER', entityType: 'PET', entityId: petId, previous: { principal: 'PREVIOUS' }, next: { principal: 'NEW' } });
      await revokeLinksOfNonOwners(deps, repositories, petId, actorUserId, now); // ENM-005-A §2.2: incluidos los creados como ADMIN de hogar
      return { objectKeys: [], deletedPetId: null, rejectedWith: null };
    }
    case 'INVITE_CO_OWNER': {
      await bumpOrRetry(repositories, petId, state);
      const target = request.targetUserId;
      // Destino no resuelto o que ya es propietario: misma respuesta de éxito aparente, sin crear fila (trinity R-09).
      if (target !== null && !owners.includes(target) && !rows.some((row) => row.userId === target && effectiveCoOwnerStatus(row, now) === 'INVITED')) {
        await repositories.coOwners.insert({
          id: deps.ids.nextId(),
          petId,
          userId: target,
          userPseudonym: null,
          status: 'INVITED',
          invitedByUserId: request.requesterUserId,
          invitedAt: now,
          expiresAt: addMillis(now, CO_OWNER_INVITE_TTL_DAYS * DAY_MS),
          joinedAt: null,
          leftAt: null,
          promotionKind: null,
          promotionNoticeAckAt: null,
          version: 1,
        });
        await recordOwnershipAudit(deps, repositories, actorUserId, 'CO_OWNER_INVITED', petId, null, { status: 'INVITED' });
      }
      return { objectKeys: [], deletedPetId: null, rejectedWith: null };
    }
    default:
      throw new DomainError('ERR-OWN12-STALE'); // CLAIM_CO_OWNERSHIP y CHIP_DISPUTE pertenecen a los bloques #23 y a /admin
  }
}
