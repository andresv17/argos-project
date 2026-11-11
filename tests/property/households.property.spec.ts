import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, validateHouseholdMember } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import {
  acceptInvitation,
  createHousehold,
  declineInvitation,
  inviteMember,
  ownerColorTokens,
  removeOrLeave,
} from '../../src/domain/households/household-policies.ts';

const PROPERTY_SEED = 20261105;
const H = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const USERS = [1, 2, 3, 4, 5].map((n) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${n}`);
const BASE = Date.UTC(2026, 10, 5, 12);

const opArb = fc.record({
  kind: fc.constantFrom('INVITE', 'INVITE_MISSING', 'ACCEPT', 'DECLINE', 'REMOVE_OR_LEAVE'),
  actor: fc.integer({ min: 0, max: 4 }),
  target: fc.integer({ min: 0, max: 4 }),
});

describe('propiedades de hogares', () => {
  it('[INV-HOUSE-001][INV-HOUSE-003][STATE-HOUSE-MEMBERSHIP-001] tras cualquier secuencia de operaciones: un único OWNER ACTIVE, a lo sumo una fila abierta por usuario y firstJoinedAt inmutable', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const created = createHousehold({ householdId: H, membershipId: 'cccccccc-cccc-4ccc-8ccc-000000000000', ownerUserId: USERS[0]!, input: { name: 'Casa' }, nowIsoTimestamp: new Date(BASE).toISOString() });
        let rows: HouseholdMember[] = [created.ownerMembership];
        const firstJoined = new Map<string, string>([[USERS[0]!, created.ownerMembership.firstJoinedAt!]]);
        ops.forEach((op, i) => {
          const now = new Date(BASE + (i + 1) * 60_000).toISOString();
          const actor = USERS[op.actor]!;
          const target = USERS[op.target]!;
          let result: HouseholdMember;
          try {
            if (op.kind === 'INVITE' || op.kind === 'INVITE_MISSING') {
              const membershipId = `cccccccc-cccc-4ccc-8ccc-${String(i + 1).padStart(12, '0')}`;
              result = inviteMember({ memberships: rows, householdId: H, actorUserId: actor, invitee: op.kind === 'INVITE' ? { id: target } : null, membershipId, nowIsoTimestamp: now });
            } else if (op.kind === 'ACCEPT') {
              result = acceptInvitation(rows, H, actor, now);
            } else if (op.kind === 'DECLINE') {
              result = declineInvitation(rows, H, actor, now);
            } else {
              result = removeOrLeave(rows, H, actor, target, now);
            }
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            expect([403, 404, 409]).toContain(error.status);
            return;
          }
          expect(validateHouseholdMember(result)).toBe(true);
          rows = rows.some((r) => r.membershipId === result.membershipId)
            ? rows.map((r) => (r.membershipId === result.membershipId ? result : r))
            : [...rows, result];
          if (result.firstJoinedAt !== null) {
            expect(result.firstJoinedAt).toBe(firstJoined.get(result.userId) ?? result.firstJoinedAt);
            firstJoined.set(result.userId, result.firstJoinedAt);
          }
        });
        const owners = rows.filter((r) => r.role === 'OWNER');
        expect(owners.map((r) => [r.userId, r.status])).toEqual([[USERS[0], 'ACTIVE']]);
        for (const user of USERS) {
          expect(rows.filter((r) => r.userId === user && (r.status === 'INVITED' || r.status === 'ACTIVE')).length).toBeLessThanOrEqual(1);
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 300 },
    );
  });

  it('[INV-HOUSE-005] el color de cada miembro ACTIVE sigue su posición por firstJoinedAt y userId; los demás no tienen color', () => {
    const rowArb = fc.record({
      userId: fc.constantFrom(...USERS, ...USERS.map((u) => u.replace('aaaaaaaaaa', 'bbbbbbbbbb'))),
      status: fc.constantFrom('INVITED', 'ACTIVE', 'LEFT', 'REMOVED'),
      joinedDay: fc.integer({ min: 1, max: 9 }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.userId, maxLength: 10 }), (specs) => {
        const rows = specs.map((s, i) => ({
          membershipId: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`,
          householdId: H,
          userId: s.userId,
          role: 'MEMBER' as const,
          status: s.status as HouseholdMember['status'],
          invitedByUserId: null,
          invitedAt: null,
          joinedAt: null,
          firstJoinedAt: `2026-01-0${s.joinedDay}T00:00:00.000Z`,
          updatedAt: '2026-01-01T00:00:00.000Z',
        }));
        const oracle = rows
          .filter((r) => r.status === 'ACTIVE')
          .sort((a, b) => (a.firstJoinedAt < b.firstJoinedAt ? -1 : a.firstJoinedAt > b.firstJoinedAt ? 1 : a.userId < b.userId ? -1 : 1))
          .map((r, i) => [r.userId, `OWNER_COLOR_${(i % 8) + 1}`]);
        expect([...ownerColorTokens(rows, H).entries()]).toEqual(oracle);
      }),
      { seed: PROPERTY_SEED, numRuns: 400 },
    );
  });
});
