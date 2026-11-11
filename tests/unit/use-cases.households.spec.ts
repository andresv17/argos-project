import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
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
  it('[REQ-HOUSE-001][INV-ARCH-002] Lucía crea un hogar: queda como OWNER ACTIVE con OWNER_COLOR_1 y los ids salen de IdGeneratorPort', async () => {
    const { deps, uow } = createHarness();
    const view = await new CreateHouseholdUseCase(deps).execute(LUCIA, { name: 'Casa Lucía' });
    const household = { id: generatedId(1), name: 'Casa Lucía', ownerUserId: LUCIA, createdAt: NOW };
    const owner: HouseholdMember = {
      membershipId: generatedId(2),
      householdId: household.id,
      userId: LUCIA,
      role: 'OWNER',
      status: 'ACTIVE',
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: NOW,
      firstJoinedAt: NOW,
      updatedAt: NOW,
    };
    expect(view).toEqual({ household, myRole: 'OWNER', members: [{ membership: owner, user: publicUser(LUCIA), colorToken: 'OWNER_COLOR_1' }] });
    expect([uow.snapshot().households.at(-1), uow.snapshot().memberships.at(-1)]).toEqual([household, owner]);
    expect(await outcome(new CreateHouseholdUseCase(deps).execute(LUCIA, { name: ' ' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@name');
  });

  it('[REQ-HOUSE2-001] el OWNER invita a "lucia.r" con rol: responde {received:true}, deja la fila INVITED sin color y guarda la invitación con roleOnJoin', async () => {
    const { deps, uow } = createHarness();
    const view = await new InviteMemberUseCase(deps).execute(ANDRES, H, { username: 'lucia.r', roleOnJoin: 'CAREGIVER' });
    const row: HouseholdMember = {
      membershipId: generatedId(1),
      householdId: H,
      userId: LUCIA,
      role: 'MEMBER',
      status: 'INVITED',
      invitedByUserId: ANDRES,
      invitedAt: NOW,
      joinedAt: null,
      firstJoinedAt: null,
      updatedAt: NOW,
    };
    expect(view).toEqual({ received: true });
    expect(uow.snapshot().memberships.at(-1)).toEqual(row);
    expect(uow.snapshot().invitations).toEqual([
      { invitationId: generatedId(2), householdId: H, inviteeUsername: 'lucia.r', inviteeUserId: LUCIA, roleOnJoin: 'CAREGIVER', invitedByUserId: ANDRES, status: 'INVITED', createdAt: NOW, respondedAt: null },
    ]);
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
    expect(after.invitations.map((i) => [i.inviteeUsername, i.inviteeUserId])).toEqual([['nadie', null]]);
    expect(after.rateEvents).toHaveLength(2);
  });

  it('[REQ-HOUSE-003] Carlos ve su invitación pendiente; al aceptarla queda ACTIVE con OWNER_COLOR_3 y ya ve el hogar', async () => {
    const { deps, uow } = createHarness();
    expect(await new ListMyInvitationsUseCase(deps).execute(CARLOS)).toEqual([{ household: HOUSEHOLD, invitedBy: publicUser(ANDRES), invitedAt: CARLOS_ROW.invitedAt }]);
    expect(await new ListMyInvitationsUseCase(deps).execute(LUCIA)).toEqual([]);
    const accepted = await new RespondInvitationUseCase(deps).execute(CARLOS, H, 'ACCEPT');
    const row = { ...CARLOS_ROW, status: 'ACTIVE', joinedAt: NOW, firstJoinedAt: NOW, updatedAt: NOW };
    expect(accepted).toEqual({ membership: row, user: publicUser(CARLOS), colorToken: 'OWNER_COLOR_3' });
    expect([rowsOf(uow.snapshot().memberships, CARLOS), (await new GetHouseholdUseCase(deps).execute(CARLOS, H)).myRole]).toEqual([['ACTIVE'], 'MEMBER']);
    expect(await new ListMyInvitationsUseCase(deps).execute(CARLOS)).toEqual([]);
  });

  it('[REQ-HOUSE-003] rechazar deja la fila en DECLINED con 204; sin invitación INVITED, aceptar o rechazar es 404 y nunca 403 (EDGE-026, EDGE-027)', async () => {
    const { deps, uow } = createHarness();
    const respond = new RespondInvitationUseCase(deps);
    expect(await respond.execute(CARLOS, H, 'DECLINE')).toBe(204);
    expect(rowsOf(uow.snapshot().memberships, CARLOS)).toEqual(['DECLINED']);
    expect(
      await Promise.all([
        outcome(respond.execute(CARLOS, H, 'ACCEPT')),
        outcome(respond.execute(LUCIA, H, 'DECLINE')),
        outcome(respond.execute(MARIA, H, 'ACCEPT')),
        outcome(respond.execute(ANDRES, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb99', 'ACCEPT')),
      ]),
    ).toEqual(Array(4).fill('ERR-HOUSE-INVITATION-NOT-FOUND@householdId'));
  });

  it('[REQ-HOUSE-004] María abandona (LEFT); el OWNER no puede abandonar (EDGE-015); el OWNER retira a María (REMOVED) y cancela a Carlos (CANCELLED)', async () => {
    const leaving = createHarness();
    expect(await new LeaveHouseholdUseCase(leaving.deps).execute(MARIA, H)).toBe(204);
    expect(rowsOf(leaving.uow.snapshot().memberships, MARIA)).toEqual(['LEFT']);
    expect(await outcome(new LeaveHouseholdUseCase(leaving.deps).execute(ANDRES, H))).toBe(`${edge('EDGE-015-').expectedError}@userId`);
    const { deps, uow } = createHarness();
    const remove = new RemoveMemberUseCase(deps);
    expect([await remove.execute(ANDRES, H, MARIA), await remove.execute(ANDRES, H, CARLOS)]).toEqual([204, 204]);
    expect([rowsOf(uow.snapshot().memberships, MARIA), rowsOf(uow.snapshot().memberships, CARLOS)]).toEqual([['REMOVED'], ['CANCELLED']]);
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

  it('[REQ-HOUSE-004] detalle del hogar: el OWNER ve también a Carlos (INVITED); María solo los ACTIVE; Carlos y Lucía reciben 404 (D-01)', async () => {
    const { deps } = createHarness();
    const get = new GetHouseholdUseCase(deps);
    const members = async (userId: string) => (await get.execute(userId, H)).members.map((m) => [m.membership.userId, m.membership.status, m.colorToken]);
    expect(await members(ANDRES)).toEqual([
      [ANDRES, 'ACTIVE', 'OWNER_COLOR_1'],
      [MARIA, 'ACTIVE', 'OWNER_COLOR_2'],
      [CARLOS, 'INVITED', null],
    ]);
    expect(await members(MARIA)).toEqual([
      [ANDRES, 'ACTIVE', 'OWNER_COLOR_1'],
      [MARIA, 'ACTIVE', 'OWNER_COLOR_2'],
    ]);
    expect([await outcome(get.execute(CARLOS, H)), await outcome(get.execute(LUCIA, H))]).toEqual(Array(2).fill('ERR-HOUSE-NOT-FOUND@householdId'));
  });

  it('[REQ-HOUSE-005] mascotas del hogar en el orden y con los colores de expectedHouseholdView; canEdit solo para el dueño; Carlos (INVITED) recibe 404 (EDGE-017)', async () => {
    const { deps } = createHarness();
    const pets = new GetHouseholdPetsUseCase(deps);
    const expected = fixtures.expectedHouseholdView;
    const forAndres = await pets.execute(ANDRES, H);
    expect(forAndres.household).toEqual(HOUSEHOLD);
    expect(forAndres.pets.map((p) => p.profile.id)).toEqual(expected.petOrder);
    expect(forAndres.pets.map((p) => [p.owner.colorToken, p.permissions.editPetBasics])).toEqual(
      expected.petOrder.map((id: string) => {
        const owner = ANDRES_PETS.some((p) => p.id === id) ? ANDRES : MARIA;
        return [expected.ownerColorTokens[owner], owner === ANDRES];
      }),
    );
    expect((await pets.execute(MARIA, H)).pets.map((p) => p.permissions.editPetBasics)).toEqual([false, false, false, false, false, true]);
    expect(forAndres.pets[0]!.latestWeightKg).toBe(32.85);
    expect([await outcome(pets.execute(CARLOS, H)), await outcome(pets.execute(LUCIA, H))]).toEqual(Array(2).fill(`${edge('EDGE-017-').expectedError}@householdId`));
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
      ['Casa Vallejo', 'OWNER'],
      ['Finca', 'OWNER'],
    ]);
    expect([(await list.execute(MARIA)).map((v) => v.household.name), await list.execute(CARLOS), await list.execute(LUCIA)]).toEqual([['Casa Vallejo'], [], []]);
  });

  it('[REQ-HOUSE2-001][REQ-HOUSE-005] EDGE-031: retirar y volver a invitar a María crea una fila nueva y, al aceptar, conserva firstJoinedAt y OWNER_COLOR_2', async () => {
    const { deps, uow } = createHarness();
    await new RemoveMemberUseCase(deps).execute(ANDRES, H, MARIA);
    expect(await new InviteMemberUseCase(deps).execute(ANDRES, H, { username: 'maria.v', roleOnJoin: 'READER' })).toEqual({ received: true });
    const invited = { membership: uow.snapshot().memberships.at(-1)! };
    const accepted = await new RespondInvitationUseCase(deps).execute(MARIA, H, 'ACCEPT');
    expect([invited.membership.membershipId, invited.membership.firstJoinedAt]).toEqual([generatedId(1), MARIA_ROW.firstJoinedAt]);
    expect(accepted).toEqual({
      membership: { ...invited.membership, status: 'ACTIVE', joinedAt: NOW, updatedAt: NOW },
      user: publicUser(MARIA),
      colorToken: 'OWNER_COLOR_2',
    });
    expect([rowsOf(uow.snapshot().memberships, MARIA), OWNER_ROW.status]).toEqual([['REMOVED', 'ACTIVE'], 'ACTIVE']);
  });
});
