/**
 * Motores de pruebas de registros (T537, T539): los mismos casos de uso sobre la unidad de trabajo en memoria y sobre SQLite en
 * memoria, con el estado canónico, reloj fijo, ids deterministas y lectura uniforme de la auditoría y del estado completo.
 */
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { DomainError } from '../../src/generated/index.ts';
import { canonicalState, createDeps, createHarness, MARIA } from './application-harness.ts';
import { dumpSqlite, seedSqlite } from './sqlite-harness.ts';
import { upgradePet, upgradeRecords } from './storage-upgrade.ts';
import { SpyPasswordHasher } from './test-doubles.ts';

export type HouseholdRole = 'ADMIN' | 'CAREGIVER' | 'READER';

export interface AuditView {
  readonly mutationType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly previousStateHash: string | null;
  readonly newStateHash: string | null;
}

export interface Engine {
  readonly name: 'memoria' | 'SQLite';
  readonly deps: ApplicationDeps;
  /** Filas de auditoría de la entidad (sin la fila MIGRATION de SQLite). */
  audit(entityId: string): Promise<AuditView[]>;
  /** Estado completo serializado: sirve para exigir «sin cambios» byte a byte. */
  snapshot(): string;
  /** Ids de los registros del módulo (tabla) de la mascota. */
  recordIds(table: string): string[];
  close(): void;
}

/** Rol de María en el hogar canónico: se fija antes de crear el motor. */
function stateWithMariaAs(role: HouseholdRole | null) {
  const state = canonicalState();
  if (role !== null) (state.memberships.find((m) => m.userId === MARIA)! as { role: string }).role = role;
  return state;
}

/** Estado canónico en la forma de almacenamiento vigente (registros con `category`, mascotas 3.x), como lo siembra SQLite. */
function upgradedState(role: HouseholdRole | null) {
  const state = stateWithMariaAs(role);
  return { ...state, pets: state.pets.map(upgradePet), records: upgradeRecords(state.records) } as typeof state;
}

export async function createEngines(role: HouseholdRole | null = null): Promise<Engine[]> {
  const memory = createHarness(upgradedState(role));
  const memoryEngine: Engine = {
    name: 'memoria',
    deps: memory.deps,
    audit: async (entityId) => memory.uow.snapshot().auditLog.filter((r) => r.entityId === entityId),
    snapshot: () => JSON.stringify(memory.uow.snapshot()),
    recordIds: (table) => (memory.uow.snapshot().records as unknown as Record<string, Array<{ id: string }>>)[camel(table)]!.map((r) => r.id),
    close: () => undefined,
  };
  const db: SqliteDatabase = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, stateWithMariaAs(role));
  const sqliteEngine: Engine = {
    name: 'SQLite',
    deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()),
    audit: async (entityId) =>
      (
        db.prepare('SELECT mutation_type AS mutationType, entity_type AS entityType, entity_id AS entityId, previous_state_hash AS previousStateHash, new_state_hash AS newStateHash FROM audit_log WHERE entity_id = ? ORDER BY timestamp, id').all(entityId) as AuditView[]
      ),
    snapshot: () => dumpSqlite(db) + JSON.stringify(db.prepare("SELECT * FROM audit_log WHERE mutation_type <> 'MIGRATION' ORDER BY id").all()),
    recordIds: (table) => (db.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>).map((r) => r.id),
    close: () => db.close(),
  };
  return [memoryEngine, sqliteEngine];
}

const camel = (table: string) => table.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase());

/** Código del DomainError o `OK` (cualquier otro error se relanza). */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}
