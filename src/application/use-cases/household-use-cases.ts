/**
 * Casos de uso de hogares compartidos (plan §3, más GetHouseholdUseCase para la operación getHousehold del OpenAPI).
 * Las reglas son las de household-policies (STATE-HOUSE-MEMBERSHIP-001, INV-HOUSE-001..005); aquí se cargan y
 * guardan las membresías en una transacción.
 * - Visibilidad: sin membresía ACTIVE, ERR-HOUSE-NOT-FOUND (INV-HOUSE-004, constitución §6.4).
 * - InviteMemberUseCase comprueba primero que el actor sea OWNER y después valida la entrada (normalización del
 *   username, spec §5.1 regla 3), igual que el acceso precede al esquema en mascotas y registros.
 * - ListMyHouseholdsUseCase ordena por createdAt del hogar y luego id (la spec no fija el orden).
 *
 * @implements REQ-HOUSE-001, REQ-HOUSE-002, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, INV-ARCH-001, INV-ARCH-002
 */

import {
  validateInviteMemberInput,
  type components,
  type Household,
  type HouseholdMember,
  type InviteMemberInput,
} from '../../generated/index.ts';
import { normalizeUsername } from '../../domain/auth/auth-policies.ts';
import {
  acceptInvitation,
  createHousehold,
  activeMembersInOrder,
  declineInvitation,
  householdPets,
  householdView,
  inviteMember,
  ownerColorTokens,
  pendingInvitations,
  removeOrLeave,
  requireActiveMembership,
  requireOwner,
} from '../../domain/households/household-policies.ts';
import { matchesPetListFilter } from '../../domain/sorting/deterministic-sorter.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { PetListQuery } from './pet-use-cases.ts';
import {
  assertMatchesSchema,
  buildPetCard,
  publicProfilesById,
  toPublicProfile,
  type ApplicationDeps,
  type PetCardView,
} from './use-case-support.ts';

export type HouseholdView = components['schemas']['HouseholdView'];
export type HouseholdMemberView = components['schemas']['HouseholdMemberView'];
/** HouseholdPetsView con las tarjetas de PetCardView (profile como PetProfile, H-108-3). */
export type HouseholdPetsView = Omit<components['schemas']['HouseholdPetsView'], 'pets'> & { pets: PetCardView[] };
export type InvitationView = components['schemas']['InvitationView'];

function parseInviteMemberInput(input: unknown): InviteMemberInput {
  const username = (input as { username?: unknown } | null)?.username;
  const candidate = typeof username === 'string' ? { ...(input as object), username: normalizeUsername(username) } : input;
  return assertMatchesSchema<InviteMemberInput>('InviteMemberInput', validateInviteMemberInput, candidate);
}

/** Vista del hogar para el actor (lanza ERR-HOUSE-NOT-FOUND sin membresía ACTIVE). */
async function viewOf(repositories: RepositorySet, household: Household, memberships: readonly HouseholdMember[], actorUserId: string): Promise<HouseholdView> {
  const users = await publicProfilesById(repositories, memberships.map((m) => m.userId));
  return householdView(household, memberships, users, actorUserId);
}

/** Reemplaza la fila actualizada en la lista de membresías del hogar. */
function withRow(memberships: readonly HouseholdMember[], row: HouseholdMember): HouseholdMember[] {
  return memberships.map((m) => (m.membershipId === row.membershipId ? row : m));
}

async function memberView(repositories: RepositorySet, memberships: readonly HouseholdMember[], row: HouseholdMember): Promise<HouseholdMemberView> {
  const user = (await publicProfilesById(repositories, [row.userId])).get(row.userId)!;
  return { membership: row, user, colorToken: ownerColorTokens(memberships, row.householdId).get(row.userId) ?? null };
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

/** @implements REQ-HOUSE-002 */
export class InviteMemberUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, input: unknown): Promise<HouseholdMemberView> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const memberships = await repositories.households.listMemberships(householdId);
      requireOwner(memberships, householdId, userId);
      const { username } = parseInviteMemberInput(input);
      const invitee = await repositories.users.findByUsername(username);
      const row = inviteMember({
        memberships,
        householdId,
        actorUserId: userId,
        invitee,
        membershipId: this.deps.ids.nextId(),
        nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
      });
      await repositories.households.saveMembership(row);
      return { membership: row, user: toPublicProfile(invitee!), colorToken: null };
    });
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
        matchesPetListFilter(entry.pet, query),
      );
      const pets = [];
      for (const entry of entries) {
        pets.push(buildPetCard(entry.pet, entry.owner, entry.canEdit, await repositories.records.listForPet(entry.pet.id), today));
      }
      return { household: (await repositories.households.findById(householdId))!, pets };
    });
  }
}
