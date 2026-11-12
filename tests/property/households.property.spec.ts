import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, validateHouseholdMember } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import {
  acceptInvitation,
  createHousehold,
  declineInvitation,
  inviteMember,
  isOwnerRow,
  ownerColorTokens,
  removeOrLeave,
} from '../../src/domain/households/household-policies.ts';

const PROPERTY_SEED = 20261105;
const H = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const USERS = [1, 2, 3, 4, 5].map((n) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${n}`);
const BASE = Date.UTC(2026, 10, 5, 12);

/** Estado HTTP de cada código de error de la operación, según error-catalog.json (3.0.0). */
const ERROR_STATUS: Readonly<Record<string, number>> = {
  'ERR-HOUSE-NOT-FOUND': 404,
  'ERR-ACC-FORBIDDEN': 403,
  'ERR-HOUSE-INVITATION-NOT-FOUND': 404,
  'ERR-HOUSE-OWNER-CANNOT-LEAVE': 409,
  'ERR-HOUSE-MEMBERSHIP-NOT-FOUND': 404,
};

/**
 * Código de error que debe lanzar cada operación sobre el estado previo (o null si no debe lanzar).
 * Reglas: requireActiveMembership → ERR-HOUSE-NOT-FOUND; requireOwner → ERR-ACC-FORBIDDEN;
 * requireInvitation → ERR-HOUSE-INVITATION-NOT-FOUND; LEAVE de propietario → ERR-HOUSE-OWNER-CANNOT-LEAVE;
 * destino sin fila abierta → ERR-HOUSE-MEMBERSHIP-NOT-FOUND.
 */
function expectedErrorCode(kind: string, rows: readonly HouseholdMember[], actorId: string, targetId: string): string | null {
  const actorRow = rows.find((r) => r.userId === actorId && r.status === 'ACTIVE');
  if (kind === 'INVITE' || kind === 'INVITE_MISSING') {
    if (actorRow === undefined) return 'ERR-HOUSE-NOT-FOUND';
    return isOwnerRow(actorRow) ? null : 'ERR-ACC-FORBIDDEN';
  }
  if (kind === 'ACCEPT' || kind === 'DECLINE') {
    return rows.some((r) => r.userId === actorId && r.status === 'INVITED') ? null : 'ERR-HOUSE-INVITATION-NOT-FOUND';
  }
  if (actorRow === undefined) return 'ERR-HOUSE-NOT-FOUND';
  if (targetId === actorId) return isOwnerRow(actorRow) ? 'ERR-HOUSE-OWNER-CANNOT-LEAVE' : null;
  if (!isOwnerRow(actorRow)) return 'ERR-ACC-FORBIDDEN';
  const open = rows.some((r) => r.userId === targetId && (r.status === 'INVITED' || r.status === 'ACTIVE'));
  return open ? null : 'ERR-HOUSE-MEMBERSHIP-NOT-FOUND';
}

const opArb = fc.record({
  kind: fc.constantFrom('INVITE', 'INVITE_MISSING', 'ACCEPT', 'DECLINE', 'REMOVE_OR_LEAVE'),
  actor: fc.integer({ min: 0, max: 4 }),
  target: fc.integer({ min: 0, max: 4 }),
});

describe('propiedades de hogares', () => {
  it('[INV-HOUSE2-001][INV-HOUSE-003][STATE-HOUSE-MEMBERSHIP-001] tras cualquier secuencia de operaciones: un único propietario ACTIVE con rol ADMIN, a lo sumo una fila abierta por usuario y firstJoinedAt inmutable', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const created = createHousehold({ householdId: H, membershipId: 'cccccccc-cccc-4ccc-8ccc-000000000000', ownerUserId: USERS[0]!, input: { name: 'Casa' }, nowIsoTimestamp: new Date(BASE).toISOString() });
        let rows: HouseholdMember[] = [created.ownerMembership];
        const firstJoined = new Map<string, string>([[USERS[0]!, created.ownerMembership.firstJoinedAt!]]);
        ops.forEach((op, i) => {
          const now = new Date(BASE + (i + 1) * 60_000).toISOString();
          const actor = USERS[op.actor]!;
          const target = USERS[op.target]!;
          const expectedCode = expectedErrorCode(op.kind, rows, actor, target);
          let result: HouseholdMember | null = null;
          let thrown: DomainError | null = null;
          try {
            if (op.kind === 'INVITE' || op.kind === 'INVITE_MISSING') {
              const membershipId = `cccccccc-cccc-4ccc-8ccc-${String(i + 1).padStart(12, '0')}`;
              const command = { memberships: rows, householdId: H, actorUserId: actor, invitee: op.kind === 'INVITE' ? { id: target } : null, membershipId, nowIsoTimestamp: now, roleOnJoin: 'CAREGIVER' as const };
              result = inviteMember(command);
            } else if (op.kind === 'ACCEPT') {
              result = acceptInvitation(rows, H, actor, now);
            } else if (op.kind === 'DECLINE') {
              result = declineInvitation(rows, H, actor, now);
            } else {
              result = removeOrLeave(rows, H, actor, target, now);
            }
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            thrown = error;
          }
          if (expectedCode !== null) {
            expect(thrown?.code).toBe(expectedCode);
            expect(thrown?.status).toBe(ERROR_STATUS[expectedCode]);
            return;
          }
          expect(thrown).toBeNull();
          if (result === null) return; // invitación uniforme sin efecto (usuario inexistente o par ya abierto)
          expect(validateHouseholdMember(result)).toBe(true);
          rows = rows.some((r) => r.membershipId === result!.membershipId)
            ? rows.map((r) => (r.membershipId === result!.membershipId ? result! : r))
            : [...rows, result];
          if (result.firstJoinedAt !== null) {
            expect(result.firstJoinedAt).toBe(firstJoined.get(result.userId) ?? result.firstJoinedAt);
            firstJoined.set(result.userId, result.firstJoinedAt);
          }
        });
        const owners = rows.filter((r) => r.role === 'ADMIN' && r.status === 'ACTIVE');
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

// Feature 002 · T237 (rojo): propiedad de propietario único bajo CHANGE_ROLE, TRANSFER_OWNERSHIP, REMOVE, LEAVE y ACCEPT.
// Usa la misma firma supuesta que tests/unit/household-policies.spec.ts (applyMembershipEvent).
describe('propiedades de hogares 002 (INV-HOUSE2-001, STATE-HOUSE-MEMBERSHIP-001, REQ-HOUSE2-002)', () => {
  it('[INV-HOUSE2-001][STATE-HOUSE-MEMBERSHIP-001] tras cualquier secuencia de eventos válidos o rechazados: exactamente un propietario ACTIVE, siempre con rol ADMIN', async () => {
    const { applyMembershipEvent } = (await import('../../src/domain/households/household-policies.ts')) as unknown as {
      applyMembershipEvent: (input: Record<string, unknown>) => { memberships: Array<Record<string, unknown>> };
    };
    const users = [1, 2, 3, 4].map((n) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${n}`);
    const hid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
    const start = [
      { membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', householdId: hid, userId: users[0], role: 'ADMIN', status: 'ACTIVE', isHouseholdOwner: true },
      { membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', householdId: hid, userId: users[1], role: 'ADMIN', status: 'ACTIVE', isHouseholdOwner: false },
      { membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc03', householdId: hid, userId: users[2], role: 'CAREGIVER', status: 'ACTIVE', isHouseholdOwner: false },
      { membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccc04', householdId: hid, userId: users[3], role: 'READER', status: 'ACTIVE', isHouseholdOwner: false },
    ];
    const opArb = fc.record({
      event: fc.constantFrom('CHANGE_ROLE', 'TRANSFER_OWNERSHIP', 'REMOVE', 'LEAVE', 'ACCEPT'),
      actor: fc.integer({ min: 0, max: 3 }),
      target: fc.integer({ min: 0, max: 3 }),
      role: fc.constantFrom('ADMIN', 'CAREGIVER', 'READER'),
    });
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 25 }), (ops) => {
        let memberships: Array<Record<string, unknown>> = structuredClone(start);
        for (const op of ops) {
          try {
            memberships = applyMembershipEvent({
              event: op.event,
              memberships,
              assignments: [],
              householdId: hid,
              actorUserId: users[op.actor],
              targetUserId: users[op.target],
              role: op.role,
            }).memberships;
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
          }
          const owners = memberships.filter((m) => m['status'] === 'ACTIVE' && m['isHouseholdOwner'] === true);
          expect(owners.length).toBe(1);
          expect(owners[0]!['role']).toBe('ADMIN');
        }
      }),
      { seed: PROPERTY_SEED, numRuns: 200 },
    );
  });
});
