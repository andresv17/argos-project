import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, type MembershipStatus } from '../../src/generated/index.ts';
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

describe('TASK-105: propiedades de la política de acceso', () => {
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
