import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BackupEnvelopeV3, Household, PetProfile, UserPublicProfile } from '../../src/generated/index.ts';
import { Sha256BackupTokenAdapter } from '../../src/infrastructure/adapters/sha256-backup-token.adapter.ts';
import { NullAuditLogAdapter } from '../../src/infrastructure/adapters/null-audit-log.adapter.ts';
import { SlidingWindowRateLimiterAdapter, type RateLimits } from '../../src/infrastructure/adapters/sliding-window-rate-limiter.adapter.ts';
import type { ClockPort } from '../../src/application/ports/clock.port.ts';
import type { PasswordHasherPort } from '../../src/application/ports/password-hasher.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import type { UserAccount } from '../../src/application/ports/repositories.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DeterministicIdAdapter } from '../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import {
  InMemoryUnitOfWork,
  emptyMemoryState,
  type InMemoryUnitOfWorkOptions,
  type MemoryState,
} from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { upgradePet } from './storage-upgrade.ts';
import { DUMMY_PASSWORD_HASH, FAKE_HASH_PREFIX, SequentialTokenAdapter, SpyPasswordHasher } from './test-doubles.ts';

/** Datos canónicos de contracts/examples/canonical-fixtures.json. */
export const fixtures = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'));

/**
 * Las mascotas de la 001 pasan a la forma 3.0.0 (CANINE, FELINE, campos nuevos) porque las rutas y los repositorios de
 * la 002 las validan (T226). Los registros siguen con la forma 001 hasta T255 (vacunas y desparasitaciones).
 */
export const envelope: BackupEnvelopeV3 = (() => {
  const raw: BackupEnvelopeV3 = fixtures.validBackupEnvelopeV2;
  return { ...raw, pets: (raw.pets as unknown as PetProfile[]).map(upgradePet) as unknown as BackupEnvelopeV3['pets'] };
})();
export const USERS: UserPublicProfile[] = fixtures.users;
export const [ANDRES, MARIA, CARLOS, LUCIA] = USERS.map((u) => u.id) as [string, string, string, string];
export const HOUSEHOLD: Household = fixtures.household;
export const MEMBERSHIPS: HouseholdMember[] = fixtures.householdMembers;
export const ANDRES_PETS = envelope.pets as PetProfile[];
export const MARIA_PETS = (fixtures.otherUserPets as PetProfile[]).map(upgradePet);
export const ARGOS = ANDRES_PETS.find((p) => p.name === 'Argos')!;
export const LUNA = MARIA_PETS[0]!;
export const PASSWORDS: Record<string, string> = fixtures.credentialsForTestsOnly;

/** UUID v4 válidos para DeterministicIdAdapter: 00000000-0000-4000-8000-0000000000NN. */
export const generatedId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const GENERATED_IDS = Array.from({ length: 50 }, (_, i) => generatedId(i + 1));

/** Estado canónico: 4 usuarios con hash falso de su contraseña, Casa Vallejo con 2 membresías ACTIVE y la invitación de Carlos, 6 mascotas y los registros del sobre v2. */
export function canonicalState(): MemoryState {
  const state = emptyMemoryState();
  state.users = USERS.map((u): UserAccount => ({ ...u, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: `${FAKE_HASH_PREFIX}${PASSWORDS[u.username]}` }));
  state.pets = [...ANDRES_PETS, ...MARIA_PETS];
  state.records = structuredClone(envelope.records);
  state.households = [HOUSEHOLD];
  // T246: household_members no guarda INVITED; la invitación de Carlos (fixture 001) vive en household_invitations con roleOnJoin CAREGIVER.
  state.memberships = MEMBERSHIPS.filter((m) => m.status !== 'INVITED');
  state.invitations = MEMBERSHIPS.filter((m) => m.status === 'INVITED').map((m) => ({
    invitationId: m.membershipId,
    householdId: m.householdId,
    inviteeUsername: USERS.find((u) => u.id === m.userId)!.username,
    inviteeUserId: m.userId,
    roleOnJoin: 'CAREGIVER' as const,
    invitedByUserId: m.invitedByUserId!,
    status: 'INVITED' as const,
    createdAt: m.invitedAt!,
    respondedAt: null,
  }));
  // REQ-MIG-001: la migración 001→002 asigna cada mascota a los hogares donde su dueño es miembro ACTIVE (la visibilidad de la 001).
  const activeHouseholdsOf = (userId: string) => state.memberships.filter((m) => m.userId === userId && m.status === 'ACTIVE').map((m) => m.householdId);
  state.assignments = state.pets.flatMap((pet) =>
    activeHouseholdsOf(pet.ownerUserId).map((householdId) => ({ petId: pet.id, householdId, assignedByUserId: pet.ownerUserId, assignedAt: pet.createdAt })),
  );
  return state;
}

/** Zona horaria y límites de frecuencia de las pruebas (valores iniciales de ADR-002-12: 5 exportaciones y 20 invitaciones por 15 min). */
export const TEST_RATE_LIMITS: RateLimits = { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 20, windowMinutes: 15 } };
export const RATE_EVENT_IDS = Array.from({ length: 500 }, (_, i) => `e1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

/** Dependencias de aplicación de pruebas: ids y tokens deterministas, límites configurables y auditoría nula (hasta T265). */
export function createDeps(uow: UnitOfWorkPort, clock: ClockPort, hasher: PasswordHasherPort, rateLimits: RateLimits = TEST_RATE_LIMITS): ApplicationDeps {
  const tokens = new SequentialTokenAdapter();
  return {
    uow,
    clock,
    ids: new DeterministicIdAdapter(GENERATED_IDS),
    tokens,
    hasher,
    dummyPasswordHash: DUMMY_PASSWORD_HASH,
    rateLimiter: new SlidingWindowRateLimiterAdapter(new DeterministicIdAdapter(RATE_EVENT_IDS), rateLimits),
    backupTokens: new Sha256BackupTokenAdapter(tokens),
    audit: new NullAuditLogAdapter(),
  };
}

export interface Harness {
  readonly deps: ApplicationDeps;
  readonly uow: InMemoryUnitOfWork;
  readonly clock: FixedClockAdapter;
  readonly hasher: SpyPasswordHasher;
}

export function createHarness(state: MemoryState = canonicalState(), options: InMemoryUnitOfWorkOptions = {}, rateLimits: RateLimits = TEST_RATE_LIMITS): Harness {
  const uow = new InMemoryUnitOfWork(state, options);
  const clock = new FixedClockAdapter();
  const hasher = new SpyPasswordHasher();
  return { deps: createDeps(uow, clock, hasher, rateLimits), uow, clock, hasher };
}
