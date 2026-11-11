/**
 * Políticas puras de hogares y membresías.
 * - REQ-HOUSE-001 / INV-HOUSE-001: el creador nace OWNER ACTIVE y es el único OWNER.
 * - REQ-HOUSE2-001 / INV-HOUSE-002 / INV-HOUSE-003: solo el OWNER invita (T238 PENDIENTE: ADMIN); la invitación es
 *   uniforme: si el username no existe o el par ya tiene una membresía INVITED o ACTIVE no hay efecto y no se
 *   distingue (INV-AUTH-006); a lo sumo una membresía INVITED o ACTIVE por par (householdId, userId). La
 *   re-invitación crea una fila nueva y hereda firstJoinedAt del par (D-05).
 * - REQ-HOUSE-003: ACCEPT y DECLINE sin invitación INVITED dan ERR-HOUSE-INVITATION-NOT-FOUND, nunca 403.
 * - REQ-HOUSE-004: REMOVE / CANCEL (OWNER), LEAVE (MEMBER) y borrado del hogar; destino sin membresía
 *   INVITED o ACTIVE da ERR-HOUSE-MEMBERSHIP-NOT-FOUND.
 * - REQ-HOUSE-005 / INV-HOUSE-004 / INV-HOUSE-005: solo los ACTIVE ven el hogar; members con INVITED solo
 *   para el OWNER (D-01); color del dueño por firstJoinedAt ASC, userId ASC; colorToken nulo fuera del hogar.
 * - STATE-HOUSE-MEMBERSHIP-001: tabla de transiciones leída del contrato generado.
 *
 * @implements REQ-HOUSE-001, REQ-HOUSE2-001, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, INV-HOUSE-001, INV-HOUSE-002, INV-HOUSE-003, INV-HOUSE-004, INV-HOUSE-005, STATE-HOUSE-MEMBERSHIP-001, ERR-HOUSE-NOT-FOUND, ERR-HOUSE-OWNER-CANNOT-LEAVE, ERR-HOUSE-INVITATION-NOT-FOUND, ERR-HOUSE-MEMBERSHIP-NOT-FOUND, INV-ARCH-004
 */

import {
  DomainError,
  STATE_HOUSE_MEMBERSHIP_001,
  validateCreateHouseholdInput,
  type CreateHouseholdInput,
  type Household,
  type HouseholdRole,
  type OwnerColorToken,
  type OwnerTag,
  type PetProfile,
  type StateHouseMembership001Event,
  type StateHouseMembership001State,
  type UserPublicProfile,
} from '../../generated/index.ts';
import { assertCanonicalCreatedAt, sortPetsForListing } from '../sorting/deterministic-sorter.ts';

const MEMBERSHIP_MACHINE = STATE_HOUSE_MEMBERSHIP_001;

/**
 * Fila de membresía que entiende la lógica heredada de la 001 (OWNER/MEMBER, INVITED dentro de la misma fila) y que
 * también acepta la fila 3.0.0 (ADMIN/CAREGIVER/READER, isHouseholdOwner). La 002 separa la invitación de la
 * membresía; esa reescritura es T237/T243.
 * T237 PENDIENTE: sustituir este tipo por HouseholdMember e invitación separada del contrato 3.0.0.
 */
export interface LegacyHouseholdMember {
  readonly membershipId: string;
  readonly householdId: string;
  readonly userId: string;
  readonly role: HouseholdRole | 'OWNER' | 'MEMBER';
  readonly status: StateHouseMembership001State;
  readonly invitedByUserId?: string | null;
  readonly invitedAt?: string | null;
  readonly joinedAt: string | null;
  readonly firstJoinedAt: string | null;
  readonly updatedAt: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly isHouseholdOwner?: boolean;
}

/** Propietario del hogar: OWNER de la 001 o isHouseholdOwner de la 3.0.0. */
export const isOwnerRow = (m: Pick<LegacyHouseholdMember, 'role' | 'isHouseholdOwner'>): boolean => m.role === 'OWNER' || m.isHouseholdOwner === true;

/** Guarda estructural de la fila (la persistencia no tiene validador generado para el modelo heredado). */
export function isLegacyHouseholdMember(value: unknown): value is LegacyHouseholdMember {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => typeof x === 'string';
  const nullableText = (x: unknown) => x === null || typeof x === 'string';
  return (
    text(v['membershipId']) &&
    text(v['householdId']) &&
    text(v['userId']) &&
    text(v['role']) &&
    text(v['status']) &&
    nullableText(v['joinedAt']) &&
    nullableText(v['firstJoinedAt']) &&
    text(v['updatedAt'])
  );
}
export const OWNER_COLOR_COUNT = 8;

export interface MembershipTransition {
  readonly target: StateHouseMembership001State;
  readonly actor: 'INVITEE' | 'OWNER' | 'SELF';
}

/**
 * Transición del contrato para (estado, evento). Lanza RangeError si el contrato no la define.
 * @implements STATE-HOUSE-MEMBERSHIP-001
 */
export function nextMembershipState(
  state: StateHouseMembership001State,
  event: StateHouseMembership001Event,
): MembershipTransition {
  const on = MEMBERSHIP_MACHINE.states[state].on as Readonly<Partial<Record<string, { target: string; actor: string }>>>;
  const raw = on[event];
  if (raw === undefined) {
    throw new RangeError(`STATE-HOUSE-MEMBERSHIP-001: el evento ${event} no está definido en el estado ${state}.`);
  }
  return { target: raw.target as StateHouseMembership001State, actor: raw.actor as MembershipTransition['actor'] };
}

/** Indica si el estado da visibilidad del hogar (isVisible del contrato). */
export function isVisibleState(state: StateHouseMembership001State): boolean {
  return MEMBERSHIP_MACHINE.states[state].isVisible;
}

function rowsOf(memberships: readonly LegacyHouseholdMember[], householdId: string, userId: string): LegacyHouseholdMember[] {
  return memberships.filter((m) => m.householdId === householdId && m.userId === userId);
}

function openRowOf(memberships: readonly LegacyHouseholdMember[], householdId: string, userId: string): LegacyHouseholdMember | undefined {
  return rowsOf(memberships, householdId, userId).find((m) => m.status === 'INVITED' || m.status === 'ACTIVE');
}

/** firstJoinedAt del par (householdId, userId): el más antiguo no nulo, o null. Las INVITED siempre tienen invitedAt y las ACTIVE, firstJoinedAt (contrato). */
export function inheritedFirstJoinedAt(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  userId: string,
): string | null {
  let earliest: string | null = null;
  for (const { firstJoinedAt } of rowsOf(memberships, householdId, userId)) {
    if (firstJoinedAt !== null && (earliest === null || firstJoinedAt < earliest)) {
      earliest = firstJoinedAt;
    }
  }
  return earliest;
}

function transition(
  row: LegacyHouseholdMember,
  event: StateHouseMembership001Event,
  nowIsoTimestamp: string,
  changes: Partial<LegacyHouseholdMember> = {},
): LegacyHouseholdMember {
  const { target } = nextMembershipState(row.status, event);
  return { ...row, ...changes, status: target, updatedAt: nowIsoTimestamp };
}

/**
 * INV-HOUSE-004: devuelve la membresía ACTIVE del actor; si no la tiene, ERR-HOUSE-NOT-FOUND.
 * @implements INV-HOUSE-004, ERR-HOUSE-NOT-FOUND
 */
export function requireActiveMembership(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
): LegacyHouseholdMember {
  const row = rowsOf(memberships, householdId, actorUserId).find((m) => m.status === 'ACTIVE');
  if (row === undefined) {
    throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
  }
  return row;
}

/**
 * INV-HOUSE-002: el actor debe ser OWNER ACTIVE. No ACTIVE: ERR-HOUSE-NOT-FOUND; MEMBER ACTIVE: ERR-ACC-FORBIDDEN.
 * @implements INV-HOUSE-002, INV-HOUSE-004
 */
export function requireOwner(memberships: readonly LegacyHouseholdMember[], householdId: string, actorUserId: string): LegacyHouseholdMember {
  const row = requireActiveMembership(memberships, householdId, actorUserId);
  if (!isOwnerRow(row)) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  }
  return row;
}

export interface CreateHouseholdCommand {
  readonly householdId: string;
  readonly membershipId: string;
  readonly ownerUserId: string;
  readonly input: unknown;
  readonly nowIsoTimestamp: string;
}

/**
 * REQ-HOUSE-001 / INV-HOUSE-001: hogar nuevo con su OWNER en ACTIVE (initialStates.OWNER del contrato).
 * @implements REQ-HOUSE-001, INV-HOUSE-001
 */
export function createHousehold(command: CreateHouseholdCommand): { household: Household; ownerMembership: LegacyHouseholdMember } {
  if (!validateCreateHouseholdInput(command.input)) {
    const error = validateCreateHouseholdInput.errors![0]!;
    const extra = error.params['additionalProperty'] ?? error.params['missingProperty'];
    const field = typeof extra === 'string' ? extra : error.instancePath.split('/')[1] ?? null;
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `CreateHouseholdInput: ${field ?? '(raíz)'} ${String(error.message)}.`, field);
  }
  assertCanonicalCreatedAt(command.nowIsoTimestamp);
  const input: CreateHouseholdInput = command.input;
  return {
    household: { id: command.householdId, name: input.name, ownerUserId: command.ownerUserId, createdAt: command.nowIsoTimestamp },
    ownerMembership: {
      membershipId: command.membershipId,
      householdId: command.householdId,
      userId: command.ownerUserId,
      role: 'OWNER',
      status: MEMBERSHIP_MACHINE.initialStates.CREATE_HOUSEHOLD.target,
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: command.nowIsoTimestamp,
      firstJoinedAt: command.nowIsoTimestamp,
      updatedAt: command.nowIsoTimestamp,
    },
  };
}

export interface InviteCommand {
  readonly memberships: readonly LegacyHouseholdMember[];
  readonly householdId: string;
  readonly actorUserId: string;
  /** Usuario resuelto por username; null si no existe. */
  readonly invitee: Pick<UserPublicProfile, 'id'> | null;
  readonly membershipId: string;
  readonly nowIsoTimestamp: string;
}

/**
 * REQ-HOUSE2-001: el OWNER invita a un usuario existente. Orden de comprobación: OWNER (INV-HOUSE-002), después la
 * invitación es uniforme: devuelve null (sin efecto) si el usuario no existe o si ya hay una fila INVITED o ACTIVE del
 * par (INV-HOUSE-003); la 001 respondía 404 y 409, que enumeraban cuentas y membresías y están retirados. Si procede,
 * crea una fila nueva en INVITED; desde DECLINED, CANCELLED, LEFT o REMOVED es el evento INVITE y hereda
 * firstJoinedAt (D-05).
 * @implements REQ-HOUSE2-001, INV-HOUSE-002, INV-HOUSE-003
 */
export function inviteMember(command: InviteCommand): LegacyHouseholdMember | null {
  const { memberships, householdId, actorUserId, invitee, nowIsoTimestamp } = command;
  requireOwner(memberships, householdId, actorUserId);
  if (invitee === null || openRowOf(memberships, householdId, invitee.id) !== undefined) return null;
  return {
    membershipId: command.membershipId,
    householdId,
    userId: invitee.id,
    role: 'MEMBER',
    status: MEMBERSHIP_MACHINE.initialStates.INVITE.target,
    invitedByUserId: actorUserId,
    invitedAt: nowIsoTimestamp,
    joinedAt: null,
    firstJoinedAt: inheritedFirstJoinedAt(memberships, householdId, invitee.id),
    updatedAt: nowIsoTimestamp,
  };
}

function requireInvitation(memberships: readonly LegacyHouseholdMember[], householdId: string, actorUserId: string): LegacyHouseholdMember {
  const row = rowsOf(memberships, householdId, actorUserId).find((m) => m.status === 'INVITED');
  if (row === undefined) {
    throw new DomainError('ERR-HOUSE-INVITATION-NOT-FOUND', undefined, 'householdId');
  }
  return row;
}

/**
 * REQ-HOUSE-003 (ACCEPT): INVITED → ACTIVE; joinedAt = now; firstJoinedAt = el del par o now.
 * Sin invitación INVITED: ERR-HOUSE-INVITATION-NOT-FOUND (nunca 403).
 * @implements REQ-HOUSE-003, ERR-HOUSE-INVITATION-NOT-FOUND
 */
export function acceptInvitation(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
  nowIsoTimestamp: string,
): LegacyHouseholdMember {
  const row = requireInvitation(memberships, householdId, actorUserId);
  return transition(row, 'ACCEPT', nowIsoTimestamp, {
    joinedAt: nowIsoTimestamp,
    firstJoinedAt: inheritedFirstJoinedAt(memberships, householdId, actorUserId) ?? nowIsoTimestamp,
  });
}

/**
 * REQ-HOUSE-003 (DECLINE): INVITED → DECLINED. Sin invitación INVITED: ERR-HOUSE-INVITATION-NOT-FOUND (nunca 403).
 * @implements REQ-HOUSE-003, ERR-HOUSE-INVITATION-NOT-FOUND
 */
export function declineInvitation(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
  nowIsoTimestamp: string,
): LegacyHouseholdMember {
  return transition(requireInvitation(memberships, householdId, actorUserId), 'DECLINE', nowIsoTimestamp);
}

/**
 * REQ-HOUSE-004 (DELETE /households/{id}/members/{userId}):
 * - el actor debe ser ACTIVE (si no, ERR-HOUSE-NOT-FOUND);
 * - si el destino es el propio actor: LEAVE; un OWNER recibe ERR-HOUSE-OWNER-CANNOT-LEAVE (INV-HOUSE-001);
 * - si no, el actor debe ser OWNER (ERR-ACC-FORBIDDEN): INVITED → CANCEL, ACTIVE → REMOVE;
 * - destino sin fila INVITED o ACTIVE: ERR-HOUSE-MEMBERSHIP-NOT-FOUND.
 * @implements REQ-HOUSE-004, INV-HOUSE-001, INV-HOUSE-002, ERR-HOUSE-OWNER-CANNOT-LEAVE, ERR-HOUSE-MEMBERSHIP-NOT-FOUND
 */
export function removeOrLeave(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
  targetUserId: string,
  nowIsoTimestamp: string,
): LegacyHouseholdMember {
  const actor = requireActiveMembership(memberships, householdId, actorUserId);
  if (targetUserId === actorUserId) {
    if (isOwnerRow(actor)) {
      throw new DomainError('ERR-HOUSE-OWNER-CANNOT-LEAVE', undefined, 'userId');
    }
    return transition(actor, 'LEAVE', nowIsoTimestamp);
  }
  requireOwner(memberships, householdId, actorUserId);
  const target = openRowOf(memberships, householdId, targetUserId);
  if (target === undefined) {
    throw new DomainError('ERR-HOUSE-MEMBERSHIP-NOT-FOUND', undefined, 'userId');
  }
  return transition(target, target.status === 'INVITED' ? 'CANCEL' : 'REMOVE', nowIsoTimestamp);
}

/**
 * REQ-HOUSE-004: solo el OWNER elimina el hogar; se quitan el hogar y todas sus membresías. Las mascotas no cambian.
 * @implements REQ-HOUSE-004, INV-HOUSE-002
 */
export function deleteHousehold(
  households: readonly Household[],
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
): { households: Household[]; memberships: LegacyHouseholdMember[] } {
  requireOwner(memberships, householdId, actorUserId);
  return {
    households: households.filter((h) => h.id !== householdId),
    memberships: memberships.filter((m) => m.householdId !== householdId),
  };
}

/**
 * Invitaciones pendientes del usuario (REQ-HOUSE-003), por invitedAt ASC y householdId ASC.
 * @implements REQ-HOUSE-003
 */
export function pendingInvitations(memberships: readonly LegacyHouseholdMember[], userId: string): LegacyHouseholdMember[] {
  return memberships
    .filter((m) => m.userId === userId && m.status === 'INVITED')
    .sort((a, b) => a.invitedAt!.localeCompare(b.invitedAt!) || a.householdId.localeCompare(b.householdId));
}

function compareByJoin(a: LegacyHouseholdMember, b: LegacyHouseholdMember): number {
  return a.firstJoinedAt!.localeCompare(b.firstJoinedAt!) || a.userId.localeCompare(b.userId);
}

/**
 * Miembros ACTIVE del hogar en el orden de INV-HOUSE-005: firstJoinedAt ASC, userId ASC.
 * @implements INV-HOUSE-005
 */
export function activeMembersInOrder(memberships: readonly LegacyHouseholdMember[], householdId: string): LegacyHouseholdMember[] {
  return memberships.filter((m) => m.householdId === householdId && m.status === 'ACTIVE').sort(compareByJoin);
}

/**
 * INV-HOUSE-005: colorToken = OWNER_COLOR_{(i mod 8) + 1} según la posición i en activeMembersInOrder.
 * @implements INV-HOUSE-005
 */
export function ownerColorTokens(memberships: readonly LegacyHouseholdMember[], householdId: string): Map<string, OwnerColorToken> {
  const tokens = new Map<string, OwnerColorToken>();
  activeMembersInOrder(memberships, householdId).forEach((m, i) => {
    tokens.set(m.userId, `OWNER_COLOR_${(i % OWNER_COLOR_COUNT) + 1}` as OwnerColorToken);
  });
  return tokens;
}

/**
 * OwnerTag de una mascota. Sin contexto de hogar (colors = null), colorToken = null (REQ-UI-007, EDGE-030).
 * @implements INV-HOUSE-005
 */
export function ownerTag(owner: Pick<UserPublicProfile, 'id' | 'displayName'>, colors: ReadonlyMap<string, OwnerColorToken> | null): OwnerTag {
  return { userId: owner.id, displayName: owner.displayName, colorToken: colors?.get(owner.id) ?? null };
}

export interface HouseholdMemberEntry {
  readonly membership: LegacyHouseholdMember;
  readonly user: UserPublicProfile;
  readonly colorToken: OwnerColorToken | null;
}

/**
 * INV-HOUSE-004 / D-01: vista del hogar para un miembro ACTIVE. members trae los ACTIVE (orden INV-HOUSE-005) y,
 * solo para el OWNER, luego las INVITED (invitedAt ASC, userId ASC). colorToken solo para ACTIVE.
 * @implements INV-HOUSE-004, INV-HOUSE-005, ERR-HOUSE-NOT-FOUND
 */
export function householdView(
  household: Household,
  memberships: readonly LegacyHouseholdMember[],
  usersById: ReadonlyMap<string, UserPublicProfile>,
  actorUserId: string,
): { household: Household; myRole: LegacyHouseholdMember['role']; members: HouseholdMemberEntry[] } {
  const me = requireActiveMembership(memberships, household.id, actorUserId);
  const colors = ownerColorTokens(memberships, household.id);
  const active = activeMembersInOrder(memberships, household.id);
  const invited =
    isOwnerRow(me)
      ? memberships
          .filter((m) => m.householdId === household.id && m.status === 'INVITED')
          .sort((a, b) => a.invitedAt!.localeCompare(b.invitedAt!) || a.userId.localeCompare(b.userId))
      : [];
  const members = [...active, ...invited].map((membership) => ({
    membership,
    user: usersById.get(membership.userId)!,
    colorToken: colors.get(membership.userId) ?? null,
  }));
  return { household, myRole: me.role, members };
}

export interface HouseholdPetEntry {
  readonly pet: PetProfile;
  readonly owner: OwnerTag;
  readonly canEdit: boolean;
}

/**
 * REQ-HOUSE-005: mascotas de todos los miembros ACTIVE, por dueño (orden INV-HOUSE-005) y luego REQ-PET-005.
 * canEdit solo para las propias. Exige que el actor sea ACTIVE (INV-HOUSE-004).
 * @implements REQ-HOUSE-005, INV-HOUSE-004, INV-HOUSE-005
 */
export function householdPets(
  householdId: string,
  memberships: readonly LegacyHouseholdMember[],
  pets: readonly PetProfile[],
  usersById: ReadonlyMap<string, UserPublicProfile>,
  actorUserId: string,
): HouseholdPetEntry[] {
  requireActiveMembership(memberships, householdId, actorUserId);
  const colors = ownerColorTokens(memberships, householdId);
  return activeMembersInOrder(memberships, householdId).flatMap((member) => {
    const owner = ownerTag(usersById.get(member.userId)!, colors);
    return sortPetsForListing(pets.filter((p) => p.ownerUserId === member.userId)).map((pet) => ({
      pet,
      owner,
      canEdit: pet.ownerUserId === actorUserId,
    }));
  });
}
