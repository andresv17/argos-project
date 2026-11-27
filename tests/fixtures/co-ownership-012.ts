/**
 * Arnés de la feature 012 (Bloque A, #22; T1615): los MISMOS casos de uso de co-propiedad sobre memoria, SQLite en memoria y PostgreSQL 17 real (se OMITE sin `TEST_DATABASE_URL`),
 * más el par de conexiones para las carreras (SQLite con DOS conexiones al mismo archivo y PostgreSQL con DOS sesiones; memoria serializa).
 *
 * ROJO hasta T1616: importa módulos que aún no existen (`co-ownership-use-cases.ts`, `owner-request-use-cases.ts`). La API de los casos de uso es la SUPUESTA por T1615 (nombres de los
 * `operationId` de `contracts/openapi/co-ownership.openapi.yaml`): `execute(actorUserId, ...)` como el resto de casos de uso; el repositorio `repositories.coOwners` y `repositories.ownerRequests`
 * (puertos `CoOwnerRepository` y `OwnerRequestRepository` del plan) exponen `listByPet(petId)` y `insert(fila)` con filas en camelCase.
 */
import { DomainError } from '../../src/generated/index.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import {
  AcceptCoOwnerInvitationUseCase,
  AckPromotionNoticeUseCase,
  DeclineCoOwnerInvitationUseCase,
  GetPetOwnershipUseCase,
  InviteCoOwnerUseCase,
  LeavePetUseCase,
} from '../../src/application/use-cases/co-ownership-use-cases.ts';
import { ApproveOwnerRequestUseCase, CreateOwnerRequestUseCase, ListMyOwnerRequestsUseCase, RejectOwnerRequestUseCase } from '../../src/application/use-cases/owner-request-use-cases.ts';
import { eraseAccountInTransaction } from '../../src/application/use-cases/account-use-cases.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { ANDRES, ARGOS, CARLOS, LUCIA, MARIA, USERS } from './application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, gate, holdBeforeCommit, TEST_DATABASE_URL, type ConcurrentEngine } from './concurrent-engines.ts';
import { createShareEngines, type ShareEngine } from './share-harness.ts';

export { ANDRES, ARGOS, CARLOS, LUCIA, MARIA };
export const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';
export const PET = ARGOS.id;
export const NOW = '2026-11-26T10:00:00.000Z';
export const usernameOf = (userId: string): string => USERS.find((u) => u.id === userId)!.username;

/** Una fila de `pet_co_owners` o de `owner_requests` en camelCase, como la devuelven los puertos. */
export type Row = Record<string, unknown>;

export interface Engine012 {
  readonly name: 'memoria' | 'SQLite' | 'PostgreSQL';
  readonly deps: ApplicationDeps;
  /** `true` si `deps.sharing` está conectado (memoria y SQLite): el enlace `PET` solo se prueba ahí. */
  readonly sharing: boolean;
  run<T>(work: (r: RepositorySet) => Promise<T>): Promise<T>;
  setNow(iso: string): void;
  tokens(): readonly string[];
  /** Tipos de mutación auditados sobre la mascota (`audit_log`), en orden. */
  auditTypes(petId: string): Promise<string[]>;
  dispose(): Promise<void>;
}
export interface Engine012Factory {
  readonly name: Engine012['name'];
  readonly enabled: boolean;
  make(): Promise<Engine012>;
}

const fromShare = (engine: ShareEngine): Engine012 => ({
  name: engine.name,
  deps: engine.deps,
  sharing: true,
  run: (work) => engine.run(work),
  setNow: (iso) => engine.setNow(iso),
  tokens: () => engine.tokens.issued,
  auditTypes: async (petId) => (await engine.base.audit('PET')).filter((r) => r.entityId === petId).map((r) => r.mutationType),
  dispose: async () => engine.close(),
});

const fromConcurrent = (engine: ConcurrentEngine): Engine012 => {
  const deps = engine.depsA();
  return {
    name: engine.name === 'PostgreSQL' ? 'PostgreSQL' : 'SQLite',
    deps,
    sharing: false,
    run: (work) => deps.uow.runInTransaction(work),
    setNow: (iso) => (deps.clock as FixedClockAdapter).setClock(iso.slice(0, 10), iso),
    tokens: () => [],
    auditTypes: async (petId) => (await engine.audit(petId)).map((row) => row[0]!),
    dispose: () => engine.dispose(),
  };
};

export const ENGINE_FACTORIES: readonly Engine012Factory[] = [
  { name: 'memoria', enabled: true, make: async () => fromShare((await createShareEngines()).find((e) => e.name === 'memoria')!) },
  { name: 'SQLite', enabled: true, make: async () => fromShare((await createShareEngines()).find((e) => e.name === 'SQLite')!) },
  { name: 'PostgreSQL', enabled: HAS_POSTGRES, make: async () => fromConcurrent(await createPostgresConcurrentEngine()) },
];

/** Dos clientes sobre el MISMO almacenamiento: memoria comparte las dependencias; SQLite (dos conexiones) y PostgreSQL (dos sesiones) las separan. */
export interface RaceEngine {
  readonly name: 'memoria' | 'SQLite' | 'PostgreSQL';
  readonly a: ApplicationDeps;
  /** Ejecuta `call` como cliente B (SQLite reintenta ante SQLITE_BUSY; PostgreSQL espera el candado). */
  b<T>(call: (deps: ApplicationDeps) => Promise<T>): Promise<T>;
  /** Cliente B con el trabajo A retenido ANTES de confirmar (candado por mascota tomado): `release` lo suelta. */
  holdingA<T>(first: (deps: ApplicationDeps) => Promise<T>): { readonly entered: Promise<void>; release(): void; readonly result: Promise<T> };
  setNow(iso: string): void;
  dispose(): Promise<void>;
}
export interface RaceFactory {
  readonly name: RaceEngine['name'];
  readonly enabled: boolean;
  make(): Promise<RaceEngine>;
}

const fromRace = (engine: ConcurrentEngine, name: RaceEngine['name']): RaceEngine => ({
  name,
  a: engine.depsA(),
  b: (call) => engine.asClientB(call).result,
  holdingA: (first) => {
    const entered = gate();
    const hold = gate();
    const result = first(engine.depsA(holdBeforeCommit(engine.uowA, () => entered.open(), hold.promise)));
    return { entered: entered.promise, release: () => hold.open(), result };
  },
  setNow: (iso) => (engine.depsA().clock as FixedClockAdapter).setClock(iso.slice(0, 10), iso),
  dispose: () => engine.dispose(),
});

export const RACE_FACTORIES: readonly RaceFactory[] = [
  {
    name: 'memoria',
    enabled: true,
    make: async () => {
      const share = (await createShareEngines()).find((e) => e.name === 'memoria')!;
      return {
        name: 'memoria',
        a: share.deps,
        b: (call) => call(share.deps),
        holdingA: (first) => ({ entered: Promise.resolve(), release: () => undefined, result: first(share.deps) }),
        setNow: (iso) => share.setNow(iso),
        dispose: async () => share.close(),
      };
    },
  },
  { name: 'SQLite', enabled: true, make: async () => fromRace(await createSqliteConcurrentEngine(), 'SQLite') },
  { name: 'PostgreSQL', enabled: HAS_POSTGRES, make: async () => fromRace(await createPostgresConcurrentEngine(), 'PostgreSQL') },
];

/** Código del DomainError o `OK` (cualquier otro error se relanza). */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    // Los códigos ERR-OWN12-* aún no están en el catálogo generado: se aceptan como texto si el error trae `code`.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR-')) return code;
    throw error;
  }
}

/** Casos de uso de 012 ligados a unas dependencias. */
export function cases(deps: ApplicationDeps) {
  return {
    invite: (actor: string, petId: string, username: string) => new InviteCoOwnerUseCase(deps).execute(actor, petId, { username }),
    accept: (actor: string, coOwnerId: string) => new AcceptCoOwnerInvitationUseCase(deps).execute(actor, coOwnerId),
    decline: (actor: string, coOwnerId: string) => new DeclineCoOwnerInvitationUseCase(deps).execute(actor, coOwnerId),
    leave: (actor: string, petId: string, successorUserId?: string) => new LeavePetUseCase(deps).execute(actor, petId, successorUserId === undefined ? {} : { successorUserId }),
    ownership: (actor: string, petId: string) => new GetPetOwnershipUseCase(deps).execute(actor, petId),
    ackPromotion: (actor: string, petId: string) => new AckPromotionNoticeUseCase(deps).execute(actor, petId),
    request: (actor: string, petId: string, input: { action: 'DELETE_PET' | 'TRANSFER_PRINCIPAL' | 'CHANGE_PRINCIPAL'; targetUserId?: string; message?: string }) => new CreateOwnerRequestUseCase(deps).execute(actor, petId, input),
    approve: (actor: string, requestId: string) => new ApproveOwnerRequestUseCase(deps).execute(actor, requestId),
    reject: (actor: string, requestId: string) => new RejectOwnerRequestUseCase(deps).execute(actor, requestId),
    myRequests: (actor: string) => new ListMyOwnerRequestsUseCase(deps).execute(actor),
    /** Supresión de cuenta (misma función que usan las dos vías de borrado): `ERR-ACCOUNT-OWNS-SHARED-PETS` si algo bloquea. */
    erase: (userId: string): Promise<unknown> =>
      deps.uow.runInTransaction(async (r) => {
        const account = await r.users.findById(userId);
        if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
        return eraseAccountInTransaction(deps, r, {
          userId,
          account,
          pseudonym: deps.auditPseudonym.hmacUserId(userId, deps.auditHmacSecret),
          now: deps.clock.nowIsoTimestamp(),
          rejectBlocked: () => new DomainError('ERR-ACCOUNT-OWNS-SHARED-PETS'),
        });
      }),
  };
}

/** Filas de co-propiedad y de solicitudes de una mascota (camelCase), por los puertos. */
export const coOwnerRows = (engine: { run: Engine012['run'] }, petId: string): Promise<Row[]> => engine.run(async (r) => [...(await r.coOwners.listByPet(petId))] as unknown as Row[]);
export const requestRows = (engine: { run: Engine012['run'] }, petId: string): Promise<Row[]> => engine.run(async (r) => [...(await r.ownerRequests.listByPet(petId))] as unknown as Row[]);
export const principalOf = (engine: { run: Engine012['run'] }, petId: string): Promise<string | null> => engine.run(async (r) => (await r.pets.findById(petId))?.ownerUserId ?? null);

/** Invita y acepta en orden, separando `joined_at` un minuto entre una y otra (la antigüedad decide la sucesión). */
export async function makeCoOwners(engine: Pick<Engine012, 'deps' | 'run' | 'setNow'>, userIds: readonly string[], petId: string = PET, principal: string = ANDRES): Promise<string[]> {
  const use = cases(engine.deps);
  const ids: string[] = [];
  let minute = 0;
  for (const userId of userIds) {
    minute += 1;
    engine.setNow(`2026-11-26T10:${String(minute).padStart(2, '0')}:00.000Z`);
    await use.invite(principal, petId, usernameOf(userId));
    const row = (await coOwnerRows(engine, petId)).find((x) => x['userId'] === userId && x['status'] === 'INVITED')!;
    await use.accept(userId, row['id'] as string);
    ids.push(row['id'] as string);
  }
  engine.setNow('2026-11-26T11:00:00.000Z');
  return ids;
}

/** Todas las solicitudes (incluidas las de mascota ya eliminada, `petId` nulo): para las disputas que sobreviven a la mascota (`INV-CHP12-005`). */
export const allRequestRows = (engine: { run: Engine012['run'] }): Promise<Row[]> => engine.run(async (r) => [...(await r.ownerRequests.listAll())] as unknown as Row[]);

/** Quita las asignaciones a hogares de la mascota: así `ERR-ACCOUNT-OWNS-SHARED-PETS` no interfiere con las carreras de supresión (002 sigue intacta y se prueba aparte). */
export async function unshare(deps: ApplicationDeps, petId: string = PET): Promise<void> {
  await deps.uow.runInTransaction(async (r) => {
    for (const assignment of await r.assignments.listByPet(petId)) await r.assignments.remove(petId, assignment.householdId);
  });
}

/**
 * Doble de repositorio para `REQ-OWN12-011`: toda escritura de `pets` cuyo nombre contenga «owner» (el `UPDATE … WHERE owner_user_id = esperado` del cambio de principal) afecta 0 filas y se cuenta.
 * El nombre exacto del método lo fija T1616: la prueba solo depende de que contenga `owner`.
 */
export function withZeroRowOwnerWrites(deps: ApplicationDeps): { readonly deps: ApplicationDeps; attempts(): number } {
  let attempts = 0;
  const wrap = (repositories: RepositorySet): RepositorySet =>
    ({
      ...repositories,
      pets: new Proxy(repositories.pets as object, {
        get: (target, property, receiver) => {
          const value = Reflect.get(target, property, receiver) as unknown;
          if (typeof property !== 'string' || typeof value !== 'function' || /^(find|list|count|get)/.test(property) || !/owner/i.test(property)) return value;
          return () => {
            attempts += 1;
            return Promise.resolve(0);
          };
        },
      }),
    }) as RepositorySet;
  return { deps: { ...deps, uow: { ...deps.uow, runInTransaction: (work) => deps.uow.runInTransaction((r) => work(wrap(r))) } }, attempts: () => attempts };
}
