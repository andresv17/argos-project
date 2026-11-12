import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import { GetPetDashboardUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import {
  CreateHouseholdUseCase,
  DeleteHouseholdUseCase,
  GetHouseholdPetsUseCase,
  GetHouseholdUseCase,
  InviteMemberUseCase,
  LeaveHouseholdUseCase,
  ListMyHouseholdsUseCase,
  ListMyInvitationsUseCase,
  RemoveMemberUseCase,
  RespondInvitationUseCase,
} from '../../src/application/use-cases/household-use-cases.ts';
import {
  ANDRES,
  ANDRES_PETS,
  CARLOS,
  HOUSEHOLD,
  LUCIA,
  MARIA,
  MEMBERSHIPS,
  USERS,
  canonicalState,
  createHarness,
  fixtures,
  generatedId,
} from '../fixtures/application-harness.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const H = HOUSEHOLD.id;
const [OWNER_ROW, MARIA_ROW, CARLOS_ROW] = MEMBERSHIPS as [HouseholdMember, HouseholdMember, HouseholdMember];
const publicUser = (id: string) => USERS.find((u) => u.id === id)!;
const edge = (prefix: string) => fixtures.invalidEdgeCases.find((c: { caseId: string }) => c.caseId.startsWith(prefix));

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}

const rowsOf = (memberships: readonly HouseholdMember[], userId: string) => memberships.filter((m) => m.householdId === H && m.userId === userId).map((m) => m.status);

describe('hogares (src/application/use-cases/household-use-cases.ts)', () => {
  it('[REQ-HOUSE-001][INV-ARCH-002] Lucía crea un hogar: queda como propietaria con rol ADMIN, ACTIVE, con OWNER_COLOR_1 y los ids salen de IdGeneratorPort', async () => {
    const { deps, uow } = createHarness();
    const view = await new CreateHouseholdUseCase(deps).execute(LUCIA, { name: 'Casa Lucía' });
    const household = { id: generatedId(1), name: 'Casa Lucía', ownerUserId: LUCIA, createdAt: NOW };
    const owner: HouseholdMember = {
      membershipId: generatedId(2),
      householdId: household.id,
      userId: LUCIA,
      role: 'ADMIN',
      isHouseholdOwner: true,
      status: 'ACTIVE',
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: NOW,
      firstJoinedAt: NOW,
      updatedAt: NOW,
    };
    const { invitedByUserId: _by, invitedAt: _at, ...ownerDto } = owner;
    expect(view).toEqual({
      household,
      myRole: 'ADMIN',
      isHouseholdOwner: true,
      members: [{ membership: { ...ownerDto, username: 'lucia.r', displayName: 'Lucía' }, colorToken: 'OWNER_COLOR_1' }],
      pendingInvitations: [],
    });
    expect([uow.snapshot().households.at(-1), uow.snapshot().memberships.at(-1)]).toEqual([household, owner]);
    expect(await outcome(new CreateHouseholdUseCase(deps).execute(LUCIA, { name: ' ' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@name');
  });

  it('[REQ-HOUSE2-001] el OWNER invita a "lucia.r" con rol: responde {received:true}, no escribe filas INVITED en household_members y guarda la invitación con roleOnJoin', async () => {
    const { deps, uow } = createHarness();
    const view = await new InviteMemberUseCase(deps).execute(ANDRES, H, { username: 'lucia.r', roleOnJoin: 'CAREGIVER' });
    expect(view).toEqual({ received: true });
    expect(uow.snapshot().memberships).toEqual(canonicalState().memberships);
    expect(uow.snapshot().memberships.filter((m) => m.status === 'INVITED')).toEqual([]);
    expect(uow.snapshot().invitations.at(-1)).toEqual({
      invitationId: generatedId(2),
      householdId: H,
      inviteeUsername: 'lucia.r',
      inviteeUserId: LUCIA,
      roleOnJoin: 'CAREGIVER',
      invitedByUserId: ANDRES,
      status: 'INVITED',
      createdAt: NOW,
      respondedAt: null,
    });
  });

  it('[REQ-HOUSE2-001] invitar: MEMBER 403, INVITED o ajeno 404 (antes de validar la entrada); username inexistente o ya invitado responden igual que uno nuevo (202), sin 404 ni 409', async () => {
    const { deps, uow } = createHarness();
    const invite = new InviteMemberUseCase(deps);
    expect(
      await Promise.all([
        outcome(invite.execute(MARIA, H, { username: 'lucia.r', roleOnJoin: 'READER' })),
        outcome(invite.execute(MARIA, H, {})),
        outcome(invite.execute(CARLOS, H, { username: 'lucia.r', roleOnJoin: 'READER' })),
        outcome(invite.execute(LUCIA, H, { username: 'maria.v', roleOnJoin: 'READER' })),
        outcome(invite.execute(ANDRES, H, { username: 'nadie', roleOnJoin: 'READER' })),
        outcome(invite.execute(ANDRES, H, { username: 'carlos_88', roleOnJoin: 'READER' })),
        outcome(invite.execute(ANDRES, H, { username: 'lucia.r', roleOnJoin: 'READER', role: 'OWNER' })),
        outcome(invite.execute(ANDRES, H, null)),
        outcome(invite.execute(ANDRES, H, { username: 5, roleOnJoin: 'READER' })),
        outcome(invite.execute(ANDRES, H, { username: 'lucia.r' })),
      ]),
    ).toEqual([
      'ERR-ACC-FORBIDDEN@householdId',
      'ERR-ACC-FORBIDDEN@householdId',
      'ERR-HOUSE-NOT-FOUND@householdId',
      'ERR-HOUSE-NOT-FOUND@householdId',
      'OK',
      'OK',
      'ERR-SCHEMA-VALIDATION-FAILED@role',
      'ERR-SCHEMA-VALIDATION-FAILED@null',
      'ERR-SCHEMA-VALIDATION-FAILED@username',
      'ERR-SCHEMA-VALIDATION-FAILED@roleOnJoin',
    ]);
    let message = '';
    try {
      await invite.execute(ANDRES, H, {});
    } catch (error) {
      message = (error as DomainError).message;
    }
    expect(message).toBe("[ERR-SCHEMA-VALIDATION-FAILED] InviteMemberInput: username must have required property 'username'.");
    const after = uow.snapshot();
    expect(after.memberships).toEqual(canonicalState().memberships);
    // La invitación de Carlos ya existía (no se duplica); solo se suma la inerte de 'nadie'.
    expect(after.invitations.map((i) => [i.inviteeUsername, i.inviteeUserId])).toEqual([['carlos_88', CARLOS], ['nadie', null]]);
    expect(after.rateEvents).toHaveLength(2);
  });

  it('[REQ-HOUSE-003][REQ-HOUSE2-001] Carlos ve su invitación pendiente con roleOnJoin CAREGIVER; al aceptarla queda ACTIVE con ese rol, con OWNER_COLOR_3 y ya ve el hogar', async () => {
    const { deps, uow } = createHarness();
    expect(await new ListMyInvitationsUseCase(deps).execute(CARLOS)).toEqual([{ household: HOUSEHOLD, invitedBy: publicUser(ANDRES), roleOnJoin: 'CAREGIVER', invitedAt: CARLOS_ROW.invitedAt }]);
    expect(await new ListMyInvitationsUseCase(deps).execute(LUCIA)).toEqual([]);
    const accepted = await new RespondInvitationUseCase(deps).execute(CARLOS, H, 'ACCEPT');
    const row = { membershipId: generatedId(1), householdId: H, userId: CARLOS, username: 'carlos_88', displayName: 'Carlos', role: 'CAREGIVER', isHouseholdOwner: false, status: 'ACTIVE', joinedAt: NOW, firstJoinedAt: NOW, updatedAt: NOW };
    expect(accepted).toEqual({ membership: row, colorToken: 'OWNER_COLOR_3' });
    expect([rowsOf(uow.snapshot().memberships, CARLOS), (await new GetHouseholdUseCase(deps).execute(CARLOS, H)).myRole]).toEqual([['ACTIVE'], 'CAREGIVER']);
    expect(uow.snapshot().invitations.map((i) => [i.inviteeUsername, i.status, i.respondedAt])).toEqual([['carlos_88', 'ACCEPTED', NOW]]);
    expect(await new ListMyInvitationsUseCase(deps).execute(CARLOS)).toEqual([]);
  });

  it('[REQ-HOUSE-003] rechazar deja la invitación en DECLINED con 204 y sin fila de membresía; sin invitación INVITED, aceptar o rechazar es 404 y nunca 403 (EDGE-026, EDGE-027)', async () => {
    const { deps, uow } = createHarness();
    const respond = new RespondInvitationUseCase(deps);
    expect(await respond.execute(CARLOS, H, 'DECLINE')).toBe(204);
    expect(rowsOf(uow.snapshot().memberships, CARLOS)).toEqual([]);
    expect(uow.snapshot().invitations.map((i) => [i.inviteeUsername, i.status, i.respondedAt])).toEqual([['carlos_88', 'DECLINED', NOW]]);
    expect(
      await Promise.all([
        outcome(respond.execute(CARLOS, H, 'ACCEPT')),
        outcome(respond.execute(LUCIA, H, 'DECLINE')),
        outcome(respond.execute(MARIA, H, 'ACCEPT')),
        outcome(respond.execute(ANDRES, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99', 'ACCEPT')),
      ]),
    ).toEqual(Array(4).fill('ERR-HOUSE-INVITATION-NOT-FOUND@householdId'));
  });

  it('[REQ-HOUSE-004] María abandona (LEFT); el OWNER no puede abandonar (EDGE-015); el OWNER retira a María (REMOVED) y cancela la invitación de Carlos (CANCELLED en household_invitations)', async () => {
    const leaving = createHarness();
    expect(await new LeaveHouseholdUseCase(leaving.deps).execute(MARIA, H)).toBe(204);
    expect(rowsOf(leaving.uow.snapshot().memberships, MARIA)).toEqual(['LEFT']);
    expect(await outcome(new LeaveHouseholdUseCase(leaving.deps).execute(ANDRES, H))).toBe(`${edge('EDGE-015-').expectedError}@userId`);
    const { deps, uow } = createHarness();
    const remove = new RemoveMemberUseCase(deps);
    expect([await remove.execute(ANDRES, H, MARIA), await remove.execute(ANDRES, H, CARLOS)]).toEqual([204, 204]);
    expect([rowsOf(uow.snapshot().memberships, MARIA), rowsOf(uow.snapshot().memberships, CARLOS)]).toEqual([['REMOVED'], []]);
    expect(uow.snapshot().invitations.map((i) => [i.inviteeUsername, i.status, i.respondedAt])).toEqual([['carlos_88', 'CANCELLED', NOW]]);
  });

  it('[REQ-HOUSE-004] retirar a quien no tiene membresía abierta es 404 ERR-HOUSE-MEMBERSHIP-NOT-FOUND; un MEMBER no retira (403) y un ajeno no ve el hogar (404)', async () => {
    const { deps, uow } = createHarness();
    const remove = new RemoveMemberUseCase(deps);
    expect(
      await Promise.all([outcome(remove.execute(ANDRES, H, LUCIA)), outcome(remove.execute(MARIA, H, CARLOS)), outcome(remove.execute(LUCIA, H, MARIA)), outcome(new LeaveHouseholdUseCase(deps).execute(CARLOS, H))]),
    ).toEqual(['ERR-HOUSE-MEMBERSHIP-NOT-FOUND@userId', 'ERR-ACC-FORBIDDEN@householdId', 'ERR-HOUSE-NOT-FOUND@householdId', 'ERR-HOUSE-NOT-FOUND@householdId']);
    expect(uow.snapshot()).toEqual(canonicalState());
  });

  it('[REQ-HOUSE-004] solo el OWNER elimina el hogar: se borran el hogar y sus membresías, no las mascotas', async () => {
    const { deps, uow } = createHarness();
    const remove = new DeleteHouseholdUseCase(deps);
    expect([await outcome(remove.execute(MARIA, H)), await outcome(remove.execute(CARLOS, H))]).toEqual(['ERR-ACC-FORBIDDEN@householdId', 'ERR-HOUSE-NOT-FOUND@householdId']);
    expect(await remove.execute(ANDRES, H)).toBe(204);
    const state = uow.snapshot();
    expect([state.households, state.memberships, state.pets]).toEqual([[], [], canonicalState().pets]);
    expect(await outcome(new GetHouseholdUseCase(deps).execute(ANDRES, H))).toBe('ERR-HOUSE-NOT-FOUND@householdId');
  });

  it('[REQ-HOUSE-004] detalle del hogar: el OWNER ve solo ACTIVE en members y a Carlos en pendingInvitations; María no ve invitaciones; Carlos y Lucía reciben 404 (D-01)', async () => {
    const { deps } = createHarness();
    const get = new GetHouseholdUseCase(deps);
    const members = async (userId: string) => (await get.execute(userId, H)).members.map((m) => [m.membership.userId, m.membership.status, m.colorToken]);
    expect(await members(ANDRES)).toEqual([
      [ANDRES, 'ACTIVE', 'OWNER_COLOR_1'],
      [MARIA, 'ACTIVE', 'OWNER_COLOR_2'],
    ]);
    expect((await get.execute(ANDRES, H)).pendingInvitations.map((i) => [i.inviteeUsername, i.roleOnJoin, i.status])).toEqual([['carlos_88', 'CAREGIVER', 'INVITED']]);
    expect(await members(MARIA)).toEqual([
      [ANDRES, 'ACTIVE', 'OWNER_COLOR_1'],
      [MARIA, 'ACTIVE', 'OWNER_COLOR_2'],
    ]);
    expect((await get.execute(MARIA, H)).pendingInvitations).toEqual([]);
    expect([await outcome(get.execute(CARLOS, H)), await outcome(get.execute(LUCIA, H))]).toEqual(Array(2).fill('ERR-HOUSE-NOT-FOUND@householdId'));
  });

  it('[REQ-HOUSE-005] mascotas del hogar en el orden y con los colores de expectedHouseholdView; editPetBasics: Andrés (ADMIN del hogar) true en las 6, María solo en su propia mascota; Carlos (INVITED) recibe 404 (EDGE-017)', async () => {
    const { deps } = createHarness();
    const pets = new GetHouseholdPetsUseCase(deps);
    const expected = fixtures.expectedHouseholdView;
    const forAndres = await pets.execute(ANDRES, H);
    expect(forAndres.household).toEqual(HOUSEHOLD);
    expect(forAndres.pets.map((p) => p.profile.id)).toEqual(expected.petOrder);
    expect(forAndres.pets.map((p) => [p.owner.colorToken, p.permissions.editPetBasics])).toEqual(
      expected.petOrder.map((id: string) => {
        const owner = ANDRES_PETS.some((p) => p.id === id) ? ANDRES : MARIA;
        return [expected.ownerColorTokens[owner], true];
      }),
    );
    expect((await pets.execute(MARIA, H)).pets.map((p) => p.permissions.editPetBasics)).toEqual([false, false, false, false, false, true]);
    expect(forAndres.pets[0]!.latestWeightKg).toBe(32.85);
    expect([await outcome(pets.execute(CARLOS, H)), await outcome(pets.execute(LUCIA, H))]).toEqual(Array(2).fill(`${edge('EDGE-017-').expectedError}@householdId`));
  });

  it.each(['READER', 'CAREGIVER'] as const)('[REQ-HOUSE-005][REQ-RBAC-001] un miembro %s del hogar recibe editPetBasics false en las 6 mascotas ajenas', async (role) => {
    const state = canonicalState();
    state.invitations = state.invitations.map((i) => (i.inviteeUsername === 'carlos_88' ? { ...i, roleOnJoin: role } : i));
    const { deps } = createHarness(state);
    await new RespondInvitationUseCase(deps).execute(CARLOS, H, 'ACCEPT');
    const view = await new GetHouseholdPetsUseCase(deps).execute(CARLOS, H);
    expect([view.pets.length, view.pets.map((p) => p.permissions.editPetBasics), view.pets.map((p) => p.myRole)]).toEqual([6, Array(6).fill(false), Array(6).fill(role)]);
  });

  it('[REQ-HOUSE2-004][INV-ACC2-001][ERR-PET-NOT-FOUND] H-T247-1: la vista del hogar lista SOLO las mascotas asignadas; tras desasignar Argos, María no la ve en el hogar y su ficha da 404 (coherente)', async () => {
    const state = canonicalState();
    const argos = ANDRES_PETS.find((p) => p.name === 'Argos')!;
    state.assignments = state.assignments.filter((a) => !(a.petId === argos.id && a.householdId === H));
    const { deps } = createHarness(state);
    const names = async (userId: string) => (await new GetHouseholdPetsUseCase(deps).execute(userId, H)).pets.map((p) => p.profile.name);
    expect([await names(MARIA), await names(ANDRES)]).toEqual([
      ['Kira', 'Milo', 'Nyx', 'Toby', 'Luna'],
      ['Kira', 'Milo', 'Nyx', 'Toby', 'Luna'],
    ]);
    expect(await outcome(new GetPetDashboardUseCase(deps).execute(MARIA, argos.id))).toBe('ERR-PET-NOT-FOUND@petId');
    expect(await outcome(new GetPetDashboardUseCase(deps).execute(ANDRES, argos.id))).toBe('OK');
  });

  it('[REQ-PET-005][REQ-HOUSE-005] DEUDA-UI-FILTRO-001: el filtro del hogar conserva orden y colores; un no miembro recibe 404 aunque el filtro no deje nada', async () => {
    const { deps } = createHarness();
    const pets = new GetHouseholdPetsUseCase(deps);
    const view = async (query: { q?: string; species?: 'CANINE' | 'FELINE' }) => (await pets.execute(MARIA, H, query as never)).pets.map((p) => [p.profile.name, p.owner.colorToken, p.permissions.editPetBasics]);
    expect([await view({ q: '  ARGOS ' }), await view({ species: 'FELINE' }), await view({ q: 'o', species: 'CANINE' }), await view({ q: 'zz' }), await view({})]).toEqual([
      [['Argos', 'OWNER_COLOR_1', false]],
      [['Milo', 'OWNER_COLOR_1', false], ['Nyx', 'OWNER_COLOR_1', false], ['Luna', 'OWNER_COLOR_2', true]],
      [['Argos', 'OWNER_COLOR_1', false], ['Toby', 'OWNER_COLOR_1', false]],
      [],
      [['Argos', 'OWNER_COLOR_1', false], ['Kira', 'OWNER_COLOR_1', false], ['Milo', 'OWNER_COLOR_1', false], ['Nyx', 'OWNER_COLOR_1', false], ['Toby', 'OWNER_COLOR_1', false], ['Luna', 'OWNER_COLOR_2', true]],
    ]);
    expect([await outcome(pets.execute(CARLOS, H, { q: 'zz' })), await outcome(pets.execute(LUCIA, H, { species: 'FELINE' } as never))]).toEqual(Array(2).fill('ERR-HOUSE-NOT-FOUND@householdId'));
  });

  it('[REQ-HOUSE-005] Mis hogares se ordenan por createdAt del hogar y luego id, aunque el repositorio los devuelva en otro orden', async () => {
    const state = canonicalState();
    const extra = (id: string, name: string, createdAt: string) => {
      state.households.push({ id, name, ownerUserId: ANDRES, createdAt });
      state.memberships.push({ ...OWNER_ROW, membershipId: id.replace('bbbbbbbb-bbbb-4bbb-8bbb', 'cccccccc-cccc-4ccc-8ccc'), householdId: id });
    };
    extra('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09', 'Z mismo día', '2026-01-15T00:00:00.000Z');
    extra('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', 'A mismo día', '2026-01-15T00:00:00.000Z');
    const { deps } = createHarness(state);
    expect((await new ListMyHouseholdsUseCase(deps).execute(ANDRES)).map((v) => v.household.name)).toEqual(['A mismo día', 'Z mismo día', 'Casa Vallejo']);
  });

  it('[REQ-HOUSE-005] Mis hogares: solo los ACTIVE del usuario, ordenados por createdAt del hogar', async () => {
    const { deps, clock } = createHarness();
    clock.setClock('2026-11-05', '2026-11-05T13:00:00.000Z');
    await new CreateHouseholdUseCase(deps).execute(ANDRES, { name: 'Finca' });
    const list = new ListMyHouseholdsUseCase(deps);
    expect((await list.execute(ANDRES)).map((v) => [v.household.name, v.myRole])).toEqual([
      ['Casa Vallejo', 'ADMIN'],
      ['Finca', 'ADMIN'],
    ]);
    expect([(await list.execute(MARIA)).map((v) => v.household.name), await list.execute(CARLOS), await list.execute(LUCIA)]).toEqual([['Casa Vallejo'], [], []]);
  });

  it('[REQ-HOUSE2-001][REQ-HOUSE-005] EDGE-031: retirar y volver a invitar a María crea una fila nueva y, al aceptar, conserva firstJoinedAt y OWNER_COLOR_2', async () => {
    const { deps, uow } = createHarness();
    await new RemoveMemberUseCase(deps).execute(ANDRES, H, MARIA);
    expect(await new InviteMemberUseCase(deps).execute(ANDRES, H, { username: 'maria.v', roleOnJoin: 'READER' })).toEqual({ received: true });
    expect(uow.snapshot().invitations.at(-1)).toMatchObject({ inviteeUsername: 'maria.v', roleOnJoin: 'READER', status: 'INVITED' });
    const accepted = await new RespondInvitationUseCase(deps).execute(MARIA, H, 'ACCEPT');
    expect(accepted).toEqual({
      membership: {
        membershipId: generatedId(3),
        householdId: H,
        userId: MARIA,
        username: 'maria.v',
        displayName: 'María',
        role: 'READER',
        isHouseholdOwner: false,
        status: 'ACTIVE',
        joinedAt: NOW,
        firstJoinedAt: MARIA_ROW.firstJoinedAt,
        updatedAt: NOW,
      },
      colorToken: 'OWNER_COLOR_2',
    });
    expect([rowsOf(uow.snapshot().memberships, MARIA), OWNER_ROW.status]).toEqual([['REMOVED', 'ACTIVE'], 'ACTIVE']);
  });
});

// Feature 002 · T237 (rojo): casos de uso de cambio de rol y transferencia de propiedad del hogar.
// Nombres de clase SUPUESTOS (la spec no los fija): ChangeMemberRoleUseCase y TransferHouseholdOwnershipUseCase,
// con execute(actorUserId, householdId, { userId, role }) y execute(actorUserId, householdId, { targetUserId }), como InviteMemberUseCase.
// Se cargan con import() para que el resto del archivo (001) siga compilando y ejecutándose.
type UseCaseCtor = new (deps: unknown) => { execute(actorUserId: string, householdId: string, input: Record<string, unknown>): Promise<unknown> };
const loadUseCase = async (name: string): Promise<UseCaseCtor> => {
  const mod = (await import('../../src/application/use-cases/household-use-cases.ts')) as unknown as Record<string, UseCaseCtor | undefined>;
  const ctor = mod[name];
  if (ctor === undefined) throw new TypeError(`${name} no está exportado por household-use-cases.ts`);
  return ctor;
};
async function codeAndStatus(promise: Promise<unknown>): Promise<[string, number] | 'OK'> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return [error.code, error.status];
    throw error;
  }
}

describe('hogares 002: cambio de rol y transferencia de propiedad en casos de uso (T237)', () => {
  it('[REQ-HOUSE2-002][STATE-HOUSE-MEMBERSHIP-001] ChangeMemberRoleUseCase: el propietario cambia a María a CAREGIVER y la membresía guarda ese rol', async () => {
    const { deps, uow } = createHarness();
    const ChangeMemberRole = await loadUseCase('ChangeMemberRoleUseCase');
    await new ChangeMemberRole(deps).execute(ANDRES, H, { userId: MARIA, role: 'CAREGIVER' });
    const row = uow.snapshot().memberships.find((m) => m.householdId === H && m.userId === MARIA) as unknown as Record<string, unknown>;
    expect(row['role']).toBe('CAREGIVER');
  });

  it('[REQ-HOUSE2-002][ERR-ACC-FORBIDDEN] ChangeMemberRoleUseCase: un miembro sin rol de administración recibe 403 y el rol de Carlos no cambia', async () => {
    const { deps, uow } = createHarness();
    const ChangeMemberRole = await loadUseCase('ChangeMemberRoleUseCase');
    const before = JSON.stringify(uow.snapshot().memberships);
    const outcome = await codeAndStatus(new ChangeMemberRole(deps).execute(MARIA, H, { userId: CARLOS, role: 'ADMIN' }));
    expect([outcome, JSON.stringify(uow.snapshot().memberships) === before]).toEqual([['ERR-ACC-FORBIDDEN', 403], true]);
  });

  it('[INV-HOUSE2-001][REQ-HOUSE2-002] TransferHouseholdOwnershipUseCase: el propietario transfiere el hogar a María y el hogar guarda la nueva propiedad', async () => {
    const { deps, uow } = createHarness();
    const Transfer = await loadUseCase('TransferHouseholdOwnershipUseCase');
    await new Transfer(deps).execute(ANDRES, H, { targetUserId: MARIA });
    const household = uow.snapshot().households.find((h) => h.id === H);
    expect(household?.ownerUserId).toBe(MARIA);
  });

  it('[INV-HOUSE2-001][ERR-ACC-FORBIDDEN] TransferHouseholdOwnershipUseCase: María, que no es propietaria, no puede transferir: 403 y el propietario no cambia', async () => {
    const { deps, uow } = createHarness();
    const Transfer = await loadUseCase('TransferHouseholdOwnershipUseCase');
    const outcome = await codeAndStatus(new Transfer(deps).execute(MARIA, H, { targetUserId: MARIA }));
    expect([outcome, uow.snapshot().households.find((h) => h.id === H)?.ownerUserId]).toEqual([['ERR-ACC-FORBIDDEN', 403], ANDRES]);
  });
});

describe('hogares 002: expulsión y cancelación por ADMIN en casos de uso (T246, REQ-HOUSE2-002)', () => {
  /** María pasa a ADMIN (no propietaria) y Lucía entra como CAREGIVER ACTIVE; Carlos conserva su invitación. */
  const withAdminMaria = () => {
    const state = canonicalState();
    state.memberships = state.memberships.map((m) => (m.userId === MARIA ? { ...m, role: 'ADMIN' as const } : m));
    state.memberships.push({ ...MARIA_ROW, membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc09', userId: LUCIA, role: 'CAREGIVER' });
    return createHarness(state);
  };

  it('[REQ-HOUSE2-002] un ADMIN no propietario expulsa a un CAREGIVER (REMOVED, 204) y cancela la invitación de Carlos (CANCELLED)', async () => {
    const { deps, uow } = withAdminMaria();
    const remove = new RemoveMemberUseCase(deps);
    expect([await remove.execute(MARIA, H, LUCIA), await remove.execute(MARIA, H, CARLOS)]).toEqual([204, 204]);
    expect(rowsOf(uow.snapshot().memberships, LUCIA)).toEqual(['REMOVED']);
    expect(uow.snapshot().invitations.map((i) => [i.inviteeUsername, i.status])).toEqual([['carlos_88', 'CANCELLED']]);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001] un ADMIN que intenta expulsar al propietario recibe ERR-ACC-FORBIDDEN 403 y nada cambia; un CAREGIVER tampoco expulsa', async () => {
    const { deps, uow } = withAdminMaria();
    const before = JSON.stringify(uow.snapshot());
    const remove = new RemoveMemberUseCase(deps);
    expect([await codeAndStatus(remove.execute(MARIA, H, ANDRES)), await codeAndStatus(remove.execute(LUCIA, H, MARIA))]).toEqual([
      ['ERR-ACC-FORBIDDEN', 403],
      ['ERR-ACC-FORBIDDEN', 403],
    ]);
    expect(JSON.stringify(uow.snapshot())).toBe(before);
  });
});
