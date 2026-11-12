import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember } from '../../src/domain/households/household-policies.ts';
import { transferPetOwnership, type PetAssignmentRow } from '../../src/domain/pet/ownership-transfer.ts';

const ANA = 'a0000000-0000-4000-8000-000000000001';
const CARLA = 'a0000000-0000-4000-8000-000000000003';
const DIEGO = 'a0000000-0000-4000-8000-000000000004';
const H1 = 'c0000000-0000-4000-8000-000000000001';
const H2 = 'c0000000-0000-4000-8000-000000000002';
const PET = 'b0000000-0000-4000-8000-0000000000c1';
const T = '2026-11-12T10:00:00.000Z';

const row = (userId: string, householdId: string, status: string): LegacyHouseholdMember => ({
  membershipId: `m-${userId}-${householdId}`,
  householdId,
  userId,
  role: 'ADMIN',
  status: status as LegacyHouseholdMember['status'],
  joinedAt: T,
  firstJoinedAt: T,
  updatedAt: T,
});

const memberships: LegacyHouseholdMember[] = [
  row(ANA, H1, 'ACTIVE'),
  row(CARLA, H1, 'ACTIVE'),
  row(DIEGO, H2, 'ACTIVE'),
  row(CARLA, H2, 'LEFT'),
];
const assignments: PetAssignmentRow[] = [
  { petId: PET, householdId: H1, assignedByUserId: ANA },
  { petId: PET, householdId: H2, assignedByUserId: ANA },
];

const codeOf = (action: () => unknown): [string, number] => {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return [error.code, error.status];
    throw error;
  }
  return ['OK', 0];
};

describe('transferencia de propiedad de mascota (REQ-OWN-001, INV-OWN2-001)', () => {
  it('[REQ-OWN-001] el dueño transfiere a Carla (ACTIVE en H1): cambia el ownerUserId y poda solo H2, donde no es ACTIVE', () => {
    const out = transferPetOwnership({ pet: { id: PET, ownerUserId: ANA }, actorUserId: ANA, newOwnerUserId: CARLA, memberships, assignments });
    expect(out.pet.ownerUserId).toBe(CARLA);
    expect(out.assignments).toEqual([{ petId: PET, householdId: H1, assignedByUserId: CARLA }]);
    expect(out.audit).toEqual([
      { kind: 'OWNERSHIP_TRANSFER', petId: PET, fromUserId: ANA, toUserId: CARLA },
      { kind: 'UNASSIGN', petId: PET, householdId: H2 },
    ]);
  });

  it('[REQ-OWN-001][ERR-ACC-FORBIDDEN] quien no es el Propietario Legal no transfiere: 403', () => {
    expect(codeOf(() => transferPetOwnership({ pet: { id: PET, ownerUserId: ANA }, actorUserId: CARLA, newOwnerUserId: CARLA, memberships, assignments }))).toEqual([
      'ERR-ACC-FORBIDDEN',
      403,
    ]);
  });

  it('[REQ-OWN-001][ERR-OWN-TRANSFER-INVALID-TARGET] destino que no es ACTIVE en ningún hogar asignado: rechazado', () => {
    expect(codeOf(() => transferPetOwnership({ pet: { id: PET, ownerUserId: ANA }, actorUserId: ANA, newOwnerUserId: 'a0000000-0000-4000-8000-000000000009', memberships, assignments }))).toEqual([
      'ERR-OWN-TRANSFER-INVALID-TARGET',
      422,
    ]);
  });

  it('[REQ-OWN-001][ERR-OWN-TRANSFER-INVALID-TARGET] transferir al mismo dueño es un destino inválido', () => {
    expect(codeOf(() => transferPetOwnership({ pet: { id: PET, ownerUserId: ANA }, actorUserId: ANA, newOwnerUserId: ANA, memberships, assignments }))).toEqual([
      'ERR-OWN-TRANSFER-INVALID-TARGET',
      422,
    ]);
  });
});
