import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  STATE_HOUSE_MEMBERSHIP_001_EVENTS,
  STATE_HOUSE_MEMBERSHIP_001_STATES,
  validateHousehold,
  type Household,
  type PetProfile,
  type StateHouseMembership001Event,
  type StateHouseMembership001State,
  type UserPublicProfile,
} from '../../src/generated/index.ts';
import {
  acceptInvitation,
  activeMembersInOrder,
  createHousehold,
  declineInvitation,
  deleteHousehold,
  householdPets,
  householdView,
  inheritedFirstJoinedAt,
  inviteMember,
  isLegacyHouseholdMember,
  isOwnerRow,
  isVisibleState,
  nextMembershipState,
  ownerColorTokens,
  ownerTag,
  pendingInvitations,
  removeOrLeave,
  requireOwner,
} from '../../src/domain/households/household-policies.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';

const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));
const edge = (prefix: string) => fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId.startsWith(prefix));
const users: UserPublicProfile[] = fixtures.users;
const [andres, maria, carlos, lucia] = users as [UserPublicProfile, UserPublicProfile, UserPublicProfile, UserPublicProfile];
const usersById = new Map(users.map((u) => [u.id, u]));
const casa: Household = fixtures.household;
const H1 = casa.id;
const members: HouseholdMember[] = fixtures.householdMembers;
const pets: PetProfile[] = [...fixtures.validBackupEnvelopeV2.pets, ...fixtures.otherUserPets];
const NOW = '2026-11-05T12:00:00.000Z';
/** IDs de membresía con el mismo formato que los fixtures (…cccccccccc02). */
const mid = (n: number) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(2, '0').padStart(12, 'c')}`;

function catchDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}
const codeOf = (action: () => unknown) => {
  const e = catchDomainError(action);
  return [e.code, e.status];
};
const replace = (rows: readonly HouseholdMember[], row: HouseholdMember) =>
  rows.some((r) => r.membershipId === row.membershipId) ? rows.map((r) => (r.membershipId === row.membershipId ? row : r)) : [...rows, row];

type Expected = [StateHouseMembership001State, string];
/** Oráculo escrito a mano a partir de la y D-05, independiente del contrato generado. */
const MEMBERSHIP_TABLE: Partial<Record<StateHouseMembership001State, Partial<Record<StateHouseMembership001Event, Expected>>>> = {
  INVITED: { ACCEPT: ['ACTIVE', 'INVITEE'], DECLINE: ['DECLINED', 'INVITEE'], CANCEL: ['CANCELLED', 'HOUSEHOLD_OWNER | ADMIN'] },
  ACTIVE: {
    LEAVE: ['LEFT', 'SELF'],
    REMOVE: ['REMOVED', 'HOUSEHOLD_OWNER | ADMIN'],
    CHANGE_ROLE: ['ACTIVE', 'HOUSEHOLD_OWNER | ADMIN'],
    TRANSFER_OWNERSHIP: ['ACTIVE', 'HOUSEHOLD_OWNER'],
  },
  DECLINED: { INVITE: ['INVITED', 'HOUSEHOLD_OWNER | ADMIN'] },
  CANCELLED: { INVITE: ['INVITED', 'HOUSEHOLD_OWNER | ADMIN'] },
  LEFT: { INVITE: ['INVITED', 'HOUSEHOLD_OWNER | ADMIN'] },
  REMOVED: { INVITE: ['INVITED', 'HOUSEHOLD_OWNER | ADMIN'] },
};

describe('máquina STATE-HOUSE-MEMBERSHIP-001 (src/domain/households/household-policies.ts)', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001] las 11 transiciones válidas coinciden con el contrato y las 37 restantes se rechazan', () => {
    let valid = 0;
    let invalid = 0;
    for (const state of STATE_HOUSE_MEMBERSHIP_001_STATES) {
      for (const event of STATE_HOUSE_MEMBERSHIP_001_EVENTS) {
        const expected = MEMBERSHIP_TABLE[state]?.[event];
        if (expected === undefined) {
          expect(() => nextMembershipState(state, event)).toThrow(
            new RangeError(`STATE-HOUSE-MEMBERSHIP-001: el evento ${event} no está definido en el estado ${state}.`),
          );
          invalid += 1;
        } else {
          const t = nextMembershipState(state, event);
          expect([t.target, t.actor]).toEqual(expected);
          valid += 1;
        }
      }
    }
    expect([valid, invalid]).toEqual([11, 37]);
  });

  it('[INV-HOUSE-004][STATE-HOUSE-MEMBERSHIP-001] solo ACTIVE da visibilidad', () => {
    expect(STATE_HOUSE_MEMBERSHIP_001_STATES.filter(isVisibleState)).toEqual(['ACTIVE']);
  });
});

describe('crear hogar (REQ-HOUSE-001, INV-HOUSE-001)', () => {
  it('[REQ-HOUSE-001][INV-HOUSE2-001] el creador queda como único propietario, con rol ADMIN, en ACTIVE', () => {
    const { household, ownerMembership } = createHousehold({
      householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09',
      membershipId: mid(90),
      ownerUserId: lucia.id,
      input: { name: 'Casa Lucía' },
      nowIsoTimestamp: NOW,
    });
    expect(household).toEqual({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09', name: 'Casa Lucía', ownerUserId: lucia.id, createdAt: NOW });
    expect(ownerMembership).toEqual({
      membershipId: mid(90),
      householdId: household.id,
      userId: lucia.id,
      role: 'ADMIN',
      isHouseholdOwner: true,
      status: 'ACTIVE',
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: NOW,
      firstJoinedAt: NOW,
      updatedAt: NOW,
    });
    // La fila de dominio lleva invitedAt/invitedByUserId y no username: no es el HouseholdMember de la API (ese lo arma toMemberDto).
    expect([validateHousehold(household), isLegacyHouseholdMember(ownerMembership), isOwnerRow(ownerMembership)]).toEqual([true, true, true]);
  });

  it('[REQ-HOUSE-001] rechaza nombres vacíos, con espacios extremos, de más de 60 o campos extra', () => {
    const cases: Array<[unknown, string | null]> = [
      [{ name: '' }, 'name'],
      [{ name: ' Casa' }, 'name'],
      [{ name: 'x'.repeat(61) }, 'name'],
      [{ name: 'Casa', ownerUserId: maria.id }, 'ownerUserId'],
      [{}, 'name'],
      ['Casa', null],
    ];
    for (const [input, field] of cases) {
      const e = catchDomainError(() =>
        createHousehold({ householdId: H1, membershipId: mid(91), ownerUserId: lucia.id, input, nowIsoTimestamp: NOW }),
      );
      expect([e.code, e.field, e.detail.startsWith(`CreateHouseholdInput: ${field ?? '(raíz)'} `)]).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', field, true]);
    }
    const badClock = catchDomainError(() =>
      createHousehold({ householdId: H1, membershipId: mid(91), ownerUserId: lucia.id, input: { name: 'Casa' }, nowIsoTimestamp: '2026-11-05' }),
    );
    expect(badClock.field).toBe('createdAt');
  });
});

describe('invitar (REQ-HOUSE2-001, INV-HOUSE-002, INV-HOUSE-003)', () => {
  const invite = (actorUserId: string, invitee: { id: string } | null, rows = members) =>
    inviteMember({ memberships: rows, householdId: H1, actorUserId, invitee, membershipId: mid(4), nowIsoTimestamp: NOW });

  it('[REQ-HOUSE2-001][INV-HOUSE-003] el propietario invita a Lucía con roleOnJoin CAREGIVER: fila nueva INVITED con ese rol, sin firstJoinedAt', () => {
    const command = { memberships: members, householdId: H1, actorUserId: andres.id, invitee: lucia, membershipId: mid(4), nowIsoTimestamp: NOW, roleOnJoin: 'CAREGIVER' as const };
    const row = inviteMember(command);
    expect(row).toEqual({
      membershipId: mid(4),
      householdId: H1,
      userId: lucia.id,
      role: 'CAREGIVER',
      status: 'INVITED',
      invitedByUserId: andres.id,
      invitedAt: NOW,
      joinedAt: null,
      firstJoinedAt: null,
      updatedAt: NOW,
    });
    expect(isLegacyHouseholdMember(row)).toBe(true);
  });

  it('[INV-HOUSE-003][REQ-HOUSE2-001] no se duplica una membresía INVITED o ACTIVE: la invitación es uniforme y no tiene efecto (EDGE-016), sin error que enumere miembros', () => {
    expect(invite(andres.id, carlos)).toBeNull();
    expect(edge('EDGE-016').expectedError).toBe('ERR-HOUSE-MEMBER-ALREADY-EXISTS'); // el fixture 001 conserva el error retirado; la 002 responde 202 uniforme
    expect(invite(andres.id, maria)).toBeNull();
    expect(invite(andres.id, andres)).toBeNull();
  });

  it('[INV-HOUSE-003][INV-AUTH-006][REQ-HOUSE2-001] invitar a un username inexistente no tiene efecto ni error: indistinguible de un miembro existente', () => {
    expect(invite(andres.id, null)).toBeNull();
    expect(invite(andres.id, carlos)).toEqual(invite(andres.id, null));
  });

  it('[INV-HOUSE-002][ERR-HOUSE-NOT-FOUND] solo el OWNER invita: MEMBER recibe 403; INVITED o ajeno, 404', () => {
    expect(codeOf(() => invite(maria.id, lucia))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect([catchDomainError(() => invite(maria.id, lucia)).field, catchDomainError(() => invite(carlos.id, lucia)).field]).toEqual(['householdId', 'householdId']);
    const otherHouse = { ...members[0]!, membershipId: mid(60), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', userId: lucia.id };
    expect(codeOf(() => invite(lucia.id, carlos, [...members, otherHouse]))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
    expect(codeOf(() => invite(carlos.id, lucia))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
    expect(codeOf(() => invite(lucia.id, null))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
    expect(requireOwner(members, H1, andres.id)).toBe(members[0]);
  });

  it('[REQ-HOUSE2-001][INV-HOUSE-005] re-invitar a María crea una fila nueva y conserva firstJoinedAt y su color (EDGE-031)', () => {
    const steps = edge('EDGE-031');
    const removed = removeOrLeave(members, H1, andres.id, maria.id, steps.steps[0].at);
    expect([removed.membershipId, removed.status]).toEqual([mid(2), 'REMOVED']);
    let rows = replace(members, removed);
    const reinvited = inviteMember({ memberships: rows, householdId: H1, actorUserId: andres.id, invitee: maria, membershipId: mid(4), nowIsoTimestamp: steps.steps[1].at });
    expect([reinvited!.membershipId, reinvited!.status, reinvited!.firstJoinedAt, reinvited!.joinedAt]).toEqual([mid(4), 'INVITED', '2026-02-02T08:00:00.000Z', null]);
    rows = replace(rows, reinvited!);
    expect(rows.find((r) => r.membershipId === mid(2))?.status).toBe('REMOVED');
    const accepted = acceptInvitation(rows, H1, maria.id, steps.steps[2].at);
    expect([accepted.status, accepted.joinedAt, accepted.firstJoinedAt, accepted.updatedAt]).toEqual([
      'ACTIVE',
      '2026-11-05T12:20:00.000Z',
      '2026-02-02T08:00:00.000Z',
      '2026-11-05T12:20:00.000Z',
    ]);
    rows = replace(rows, accepted);
    expect(activeMembersInOrder(rows, H1).map((m) => m.userId)).toEqual(steps.expectedOwnerOrder);
    expect(ownerColorTokens(rows, H1).get(maria.id)).toBe(steps.expectedColorToken[maria.id]);
  });

  it('[REQ-HOUSE2-001][STATE-HOUSE-MEMBERSHIP-001] desde DECLINED, CANCELLED y LEFT el OWNER re-invita con fila nueva (D-05)', () => {
    const declined = replace(members, declineInvitation(members, H1, carlos.id, NOW));
    expect(invite(andres.id, carlos, declined)!.status).toBe('INVITED');
    const cancelled = replace(members, removeOrLeave(members, H1, andres.id, carlos.id, NOW));
    expect(cancelled.find((r) => r.userId === carlos.id)?.status).toBe('CANCELLED');
    expect(invite(andres.id, carlos, cancelled)!.membershipId).toBe(mid(4));
    const left = replace(members, removeOrLeave(members, H1, maria.id, maria.id, NOW));
    expect(left.find((r) => r.userId === maria.id)?.status).toBe('LEFT');
    expect(invite(andres.id, maria, left)!.firstJoinedAt).toBe('2026-02-02T08:00:00.000Z');
  });

  it('[INV-HOUSE-005] firstJoinedAt del par es el primero no nulo, en cualquier orden de filas', () => {
    const rows = [
      { ...members[1]!, membershipId: mid(7), status: 'LEFT' as const, firstJoinedAt: '2026-03-01T00:00:00.000Z' },
      members[1]!,
    ];
    expect(inheritedFirstJoinedAt(rows, H1, maria.id)).toBe('2026-02-02T08:00:00.000Z');
    expect(inheritedFirstJoinedAt(members, H1, carlos.id)).toBeNull();
    const withNullFirst = [{ ...members[2]!, userId: maria.id }, ...rows];
    expect(inheritedFirstJoinedAt(withNullFirst, H1, maria.id)).toBe('2026-02-02T08:00:00.000Z');
    const oldestFirst = [members[1]!, rows[0]!, { ...members[2]!, membershipId: mid(63), userId: maria.id }];
    expect(inheritedFirstJoinedAt(oldestFirst, H1, maria.id)).toBe('2026-02-02T08:00:00.000Z');
    const otherHouse = { ...members[1]!, membershipId: mid(61), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', firstJoinedAt: '2025-01-01T00:00:00.000Z' };
    expect(inheritedFirstJoinedAt([...members, otherHouse], H1, maria.id)).toBe('2026-02-02T08:00:00.000Z');
  });
});

describe('responder invitación (REQ-HOUSE-003)', () => {
  it('[REQ-HOUSE-003] Carlos acepta: INVITED a ACTIVE con joinedAt y firstJoinedAt = now', () => {
    expect(acceptInvitation(members, H1, carlos.id, NOW)).toEqual({ ...members[2], status: 'ACTIVE', joinedAt: NOW, firstJoinedAt: NOW, updatedAt: NOW });
  });

  it('[REQ-HOUSE-003] Carlos rechaza: INVITED a DECLINED sin joinedAt', () => {
    expect(declineInvitation(members, H1, carlos.id, NOW)).toEqual({ ...members[2], status: 'DECLINED', updatedAt: NOW });
  });

  it('[REQ-HOUSE-003][ERR-HOUSE-INVITATION-NOT-FOUND] aceptar o rechazar sin invitación INVITED es 404, nunca 403 (EDGE-026, EDGE-027)', () => {
    const accept = catchDomainError(() => acceptInvitation(members, H1, lucia.id, NOW));
    expect([accept.code, accept.status, accept.field]).toEqual([edge('EDGE-026').expectedError, edge('EDGE-026').expectedStatus, 'householdId']);
    const decline = catchDomainError(() => declineInvitation(members, H1, maria.id, NOW));
    expect([decline.code, decline.status]).toEqual([edge('EDGE-027').expectedError, edge('EDGE-027').expectedStatus]);
    expect(codeOf(() => acceptInvitation(members, H1, andres.id, NOW))).toEqual(['ERR-HOUSE-INVITATION-NOT-FOUND', 404]);
  });

  it('[REQ-HOUSE-003] pendingInvitations lista solo las INVITED del usuario, por invitedAt', () => {
    const second = { ...members[2]!, membershipId: mid(8), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', invitedAt: '2026-01-01T00:00:00.000Z' };
    expect(pendingInvitations([...members, second], carlos.id).map((m) => m.membershipId)).toEqual([mid(8), mid(3)]);
    const sameTime = { ...members[2]!, membershipId: mid(9), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb00' };
    expect(pendingInvitations([...members, sameTime], carlos.id).map((m) => m.membershipId)).toEqual([mid(9), mid(3)]);
    expect(pendingInvitations(members, maria.id)).toEqual([]);
  });
});

describe('gestionar membresías (REQ-HOUSE-004)', () => {
  it('[INV-HOUSE2-001][ERR-HOUSE-OWNER-CANNOT-LEAVE] el propietario del hogar no puede abandonarlo (EDGE-015)', () => {
    const e = catchDomainError(() => removeOrLeave(members, H1, andres.id, andres.id, NOW));
    expect([e.code, e.status, e.invariantRef, e.field]).toEqual([edge('EDGE-015').expectedError, 409, 'INV-HOUSE2-001', 'userId']);
  });

  it('[REQ-HOUSE-004] MEMBER abandona (LEFT); OWNER retira (REMOVED) y cancela invitaciones (CANCELLED)', () => {
    expect(removeOrLeave(members, H1, maria.id, maria.id, NOW)).toEqual({ ...members[1], status: 'LEFT', updatedAt: NOW });
    expect(removeOrLeave(members, H1, andres.id, maria.id, NOW)).toEqual({ ...members[1], status: 'REMOVED', updatedAt: NOW });
    expect(removeOrLeave(members, H1, andres.id, carlos.id, NOW)).toEqual({ ...members[2], status: 'CANCELLED', updatedAt: NOW });
  });

  it('[REQ-HOUSE-004][ERR-HOUSE-MEMBERSHIP-NOT-FOUND] retirar a quien no tiene membresía INVITED o ACTIVE es 404 (EDGE-025)', () => {
    const e = catchDomainError(() => removeOrLeave(members, H1, andres.id, lucia.id, NOW));
    expect([e.code, e.status, e.field]).toEqual([edge('EDGE-025').expectedError, 404, 'userId']);
    const removed = replace(members, removeOrLeave(members, H1, andres.id, maria.id, NOW));
    expect(codeOf(() => removeOrLeave(removed, H1, andres.id, maria.id, NOW))).toEqual(['ERR-HOUSE-MEMBERSHIP-NOT-FOUND', 404]);
  });

  it('[INV-HOUSE-002] un MEMBER no retira a otros (403); un INVITED o ajeno no ve el hogar (404)', () => {
    expect(codeOf(() => removeOrLeave(members, H1, maria.id, carlos.id, NOW))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect(codeOf(() => removeOrLeave(members, H1, maria.id, lucia.id, NOW))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect(codeOf(() => removeOrLeave(members, H1, carlos.id, carlos.id, NOW))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
    expect(codeOf(() => removeOrLeave(members, H1, lucia.id, maria.id, NOW))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001] un ADMIN no propietario expulsa a un CAREGIVER (REMOVED); un ADMIN no expulsa ni cancela al propietario (403), un READER tampoco', () => {
    const admin: HouseholdMember = { ...members[1]!, role: 'ADMIN' };
    const caregiver: HouseholdMember = { ...members[1]!, membershipId: mid(70), userId: lucia.id, role: 'CAREGIVER' };
    const owner: HouseholdMember = { ...members[0]!, role: 'ADMIN', isHouseholdOwner: true };
    const rows = [owner, admin, caregiver];
    expect(removeOrLeave(rows, H1, maria.id, lucia.id, NOW)).toEqual({ ...caregiver, status: 'REMOVED', updatedAt: NOW });
    expect(codeOf(() => removeOrLeave(rows, H1, maria.id, andres.id, NOW))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect(codeOf(() => removeOrLeave(rows, H1, lucia.id, andres.id, NOW))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    // El propietario sigue pudiendo expulsar a un ADMIN.
    expect(removeOrLeave(rows, H1, andres.id, maria.id, NOW)).toEqual({ ...admin, status: 'REMOVED', updatedAt: NOW });
  });

  it('[REQ-HOUSE-004][INV-HOUSE-002] solo el OWNER elimina el hogar; se borran sus membresías y nada más', () => {
    const other = { ...casa, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02' };
    const otherRow = { ...members[0]!, membershipId: mid(9), householdId: other.id };
    const result = deleteHousehold([casa, other], [...members, otherRow], H1, andres.id);
    expect(result).toEqual({ households: [other], memberships: [otherRow] });
    expect(codeOf(() => deleteHousehold([casa], members, H1, maria.id))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect(codeOf(() => deleteHousehold([casa], members, H1, carlos.id))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
  });
});

describe('visibilidad, color y vista de hogar (REQ-HOUSE-005, INV-HOUSE-004, INV-HOUSE-005)', () => {
  // Entrada 002 (REQ-MIG-001): OWNER 001 → ADMIN con isHouseholdOwner (propietario único); MEMBER 001 → READER.
  const entrada002: HouseholdMember[] = members.map((m): HouseholdMember =>
    m.role === 'OWNER' ? { ...m, role: 'ADMIN', isHouseholdOwner: true } : m.role === 'MEMBER' ? { ...m, role: 'READER' } : m,
  );

  it('[INV-HOUSE-004][ERR-HOUSE-NOT-FOUND] un INVITED no lee el hogar ni sus mascotas: 404 (EDGE-017, EDGE-037)', () => {
    const view = catchDomainError(() => householdView(casa, entrada002, usersById, carlos.id));
    expect([view.code, view.status, view.invariantRef]).toEqual([edge('EDGE-037').expectedError, 404, 'INV-HOUSE-004']);
    expect(codeOf(() => householdPets(H1, entrada002, pets, usersById, carlos.id))).toEqual([edge('EDGE-017').expectedError, 404]);
    expect(codeOf(() => householdView(casa, entrada002, usersById, lucia.id))).toEqual(['ERR-HOUSE-NOT-FOUND', 404]);
  });

  it('[INV-HOUSE-004] el OWNER ve también las INVITED en members; un MEMBER solo ve ACTIVE (EDGE-038, D-01)', () => {
    const expected = edge('EDGE-038').expectedResult;
    const forOwner = householdView(casa, entrada002, usersById, andres.id);
    const forMember = householdView(casa, entrada002, usersById, maria.id);
    expect(forOwner.members.map((m) => m.membership.status)).toEqual(expected.ownerAndrés);
    expect(forMember.members.map((m) => m.membership.status)).toEqual(expected.memberMaría);
    expect([forOwner.myRole, forMember.myRole]).toEqual(['ADMIN', 'READER']);
    expect(forOwner.members.map((m) => [m.user.id, m.colorToken])).toEqual([
      [andres.id, 'OWNER_COLOR_1'],
      [maria.id, 'OWNER_COLOR_2'],
      [carlos.id, null],
    ]);
    expect(forOwner.household).toBe(casa);
  });

  it('[INV-HOUSE-004] las INVITED que ve el OWNER se ordenan por invitedAt y userId', () => {
    const extra = { ...entrada002[2]!, membershipId: mid(5), userId: lucia.id, invitedAt: '2026-02-01T00:00:00.000Z' };
    const tie = { ...entrada002[2]!, membershipId: mid(6), userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa00' };
    const elsewhere = { ...entrada002[2]!, membershipId: mid(62), householdId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', userId: lucia.id };
    const view = householdView(casa, [...entrada002, extra, tie, elsewhere], new Map([...usersById, [tie.userId, { ...carlos, id: tie.userId }]]), andres.id);
    expect(view.members.map((m) => m.membership.membershipId)).toEqual([mid(1), mid(2), mid(5), mid(6), mid(3)]);
  });

  it('[REQ-HOUSE-005][INV-HOUSE-005][REQ-RBAC-001] mascotas por dueño (firstJoinedAt, userId) y luego por nombre, con color y permissions.editPetBasics', () => {
    const expected = fixtures.expectedHouseholdView;
    const forAndres = householdPets(H1, entrada002, pets, usersById, andres.id);
    expect(forAndres.map((e) => e.pet.id)).toEqual(expected.petOrder);
    // Andrés es ADMIN de H1 (REQ-MIG-001: OWNER 001 → ADMIN 002). La matriz REQ-RBAC-001 da «Editar datos básicos» = S
    // al Administrador de Hogar sobre las mascotas asignadas a H1, sea cual sea su dueño legal.
    expect(forAndres.map((e) => [e.owner.userId, e.owner.colorToken, e.permissions.editPetBasics])).toEqual(
      expected.petOrder.map((id: string) => {
        const owner = pets.find((p) => p.id === id)!.ownerUserId;
        return [owner, expected.ownerColorTokens[owner], true];
      }),
    );
    expect(forAndres[0]!.owner).toEqual({ userId: andres.id, displayName: 'Andrés', colorToken: 'OWNER_COLOR_1' });
    // María es READER en H1 (REQ-MIG-001: MEMBER 001 → READER 002). La matriz da «Editar datos básicos» = N a Lector,
    // salvo sobre sus propias mascotas (Propietario Legal = S): solo Luna.
    const forMaria = householdPets(H1, entrada002, pets, usersById, maria.id);
    expect(forMaria.filter((e) => e.permissions.editPetBasics).map((e) => e.pet.name)).toEqual(['Luna']);
  });

  it('[INV-HOUSE-005] el color da la vuelta cada 8 dueños y desempata por userId', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      ...entrada002[1]!,
      membershipId: mid(100 + i),
      userId: `dddddddd-dddd-4ddd-8ddd-${String(8 - i).padStart(12, '0')}`,
      firstJoinedAt: i < 2 ? '2026-01-01T00:00:00.000Z' : `2026-01-0${i}T00:00:00.000Z`,
    }));
    const tokens = ownerColorTokens(rows, H1);
    expect([...tokens.entries()].map(([u, t]) => [u.slice(-2), t])).toEqual([
      ['07', 'OWNER_COLOR_1'],
      ['08', 'OWNER_COLOR_2'],
      ['06', 'OWNER_COLOR_3'],
      ['05', 'OWNER_COLOR_4'],
      ['04', 'OWNER_COLOR_5'],
      ['03', 'OWNER_COLOR_6'],
      ['02', 'OWNER_COLOR_7'],
      ['01', 'OWNER_COLOR_8'],
      ['00', 'OWNER_COLOR_1'],
    ]);
    expect(ownerColorTokens(entrada002, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02').size).toBe(0);
  });

  it('[INV-HOUSE-005] fuera de un hogar colorToken es null (EDGE-030)', () => {
    expect(ownerTag(andres, null)).toEqual(edge('EDGE-030').expectedOwner);
    expect(ownerTag(lucia, ownerColorTokens(entrada002, H1)).colorToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Feature 002 · T237 (rojo): roles por membresía, propietario único, CHANGE_ROLE, TRANSFER_OWNERSHIP y poda.
// Firma SUPUESTA (no fijada por spec ni contrato; declarada en el informe de Keymaker):
//   applyMembershipEvent({ event, memberships, assignments, householdId, actorUserId, targetUserId, role })
//   → { memberships, assignments, audit, household } o DomainError.
// Se importa dinámicamente para que cada prueba falle por sí sola mientras el módulo no exporte la función.
// ---------------------------------------------------------------------------------------------------------------------
type MembershipRow = Record<string, unknown>;
type MembershipResult = {
  memberships: MembershipRow[];
  assignments: Array<{ petId: string; householdId: string }>;
  audit: Array<{ kind: string }>;
  household?: { id: string; ownerUserId: string };
};
type ApplyEvent = (input: Record<string, unknown>) => MembershipResult;
const applyMembershipEvent = async (input: Record<string, unknown>): Promise<MembershipResult> => {
  const mod = (await import('../../src/domain/households/household-policies.ts')) as unknown as { applyMembershipEvent: ApplyEvent };
  return mod.applyMembershipEvent(input);
};
/** Código y estado del DomainError lanzado; cualquier otro error se relanza (un TypeError por función ausente cuenta como fallo). */
async function failureOfEvent(input: Record<string, unknown>): Promise<[string, number]> {
  try {
    await applyMembershipEvent(input);
    return ['OK', 0];
  } catch (error) {
    if (error instanceof DomainError) return [error.code, error.status];
    throw error;
  }
}

const FX2 = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json'), 'utf8'));
const [ANA2, BRUNO2, CARLA2, DIEGO2, ELENA2] = (FX2.entities.users as Array<{ id: string }>).map((u) => u.id) as [string, string, string, string, string];
const HH2: string = FX2.entities.household.id;
const ROWS2: MembershipRow[] = FX2.entities.householdMembers;
const PET_TOBY2: string = FX2.entities.pets[0].id;
const P_CARLA = 'b0000000-0000-4000-8000-0000000000c1';
const base = (): MembershipRow[] => structuredClone(ROWS2);
const rowOf = (rows: MembershipRow[], userId: string) => rows.find((r) => r['userId'] === userId)!;
const ownersActive = (rows: MembershipRow[]) => rows.filter((r) => r['status'] === 'ACTIVE' && r['isHouseholdOwner'] === true);

describe('roles de hogar 002 (REQ-HOUSE2-001, REQ-HOUSE2-002, INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001) · T237', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001][REQ-HOUSE2-001] ACCEPT de una invitación con roleOnJoin CAREGIVER deja ACTIVE con ese rol y sin propiedad del hogar', async () => {
    const invited: MembershipRow = {
      membershipId: 'd0000000-0000-4000-8000-0000000000aa',
      householdId: HH2,
      userId: ELENA2,
      role: 'CAREGIVER',
      status: 'INVITED',
      isHouseholdOwner: false,
      invitedByUserId: ANA2,
    };
    const out = await applyMembershipEvent({ event: 'ACCEPT', memberships: [...base(), invited], assignments: [], householdId: HH2, actorUserId: ELENA2, targetUserId: ELENA2 });
    const row = out.memberships.find((m) => m['membershipId'] === invited['membershipId'])!;
    expect([row['status'], row['role'], row['isHouseholdOwner']]).toEqual(['ACTIVE', 'CAREGIVER', false]);
  });

  it('[STATE-HOUSE-MEMBERSHIP-001][REQ-HOUSE2-002] CHANGE_ROLE del propietario del hogar (ADMIN) cambia a Lector a Diego (READER→CAREGIVER) y registra una fila ROLE_CHANGE', async () => {
    const out = await applyMembershipEvent({ event: 'CHANGE_ROLE', memberships: base(), assignments: [], householdId: HH2, actorUserId: ANA2, targetUserId: DIEGO2, role: 'CAREGIVER' });
    expect([rowOf(out.memberships, DIEGO2)['role'], out.audit.map((a) => a.kind)]).toEqual(['CAREGIVER', ['ROLE_CHANGE']]);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001] un ADMIN que no es propietario no cambia el rol del propietario ni el suyo: ERR-ACC-FORBIDDEN 403', async () => {
    const toOwner = await failureOfEvent({ event: 'CHANGE_ROLE', memberships: base(), assignments: [], householdId: HH2, actorUserId: BRUNO2, targetUserId: ANA2, role: 'READER' });
    const toSelf = await failureOfEvent({ event: 'CHANGE_ROLE', memberships: base(), assignments: [], householdId: HH2, actorUserId: BRUNO2, targetUserId: BRUNO2, role: 'READER' });
    expect([toOwner, toSelf]).toEqual([
      ['ERR-ACC-FORBIDDEN', 403],
      ['ERR-ACC-FORBIDDEN', 403],
    ]);
  });

  it('[REQ-HOUSE2-002] CAREGIVER no cambia roles (403) y cambiar el rol de un miembro LEFT da ERR-HOUSE-MEMBERSHIP-NOT-FOUND (404)', async () => {
    const leftRows = [...base(), { membershipId: 'd0000000-0000-4000-8000-0000000000bb', householdId: HH2, userId: ELENA2, role: 'READER', status: 'LEFT', isHouseholdOwner: false }];
    const byCaregiver = await failureOfEvent({ event: 'CHANGE_ROLE', memberships: base(), assignments: [], householdId: HH2, actorUserId: CARLA2, targetUserId: DIEGO2, role: 'ADMIN' });
    const onLeft = await failureOfEvent({ event: 'CHANGE_ROLE', memberships: leftRows, assignments: [], householdId: HH2, actorUserId: ANA2, targetUserId: ELENA2, role: 'CAREGIVER' });
    expect([byCaregiver, onLeft]).toEqual([
      ['ERR-ACC-FORBIDDEN', 403],
      ['ERR-HOUSE-MEMBERSHIP-NOT-FOUND', 404],
    ]);
  });

  it('[INV-HOUSE2-001][REQ-HOUSE2-002] TRANSFER_OWNERSHIP solo lo ejecuta el propietario: el ADMIN recibe 403 y el propietario deja exactamente un propietario ACTIVE (ADMIN)', async () => {
    const byAdmin = await failureOfEvent({ event: 'TRANSFER_OWNERSHIP', memberships: base(), assignments: [], householdId: HH2, actorUserId: BRUNO2, targetUserId: CARLA2 });
    const out = await applyMembershipEvent({ event: 'TRANSFER_OWNERSHIP', memberships: base(), assignments: [], householdId: HH2, actorUserId: ANA2, targetUserId: CARLA2 });
    expect([
      byAdmin,
      ownersActive(out.memberships).map((r) => r['userId']),
      [rowOf(out.memberships, CARLA2)['role'], rowOf(out.memberships, ANA2)['role'], rowOf(out.memberships, ANA2)['isHouseholdOwner']],
      out.household?.ownerUserId,
      out.audit.map((a) => a.kind),
    ]).toEqual([['ERR-ACC-FORBIDDEN', 403], [CARLA2], ['ADMIN', 'ADMIN', false], CARLA2, ['OWNERSHIP_TRANSFER']]);
  });

  it('[REQ-HOUSE2-002][ERR-HOUSE-MEMBERSHIP-NOT-FOUND] TRANSFER_OWNERSHIP a quien no es miembro ACTIVE se rechaza sin cambiar el propietario', async () => {
    const outcome = await failureOfEvent({ event: 'TRANSFER_OWNERSHIP', memberships: base(), assignments: [], householdId: HH2, actorUserId: ANA2, targetUserId: ELENA2 });
    expect(outcome).toEqual(['ERR-HOUSE-MEMBERSHIP-NOT-FOUND', 404]);
  });

  it('[INV-HOUSE2-001][ERR-HOUSE-OWNER-CANNOT-LEAVE] el propietario del hogar no puede abandonarlo: 409 y la membresía sigue ACTIVE', async () => {
    const outcome = await failureOfEvent({ event: 'LEAVE', memberships: base(), assignments: [], householdId: HH2, actorUserId: ANA2, targetUserId: ANA2 });
    expect(outcome).toEqual(['ERR-HOUSE-OWNER-CANNOT-LEAVE', 409]);
  });

  it('[REQ-HOUSE2-002][REQ-HOUSE2-003] REMOVE de Carla retira solo las asignaciones de sus propias mascotas a ese hogar (UNASSIGN por fila) y conserva las de Toby', async () => {
    const assignments = [
      { petId: P_CARLA, householdId: HH2 },
      { petId: PET_TOBY2, householdId: HH2 },
    ];
    const out = await applyMembershipEvent({
      event: 'REMOVE',
      memberships: base(),
      assignments,
      pets: [
        { id: P_CARLA, ownerUserId: CARLA2 },
        { id: PET_TOBY2, ownerUserId: ANA2 },
      ],
      householdId: HH2,
      actorUserId: ANA2,
      targetUserId: CARLA2,
    });
    expect([rowOf(out.memberships, CARLA2)['status'], out.assignments, out.audit.map((a) => a.kind)]).toEqual([
      'REMOVED',
      [{ petId: PET_TOBY2, householdId: HH2 }],
      ['UNASSIGN'],
    ]);
  });

  it('[REQ-HOUSE2-002] solo el propietario elimina el hogar: un ADMIN recibe 403; el propietario borra membresías, invitaciones y asignaciones del hogar', async () => {
    const byAdmin = await failureOfEvent({ event: 'DELETE_HOUSEHOLD', memberships: base(), assignments: [{ petId: PET_TOBY2, householdId: HH2 }], householdId: HH2, actorUserId: BRUNO2 });
    const out = await applyMembershipEvent({ event: 'DELETE_HOUSEHOLD', memberships: base(), assignments: [{ petId: PET_TOBY2, householdId: HH2 }], householdId: HH2, actorUserId: ANA2 });
    expect([byAdmin, out.memberships.length, out.assignments.length]).toEqual([['ERR-ACC-FORBIDDEN', 403], 0, 0]);
  });
});
