import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import type { RecordModule } from '../../src/domain/records/record-invariants.ts';
import type { MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import type { SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { canonicalState } from './application-harness.ts';
import { upgradePet, upgradeRecords } from './storage-upgrade.ts';

/** Guarda en la unidad de trabajo (SQLite o memoria) el estado dado; por defecto, el estado canónico.. */
export async function seedSqlite(uow: UnitOfWorkPort, state: MemoryState = canonicalState()): Promise<void> {
  await uow.runInTransaction(async (r) => {
    for (const user of state.users) await r.users.insert(user);
    for (const [token, session] of Object.entries(state.sessions)) await r.sessions.save(token, session);
    for (const [username, failures] of Object.entries(state.loginFailures)) await r.loginAttempts.replaceFailures(username, failures);
    const records = upgradeRecords(state.records);
    for (const pet of state.pets) await r.pets.save(upgradePet(pet));
    for (const module of Object.keys(records) as RecordModule[]) {
      for (const record of records[module]) await r.records.add(module, record as never);
    }
    for (const household of state.households) await r.households.insert(household);
    for (const membership of state.memberships) await r.households.saveMembership(membership);
  });
}

const TABLES = [
  'users',
  'sessions',
  'login_attempts',
  'pets',
  'weights',
  'body_measurements',
  'vaccinations',
  'dewormings',
  'medical_visits',
  'custom_parameters',
  'households',
  'household_members',
  'household_invitations',
  'backup_confirmation_tokens',
  'rate_limit_events',
];

/** Volcado de todas las filas de todas las tablas, en orden estable: sirve para comparar el estado byte a byte. */
export function dumpSqlite(db: SqliteDatabase): string {
  return JSON.stringify(TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
}
