import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type StateHouseMembership001State as MembershipStatus } from '../../src/generated/index.ts';
import {
  assertCanWrite,
  canRead,
  canWrite,
  type AccessMembership,
} from '../../src/domain/access/access-policy.ts';

const PROPERTY_SEED = 20261105;
const USERS = ['u1', 'u2', 'u3', 'u4'] as const;
const HOUSEHOLDS = ['h1', 'h2', 'h3'] as const;
const STATUSES: MembershipStatus[] = ['INVITED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'LEFT', 'REMOVED'];

const membershipArb = fc.record({
  userId: fc.constantFrom(...USERS),
  householdId: fc.constantFrom(...HOUSEHOLDS),
  status: fc.constantFrom(...STATUSES),
});
const scenarioArb = fc.record({
  user: fc.constantFrom(...USERS),
  owner: fc.constantFrom(...USERS),
  memberships: fc.array(membershipArb, { maxLength: 12 }),
});

/** Oráculo independiente: recorre cada hogar y comprueba las dos membresías ACTIVE. */
function oracleCanRead(user: string, owner: string, memberships: readonly AccessMembership[]): boolean {
  if (user === owner) return true;
  return HOUSEHOLDS.some(
    (h) =>
      memberships.some((m) => m.householdId === h && m.userId === user && m.status === 'ACTIVE') &&
      memberships.some((m) => m.householdId === h && m.userId === owner && m.status === 'ACTIVE'),
  );
}

function writeOutcome(user: string, owner: string, memberships: readonly AccessMembership[]): string {
  try {
    assertCanWrite({ id: user }, { id: 'p1', ownerUserId: owner }, memberships);
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe('propiedades de la política de acceso', () => {
  it('[INV-ACC-001] canRead coincide con el oráculo para cualquier combinación generada y no depende del orden', () => {
    fc.assert(
      fc.property(scenarioArb, ({ user, owner, memberships }) => {
        const pet = { id: 'p1', ownerUserId: owner };
        const expected = oracleCanRead(user, owner, memberships);
        expect(canRead({ id: user }, pet, memberships)).toBe(expected);
        expect(canRead({ id: user }, pet, [...memberships].reverse())).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-ACC-002][ERR-ACC-FORBIDDEN] canWrite solo para el dueño; el error depende de si puede leer', () => {
    fc.assert(
      fc.property(scenarioArb, ({ user, owner, memberships }) => {
        const pet = { id: 'p1', ownerUserId: owner };
        expect(canWrite({ id: user }, pet)).toBe(user === owner);
        const readable = oracleCanRead(user, owner, memberships);
        const expected = user === owner ? 'OK' : readable ? 'ERR-ACC-FORBIDDEN' : 'ERR-PET-NOT-FOUND';
        expect(writeOutcome(user, owner, memberships)).toBe(expected);
        if (canWrite({ id: user }, pet)) {
          expect(canRead({ id: user }, pet, memberships)).toBe(true);
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });
});

// ---------------------------------------------------------------------------
// 002: rol efectivo, visibilidad por asignación y matriz can(rol, acción)
// (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, SC-003). Cargas dinámicas por caso: fallan por separado
// mientras src/domain/access/effective-role.ts y src/domain/access/rbac.ts no existan.
// Firma supuesta: effectiveRole(usuario, mascota, membresías con rol, asignaciones mascota-hogar).
// ---------------------------------------------------------------------------

type Role002 = 'OWNER' | 'ADMIN' | 'CAREGIVER' | 'READER';
type MemberRole002 = Exclude<Role002, 'OWNER'>;
type Action002 =
  | 'EDIT_PET_BASICS'
  | 'DELETE_PET'
  | 'WRITE_HEALTH_EVENTS'
  | 'DELETE_HEALTH_EVENTS'
  | 'WRITE_WEIGHTS_AND_MEASUREMENTS'
  | 'WRITE_APPOINTMENTS_AND_PARAMETERS'
  | 'DELETE_OTHER_RECORDS'
  | 'MANAGE_HOUSEHOLD_MEMBERS'
  | 'TRANSFER_PET_OWNERSHIP'
  | 'ASSIGN_PET_TO_HOUSEHOLDS'
  | 'EXPORT_IMPORT_BACKUP';
interface Membership002 {
  userId: string;
  householdId: string;
  status: string;
  role: MemberRole002;
}
interface Assignment002 {
  petId: string;
  householdId: string;
}
type EffectiveRoleFn = (
  user: { id: string },
  pet: { id: string; ownerUserId: string },
  memberships: readonly Membership002[],
  assignments: readonly Assignment002[],
) => Role002 | null;
type CanFn = (role: Role002, action: Action002) => boolean;

const ACTIONS002: readonly Action002[] = [
  'EDIT_PET_BASICS',
  'DELETE_PET',
  'WRITE_HEALTH_EVENTS',
  'DELETE_HEALTH_EVENTS',
  'WRITE_WEIGHTS_AND_MEASUREMENTS',
  'WRITE_APPOINTMENTS_AND_PARAMETERS',
  'DELETE_OTHER_RECORDS',
  'MANAGE_HOUSEHOLD_MEMBERS',
  'TRANSFER_PET_OWNERSHIP',
  'ASSIGN_PET_TO_HOUSEHOLDS',
  'EXPORT_IMPORT_BACKUP',
];
const MEMBER_ROLES002: MemberRole002[] = ['ADMIN', 'CAREGIVER', 'READER'];
const PETS002 = ['p1', 'p2'] as const;
const RANK002: Record<MemberRole002, number> = { READER: 1, CAREGIVER: 2, ADMIN: 3 };
const LADDER002: readonly Role002[] = ['READER', 'CAREGIVER', 'ADMIN', 'OWNER'];

const membership002Arb = fc.record({
  userId: fc.constantFrom(...USERS),
  householdId: fc.constantFrom(...HOUSEHOLDS),
  status: fc.constantFrom(...STATUSES),
  role: fc.constantFrom(...MEMBER_ROLES002),
});
const assignment002Arb = fc.record({
  petId: fc.constantFrom(...PETS002),
  householdId: fc.constantFrom(...HOUSEHOLDS),
});
const scenario002Arb = fc.record({
  user: fc.constantFrom(...USERS),
  owner: fc.constantFrom(...USERS),
  memberships: fc.array(membership002Arb, { maxLength: 12 }),
  assignments: fc.array(assignment002Arb, { maxLength: 8 }),
});

/** Oráculo independiente del rol efectivo: dueño primero; si no, el mayor rol ACTIVE en hogares con p1 asignada. */
function oracleRole002(
  user: string,
  owner: string,
  memberships: readonly Membership002[],
  assignments: readonly Assignment002[],
): Role002 | null {
  if (user === owner) return 'OWNER';
  let best: MemberRole002 | null = null;
  for (const m of memberships) {
    if (m.userId !== user || m.status !== 'ACTIVE') continue;
    const assigned = assignments.some((a) => a.petId === 'p1' && a.householdId === m.householdId);
    if (assigned && (best === null || RANK002[m.role] > RANK002[best])) best = m.role;
  }
  return best;
}

/** Oráculo independiente de visibilidad (INV-ACC2-001): dueño, o ACTIVE en un hogar con p1 asignada. */
function oracleVisible002(
  user: string,
  owner: string,
  memberships: readonly Membership002[],
  assignments: readonly Assignment002[],
): boolean {
  if (user === owner) return true;
  return assignments.some(
    (a) =>
      a.petId === 'p1' &&
      memberships.some((m) => m.userId === user && m.status === 'ACTIVE' && m.householdId === a.householdId),
  );
}

const loadEffectiveRole002 = async (): Promise<EffectiveRoleFn> =>
  (await import('../../src/domain/access/effective-role.ts')).effectiveRole as EffectiveRoleFn;
const loadCan002 = async (): Promise<CanFn> => (await import('../../src/domain/access/rbac.ts')).can as CanFn;

describe('propiedades de rol efectivo y matriz (002)', () => {
  it('[REQ-RBAC-001] effectiveRole coincide con el oráculo (dueño primero, mayor rol ACTIVE con asignación) y no depende del orden', async () => {
    const effectiveRole = await loadEffectiveRole002();
    fc.assert(
      fc.property(scenario002Arb, ({ user, owner, memberships, assignments }) => {
        const pet = { id: 'p1', ownerUserId: owner };
        const expected = oracleRole002(user, owner, memberships, assignments);
        expect(effectiveRole({ id: user }, pet, memberships, assignments)).toBe(expected);
        expect(effectiveRole({ id: user }, pet, [...memberships].reverse(), [...assignments].reverse())).toBe(expected);
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-ACC2-001] la mascota es visible si y solo si el rol efectivo no es nulo (dueño, o ACTIVE con asignación)', async () => {
    const effectiveRole = await loadEffectiveRole002();
    fc.assert(
      fc.property(scenario002Arb, ({ user, owner, memberships, assignments }) => {
        const pet = { id: 'p1', ownerUserId: owner };
        const visible = effectiveRole({ id: user }, pet, memberships, assignments) !== null;
        expect(visible).toBe(oracleVisible002(user, owner, memberships, assignments));
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[INV-ACC2-001][REQ-RBAC-001] un rol de hogar nunca edita datos de una mascota ajena más allá de su fila de la matriz', async () => {
    const effectiveRole = await loadEffectiveRole002();
    const can = await loadCan002();
    fc.assert(
      fc.property(scenario002Arb, ({ user, owner, memberships, assignments }) => {
        const pet = { id: 'p1', ownerUserId: owner };
        const role = effectiveRole({ id: user }, pet, memberships, assignments);
        if (role === null || role === 'OWNER') return;
        expect(user).not.toBe(owner);
        expect(can(role, 'DELETE_PET')).toBe(false);
        expect(can(role, 'TRANSFER_PET_OWNERSHIP')).toBe(false);
        expect(can(role, 'ASSIGN_PET_TO_HOUSEHOLDS')).toBe(false);
        expect(can(role, 'EDIT_PET_BASICS')).toBe(role === 'ADMIN');
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });

  it('[REQ-RBAC-001] la matriz es una escalera: lo que puede un rol menor lo puede el siguiente (READER ≤ CAREGIVER ≤ ADMIN ≤ OWNER)', async () => {
    const can = await loadCan002();
    fc.assert(
      fc.property(fc.constantFrom(...ACTIONS002), fc.integer({ min: 0, max: LADDER002.length - 2 }), (action, i) => {
        const lower = LADDER002[i]!;
        const upper = LADDER002[i + 1]!;
        if (can(lower, action)) expect(can(upper, action)).toBe(true);
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });
});
