/**
 * Repositorios en memoria detrás de UnitOfWorkPort (plan §4, creados en TASK-108 para los tests de casos de uso).
 * - Cada transacción trabaja sobre una copia profunda del estado; si `work` termina y `beforeCommit` no lanza, la
 *   copia reemplaza al estado; si no, se descarta y la promesa se rechaza con el error original (INV-ARCH-005).
 * - Las transacciones se ejecutan en serie, en orden de llegada.
 * - Los objetos devueltos son copias: modificarlos no altera el estado guardado.
 * - Restricciones equivalentes a las de SQLite: id y username únicos en usuarios; id único por módulo de registros.
 *
 * @implements INV-ARCH-004, INV-ARCH-005
 */

import type { Household, HouseholdMember, PetProfile } from '../../../generated/index.ts';
import type {
  HouseholdRepositoryPort,
  LoginAttemptRepositoryPort,
  MedicalRecordRepositoryPort,
  PetRepositoryPort,
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
  memberships: HouseholdMember[];
}

export interface InMemoryUnitOfWorkOptions {
  /** Se ejecuta justo antes de confirmar; si lanza, la transacción se descarta (simula un fallo de commit). */
  readonly beforeCommit?: () => void;
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
    async add<M extends RecordModule>(module: M, record: RecordOf<M>) {
      const collection = state.records[module] as Array<RecordOf<M>>;
      if (collection.some((r) => r.id === record.id)) {
        throw new Error(`${module}: id duplicado (${record.id})`);
      }
      collection.push(copy(record));
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
      const result = await work(repositoriesOver(draft));
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
