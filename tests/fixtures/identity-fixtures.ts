import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Household, PetProfile } from '../../src/generated/index.ts';
import type { UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { LegacyHouseholdMember } from '../../src/domain/households/household-policies.ts';
import { emptyMemoryState, type MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { FAKE_HASH_PREFIX } from './test-doubles.ts';

/**
 * Estado de identidad de la Rebanada 1 (Feature 002) sobre los fixtures canónicos 3.0.0: cinco cuentas con la política
 * nueva más una cuenta de la 001 con contraseña de 8 caracteres (SC-010), un hogar compartido (Casa de Ana) y un hogar
 * de un solo miembro ACTIVE (Hogar de Elena) con una invitación pendiente. El modelo de hogares sigue siendo el heredado
 * (T237 PENDIENTE: rebanada 3).
 */
const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json'), 'utf8'));
const { description: _description, ...credentials } = raw.credentialsForTestsOnly as Record<string, string>;

export const REFERENCE_NOW: string = raw.referenceClock.nowIsoTimestamp;
export const REFERENCE_TODAY: string = raw.referenceClock.todayIsoDate;
export const APP_TIMEZONE: string = raw.referenceClock.timezone;

interface PublicUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: string;
}
const base: PublicUser[] = raw.entities.users;
export const [ANA, BRUNO, CARLA, DIEGO, ELENA] = base.map((u) => u.id) as [string, string, string, string, string];
export const OLD_ACCOUNT: PublicUser = { id: 'a0000000-0000-4000-8000-000000000006', username: 'vieja.cuenta', displayName: 'Cuenta Antigua', createdAt: '2025-12-01T10:00:00.000Z' };
export const USERNAMES: Record<string, string> = Object.fromEntries([...base, OLD_ACCOUNT].map((u) => [u.id, u.username]));
/** Contraseñas de prueba; vieja.cuenta conserva 8 caracteres de la 001 (el login no aplica la política). */
export const IDENTITY_PASSWORDS: Record<string, string> = { ...credentials, 'vieja.cuenta': 'abcd1234' };

export const HOUSEHOLD_ANA: Household = raw.entities.household;
export const HOUSEHOLD_ELENA: Household = { id: 'c0000000-0000-4000-8000-000000000002', name: 'Hogar de Elena', ownerUserId: ELENA, createdAt: '2026-03-01T10:00:00.000Z' };

const row = (n: number, householdId: string, userId: string, role: 'OWNER' | 'MEMBER', status: LegacyHouseholdMember['status'], invitedBy: string | null): LegacyHouseholdMember => ({
  membershipId: `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  householdId,
  userId,
  role,
  status,
  invitedByUserId: invitedBy,
  invitedAt: invitedBy === null ? null : '2026-03-02T10:00:00.000Z',
  joinedAt: status === 'ACTIVE' ? '2026-03-01T11:00:00.000Z' : null,
  firstJoinedAt: status === 'ACTIVE' ? '2026-03-01T11:00:00.000Z' : null,
  updatedAt: '2026-03-02T10:00:00.000Z',
});
export const IDENTITY_MEMBERSHIPS: LegacyHouseholdMember[] = [
  row(1, HOUSEHOLD_ANA.id, ANA, 'OWNER', 'ACTIVE', null),
  row(2, HOUSEHOLD_ANA.id, BRUNO, 'MEMBER', 'ACTIVE', ANA),
  row(3, HOUSEHOLD_ELENA.id, ELENA, 'OWNER', 'ACTIVE', null),
  row(4, HOUSEHOLD_ELENA.id, CARLA, 'MEMBER', 'INVITED', ELENA),
];

export const ANA_PETS: PetProfile[] = raw.entities.pets;
export const ELENA_PET: PetProfile = { ...ANA_PETS[1]!, id: 'b0000000-0000-4000-8000-000000000009', ownerUserId: ELENA, name: 'Luna', microchipId: null };

export function accountOf(user: PublicUser, password: string): UserAccount {
  return { ...user, email: null, preferredLanguage: 'es', timezone: APP_TIMEZONE, passwordHash: `${FAKE_HASH_PREFIX}${password}` };
}

/** Estado de identidad: usuarios, hogares, mascotas de Ana y de Elena con sus registros. */
export function identityState(): MemoryState {
  const state = emptyMemoryState();
  state.users = [...base, OLD_ACCOUNT].map((u) => accountOf(u, IDENTITY_PASSWORDS[u.username]!));
  state.households = [HOUSEHOLD_ANA, HOUSEHOLD_ELENA];
  state.memberships = structuredClone(IDENTITY_MEMBERSHIPS);
  state.pets = [...structuredClone(ANA_PETS), structuredClone(ELENA_PET)];
  state.records = structuredClone(raw.entities.records);
  const weight = structuredClone(state.records.weights[0]!);
  state.records.weights.push({ ...weight, id: 'f0000000-0000-4000-8000-000000000099', petId: ELENA_PET.id });
  return state;
}

/** Estado con solo los usuarios (para las pruebas de adaptadores). */
export function USERS_FOR_ADAPTERS(): MemoryState {
  const state = emptyMemoryState();
  state.users = [...base, OLD_ACCOUNT].map((u) => accountOf(u, IDENTITY_PASSWORDS[u.username]!));
  return state;
}
