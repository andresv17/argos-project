import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserAccount } from '../../../src/application/ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { fixtures, HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { allPostgresMigrationsSql } from '../../fixtures/postgres-migrations.ts';

/**
 * T1296 (i) (009, 5b): consulta de intentos por ventana mensual `quota_window` (YYYY-MM, zona America/Bogota fijada al crear el intento) para la regla de coste,
 * con paridad memoria / SQLite / PostgreSQL. Solo modelo, region y marca de llamada; nunca prompt ni inputs. EDGE-009-036, NFR-009-003; SC-009-051.
 * Contrato: `adminParameters.listSceneSpendAttempts(window)` -> `{ providerModel, providerLocation, providerCallStartedAt }[]` de los intentos de ESA ventana.
 */
const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const NOW = '2026-11-18T12:00:00.000Z';
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const id = (n: number): string => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scene = (): SceneRecord => ({
  id: SCENE_ID, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW,
});
const attempt = (n: number, quotaWindow: string): SceneAttemptRecord => ({
  id: id(n), sceneId: SCENE_ID, actorUserId: ANDRES.id, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}',
  resultObjectId: `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, quotaWindow, quotaMax: 10,
  outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null,
});
type MarkWithCall = (id: string, now: string, call: { model: string | null; location: string | null }) => Promise<void>;
type ListFn = (window: string) => Promise<ReadonlyArray<{ providerModel: string | null; providerLocation: string | null; providerCallStartedAt: string | null }>>;

function defineContract(name: string, create: () => Promise<UnitOfWorkPort>, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`T1296 gasto mensual por intentos (${name})`, () => {
    afterEach(async () => dispose());
    const seed = async () => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.households.insert(HOUSEHOLD);
        await r.scenes.insert(scene());
      });
      const close = (n: number) => (r: Parameters<Parameters<UnitOfWorkPort['runInTransaction']>[0]>[0]) =>
        r.scenes.closeAttempt({ sceneId: SCENE_ID, attemptId: id(n), outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: NOW });
      const plan: Array<[number, string, { model: string | null; location: string | null } | null]> = [
        [1, '2026-11', { model: 'gemini-2.5-flash-image', location: 'us-central1' }],
        [2, '2026-11', { model: null, location: null }],
        [3, '2026-11', null], // cerrado antes del proveedor: sin marca
        [4, '2026-12', { model: 'gemini-3.1-flash-image', location: 'us-central1' }],
      ];
      for (const [n, window, call] of plan) {
        await uow.runInTransaction((r) => r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(n, window), now: NOW, leaseExpiresAt: '2026-11-18T12:10:00.000Z' }));
        if (call !== null) await uow.runInTransaction((r) => (r.scenes.markProviderCall as unknown as MarkWithCall)(id(n), '2026-11-18T12:00:31.000Z', call));
        await uow.runInTransaction(close(n));
      }
      return uow;
    };
    const list = (uow: UnitOfWorkPort, window: string) => uow.runInTransaction((r) => (r.adminParameters as unknown as { listSceneSpendAttempts: ListFn }).listSceneSpendAttempts(window));
    const sort = <T extends { providerModel: string | null; providerCallStartedAt: string | null }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => String(a.providerModel).localeCompare(String(b.providerModel)) || String(a.providerCallStartedAt).localeCompare(String(b.providerCallStartedAt)));

    it('devuelve solo los intentos de la ventana pedida, con modelo, region y marca de llamada (los sin marca vienen con marca null)', async () => {
      const uow = await seed();
      expect(sort(await list(uow, '2026-11'))).toEqual(sort([
        { providerModel: 'gemini-2.5-flash-image', providerLocation: 'us-central1', providerCallStartedAt: '2026-11-18T12:00:31.000Z' },
        { providerModel: null, providerLocation: null, providerCallStartedAt: '2026-11-18T12:00:31.000Z' },
        { providerModel: null, providerLocation: null, providerCallStartedAt: null },
      ]));
      expect(await list(uow, '2026-12')).toEqual([{ providerModel: 'gemini-3.1-flash-image', providerLocation: 'us-central1', providerCallStartedAt: '2026-11-18T12:00:31.000Z' }]);
      expect(await list(uow, '2027-01')).toEqual([]);
    });

    it('no expone prompt, inputs ni ids: solo las tres columnas de coste', async () => {
      const uow = await seed();
      for (const row of await list(uow, '2026-11')) expect(Object.keys(row).sort()).toEqual(['providerCallStartedAt', 'providerLocation', 'providerModel']);
    });
  });
}

defineContract('memoria', async () => new InMemoryUnitOfWork());

let sqliteDb: SqliteDatabase | undefined;
defineContract(
  'SQLite',
  async () => {
    sqliteDb = openSqliteDatabase(IN_MEMORY_DATABASE);
    return new SqliteUnitOfWork(sqliteDb);
  },
  () => {
    sqliteDb?.close();
    sqliteDb = undefined;
  },
);

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const PG_SCHEMA = allPostgresMigrationsSql();
describe.skipIf(TEST_DATABASE_URL === undefined)('T1296 PostgreSQL real', () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineContract(
    'PostgreSQL',
    async () => {
      schema = `argos_t1296_${randomUUID().replaceAll('-', '')}`;
      admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(TEST_DATABASE_URL ?? '');
      url.searchParams.set('options', `-c search_path=${schema}`);
      pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
      await pool.query(PG_SCHEMA);
      return new PostgresUnitOfWork(pool, (client: PoolClientLike) => createPostgresRepositories(client));
    },
    async () => {
      if (pool) await closePool(pool);
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await closePool(admin);
      }
      pool = undefined;
      admin = undefined;
    },
  );
});
