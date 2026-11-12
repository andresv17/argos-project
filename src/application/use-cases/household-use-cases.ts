/**
 * Casos de uso de hogares compartidos.
 * Las reglas son las de household-policies (STATE-HOUSE-MEMBERSHIP-001, INV-HOUSE-001..005); aquí se cargan y
 * guardan las membresías en una transacción.
 * - Visibilidad: sin membresía ACTIVE, ERR-HOUSE-NOT-FOUND (INV-HOUSE-004,).
 * - Las invitaciones viven solo en household_invitations (T246, resolución de Neo): household_members no guarda filas
 *   INVITED, y aceptar, rechazar, cancelar y listar leen y escriben ahí; al aceptar nace la membresía ACTIVE con roleOnJoin.
 * - InviteMemberUseCase comprueba primero que el actor sea gestor (OWNER o ADMIN, requireManager; REQ-HOUSE2-001), después valida la entrada
 *   (el username no se normaliza), aplica el límite de frecuencia y responde siempre 202 {received:true} (REQ-HOUSE2-001).
 * - ListMyHouseholdsUseCase ordena por createdAt del hogar y luego id (la spec no fija el orden).
 *
 * - ChangeMemberRoleUseCase y TransferHouseholdOwnershipUseCase (T246) guardan solo las filas que cambian; la transferencia
 *   también actualiza el propietario del hogar. REMOVE y LEAVE podan las asignaciones de las mascotas del miembro saliente.
 *
 * @implements REQ-HOUSE-001, REQ-HOUSE2-001, REQ-HOUSE2-002, REQ-HOUSE2-003, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, INV-HOUSE2-001, INV-ARCH-001, INV-ARCH-002
 */

import {
  DomainError,
  validateChangeRoleInput,
  validateInviteMemberInput,
  validateTransferHouseholdOwnershipInput,
  type components,
  type Household,
  type PetProfile,
  type UserPublicProfile,
  type InviteMemberInput,
  type ChangeRoleInput,
  type TransferHouseholdOwnershipInput,
} from '../../generated/index.ts';
import {
  applyMembershipEvent,
  changeMemberRole,
  createHousehold,
  activeMembersInOrder,
  householdPets,
  householdView,
  isOwnerRow,
  type LegacyHouseholdMember,
  inviteMember,
  membershipFromAcceptedInvitation,
  ownerColorTokens,
  requireActiveMembership,
  requireManager,
  requireOwner,
  transferHouseholdOwnership,
} from '../../domain/households/household-policies.ts';
import { matchesPetListFilter } from '../../domain/sorting/deterministic-sorter.ts';
import type { InvitationRecord, RepositorySet } from '../ports/repositories.port.ts';
import { recordAssignmentRemoved, recordAudit } from './audit-support.ts';
import { keepsCard, petListFilterOf, type PetListQuery } from './pet-use-cases.ts';
import {
  assertMatchesSchema,
  buildPetCard,
  publicProfilesById,
  type ApplicationDeps,
  type PetCardView,
} from './use-case-support.ts';

export type HouseholdView = components['schemas']['HouseholdView'];
export type HouseholdMemberView = components['schemas']['HouseholdMemberView'];
/** HouseholdPetsView con las tarjetas de PetCardView (profile como PetProfile, H-108-3). */
export type HouseholdPetsView = Omit<components['schemas']['HouseholdPetsView'], 'pets'> & { pets: PetCardView[] };
export type InvitationView = components['schemas']['InvitationView'];
/** Cuerpo único de la respuesta de invitar, idéntico exista o no el username (REQ-HOUSE2-001). */
export type InviteAccepted = components['schemas']['InviteAccepted'];

/** Valida el cuerpo de PATCH /households/{id}/members/{userId} (ChangeRoleInput). */
export function parseChangeRoleInput(input: unknown): ChangeRoleInput {
  return assertMatchesSchema<ChangeRoleInput>('ChangeRoleInput', validateChangeRoleInput, input);
}

function parseTransferInput(input: unknown): TransferHouseholdOwnershipInput {
  return assertMatchesSchema<TransferHouseholdOwnershipInput>('TransferHouseholdOwnershipInput', validateTransferHouseholdOwnershipInput, input);
}

function parseInviteMemberInput(input: unknown): InviteMemberInput {
  return assertMatchesSchema<InviteMemberInput>('InviteMemberInput', validateInviteMemberInput, input);
}

/**
 * Fila heredada de la 001 proyectada al HouseholdMember 3.0.0.
 * T237 PENDIENTE: OWNER -> ADMIN con isHouseholdOwner; MEMBER -> READER (conservador, sin permisos de escritura);
 * el rol de Cuidador y el rol inicial de la invitación son decisiones de la rebanada 3.
 */
function toMemberDto(row: LegacyHouseholdMember, user: UserPublicProfile): HouseholdMemberView['membership'] {
  const owner = isOwnerRow(row);
  return {
    membershipId: row.membershipId,
    householdId: row.householdId,
    userId: row.userId,
    username: user.username,
    displayName: user.displayName,
    role: owner ? 'ADMIN' : row.role === 'MEMBER' ? 'READER' : (row.role as HouseholdMemberView['membership']['role']),
    isHouseholdOwner: owner,
    status: row.status as HouseholdMemberView['membership']['status'],
    joinedAt: row.joinedAt!,
    firstJoinedAt: row.firstJoinedAt!,
    updatedAt: row.updatedAt,
  };
}

/**
 * Vista del hogar para el actor (lanza ERR-HOUSE-NOT-FOUND sin membresía ACTIVE). members trae solo ACTIVE;
 * pendingInvitations sale de household_invitations (INVITED con usuario) y solo para el propietario o un ADMIN;
 * las invitaciones inertes (username inexistente) nunca se muestran (INV-AUTH-006).
 */
async function viewOf(repositories: RepositorySet, household: Household, memberships: readonly LegacyHouseholdMember[], actorUserId: string): Promise<HouseholdView> {
  const users = await publicProfilesById(repositories, memberships.map((m) => m.userId));
  const view = householdView(household, memberships, users, actorUserId);
  const me = memberships.find((m) => m.householdId === household.id && m.userId === actorUserId && m.status === 'ACTIVE')!;
  const owner = isOwnerRow(me);
  const myRole = owner ? 'ADMIN' : me.role === 'MEMBER' ? 'READER' : (me.role as HouseholdView['myRole']);
  const invited =
    owner || me.role === 'ADMIN'
      ? (await repositories.invitations.listByHousehold(household.id))
          .filter((i) => i.status === 'INVITED' && i.inviteeUserId !== null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.invitationId.localeCompare(b.invitationId))
      : [];
  return {
    household: view.household,
    myRole,
    isHouseholdOwner: owner,
    members: view.members
      .filter((entry) => entry.membership.status === 'ACTIVE')
      .map((entry) => ({ membership: toMemberDto(entry.membership, entry.user), colorToken: entry.colorToken })),
    pendingInvitations: invited.map((i) => ({
      invitationId: i.invitationId,
      householdId: i.householdId,
      inviteeUsername: i.inviteeUsername,
      roleOnJoin: i.roleOnJoin,
      invitedByUserId: i.invitedByUserId,
      status: 'INVITED' as const,
      createdAt: i.createdAt,
      respondedAt: null,
    })),
  };
}

async function memberView(repositories: RepositorySet, memberships: readonly LegacyHouseholdMember[], row: LegacyHouseholdMember): Promise<HouseholdMemberView> {
  const user = (await publicProfilesById(repositories, [row.userId])).get(row.userId)!;
  return { membership: toMemberDto(row, user), colorToken: ownerColorTokens(memberships, row.householdId).get(row.userId) ?? null };
}

/** @implements REQ-HOUSE-001 */
export class CreateHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, input: unknown): Promise<HouseholdView> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { household, ownerMembership } = createHousehold({
        householdId: this.deps.ids.nextId(),
        membershipId: this.deps.ids.nextId(),
        ownerUserId: userId,
        input,
        nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
      });
      await repositories.households.insert(household);
      await repositories.households.saveMembership(ownerMembership);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'CREATE', entityType: 'HOUSEHOLD', entityId: household.id, previous: null, next: household });
      return viewOf(repositories, household, [ownerMembership], userId);
    });
  }
}

/**
 * Invitación uniforme (REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006): exista o no el username, y ya sea miembro o ya
 * invitado, la respuesta y el trabajo de almacenamiento son los mismos (202 {received:true}). Un username inexistente
 * deja una invitación inerte (sin usuario) que nadie puede aceptar. La invitación se guarda solo en household_invitations
 * con el `roleOnJoin` de la entrada; household_members no recibe filas INVITED.
 * El límite de frecuencia (INVITE_MAX_PER_WINDOW por INVITE_WINDOW_MINUTES y actor) se aplica después de la
 * autorización y de la validación, y su rechazo (ERR-RATE-LIMITED) es igual para usernames reales e inexistentes.
 * Autorización: OWNER o ADMIN activo pueden invitar (requireManager; MANAGE_HOUSEHOLD_MEMBERS de REQ-RBAC-001).
 * @implements REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006, ERR-RATE-LIMITED
 */
export class InviteMemberUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, input: unknown): Promise<InviteAccepted> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      requireManager(memberships, householdId, userId);
      const { username, roleOnJoin } = parseInviteMemberInput(input);
      const now = this.deps.clock.nowIsoTimestamp();
      if (!(await this.deps.rateLimiter.tryConsume(repositories, 'INVITE', userId, now))) throw new DomainError('ERR-RATE-LIMITED');
      const invitee = await repositories.users.findByUsername(username);
      // La política decide si procede (null: usuario inexistente o ya miembro ACTIVE); su fila no se guarda.
      const eligible = inviteMember({ memberships, householdId, actorUserId: userId, invitee, membershipId: this.deps.ids.nextId(), nowIsoTimestamp: now, roleOnJoin }) !== null;
      const pending = await repositories.invitations.findOpen(householdId, username);
      if (pending === null && (invitee === null || eligible)) {
        const invitation = this.invitationOf(householdId, username, invitee?.id ?? null, roleOnJoin, userId, now);
        await repositories.invitations.save(invitation);
        await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'CREATE', entityType: 'HOUSEHOLD_INVITATION', entityId: invitation.invitationId, previous: null, next: invitation });
      }
      return { received: true };
    });
  }

  private invitationOf(householdId: string, username: string, inviteeUserId: string | null, roleOnJoin: InviteMemberInput['roleOnJoin'], invitedByUserId: string, now: string): InvitationRecord {
    return { invitationId: this.deps.ids.nextId(), householdId, inviteeUsername: username, inviteeUserId, roleOnJoin, invitedByUserId, status: 'INVITED', createdAt: now, respondedAt: null };
  }
}

/** @implements REQ-HOUSE-003, REQ-HOUSE2-001 */
export class ListMyInvitationsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<InvitationView[]> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const pending = await repositories.invitations.listOpenForUser(userId);
      const inviters = await publicProfilesById(repositories, pending.map((i) => i.invitedByUserId));
      const views: InvitationView[] = [];
      for (const invitation of pending) {
        views.push({
          household: (await repositories.households.findById(invitation.householdId))!,
          invitedBy: inviters.get(invitation.invitedByUserId)!,
          roleOnJoin: invitation.roleOnJoin,
          invitedAt: invitation.createdAt,
        });
      }
      return views;
    });
  }
}

/** @implements REQ-HOUSE-003, REQ-HOUSE2-001 */
export class RespondInvitationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** ACCEPT devuelve la membresía ACTIVE con el roleOnJoin de la invitación (200); DECLINE no devuelve cuerpo (204). Nunca 403 (EDGE-026, EDGE-027). */
  async execute(userId: string, householdId: string, response: 'ACCEPT' | 'DECLINE'): Promise<HouseholdMemberView | 204> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const invitation = (await repositories.invitations.listOpenForUser(userId)).find((i) => i.householdId === householdId);
      if (invitation === undefined) throw new DomainError('ERR-HOUSE-INVITATION-NOT-FOUND', undefined, 'householdId');
      if (response === 'DECLINE') {
        const declined: InvitationRecord = { ...invitation, status: 'DECLINED', respondedAt: now };
        await repositories.invitations.save(declined);
        await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'HOUSEHOLD_INVITATION', entityId: invitation.invitationId, previous: invitation, next: declined });
        return 204 as const;
      }
      const memberships = await repositories.households.listMemberships(householdId);
      const row = membershipFromAcceptedInvitation({ memberships, invitation, userId, membershipId: this.deps.ids.nextId(), nowIsoTimestamp: now });
      const accepted: InvitationRecord = { ...invitation, status: 'ACCEPTED', respondedAt: now };
      await repositories.invitations.save(accepted);
      await repositories.households.saveMembership(row);
      // La membresía nace como consecuencia de aceptar: 1 sola fila UPDATE sobre la invitación (REQ-AUD-001).
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'HOUSEHOLD_INVITATION', entityId: invitation.invitationId, previous: invitation, next: accepted });
      return memberView(repositories, [...memberships, row], row);
    });
  }
}

/** Guarda solo las filas distintas de las originales, con la del propietario nuevo al final (índice único de propietario). */
async function saveChangedRows(repositories: RepositorySet, before: readonly LegacyHouseholdMember[], after: readonly LegacyHouseholdMember[]): Promise<LegacyHouseholdMember[]> {
  const previous = new Map(before.map((m) => [m.membershipId, JSON.stringify(m)]));
  const changed = after.filter((m) => previous.get(m.membershipId) !== JSON.stringify(m)).sort((a, b) => Number(isOwnerRow(a)) - Number(isOwnerRow(b)));
  for (const row of changed) await repositories.households.saveMembership(row);
  return changed;
}

async function endMembership(deps: ApplicationDeps, actorUserId: string, householdId: string, targetUserId: string): Promise<204> {
  return deps.uow.runInTransaction(async (repositories) => {
    const memberships = await repositories.households.listMemberships(householdId);
    if (actorUserId !== targetUserId && !memberships.some((m) => m.householdId === householdId && m.userId === targetUserId && m.status === 'ACTIVE')) {
      // Sin membresía ACTIVE del destino, la baja puede ser la cancelación de su invitación (vive en household_invitations).
      const invitation = (await repositories.invitations.listOpenForUser(targetUserId)).find((i) => i.householdId === householdId);
      if (invitation !== undefined) {
        requireManager(memberships, householdId, actorUserId);
        const cancelled: InvitationRecord = { ...invitation, status: 'CANCELLED', respondedAt: deps.clock.nowIsoTimestamp() };
        await repositories.invitations.save(cancelled);
        await recordAudit(deps, repositories, { executorUserId: actorUserId, mutationType: 'UPDATE', entityType: 'HOUSEHOLD_INVITATION', entityId: invitation.invitationId, previous: invitation, next: cancelled });
        return 204 as const;
      }
    }
    const assignments = await repositories.assignments.listByHousehold(householdId);
    // H-T245-2: las mascotas del miembro saliente salen del repositorio; la poda quita solo las asignaciones de esas mascotas.
    const pets = await repositories.pets.listByOwners([targetUserId]);
    const result = applyMembershipEvent({
      event: actorUserId === targetUserId ? 'LEAVE' : 'REMOVE',
      memberships,
      assignments,
      pets,
      householdId,
      actorUserId,
      targetUserId,
      nowIsoTimestamp: deps.clock.nowIsoTimestamp(),
    });
    const changedRows = await saveChangedRows(repositories, memberships, result.memberships);
    for (const row of changedRows) {
      const previous = memberships.find((m) => m.membershipId === row.membershipId)!;
      await recordAudit(deps, repositories, { executorUserId: actorUserId, mutationType: 'UPDATE', entityType: 'HOUSEHOLD_MEMBERSHIP', entityId: row.membershipId, previous, next: row });
    }
    const kept = new Set(result.assignments.map((a) => a.petId));
    for (const assignment of assignments) {
      if (kept.has(assignment.petId)) continue;
      await repositories.assignments.remove(assignment.petId, householdId);
      // Excepción de REQ-AUD-001: cada asignación podada genera su propia fila UNASSIGN.
      await recordAssignmentRemoved(deps, repositories, actorUserId, assignment);
    }
    return 204 as const;
  });
}

/**
 * Un ADMIN o el propietario cambia el rol de un miembro ACTIVE (REQ-HOUSE2-002); guarda solo la fila cambiada.
 * `input` lleva el userId de la ruta y el rol del cuerpo ya validado (parseChangeRoleInput).
 * @implements REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001
 */
export class ChangeMemberRoleUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, householdId: string, input: { userId: string; role: ChangeRoleInput['role'] }): Promise<HouseholdMemberView> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      const out = changeMemberRole(memberships, householdId, actorUserId, input.userId, input.role, this.deps.clock.nowIsoTimestamp());
      await saveChangedRows(repositories, memberships, out.memberships);
      const row = out.memberships.find((m) => m.userId === input.userId && m.status === 'ACTIVE')!;
      const previous = memberships.find((m) => m.membershipId === row.membershipId)!;
      await recordAudit(this.deps, repositories, { executorUserId: actorUserId, mutationType: 'ROLE_CHANGE', entityType: 'HOUSEHOLD_MEMBERSHIP', entityId: row.membershipId, previous, next: row });
      return memberView(repositories, out.memberships, row);
    });
  }
}

/**
 * El propietario transfiere el hogar a un miembro ACTIVE: el anterior queda ADMIN sin propiedad (INV-HOUSE2-001).
 * Guarda las dos filas cambiadas y el propietario del hogar; responde la vista del hogar para el actor.
 * @implements REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001
 */
export class TransferHouseholdOwnershipUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, householdId: string, input: unknown): Promise<HouseholdView> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      requireOwner(memberships, householdId, actorUserId);
      const { targetUserId } = parseTransferInput(input);
      const out = transferHouseholdOwnership(memberships, householdId, actorUserId, targetUserId, this.deps.clock.nowIsoTimestamp());
      await saveChangedRows(repositories, memberships, out.memberships);
      await repositories.households.updateOwner(householdId, out.household.ownerUserId);
      const previousHousehold = (await repositories.households.findById(householdId))!;
      const household = { ...previousHousehold, ownerUserId: out.household.ownerUserId };
      await recordAudit(this.deps, repositories, { executorUserId: actorUserId, mutationType: 'OWNERSHIP_TRANSFER', entityType: 'HOUSEHOLD', entityId: householdId, previous: previousHousehold, next: household });
      return viewOf(repositories, household, out.memberships, actorUserId);
    });
  }
}

/** El propietario o un ADMIN retira a un miembro (REMOVED) o cancela una invitación (CANCELLED); nadie retira al propietario. @implements REQ-HOUSE-004, REQ-HOUSE2-002 */
export class RemoveMemberUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, targetUserId: string): Promise<204> {
    return endMembership(this.deps, userId, householdId, targetUserId);
  }
}

/** Un MEMBER abandona el hogar (LEFT); el OWNER no puede (ERR-HOUSE-OWNER-CANNOT-LEAVE). @implements REQ-HOUSE-004 */
export class LeaveHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string): Promise<204> {
    return endMembership(this.deps, userId, householdId, userId);
  }
}

/** Solo el OWNER; borra el hogar y sus membresías, no las mascotas. @implements REQ-HOUSE-004 */
export class DeleteHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string): Promise<204> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      requireOwner(await repositories.households.listMemberships(householdId), householdId, userId);
      const household = (await repositories.households.findById(householdId))!;
      await repositories.households.deleteWithMemberships(householdId);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'DELETE', entityType: 'HOUSEHOLD', entityId: householdId, previous: household, next: null });
      return 204 as const;
    });
  }
}

/** @implements REQ-HOUSE-005, REQ-HOUSE-004 */
export class ListMyHouseholdsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<HouseholdView[]> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const mine = (await repositories.households.listMembershipsOfUsers([userId])).filter((m) => m.status === 'ACTIVE');
      const households: Household[] = [];
      for (const membership of mine) households.push((await repositories.households.findById(membership.householdId))!);
      households.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      const views: HouseholdView[] = [];
      for (const household of households) {
        views.push(await viewOf(repositories, household, await repositories.households.listMemberships(household.id), userId));
      }
      return views;
    });
  }
}

/** @implements REQ-HOUSE-004 */
export class GetHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string): Promise<HouseholdView> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      requireActiveMembership(memberships, householdId, userId);
      return viewOf(repositories, (await repositories.households.findById(householdId))!, memberships, userId);
    });
  }
}

/**
 * Mascotas del hogar con el filtro opcional de REQ-PET-005 (`q`, `species`; OpenAPI 2.4.0, DEUDA-UI-FILTRO-001).
 * Lista ESTRICTAMENTE las mascotas asignadas al hogar (pet_assignments, REQ-HOUSE2-004), no las del dueño.
 * La membresía ACTIVE se comprueba antes de filtrar y los colores de dueño salen de todos los miembros ACTIVE,
 * así que el filtro no cambia el color de ninguna tarjeta.
 * @implements REQ-HOUSE-005, REQ-PET-005, REQ-UI-001, INV-HOUSE-004
 */
export class GetHouseholdPetsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, query: PetListQuery = {}): Promise<HouseholdPetsView> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      const activeIds = activeMembersInOrder(memberships, householdId).map((m) => m.userId);
      const users = await publicProfilesById(repositories, activeIds);
      const assigned = await repositories.assignments.listByHousehold(householdId);
      const assignedPets: PetProfile[] = [];
      for (const assignment of assigned) {
        const pet = await repositories.pets.findById(assignment.petId);
        if (pet !== null) assignedPets.push(pet);
      }
      const actorMemberships = await repositories.households.listMembershipsOfUsers([userId]);
      const allAssignments = [];
      for (const pet of assignedPets) allAssignments.push(...(await repositories.assignments.listByPet(pet.id)));
      const entries = householdPets(householdId, memberships, assignedPets, users, userId, { memberships: actorMemberships, assignments: allAssignments }).filter((entry) =>
        matchesPetListFilter(entry.pet, petListFilterOf(query)),
      );
      const pets = [];
      for (const entry of entries) {
        const card = buildPetCard(entry.pet, entry.owner, entry.myRole, await repositories.records.listForPet(entry.pet.id), today);
        if (keepsCard(query, card)) pets.push(card);
      }
      return { household: (await repositories.households.findById(householdId))!, pets };
    });
  }
}
