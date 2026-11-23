/**
 * T764 [US4] ciclo de vida del enlace veterinario (REQ-VET-010, REQ-VET-013; SC-005-024, SC-005-042, EDGE-005-05, EDGE-005-32): en memoria, SQLite y PostgreSQL 17 real
 * (se OMITE sin TEST_DATABASE_URL):
 *  - eliminar la mascota borra sus enlaces en la misma transacción y el enlace deja de resolver (SC-005-024);
 *  - la importación de respaldo por REEMPLAZO ejecuta la misma cascada: los enlaces de la mascota reemplazada desaparecen (REQ-VET-010);
 *  - `share_links` y `share_link_audit` quedan FUERA de la exportación (RAMA-005-008): el respaldo no los contiene ni resucita un `token_hash`.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { SharedAccessLimiter } from '../../../src/application/sharing/shared-access-limiter.ts';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { DeletePetUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { CreateShareLinkUseCase } from '../../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, createDeps } from '../../fixtures/application-harness.ts';
import { digestOf, validBackupState } from '../../fixtures/backup-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { KEY, SHARE_IP_SECRET, SequentialShareTokenGenerator, codeOf } from '../../fixtures/share-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const PET_REF = { scope: 'PET', petId: ARGOS.id } as const;

interface Engine {
  readonly uow: UnitOfWorkPort;
  dispose(): Promise<void>;
}
type MakeEngine = () => Promise<Engine>;
const memory: MakeEngine = async () => ({ uow: new InMemoryUnitOfWork(validBackupState()), dispose: async () => undefined });
const sqlite: MakeEngine = async () => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, validBackupState());
  return { uow, dispose: async () => void (db.open && db.close()) };
};
const postgres: MakeEngine = async () => {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import('../../../src/infrastructure/persistence/postgres/postgres-repositories.ts')) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uow, validBackupState());
  return {
    uow,
    dispose: async () => {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

async function open(make: MakeEngine) {
  const engine = await make();
  disposers.push(engine.dispose);
  const deps: ApplicationDeps = { ...createDeps(engine.uow, new FixedClockAdapter(), new SpyPasswordHasher()), sharing: { tokens: new SequentialShareTokenGenerator(), ipHmacSecret: SHARE_IP_SECRET, limiter: new SharedAccessLimiter() } };
  const created = await new CreateShareLinkUseCase(deps).execute(ANDRES, PET_REF, KEY(1), {});
  if (created.kind !== 'CREATED') throw new Error('creación');
  return { uow: engine.uow, deps, token: created.token, linkId: created.link.id };
}

function define(make: MakeEngine): void {
  it('[SC-005-024][REQ-VET-010][EDGE-005-05] eliminar la mascota borra su enlace en la misma transacción: la fila desaparece y el token deja de resolver', async () => {
    const { uow, deps, token } = await open(make);
    expect((await new GetSharedSummaryUseCase(deps).execute(token, '203.0.113.1')).summary.pets).toHaveLength(1);
    await new DeletePetUseCase(deps).execute(ANDRES, ARGOS.id);
    expect(await uow.runInTransaction((r) => r.shareLinks.listAll())).toEqual([]);
    expect(await codeOf(new GetSharedSummaryUseCase(deps).execute(token, '203.0.113.2'))).toBe('ERR-SHARE-NOT-FOUND');
  });

  it('[REQ-VET-010][SC-005-042] la importación de respaldo por REEMPLAZO ejecuta la misma cascada: los enlaces de la mascota reemplazada desaparecen', async () => {
    const { uow, deps, token } = await open(make);
    expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).length).toBe(1);
    const { json } = await new ExportBackupUseCase(deps).execute(ANDRES);
    await new ImportBackupUseCase(deps).execute(ANDRES, json, digestOf(json));
    expect(await uow.runInTransaction((r) => r.shareLinks.listAll())).toEqual([]);
    expect(await codeOf(new GetSharedSummaryUseCase(deps).execute(token, '203.0.113.3'))).toBe('ERR-SHARE-NOT-FOUND');
    expect((await uow.runInTransaction((r) => r.pets.findById(ARGOS.id)))?.name).toBe('Argos');
  });

  it('[REQ-VET-013][SC-005-042][RAMA-005-008] la exportación no contiene enlaces, hashes ni auditoría de accesos: una importación no puede resucitar un token_hash', async () => {
    const { deps, token, linkId } = await open(make);
    await new GetSharedSummaryUseCase(deps).execute(token, '203.0.113.4');
    const { json } = await new ExportBackupUseCase(deps).execute(ANDRES);
    for (const forbidden of [token, linkId, 'share', 'tokenHash', 'token_hash', 'idempotency', 'ip_hmac', 'ipHmac']) expect(json).not.toContain(forbidden);
  });
}

describe('T764 ciclo de vida del enlace (memoria)', () => define(memory));
describe('T764 ciclo de vida del enlace (SQLite)', () => define(sqlite));
describe.skipIf(!TEST_DATABASE_URL)('T764 ciclo de vida del enlace (PostgreSQL real; requiere TEST_DATABASE_URL)', { timeout: 60_000 }, () => define(postgres));
