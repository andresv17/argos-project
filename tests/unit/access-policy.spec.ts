import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError, type PetProfile } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import {
  assertCanRead,
  assertCanWrite,
  canRead,
  canWrite,
  type AccessMembership,
} from '../../src/domain/access/access-policy.ts';

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
);
const [andres, maria, carlos, lucia] = fixtures.users as Array<{ id: string }>;
const members: HouseholdMember[] = fixtures.householdMembers;
const argos: PetProfile = fixtures.validBackupEnvelopeV2.pets[0];
const luna: PetProfile = fixtures.otherUserPets[0];
const HOUSE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const HOUSE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';

function catchDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

const membership = (userId: string, householdId: string, status: AccessMembership['status']): AccessMembership => ({
  userId,
  householdId,
  status,
});

describe('política de acceso (src/domain/access/access-policy.ts)', () => {
  it('[INV-ACC-001] el dueño lee su mascota aunque no tenga ningún hogar', () => {
    expect(canRead(andres!, argos, [])).toBe(true);
    expect(argos.ownerUserId).toBe(andres!.id);
  });

  it('[INV-ACC-001] un miembro ACTIVE lee las mascotas de otro miembro ACTIVE del mismo hogar, en ambos sentidos', () => {
    expect(canRead(maria!, argos, members)).toBe(true);
    expect(canRead(andres!, luna, members)).toBe(true);
  });

  it('[INV-ACC-001] Carlos (INVITED) y Lucía (sin hogar) no leen a Argos (EDGE-008)', () => {
    expect(canRead(carlos!, argos, members)).toBe(false);
    expect(canRead(lucia!, argos, members)).toBe(false);
    const error = catchDomainError(() => assertCanRead(carlos!, argos, members));
    expect(error.code).toBe('ERR-PET-NOT-FOUND');
    expect(error.status).toBe(404);
    expect(error.invariantRef).toBe('INV-ACC-001');
    expect(error.field).toBe('petId');
  });

  it('[INV-ACC-001] solo la membresía ACTIVE de los dos usuarios en el mismo hogar da lectura', () => {
    for (const status of ['INVITED', 'DECLINED', 'CANCELLED', 'LEFT', 'REMOVED'] as const) {
      const readerNotActive = [membership(andres!.id, HOUSE_A, 'ACTIVE'), membership(lucia!.id, HOUSE_A, status)];
      const ownerNotActive = [membership(andres!.id, HOUSE_A, status), membership(lucia!.id, HOUSE_A, 'ACTIVE')];
      expect(canRead(lucia!, argos, readerNotActive)).toBe(false);
      expect(canRead(lucia!, argos, ownerNotActive)).toBe(false);
    }
    const differentHouseholds = [membership(andres!.id, HOUSE_A, 'ACTIVE'), membership(lucia!.id, HOUSE_B, 'ACTIVE')];
    expect(canRead(lucia!, argos, differentHouseholds)).toBe(false);
    const sharedSecondHousehold = [
      ...differentHouseholds,
      membership(andres!.id, HOUSE_B, 'ACTIVE'),
    ];
    expect(canRead(lucia!, argos, sharedSecondHousehold)).toBe(true);
  });

  it('[INV-ACC-001] assertCanRead devuelve la misma mascota y trata null o undefined como inexistente', () => {
    expect(assertCanRead(maria!, argos, members)).toBe(argos);
    expect(catchDomainError(() => assertCanRead(andres!, null, members)).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanRead(andres!, undefined, members)).code).toBe('ERR-PET-NOT-FOUND');
  });

  it('[INV-ACC-002][ERR-ACC-FORBIDDEN] María puede leer pero no escribir en Argos: 403 (EDGE-009)', () => {
    expect(canWrite(maria!, argos)).toBe(false);
    const error = catchDomainError(() => assertCanWrite(maria!, argos, members));
    expect(error.code).toBe('ERR-ACC-FORBIDDEN');
    expect(error.status).toBe(403);
    expect(error.invariantRef).toBe('INV-ACC-002');
    expect(error.field).toBe('petId');
  });

  it('[INV-ACC-002] quien no puede leer recibe ERR-PET-NOT-FOUND al escribir, no ERR-ACC-FORBIDDEN', () => {
    expect(catchDomainError(() => assertCanWrite(carlos!, argos, members)).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanWrite(lucia!, argos, [])).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanWrite(andres!, null, members)).code).toBe('ERR-PET-NOT-FOUND');
  });

  it('[INV-ACC-002] solo el dueño escribe, con o sin hogar', () => {
    expect(canWrite(andres!, argos)).toBe(true);
    expect(assertCanWrite(andres!, argos, [])).toBe(argos);
    expect(assertCanWrite(maria!, luna, members)).toBe(luna);
    expect(canWrite(andres!, luna)).toBe(false);
  });
});
