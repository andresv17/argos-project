/**
 * Fixture de T1549 (011, Bloque H, #74): siembra directa de hogares y membresías para probar el tope de hogares activos (REQ-HOG11-004, INV-HOG11-001).
 * La siembra escribe por los repositorios (sin pasar por los casos de uso), de modo que puede dejar a una persona POR ENCIMA del tope (EDGE-011-008).
 * Sujeto de las pruebas: Carlos (`carlos_88`); los demás hogares los posee Lucía. Los motores son Memoria, SQLite en proceso, SQLite de dos conexiones y PostgreSQL 17 real.
 */
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import type { LegacyHouseholdMember } from '../../src/domain/households/household-policies.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { canonicalState, createDeps, ANDRES, CARLOS, LUCIA } from './application-harness.ts';
import { seedSqlite } from './sqlite-harness.ts';
import { SpyPasswordHasher } from './test-doubles.ts';

export { ANDRES, CARLOS, LUCIA };
export const CARLOS_USERNAME = 'carlos_88';
/** Valor decidido por Neo (D11-12 = B+C); las pruebas lo fijan en literal para detectar un cambio accidental de la constante. */
export const CAP = 5;

const pad = (n: number, width = 12) => String(n).padStart(width, '0');
export const householdId = (n: number) => `d0000000-0000-4000-8000-${pad(n)}`;
const membershipId = (n: number, k: number) => `e0000000-0000-4000-${pad(k, 4)}-${pad(n)}`;
const invitationId = (n: number) => `f0000000-0000-4000-8000-${pad(n)}`;

export type SeedStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export interface SeedHousehold {
  /** Número estable del hogar (1..n): fija sus ids. */
  readonly n: number;
  /** `OWNER` crea el hogar con Carlos como propietario; `MEMBER` lo posee Lucía y Carlos es miembro. */
  readonly as: 'OWNER' | 'MEMBER';
  readonly status: SeedStatus;
}

const T0 = '2026-03-01T10:00:00.000Z';
const at = (n: number) => `2026-03-${pad(Math.min(n, 28) + 1, 2)}T10:00:00.000Z`;

/** Hogares de Carlos: `active` ACTIVE (la mitad propios, redondeando hacia arriba), más `left` LEFT y `removed` REMOVED (siempre como miembro). */
export function plan(active: number, left = 0, removed = 0): SeedHousehold[] {
  const rows: SeedHousehold[] = [];
  let n = 1;
  for (let i = 0; i < active; i += 1, n += 1) rows.push({ n, as: i % 2 === 0 ? 'OWNER' : 'MEMBER', status: 'ACTIVE' });
  for (let i = 0; i < left; i += 1, n += 1) rows.push({ n, as: 'MEMBER', status: 'LEFT' });
  for (let i = 0; i < removed; i += 1, n += 1) rows.push({ n, as: 'MEMBER', status: 'REMOVED' });
  return rows;
}

const row = (n: number, userId: string, role: 'OWNER' | 'MEMBER', status: SeedStatus | 'ACTIVE', k: number): LegacyHouseholdMember => ({
  membershipId: membershipId(n, k),
  householdId: householdId(n),
  userId,
  role,
  status,
  invitedByUserId: role === 'OWNER' ? null : LUCIA,
  invitedAt: role === 'OWNER' ? null : T0,
  joinedAt: T0,
  firstJoinedAt: T0,
  updatedAt: at(n),
});

/** Siembra los hogares de `plan` en la unidad de trabajo dada. */
export async function seedHouseholds(uow: UnitOfWorkPort, rows: readonly SeedHousehold[]): Promise<void> {
  await uow.runInTransaction(async (r) => {
    for (const h of rows) {
      const owner = h.as === 'OWNER' ? CARLOS : LUCIA;
      await r.households.insert({ id: householdId(h.n), name: `Hogar sembrado ${h.n}`, ownerUserId: owner, createdAt: at(h.n) });
      await r.households.saveMembership(row(h.n, owner, 'OWNER', 'ACTIVE', 1));
      if (h.as === 'MEMBER') await r.households.saveMembership(row(h.n, CARLOS, 'MEMBER', h.status, 2));
    }
  });
}

/** Hogar de Lucía (propietaria) con invitación abierta a Carlos (rol READER); sirve para aceptar. */
export async function seedInvitations(uow: UnitOfWorkPort, numbers: readonly number[]): Promise<void> {
  await uow.runInTransaction(async (r) => {
    for (const n of numbers) {
      await r.households.insert({ id: householdId(n), name: `Hogar invitante ${n}`, ownerUserId: LUCIA, createdAt: at(n) });
      await r.households.saveMembership(row(n, LUCIA, 'OWNER', 'ACTIVE', 1));
      await r.invitations.save({
        invitationId: invitationId(n),
        householdId: householdId(n),
        inviteeUsername: CARLOS_USERNAME,
        inviteeUserId: CARLOS,
        roleOnJoin: 'READER',
        invitedByUserId: LUCIA,
        status: 'INVITED',
        createdAt: at(n),
        respondedAt: null,
      });
    }
  });
}

/** Memoiza las dependencias: los ids deterministas (y los de auditoría) siguen su secuencia entre llamadas y no se repiten. */
export const once = <T>(make: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

/** Quita la invitación de Carlos a Casa Vallejo del estado canónico: las pruebas cuentan solo las invitaciones que siembran. */
export async function clearCanonicalInvitations(uow: UnitOfWorkPort): Promise<void> {
  await uow.runInTransaction(async (r) => r.invitations.deleteForUser(CARLOS));
}

export interface CapTarget {
  readonly name: string;
  readonly uow: UnitOfWorkPort;
  deps(): ApplicationDeps;
  dispose(): Promise<void>;
}

/** Estado observable de Carlos: membresías (todas las filas) y sus invitaciones abiertas, ordenadas (una escritura de más o de menos cambia el resultado). */
export async function stateOfCarlos(uow: UnitOfWorkPort) {
  return uow.runInTransaction(async (r) => {
    const memberships = (await r.households.listMembershipsOfUsers([CARLOS])).map((m) => `${m.householdId}|${m.role}|${m.status}`).sort();
    const open = (await r.invitations.listOpenForUser(CARLOS)).map((i) => `${i.householdId}|${i.status}`).sort();
    return { memberships, open };
  });
}

export const activeCount = async (uow: UnitOfWorkPort, userId = CARLOS): Promise<number> =>
  uow.runInTransaction(async (r) => (await r.households.listMembershipsOfUsers([userId])).filter((m) => m.status === 'ACTIVE').length);

/** Motores de un solo cliente: Memoria y SQLite en proceso (PostgreSQL y SQLite de dos conexiones salen de `concurrent-engines.ts`). */
export async function createLocalTargets(): Promise<CapTarget[]> {
  const memoryUow = new InMemoryUnitOfWork(canonicalState());
  const memory: CapTarget = {
    name: 'memoria',
    uow: memoryUow,
    deps: once(() => createDeps(memoryUow, new FixedClockAdapter(), new SpyPasswordHasher())),
    dispose: async () => undefined,
  };
  const db: SqliteDatabase = openSqliteDatabase(IN_MEMORY_DATABASE);
  const sqliteUow = new SqliteUnitOfWork(db);
  await seedSqlite(sqliteUow, canonicalState());
  const sqlite: CapTarget = {
    name: 'SQLite',
    uow: sqliteUow,
    deps: once(() => createDeps(sqliteUow, new FixedClockAdapter(), new SpyPasswordHasher())),
    dispose: async () => {
      db.close();
    },
  };
  return [memory, sqlite];
}

/** Código del DomainError (o de cualquier error con `code` ERR-*) o `OK`; otro error se relanza. */
export async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code.startsWith('ERR-')) return code;
    throw error;
  }
}
