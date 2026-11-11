/**
 * Casos de uso de hogares compartidos.
 * Las reglas son las de household-policies (STATE-HOUSE-MEMBERSHIP-001, INV-HOUSE-001..005); aquí se cargan y
 * guardan las membresías en una transacción.
 * - Visibilidad: sin membresía ACTIVE, ERR-HOUSE-NOT-FOUND (INV-HOUSE-004,).
 * - InviteMemberUseCase comprueba primero que el actor sea OWNER (T238 PENDIENTE: ADMIN), después valida la entrada
 *   (el username no se normaliza), aplica el límite de frecuencia y responde siempre 202 {received:true} (REQ-HOUSE2-001).
 * - ListMyHouseholdsUseCase ordena por createdAt del hogar y luego id (la spec no fija el orden).
 *
 * @implements REQ-HOUSE-001, REQ-HOUSE2-001, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, INV-ARCH-001, INV-ARCH-002
 */

import {
  DomainError,
  validateInviteMemberInput,
  type components,
  type Household,
  type UserPublicProfile,
  type InviteMemberInput,
} from '../../generated/index.ts';
import {
  acceptInvitation,
  createHousehold,
  activeMembersInOrder,
  declineInvitation,
  householdPets,
  householdView,
  isOwnerRow,
  type LegacyHouseholdMember,
  inviteMember,
  ownerColorTokens,
  pendingInvitations,
  removeOrLeave,
  requireActiveMembership,
  requireOwner,
} from '../../domain/households/household-policies.ts';
import { matchesPetListFilter } from '../../domain/sorting/deterministic-sorter.ts';
import type { InvitationRecord, RepositorySet } from '../ports/repositories.port.ts';
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
 * Vista del hogar para el actor (lanza ERR-HOUSE-NOT-FOUND sin membresía ACTIVE). Las filas INVITED salen en
 * pendingInvitations; members trae solo ACTIVE.
 */
async function viewOf(repositories: RepositorySet, household: Household, memberships: readonly LegacyHouseholdMember[], actorUserId: string): Promise<HouseholdView> {
  const users = await publicProfilesById(repositories, memberships.map((m) => m.userId));
  const view = householdView(household, memberships, users, actorUserId);
  const invited = view.members.filter((entry) => entry.membership.status === 'INVITED');
  return {
    household: view.household,
    myRole: isOwnerRow({ role: view.myRole, isHouseholdOwner: view.myRole === 'OWNER' }) ? 'ADMIN' : 'READER',
    isHouseholdOwner: view.myRole === 'OWNER',
    members: view.members
      .filter((entry) => entry.membership.status === 'ACTIVE')
      .map((entry) => ({ membership: toMemberDto(entry.membership, entry.user), colorToken: entry.colorToken })),
    pendingInvitations: invited.map((entry) => ({
      invitationId: entry.membership.membershipId,
      householdId: entry.membership.householdId,
      inviteeUsername: entry.user.username,
      roleOnJoin: 'READER' as const,
      invitedByUserId: entry.membership.invitedByUserId!,
      status: 'INVITED' as const,
      createdAt: entry.membership.invitedAt!,
      respondedAt: null,
    })),
  };
}

/** Reemplaza la fila actualizada en la lista de membresías del hogar. */
function withRow(memberships: readonly LegacyHouseholdMember[], row: LegacyHouseholdMember): LegacyHouseholdMember[] {
  return memberships.map((m) => (m.membershipId === row.membershipId ? row : m));
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
      return viewOf(repositories, household, [ownerMembership], userId);
    });
  }
}

/**
 * Invitación uniforme (REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006): exista o no el username, y ya sea miembro o ya
 * invitado, la respuesta y el trabajo de almacenamiento son los mismos (202 {received:true}). Un username inexistente
 * deja una invitación inerte (sin usuario) que nadie puede aceptar; `roleOnJoin` se guarda y su efecto llega con T247.
 * El límite de frecuencia (INVITE_MAX_PER_WINDOW por INVITE_WINDOW_MINUTES y actor) se aplica después de la
 * autorización y de la validación, y su rechazo (ERR-RATE-LIMITED) es igual para usernames reales e inexistentes.
 * T238 PENDIENTE: la fila INVITED heredada de `household_members` se mantiene (doble escritura) mientras aceptar,
 * rechazar y listar sigan leyendo el modelo de la 001; T238 los pasa a `household_invitations`.
 * @implements REQ-HOUSE2-001, INV-HOUSE-003, INV-AUTH-006, ERR-RATE-LIMITED
 */
export class InviteMemberUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, input: unknown): Promise<InviteAccepted> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      requireOwner(memberships, householdId, userId);
      const { username, roleOnJoin } = parseInviteMemberInput(input);
      const now = this.deps.clock.nowIsoTimestamp();
      if (!(await this.deps.rateLimiter.tryConsume(repositories, 'INVITE', userId, now))) throw new DomainError('ERR-RATE-LIMITED');
      const invitee = await repositories.users.findByUsername(username);
      const row = inviteMember({ memberships, householdId, actorUserId: userId, invitee, membershipId: this.deps.ids.nextId(), nowIsoTimestamp: now });
      const pending = await repositories.invitations.findOpen(householdId, username);
      if (invitee === null) {
        if (pending === null) await repositories.invitations.save(this.invitationOf(householdId, username, null, roleOnJoin, userId, now));
      } else if (row !== null) {
        // Una INVITED anterior sin su fila heredada es residuo de un rechazo o cancelación hechos por el modelo de la 001.
        if (pending !== null) await repositories.invitations.save({ ...pending, status: 'CANCELLED', respondedAt: now });
        await repositories.households.saveMembership(row);
        await repositories.invitations.save(this.invitationOf(householdId, username, invitee.id, roleOnJoin, userId, now));
      }
      return { received: true };
    });
  }

  private invitationOf(householdId: string, username: string, inviteeUserId: string | null, roleOnJoin: InviteMemberInput['roleOnJoin'], invitedByUserId: string, now: string): InvitationRecord {
    return { invitationId: this.deps.ids.nextId(), householdId, inviteeUsername: username, inviteeUserId, roleOnJoin, invitedByUserId, status: 'INVITED', createdAt: now, respondedAt: null };
  }
}

/** @implements REQ-HOUSE-003 */
export class ListMyInvitationsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<InvitationView[]> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const pending = pendingInvitations(await repositories.households.listMembershipsOfUsers([userId]), userId);
      const inviters = await publicProfilesById(repositories, pending.map((m) => m.invitedByUserId!));
      const views: InvitationView[] = [];
      for (const invitation of pending) {
        views.push({
          household: (await repositories.households.findById(invitation.householdId))!,
          invitedBy: inviters.get(invitation.invitedByUserId!)!,
          roleOnJoin: 'READER' as const, // T237 PENDIENTE: rol inicial de la invitación
          invitedAt: invitation.invitedAt!,
        });
      }
      return views;
    });
  }
}

/** @implements REQ-HOUSE-003 */
export class RespondInvitationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** ACCEPT devuelve la membresía ACTIVE (200); DECLINE no devuelve cuerpo (204). Nunca 403 (EDGE-026, EDGE-027). */
  async execute(userId: string, householdId: string, response: 'ACCEPT' | 'DECLINE'): Promise<HouseholdMemberView | 204> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      if (response === 'DECLINE') {
        await repositories.households.saveMembership(declineInvitation(memberships, householdId, userId, now));
        return 204 as const;
      }
      const row = acceptInvitation(memberships, householdId, userId, now);
      await repositories.households.saveMembership(row);
      return memberView(repositories, withRow(memberships, row), row);
    });
  }
}

async function endMembership(deps: ApplicationDeps, actorUserId: string, householdId: string, targetUserId: string): Promise<204> {
  return deps.uow.runInTransaction(async (repositories) => {
    const memberships = await repositories.households.listMemberships(householdId);
    await repositories.households.saveMembership(removeOrLeave(memberships, householdId, actorUserId, targetUserId, deps.clock.nowIsoTimestamp()));
    return 204 as const;
  });
}

/** OWNER retira a un miembro (REMOVED) o cancela una invitación (CANCELLED). @implements REQ-HOUSE-004 */
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
      await repositories.households.deleteWithMemberships(householdId);
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
      const entries = householdPets(householdId, memberships, await repositories.pets.listByOwners(activeIds), users, userId).filter((entry) =>
        matchesPetListFilter(entry.pet, petListFilterOf(query)),
      );
      const pets = [];
      for (const entry of entries) {
        const card = buildPetCard(entry.pet, entry.owner, entry.canEdit, await repositories.records.listForPet(entry.pet.id), today);
        if (keepsCard(query, card)) pets.push(card);
      }
      return { household: (await repositories.households.findById(householdId))!, pets };
    });
  }
}
