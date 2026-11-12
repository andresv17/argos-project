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
import { effectiveRole, type PetHouseholdAssignment, type RoleMembership } from '../access/effective-role.ts';
import { petPermissionsFor, type PetPermissions, type RbacRole } from '../access/rbac.ts';
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

/**
 * REQ-HOUSE2-002: el actor debe ser ACTIVE y propietario o ADMIN. No ACTIVE: ERR-HOUSE-NOT-FOUND; otro rol: ERR-ACC-FORBIDDEN.
 * @implements REQ-HOUSE2-002, INV-HOUSE-004
 */
export function requireManager(memberships: readonly LegacyHouseholdMember[], householdId: string, actorUserId: string): LegacyHouseholdMember {
  const row = requireActiveMembership(memberships, householdId, actorUserId);
  if (!isOwnerRow(row) && row.role !== 'ADMIN') {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  }
  return row;
}

/**
 * REQ-HOUSE2-002 / T246: ACCEPT sobre una invitación guardada en household_invitations (no hay fila INVITED en
 * household_members). Devuelve la membresía ACTIVE nueva con el rol de la invitación; firstJoinedAt hereda el del par
 * o es now (D-05).
 * @implements REQ-HOUSE-003, REQ-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001
 */
export function membershipFromAcceptedInvitation(command: {
  readonly memberships: readonly LegacyHouseholdMember[];
  readonly invitation: { readonly householdId: string; readonly roleOnJoin: HouseholdRole; readonly invitedByUserId: string | null; readonly createdAt: string };
  readonly userId: string;
  readonly membershipId: string;
  readonly nowIsoTimestamp: string;
}): LegacyHouseholdMember {
  const { memberships, invitation, userId, nowIsoTimestamp } = command;
  return {
    membershipId: command.membershipId,
    householdId: invitation.householdId,
    userId,
    role: invitation.roleOnJoin,
    status: nextMembershipState('INVITED', 'ACCEPT').target,
    invitedByUserId: invitation.invitedByUserId,
    invitedAt: invitation.createdAt,
    joinedAt: nowIsoTimestamp,
    firstJoinedAt: inheritedFirstJoinedAt(memberships, invitation.householdId, userId) ?? nowIsoTimestamp,
    updatedAt: nowIsoTimestamp,
  };
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
      role: 'ADMIN',
      isHouseholdOwner: true,
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
  /** Rol con el que entrará el invitado al aceptar (REQ-HOUSE2-001); sin él, la fila heredada lleva MEMBER. */
  readonly roleOnJoin?: HouseholdRole;
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
    role: command.roleOnJoin ?? 'MEMBER',
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
 * - si no, el actor debe ser propietario o ADMIN (ERR-ACC-FORBIDDEN, REQ-HOUSE2-002) y el destino no puede ser el propietario (ERR-ACC-FORBIDDEN): INVITED → CANCEL, ACTIVE → REMOVE;
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
  requireManager(memberships, householdId, actorUserId);
  const target = openRowOf(memberships, householdId, targetUserId);
  if (target === undefined) {
    throw new DomainError('ERR-HOUSE-MEMBERSHIP-NOT-FOUND', undefined, 'userId');
  }
  // REQ-HOUSE2-002: nadie, ni un ADMIN, expulsa o cancela al propietario; el propietario sale solo transfiriendo (INV-HOUSE2-001).
  if (isOwnerRow(target)) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'userId');
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

/**
 * Membresía con rol de la matriz (REQ-MIG-001): el propietario del hogar (OWNER de la 001 o isHouseholdOwner) es ADMIN
 * y el MEMBER de la 001 es READER. Las filas INVITED no otorgan rol (effectiveRole solo cuenta las ACTIVE).
 * @implements REQ-RBAC-001, INV-ACC2-001
 */
export function toRoleMembership(member: LegacyHouseholdMember): RoleMembership {
  const role = isOwnerRow(member) ? 'ADMIN' : member.role === 'MEMBER' ? 'READER' : (member.role as RoleMembership['role']);
  return { userId: member.userId, householdId: member.householdId, status: member.status, role };
}

export interface HouseholdPetEntry {
  readonly pet: PetProfile;
  readonly owner: OwnerTag;
  /** Rol efectivo del actor sobre la mascota (REQ-PET2-003). */
  readonly myRole: RbacRole;
  /** Permisos del actor sobre la mascota, de la matriz REQ-RBAC-001 (reemplaza canEdit). */
  readonly permissions: PetPermissions;
}

/** Contexto de acceso completo del actor: todas sus membresías y todas las asignaciones de las mascotas listadas. */
export interface HouseholdPetsAccess {
  readonly memberships: readonly LegacyHouseholdMember[];
  readonly assignments: readonly PetHouseholdAssignment[];
}

/**
 * REQ-HOUSE2-004: las mascotas recibidas (el llamador pasa SOLO las asignadas al hogar) por dueño ACTIVE
 * (orden INV-HOUSE-005) y luego REQ-PET2-002, con owner (colorToken), myRole y permissions del actor.
 * Sin `access`, se asume que cada mascota está asignada solo a este hogar y que las membresías son las del hogar.
 * Exige que el actor sea ACTIVE (INV-HOUSE-004).
 * @implements REQ-HOUSE2-004, REQ-HOUSE-005, REQ-RBAC-001, INV-HOUSE-004, INV-HOUSE-005, INV-ACC2-002
 */
export function householdPets(
  householdId: string,
  memberships: readonly LegacyHouseholdMember[],
  pets: readonly PetProfile[],
  usersById: ReadonlyMap<string, UserPublicProfile>,
  actorUserId: string,
  access?: HouseholdPetsAccess,
): HouseholdPetEntry[] {
  requireActiveMembership(memberships, householdId, actorUserId);
  const colors = ownerColorTokens(memberships, householdId);
  const roleRows = (access?.memberships ?? memberships).map(toRoleMembership);
  const assignments = access?.assignments ?? pets.map((pet) => ({ petId: pet.id, householdId }));
  return activeMembersInOrder(memberships, householdId).flatMap((member) => {
    const owner = ownerTag(usersById.get(member.userId)!, colors);
    return sortPetsForListing(pets.filter((p) => p.ownerUserId === member.userId)).map((pet) => {
      const role = effectiveRole({ id: actorUserId }, pet, roleRows, assignments) ?? 'READER';
      return { pet, owner, myRole: role, permissions: petPermissionsFor(role) };
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// T245 · Roles, propietario único, poda de asignaciones y transferencia del hogar (002).
// ---------------------------------------------------------------------------------------------------------------------

/** Rol asignable a un miembro no propietario (REQ-HOUSE2-002). El propietario siempre es ADMIN (INV-HOUSE2-001). */
export type AssignableMemberRole = 'ADMIN' | 'CAREGIVER' | 'READER';
const ASSIGNABLE_ROLES: readonly AssignableMemberRole[] = ['ADMIN', 'CAREGIVER', 'READER'];

/** Asignación mascota-hogar que consulta la poda (REQ-HOUSE2-003). */
export interface HouseholdAssignmentRow {
  readonly petId: string;
  readonly householdId: string;
}

/** Mascota mínima para decidir la poda: solo hace falta su Propietario Legal. */
export interface PetOwnerRef {
  readonly id: string;
  readonly ownerUserId: string;
}

/** Entrada de auditoría de una mutación de hogar (una fila por operación; las podas generan una fila cada una). */
export type MembershipAuditKind = 'ROLE_CHANGE' | 'OWNERSHIP_TRANSFER' | 'UNASSIGN';
export interface MembershipAuditEntry {
  readonly kind: MembershipAuditKind;
  readonly householdId: string;
  readonly userId?: string;
  readonly petId?: string;
}

export type MembershipEventInput =
  | { readonly event: 'ACCEPT'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string }
  | { readonly event: 'DECLINE'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string }
  | { readonly event: 'LEAVE'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string }
  | { readonly event: 'REMOVE'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string; readonly pets?: readonly PetOwnerRef[] }
  | { readonly event: 'CHANGE_ROLE'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string; readonly role: AssignableMemberRole }
  | { readonly event: 'TRANSFER_OWNERSHIP'; readonly householdId: string; readonly actorUserId: string; readonly targetUserId: string }
  | { readonly event: 'DELETE_HOUSEHOLD'; readonly householdId: string; readonly actorUserId: string };

export interface MembershipEventCommand {
  readonly event: MembershipEventInput['event'];
  readonly memberships: readonly LegacyHouseholdMember[];
  readonly assignments: readonly HouseholdAssignmentRow[];
  readonly pets?: readonly PetOwnerRef[];
  readonly householdId: string;
  readonly actorUserId: string;
  readonly targetUserId?: string;
  readonly role?: AssignableMemberRole;
  readonly nowIsoTimestamp?: string;
}

export interface MembershipEventResult {
  readonly memberships: LegacyHouseholdMember[];
  readonly assignments: HouseholdAssignmentRow[];
  readonly audit: MembershipAuditEntry[];
  /** Solo en TRANSFER_OWNERSHIP: el hogar con su nuevo propietario. */
  readonly household?: { readonly id: string; readonly ownerUserId: string };
}

/** Sustituye una fila por su versión nueva (identidad por membershipId). */
function replaceRow(rows: readonly LegacyHouseholdMember[], row: LegacyHouseholdMember): LegacyHouseholdMember[] {
  return rows.map((r) => (r.membershipId === row.membershipId ? row : r));
}

/**
 * REQ-HOUSE2-002 (CHANGE_ROLE): solo un ADMIN o el propietario cambia roles. El propietario no cambia de rol ni se
 * le cambia el rol (INV-HOUSE2-001) y un no propietario no toca al propietario ni a sí mismo. Destino sin membresía
 * ACTIVE: ERR-HOUSE-MEMBERSHIP-NOT-FOUND.
 * @implements REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001
 */
export function changeMemberRole(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
  targetUserId: string,
  role: AssignableMemberRole,
  nowIsoTimestamp: string,
): { memberships: LegacyHouseholdMember[]; audit: MembershipAuditEntry } {
  const actor = requireActiveMembership(memberships, householdId, actorUserId);
  if (!isOwnerRow(actor) && actor.role !== 'ADMIN') {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `role: ${String(role)} no es un rol asignable.`, 'role');
  }
  const target = rowsOf(memberships, householdId, targetUserId).find((m) => m.status === 'ACTIVE');
  if (target === undefined) {
    throw new DomainError('ERR-HOUSE-MEMBERSHIP-NOT-FOUND', undefined, 'userId');
  }
  if (isOwnerRow(target) || (!isOwnerRow(actor) && targetUserId === actorUserId)) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'userId');
  }
  const changed: LegacyHouseholdMember = { ...target, role, updatedAt: nowIsoTimestamp };
  return {
    memberships: replaceRow(memberships as LegacyHouseholdMember[], changed),
    audit: { kind: 'ROLE_CHANGE', householdId, userId: targetUserId },
  };
}

/**
 * REQ-HOUSE2-002 (TRANSFER_OWNERSHIP) / INV-HOUSE2-001: solo el propietario transfiere; el destino debe ser ACTIVE.
 * El antiguo propietario pasa a ADMIN sin propiedad; el nuevo, a ADMIN con propiedad. Queda exactamente un propietario.
 * @implements REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001
 */
export function transferHouseholdOwnership(
  memberships: readonly LegacyHouseholdMember[],
  householdId: string,
  actorUserId: string,
  targetUserId: string,
  nowIsoTimestamp: string,
): { memberships: LegacyHouseholdMember[]; audit: MembershipAuditEntry; household: { id: string; ownerUserId: string } } {
  requireOwner(memberships, householdId, actorUserId);
  const target = rowsOf(memberships, householdId, targetUserId).find((m) => m.status === 'ACTIVE');
  if (target === undefined) {
    throw new DomainError('ERR-HOUSE-MEMBERSHIP-NOT-FOUND', undefined, 'userId');
  }
  if (targetUserId === actorUserId) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'userId');
  }
  const demoted: LegacyHouseholdMember = { ...requireOwner(memberships, householdId, actorUserId), role: 'ADMIN', isHouseholdOwner: false, updatedAt: nowIsoTimestamp };
  const promoted: LegacyHouseholdMember = { ...target, role: 'ADMIN', isHouseholdOwner: true, updatedAt: nowIsoTimestamp };
  let rows = replaceRow(memberships as LegacyHouseholdMember[], demoted);
  rows = replaceRow(rows, promoted);
  return {
    memberships: rows,
    audit: { kind: 'OWNERSHIP_TRANSFER', householdId, userId: targetUserId },
    household: { id: householdId, ownerUserId: targetUserId },
  };
}

/**
 * REQ-HOUSE2-003 / REQ-HOUSE2-002 (poda): al retirar a un miembro (REMOVE o LEAVE) se quitan solo las asignaciones
 * de las mascotas de las que él es Propietario Legal en ese hogar; cada una genera una fila UNASSIGN.
 * @implements REQ-HOUSE2-003, REQ-HOUSE2-002, INV-HOUSE-004
 */
export function pruneAssignmentsOf(
  assignments: readonly HouseholdAssignmentRow[],
  pets: readonly PetOwnerRef[],
  householdId: string,
  departingUserId: string,
): { assignments: HouseholdAssignmentRow[]; audit: MembershipAuditEntry[] } {
  const ownedHere = new Set(pets.filter((p) => p.ownerUserId === departingUserId).map((p) => p.id));
  const removed = assignments.filter((a) => a.householdId === householdId && ownedHere.has(a.petId));
  return {
    assignments: assignments.filter((a) => !removed.includes(a)),
    audit: removed.map((a) => ({ kind: 'UNASSIGN', householdId, petId: a.petId })),
  };
}

/**
 * Punto de entrada único de las transiciones de membresía de un hogar (STATE-HOUSE-MEMBERSHIP-001 + reglas 002).
 * Valida cada evento con las funciones de arriba y devuelve el estado nuevo sin efectos laterales.
 * @implements STATE-HOUSE-MEMBERSHIP-001, REQ-HOUSE2-002, REQ-HOUSE2-003, INV-HOUSE2-001, INV-HOUSE-004
 */
export function applyMembershipEvent(command: MembershipEventCommand): MembershipEventResult {
  const now = command.nowIsoTimestamp ?? NOW_FALLBACK;
  const { householdId, actorUserId, targetUserId } = command;
  const base = { memberships: [...command.memberships], assignments: [...command.assignments], audit: [] as MembershipAuditEntry[] };

  switch (command.event) {
    case 'ACCEPT': {
      const row = acceptInvitation(command.memberships, householdId, targetUserId!, now);
      return { ...base, memberships: replaceRow(command.memberships, row) };
    }
    case 'DECLINE': {
      const row = declineInvitation(command.memberships, householdId, targetUserId!, now);
      return { ...base, memberships: replaceRow(command.memberships, row) };
    }
    case 'LEAVE':
    case 'REMOVE': {
      const row = removeOrLeave(command.memberships, householdId, actorUserId, targetUserId!, now);
      const pruned = pruneAssignmentsOf(command.assignments, command.pets ?? [], householdId, row.userId);
      return { memberships: replaceRow(command.memberships, row), assignments: pruned.assignments, audit: pruned.audit };
    }
    case 'CHANGE_ROLE': {
      const out = changeMemberRole(command.memberships, householdId, actorUserId, targetUserId!, command.role!, now);
      return { ...base, memberships: out.memberships, audit: [out.audit] };
    }
    case 'TRANSFER_OWNERSHIP': {
      const out = transferHouseholdOwnership(command.memberships, householdId, actorUserId, targetUserId!, now);
      return { ...base, memberships: out.memberships, audit: [out.audit], household: out.household };
    }
    case 'DELETE_HOUSEHOLD': {
      const out = deleteHousehold([], command.memberships, householdId, actorUserId);
      return {
        memberships: out.memberships,
        assignments: command.assignments.filter((a) => a.householdId !== householdId),
        audit: [],
      };
    }
  }
}

/** Marca de tiempo solo para llamadas sin `nowIsoTimestamp` (pruebas de transición pura). Nunca reloj real. */
const NOW_FALLBACK = '1970-01-01T00:00:00.000Z';
