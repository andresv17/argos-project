/**
 * Repositorios en memoria detrás de UnitOfWorkPort.
 * - Cada transacción trabaja sobre una copia profunda del estado; si `work` termina y `beforeCommit` no lanza, la
 *   copia reemplaza al estado; si no, se descarta y la promesa se rechaza con el error original (INV-ARCH-005).
 * - Las transacciones se ejecutan en serie, en orden de llegada.
 * - Los objetos devueltos son copias: modificarlos no altera el estado guardado.
 * - Restricciones equivalentes a las de SQLite: id y username únicos en usuarios; id único por módulo de registros.
 *
 * @implements INV-ARCH-004, INV-ARCH-005
 */

import type { DeterministicFaultInjector } from '../fault-injector.ts';
import type { AuditEntry, Household, PetProfile } from '../../../generated/index.ts';
import type { LegacyHouseholdMember } from '../../../domain/households/household-policies.ts';
import type {
  AuditLogRepositoryPort,
  ConfirmationTokenRepositoryPort,
  HouseholdRepositoryPort,
  InvitationRecord,
  InvitationRepositoryPort,
  PetAssignmentRecord,
  PetAssignmentRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetRepositoryPort,
  RateLimitEvent,
  RateLimitRepositoryPort,
  RepositorySet,
  SessionRepositoryPort,
  UserAccount,
  UserRepositoryPort,
} from '../../../application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.ts';
import type { SessionRecord } from '../../../domain/auth/auth-policies.ts';
import type { PetRecordCollections } from '../../../domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../../domain/records/record-invariants.ts';

const RECORD_MODULE_NAMES: readonly RecordModule[] = ['weights', 'bodyMeasurements', 'vaccinations', 'dewormings', 'medicalVisits', 'customParameters'];

export interface MemoryState {
  users: UserAccount[];
  sessions: Record<string, SessionRecord>;
  loginFailures: Record<string, string[]>;
  pets: PetProfile[];
  records: PetRecordCollections;
  households: Household[];
  memberships: LegacyHouseholdMember[];
  /** Token de confirmación de respaldo por usuario (una fila por usuario; solo el hash). */
  confirmationTokens: Record<string, StoredConfirmationToken>;
  rateEvents: RateLimitEvent[];
  invitations: InvitationRecord[];
  assignments: PetAssignmentRecord[];
  /** Filas de auditoría en orden de inserción (REQ-AUD-001). */
  auditLog: AuditEntry[];
}

export interface StoredConfirmationToken {
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export interface InMemoryUnitOfWorkOptions {
  /** Se ejecuta justo antes de confirmar; si lanza, la transacción se descarta (simula un fallo de commit). */
  readonly beforeCommit?: () => void;
  /** Fallo determinista de la escritura N de cada transacción (SC-004, T277). */
  readonly faultInjector?: DeterministicFaultInjector;
}

export function emptyMemoryState(): MemoryState {
  return {
    users: [],
    sessions: {},
    loginFailures: {},
    pets: [],
    records: { weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], customParameters: [] },
    households: [],
    memberships: [],
    confirmationTokens: {},
    rateEvents: [],
    invitations: [],
    assignments: [],
    auditLog: [],
  };
}

const copy = <T>(value: T): T => structuredClone(value);

function userRepository(state: MemoryState): UserRepositoryPort {
  return {
    async findById(userId) {
      return copy(state.users.find((u) => u.id === userId) ?? null);
    },
    async findByUsername(username) {
      return copy(state.users.find((u) => u.username === username) ?? null);
    },
    async listByIds(userIds) {
      return copy(state.users.filter((u) => userIds.includes(u.id)));
    },
    async insert(user) {
      if (state.users.some((u) => u.id === user.id || u.username === user.username)) {
        throw new Error(`users: id o username duplicado (${user.id}, ${user.username})`);
      }
      state.users.push(copy(user));
    },
    async update(user) {
      const index = state.users.findIndex((u) => u.id === user.id && u.username === user.username);
      if (index < 0) throw new Error(`users: el usuario ${user.id} no existe`);
      state.users[index] = copy(user);
    },
    async delete(userId) {
      state.users = state.users.filter((u) => u.id !== userId);
    },
    async countReferences(userId) {
      return (
        state.users.filter((u) => u.id === userId).length +
        state.pets.filter((p) => p.ownerUserId === userId).length +
        state.households.filter((h) => h.ownerUserId === userId).length +
        state.memberships.filter((m) => m.userId === userId).length +
        Object.values(state.sessions).filter((session) => session.userId === userId).length +
        state.invitations.filter((i) => i.invitedByUserId === userId || i.inviteeUserId === userId).length +
        (state.confirmationTokens[userId] === undefined ? 0 : 1) +
        state.rateEvents.filter((e) => e.userId === userId).length
      );
    },
  };
}

function sessionRepository(state: MemoryState): SessionRepositoryPort {
  return {
    async findByToken(token) {
      return copy(state.sessions[token] ?? null);
    },
    async save(token, session) {
      state.sessions[token] = copy(session);
    },
    async revokeOthers(userId, keepToken, nowIsoTimestamp) {
      let revoked = 0;
      for (const [token, session] of Object.entries(state.sessions)) {
        if (token === keepToken || session.userId !== userId || session.revokedAt !== null) continue;
        state.sessions[token] = { ...session, revokedAt: nowIsoTimestamp };
        revoked += 1;
      }
      return revoked;
    },
    async deleteByUser(userId) {
      for (const [token, session] of Object.entries(state.sessions)) if (session.userId === userId) delete state.sessions[token];
    },
  };
}

function loginAttemptRepository(state: MemoryState): LoginAttemptRepositoryPort {
  return {
    async listFailures(username) {
      return copy(state.loginFailures[username] ?? []);
    },
    async replaceFailures(username, failures) {
      state.loginFailures[username] = [...failures];
    },
    async deleteFailures(username) {
      delete state.loginFailures[username];
    },
  };
}

function confirmationTokenRepository(state: MemoryState): ConfirmationTokenRepositoryPort {
  return {
    async replaceForUser(userId, tokenHash, createdAt, expiresAt) {
      state.confirmationTokens[userId] = { tokenHash, createdAt, expiresAt, usedAt: null };
    },
    async consume(userId, tokenHash, nowIsoTimestamp) {
      const row = state.confirmationTokens[userId];
      if (row === undefined || row.tokenHash !== tokenHash || row.usedAt !== null || !(row.expiresAt > nowIsoTimestamp)) return false;
      state.confirmationTokens[userId] = { ...row, usedAt: nowIsoTimestamp };
      return true;
    },
    async deleteForUser(userId) {
      delete state.confirmationTokens[userId];
    },
  };
}

function rateLimitRepository(state: MemoryState): RateLimitRepositoryPort {
  return {
    async record(event) {
      state.rateEvents.push(copy(event));
    },
    async countSince(scope, userId, sinceExclusive) {
      return state.rateEvents.filter((e) => e.scope === scope && e.userId === userId && e.occurredAt > sinceExclusive).length;
    },
    async deleteForUser(userId) {
      state.rateEvents = state.rateEvents.filter((e) => e.userId !== userId);
    },
  };
}

function invitationRepository(state: MemoryState): InvitationRepositoryPort {
  return {
    async findOpen(householdId, inviteeUsername) {
      return copy(state.invitations.find((i) => i.householdId === householdId && i.inviteeUsername === inviteeUsername && i.status === 'INVITED') ?? null);
    },
    async save(invitation) {
      const clash = state.invitations.some(
        (i) => i.invitationId !== invitation.invitationId && invitation.status === 'INVITED' && i.status === 'INVITED' && i.householdId === invitation.householdId && i.inviteeUsername === invitation.inviteeUsername,
      );
      if (clash) throw new Error(`household_invitations: ya hay una invitación INVITED de ${invitation.inviteeUsername} en el hogar`);
      state.invitations = [...state.invitations.filter((i) => i.invitationId !== invitation.invitationId), copy(invitation)];
    },
    async listOpenForUser(userId) {
      return copy(
        state.invitations
          .filter((i) => i.inviteeUserId === userId && i.status === 'INVITED')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.householdId.localeCompare(b.householdId)),
      );
    },
    async listByHousehold(householdId) {
      return copy(state.invitations.filter((i) => i.householdId === householdId));
    },
    async deleteForUser(userId) {
      state.invitations = state.invitations.filter((i) => i.invitedByUserId !== userId && i.inviteeUserId !== userId);
    },
    async deleteForHousehold(householdId) {
      state.invitations = state.invitations.filter((i) => i.householdId !== householdId);
    },
  };
}

function petRepository(state: MemoryState): PetRepositoryPort {
  return {
    async findById(petId) {
      return copy(state.pets.find((p) => p.id === petId) ?? null);
    },
    async listByOwners(ownerUserIds) {
      return copy(state.pets.filter((p) => ownerUserIds.includes(p.ownerUserId)));
    },
    async save(pet) {
      state.pets = [...state.pets.filter((p) => p.id !== pet.id), copy(pet)];
    },
    async delete(petId) {
      state.pets = state.pets.filter((p) => p.id !== petId);
      state.assignments = state.assignments.filter((a) => a.petId !== petId); // como ON DELETE CASCADE
    },
  };
}

function recordRepository(state: MemoryState): MedicalRecordRepositoryPort {
  return {
    async listForPet(petId) {
      const result = emptyMemoryState().records;
      for (const module of RECORD_MODULE_NAMES) {
        (result[module] as unknown[]) = copy((state.records[module] as Array<{ petId: string }>).filter((r) => r.petId === petId));
      }
      return result;
    },
    async findPetIdOfRecord(recordId) {
      for (const module of RECORD_MODULE_NAMES) {
        const found = (state.records[module] as Array<{ id: string; petId: string }>).find((r) => r.id === recordId);
        if (found !== undefined) return found.petId;
      }
      return null;
    },
    async add<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const collection = state.records[module] as Array<RecordOf<M>>;
      if (collection.some((r) => r.id === record.id)) {
        throw new Error(`${module}: id duplicado (${record.id})`);
      }
      collection.push(copy(record));
    },
    async replace<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const collection = state.records[module] as Array<RecordOf<M>>;
      const index = collection.findIndex((r) => r.id === record.id);
      if (index < 0) throw new Error(`${module}: registro inexistente (${record.id})`);
      collection[index] = copy(record);
    },
    async remove(module, petId, recordId) {
      const collection = state.records[module] as Array<{ id: string; petId: string }>;
      const index = collection.findIndex((r) => r.id === recordId && r.petId === petId);
      if (index < 0) return false;
      collection.splice(index, 1);
      return true;
    },
    async deleteForPet(petId) {
      for (const module of RECORD_MODULE_NAMES) {
        (state.records[module] as unknown[]) = (state.records[module] as Array<{ petId: string }>).filter((r) => r.petId !== petId);
      }
    },
  };
}

function householdRepository(state: MemoryState): HouseholdRepositoryPort {
  return {
    async findById(householdId) {
      return copy(state.households.find((h) => h.id === householdId) ?? null);
    },
    async insert(household) {
      if (state.households.some((h) => h.id === household.id)) {
        throw new Error(`households: id duplicado (${household.id})`);
      }
      state.households.push(copy(household));
    },
    async deleteWithMemberships(householdId) {
      state.households = state.households.filter((h) => h.id !== householdId);
      state.memberships = state.memberships.filter((m) => m.householdId !== householdId);
      state.invitations = state.invitations.filter((i) => i.householdId !== householdId); // como ON DELETE CASCADE
      state.assignments = state.assignments.filter((a) => a.householdId !== householdId); // como ON DELETE CASCADE
    },
    async listMemberships(householdId) {
      return copy(state.memberships.filter((m) => m.householdId === householdId));
    },
    async listMembershipsOfUsers(userIds) {
      return copy(state.memberships.filter((m) => userIds.includes(m.userId)));
    },
    async saveMembership(membership) {
      state.memberships = [...state.memberships.filter((m) => m.membershipId !== membership.membershipId), copy(membership)];
    },
    async deleteMembershipsOfUser(userId) {
      state.memberships = state.memberships.filter((m) => m.userId !== userId);
    },
    async updateOwner(householdId, ownerUserId) {
      const index = state.households.findIndex((h) => h.id === householdId);
      if (index < 0) throw new Error(`households: el hogar ${householdId} no existe`);
      state.households[index] = { ...state.households[index]!, ownerUserId };
    },
  };
}

function assignmentRepository(state: MemoryState): PetAssignmentRepositoryPort {
  return {
    async listByHousehold(householdId) {
      return copy(state.assignments.filter((a) => a.householdId === householdId));
    },
    async listByPet(petId) {
      return copy(state.assignments.filter((a) => a.petId === petId));
    },
    async save(assignment) {
      state.assignments = [...state.assignments.filter((a) => !(a.petId === assignment.petId && a.householdId === assignment.householdId)), copy(assignment)];
    },
    async remove(petId, householdId) {
      state.assignments = state.assignments.filter((a) => !(a.petId === petId && a.householdId === householdId));
    },
    async deleteForHousehold(householdId) {
      state.assignments = state.assignments.filter((a) => a.householdId !== householdId);
    },
    async deleteForPet(petId) {
      state.assignments = state.assignments.filter((a) => a.petId !== petId);
    },
  };
}

function auditLogRepository(state: MemoryState): AuditLogRepositoryPort {
  return {
    async insert(entry) {
      state.auditLog.push(copy(entry));
    },
    async pseudonymizeUser(userId, hmac) {
      state.auditLog = state.auditLog.map((e) => ({
        ...e,
        executorUserId: e.executorUserId === userId ? hmac : e.executorUserId,
        entityId: e.entityId === userId ? hmac : e.entityId,
      }));
    },
  };
}

function repositoriesOver(state: MemoryState): RepositorySet {
  return {
    users: userRepository(state),
    sessions: sessionRepository(state),
    loginAttempts: loginAttemptRepository(state),
    pets: petRepository(state),
    records: recordRepository(state),
    households: householdRepository(state),
    confirmationTokens: confirmationTokenRepository(state),
    rateLimits: rateLimitRepository(state),
    invitations: invitationRepository(state),
    assignments: assignmentRepository(state),
    auditLog: auditLogRepository(state),
  };
}

/** @implements INV-ARCH-005 */
export class InMemoryUnitOfWork implements UnitOfWorkPort {
  private state: MemoryState;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    initialState: MemoryState = emptyMemoryState(),
    private readonly options: InMemoryUnitOfWorkOptions = {},
  ) {
    this.state = copy(initialState);
  }

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft = copy(this.state);
      this.options.faultInjector?.beginTransaction();
      const repositories = repositoriesOver(draft);
      const result = await work(this.options.faultInjector?.wrap(repositories) ?? repositories);
      this.options.beforeCommit?.();
      this.state = draft;
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Copia del estado confirmado (para pruebas). */
  snapshot(): MemoryState {
    return copy(this.state);
  }
}
