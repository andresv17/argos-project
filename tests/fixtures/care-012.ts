/**
 * Arnés de la feature 012 (Bloque C, #26; T1654): los MISMOS casos de uso de cuidado sobre memoria, SQLite en memoria y PostgreSQL 17 real (se OMITE sin `TEST_DATABASE_URL`).
 * ANDRES es el propietario principal de ARGOS; MARIA toma el rol de hogar indicado (`ADMIN`, `CAREGIVER` o `READER`; el arnés heredado no sabe de `MEMBER`) con ARGOS asignada al hogar.
 *
 * ROJO hasta T1655: importa módulos que aún no existen (`care-routine-use-cases.ts`, `care-log-use-cases.ts`). La API es la SUPUESTA por T1654 (nombres de los `operationId` de `care.openapi.yaml`):
 * `execute(actorUserId, petId, ...)` como el resto de casos de uso. Los puertos `repositories.careRoutines`, `repositories.careLog` y `repositories.caregiverAccess` exponen `listByPet(petId)` con filas en camelCase.
 */
import { DomainError } from '../../src/generated/index.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import {
  CreateCareRoutineUseCase,
  DeactivateCareRoutineUseCase,
  GetHouseholdCareTodayUseCase,
  GetMyCareAccessUseCase,
  GetPetCareTodayUseCase,
  ListCareRoutinesUseCase,
  ListCaregiverAccessUseCase,
  RemoveCaregiverAccessUseCase,
  SetCaregiverAccessUseCase,
  UpdateCareRoutineUseCase,
} from '../../src/application/use-cases/care-routine-use-cases.ts';
import { CreateCareLogEntryUseCase, ListCareLogUseCase, RevertCareLogEntryUseCase } from '../../src/application/use-cases/care-log-use-cases.ts';
import { eraseAccountInTransaction } from '../../src/application/use-cases/account-use-cases.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import type { HouseholdRole } from './record-engines.ts';
import { ANDRES, ARGOS, CARLOS, LUCIA, MARIA, USERS } from './application-harness.ts';
import { createPostgresConcurrentEngine, TEST_DATABASE_URL, type ConcurrentEngine } from './concurrent-engines.ts';
import { createShareEngines, HOUSEHOLD_ID, type ShareEngine } from './share-harness.ts';

export { ANDRES, ARGOS, CARLOS, LUCIA, MARIA, HOUSEHOLD_ID };
export const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';
export const PET = ARGOS.id;
/** Jueves 2026-11-26 10:00 America/Bogota (UTC-5 fijo). */
export const NOW = '2026-11-26T15:00:00.000Z';
export const usernameOf = (userId: string): string => USERS.find((u) => u.id === userId)!.username;

export type Row = Record<string, unknown>;
export type CareRole = Extract<HouseholdRole, 'ADMIN' | 'CAREGIVER' | 'READER'>;

export interface CareEngine {
  readonly name: 'memoria' | 'SQLite' | 'PostgreSQL';
  readonly deps: ApplicationDeps;
  run<T>(work: (r: RepositorySet) => Promise<T>): Promise<T>;
  setNow(iso: string): void;
  dispose(): Promise<void>;
}
export interface CareEngineFactory {
  readonly name: CareEngine['name'];
  readonly enabled: boolean;
  /** `role`: rol de hogar de MARIA (por defecto `CAREGIVER`). */
  make(role?: CareRole): Promise<CareEngine>;
}

const fromShare = (engine: ShareEngine): CareEngine => ({
  name: engine.name,
  deps: engine.deps,
  run: (work) => engine.run(work),
  setNow: (iso) => engine.setNow(iso),
  dispose: async () => engine.close(),
});

const fromConcurrent = async (engine: ConcurrentEngine, role: CareRole): Promise<CareEngine> => {
  const deps = engine.depsA();
  await deps.uow.runInTransaction(async (r) => {
    const members = await r.households.listMemberships(HOUSEHOLD_ID);
    await r.households.saveMembership({ ...members.find((m) => m.userId === MARIA)!, role, status: 'ACTIVE' });
  });
  return { name: 'PostgreSQL', deps, run: (work) => deps.uow.runInTransaction(work), setNow: (iso) => (deps.clock as FixedClockAdapter).setClock(iso.slice(0, 10), iso), dispose: () => engine.dispose() };
};

export const CARE_ENGINE_FACTORIES: readonly CareEngineFactory[] = [
  { name: 'memoria', enabled: true, make: async (role = 'CAREGIVER') => fromShare((await createShareEngines(role)).find((e) => e.name === 'memoria')!) },
  { name: 'SQLite', enabled: true, make: async (role = 'CAREGIVER') => fromShare((await createShareEngines(role)).find((e) => e.name === 'SQLite')!) },
  { name: 'PostgreSQL', enabled: HAS_POSTGRES, make: async (role = 'CAREGIVER') => fromConcurrent(await createPostgresConcurrentEngine(), role) },
];

/** Código del DomainError (de cualquier catálogo) o `OK`; otro error se relanza. */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR-')) return code;
    throw error;
  }
}

export const MED = { kind: 'MEDICATION', title: 'Amoxicilina', instructions: 'Con comida', doseAmount: 250, doseUnit: 'MG', timesOfDay: ['08:00'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-11-20', endDate: '2026-12-04' } as const;
export const MEAL = { kind: 'MEAL', title: 'Cena', timesOfDay: ['09:00', '09:30'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-11-20', ongoing: true } as const;

/** Casos de uso de cuidado ligados a unas dependencias. */
export function careCases(deps: ApplicationDeps) {
  return {
    createRoutine: (actor: string, petId: string, input: Record<string, unknown>) => new CreateCareRoutineUseCase(deps).execute(actor, petId, input),
    updateRoutine: (actor: string, petId: string, routineId: string, input: Record<string, unknown>) => new UpdateCareRoutineUseCase(deps).execute(actor, petId, routineId, input),
    deactivateRoutine: (actor: string, petId: string, routineId: string, expectedVersion: number) => new DeactivateCareRoutineUseCase(deps).execute(actor, petId, routineId, { expectedVersion }),
    listRoutines: (actor: string, petId: string, includeInactive = false) => new ListCareRoutinesUseCase(deps).execute(actor, petId, { includeInactive }),
    today: (actor: string, petId: string) => new GetPetCareTodayUseCase(deps).execute(actor, petId),
    householdToday: (actor: string, householdId: string) => new GetHouseholdCareTodayUseCase(deps).execute(actor, householdId),
    log: (actor: string, petId: string, input: Record<string, unknown>) => new CreateCareLogEntryUseCase(deps).execute(actor, petId, input),
    revert: (actor: string, petId: string, entryId: string, input: Record<string, unknown> = {}) => new RevertCareLogEntryUseCase(deps).execute(actor, petId, entryId, input),
    history: (actor: string, petId: string, query: Record<string, unknown> = {}) => new ListCareLogUseCase(deps).execute(actor, petId, query),
    setAccess: (actor: string, petId: string, userId: string, input: Record<string, unknown>) => new SetCaregiverAccessUseCase(deps).execute(actor, petId, userId, input),
    removeAccess: (actor: string, petId: string, userId: string) => new RemoveCaregiverAccessUseCase(deps).execute(actor, petId, userId),
    listAccess: (actor: string, petId: string) => new ListCaregiverAccessUseCase(deps).execute(actor, petId),
    myAccess: (actor: string, petId: string) => new GetMyCareAccessUseCase(deps).execute(actor, petId),
    erase: (userId: string): Promise<unknown> =>
      deps.uow.runInTransaction(async (r) => {
        const account = await r.users.findById(userId);
        if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
        return eraseAccountInTransaction(deps, r, { userId, account, pseudonym: deps.auditPseudonym.hmacUserId(userId, deps.auditHmacSecret), now: deps.clock.nowIsoTimestamp(), rejectBlocked: () => new DomainError('ERR-ACCOUNT-OWNS-SHARED-PETS') });
      }),
  };
}

export const routineRows = (engine: Pick<CareEngine, 'run'>, petId: string = PET): Promise<Row[]> => engine.run(async (r) => [...(await r.careRoutines.listByPet(petId))] as unknown as Row[]);
export const logRows = (engine: Pick<CareEngine, 'run'>, petId: string = PET): Promise<Row[]> => engine.run(async (r) => [...(await r.careLog.listByPet(petId))] as unknown as Row[]);
export const accessRows = (engine: Pick<CareEngine, 'run'>, petId: string = PET): Promise<Row[]> => engine.run(async (r) => [...(await r.caregiverAccess.listByPet(petId))] as unknown as Row[]);
