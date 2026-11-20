import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork, emptyMemoryState } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, HOUSEHOLD, MARIA, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { ControlledStorage } from '../../fixtures/media-harness.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

/**
 * T861 (006, Fase 5): suite de concurrencia de la escena sobre memoria, SQLite y PostgreSQL real (se omite sin TEST_DATABASE_URL): dos solicitudes simultáneas,
 * doble clic, dos usuarios del hogar, entregas duplicadas del worker, frontera mensual y arrendamiento (compare-and-set, claim, T1/T2). REQ-ESC6-012,
 * REQ-ESC6-036; INV-ESC6-003, INV-ESC6-004; EDGE-ESC6-024, EDGE-ESC6-027, EDGE-ESC6-031; SC-ESC6-016, SC-ESC6-059, SC-ESC6-070, SC-ESC6-074.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const UPDATE = { action: 'UPDATE' } as const;
const NEVER = new AbortController().signal;

interface Engine {
  readonly uow: UnitOfWorkPort;
  readonly deps: ApplicationDeps;
  readonly fixture: SceneFixture;
  readonly clock: FixedClockAdapter;
  readonly storage: ControlledStorage;
}

async function build(uow: UnitOfWorkPort, memberAsAdmin = true): Promise<Engine> {
  const state = canonicalState();
  if (memberAsAdmin) state.memberships = state.memberships.map((m) => (m.userId === MARIA && m.householdId === HOUSEHOLD.id ? { ...m, role: 'ADMIN' as const } : m));
  await seedSqlite(uow, state);
  const clock = new FixedClockAdapter();
  const fixture = sceneFixture();
  const storage = new ControlledStorage(() => new Date(clock.nowIsoTimestamp()));
  const deps: ApplicationDeps = {
    ...createDeps(uow, clock, new SpyPasswordHasher()),
    scene: fixture.services,
    media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  };
  return { uow, deps, fixture, clock, storage };
}

const sceneOf = (e: Engine) => e.uow.runInTransaction((r) => r.scenes.findByHouseholdId(HOUSEHOLD.id));
const attemptsOf = async (e: Engine): Promise<number> => {
  const scene = await sceneOf(e);
  return scene === null ? 0 : e.uow.runInTransaction((r) => r.scenes.countAttemptsByScene(scene.id, '0000-01-01T00:00:00.000Z'));
};

function defineConcurrency(name: string, create: () => Promise<{ uow: UnitOfWorkPort; dispose: () => Promise<void> | void }>): void {
  describe(`concurrencia de la escena (${name})`, () => {
    async function withEngine(test: (e: Engine) => Promise<void>): Promise<void> {
      const made = await create();
      try {
        await test(await build(made.uow));
      } finally {
        await made.dispose();
      }
    }

    it('[SC-ESC6-016][REQ-ESC6-012] dos usuarios del hogar piden a la vez: un solo intento, una sola tarea y un solo aceptado; la otra respuesta es el estado generating sin descuento', async () => {
      await withEngine(async (e) => {
        const request = new RequestSceneGenerationUseCase(e.deps);
        const [a, b] = await Promise.all([request.execute(ANDRES, HOUSE, UPDATE, key(1)), request.execute(MARIA, HOUSE, UPDATE, key(2))]);
        expect([a.accepted, b.accepted].sort()).toEqual([false, true]);
        expect([a.view.status, b.view.status]).toEqual(['generating', 'generating']);
        expect([await attemptsOf(e), e.fixture.dispatcher.jobs.length, (await sceneOf(e))?.consumedGenerations]).toEqual([1, 1, 0]);
      });
    });

    it('[SC-ESC6-016][EDGE-ESC6-016] doble clic: la misma clave dos veces, o dos claves, en paralelo dejan un solo intento y una sola tarea', async () => {
      await withEngine(async (e) => {
        const request = new RequestSceneGenerationUseCase(e.deps);
        const same = await Promise.all([request.execute(ANDRES, HOUSE, UPDATE, key(1)), request.execute(ANDRES, HOUSE, UPDATE, key(1)), request.execute(ANDRES, HOUSE, UPDATE, key(2))]);
        expect(same.filter((r) => r.accepted)).toHaveLength(1);
        expect([await attemptsOf(e), e.fixture.dispatcher.jobs.length]).toEqual([1, 1]);
      });
    });

    it('[EDGE-ESC6-024][SC-ESC6-059][SC-ESC6-070] dos entregas concurrentes del mismo attemptId: una sola gana el claim y publica; la otra es NOOP; el generador se llama una vez y la cuota sube 1', async () => {
      await withEngine(async (e) => {
        await new RequestSceneGenerationUseCase(e.deps).execute(ANDRES, HOUSE, UPDATE, key(1));
        const scene = (await sceneOf(e))!;
        const job = { sceneId: scene.id, attemptId: scene.currentAttemptId! };
        const run = new RunSceneGenerationUseCase(e.deps);
        const outcomes = await Promise.all([run.execute(job, NEVER), run.execute(job, NEVER), run.execute(job, NEVER)]);
        expect(outcomes.filter((o) => o === 'PUBLISHED')).toHaveLength(1);
        expect(outcomes.filter((o) => o === 'NOOP')).toHaveLength(2);
        expect(e.fixture.generator.calls).toHaveLength(1);
        expect(await sceneOf(e)).toMatchObject({ runState: null, consumedGenerations: 1, quotaWindow: '2026-11' });
        expect(await e.storage.keys('scenes/')).toHaveLength(1);
      });
    });

    it('[INV-ESC6-003][SC-ESC6-093] dos lecturas concurrentes con el arrendamiento vencido producen una sola transición failed (CAS) y el INTENT pasa a DELETE una sola vez', async () => {
      await withEngine(async (e) => {
        await new RequestSceneGenerationUseCase(e.deps).execute(ANDRES, HOUSE, UPDATE, key(1));
        e.clock.setClock('2026-11-05', '2026-11-05T12:11:00.000Z');
        const get = new GetSceneUseCase(e.deps);
        const views = await Promise.all([get.execute(ANDRES, HOUSE), get.execute(MARIA, HOUSE), get.execute(ANDRES, HOUSE)]);
        expect(views.map((v) => [v.status, v.lastError])).toEqual([['failed', 'ERR-SCENE-LEASE-EXPIRED'], ['failed', 'ERR-SCENE-LEASE-EXPIRED'], ['failed', 'ERR-SCENE-LEASE-EXPIRED']]);
        const scene = (await sceneOf(e))!;
        const attempt = await e.uow.runInTransaction((r) => r.scenes.findAttemptById(scene.currentAttemptId!));
        expect(attempt).toMatchObject({ phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED', finishedAt: '2026-11-05T12:11:00.000Z' });
        expect(await e.uow.runInTransaction((r) => r.mediaQueue.listPending(10))).toHaveLength(1);
      });
    });

    it('[EDGE-ESC6-031][SC-ESC6-074] frontera mensual: iniciada el 30-nov y publicada el 1-dic se imputa a noviembre; una solicitud del 1-dic usa la ventana nueva con la cuota entera', async () => {
      await withEngine(async (e) => {
        e.clock.setClock('2026-11-30', '2026-11-30T23:59:50.000Z');
        await new RequestSceneGenerationUseCase(e.deps).execute(ANDRES, HOUSE, UPDATE, key(1));
        const scene = (await sceneOf(e))!;
        e.clock.setClock('2026-12-01', '2026-12-01T00:00:25.000Z');
        expect(await new RunSceneGenerationUseCase(e.deps).execute({ sceneId: scene.id, attemptId: scene.currentAttemptId! }, NEVER)).toBe('PUBLISHED');
        expect(await sceneOf(e)).toMatchObject({ consumedGenerations: 1, quotaWindow: '2026-11' });
        const view = await new GetSceneUseCase(e.deps).execute(ANDRES, HOUSE);
        expect(view.quota).toMatchObject({ window: '2026-12', remaining: 10 });
      });
    });

    it('[INV-ESC6-004] T1 y T2 concurrentes: una segunda solicitud mientras el worker publica no abre un segundo intento sobre un arrendamiento vigente y la cuota nunca supera el máximo', async () => {
      await withEngine(async (e) => {
        const request = new RequestSceneGenerationUseCase(e.deps);
        await request.execute(ANDRES, HOUSE, UPDATE, key(1));
        const scene = (await sceneOf(e))!;
        const [published, again] = await Promise.all([
          new RunSceneGenerationUseCase(e.deps).execute({ sceneId: scene.id, attemptId: scene.currentAttemptId! }, NEVER),
          request.execute(MARIA, HOUSE, { action: 'REGENERATE' }, key(2)),
        ]);
        expect(published).toBe('PUBLISHED');
        const after = (await sceneOf(e))!;
        expect(after.consumedGenerations).toBeLessThanOrEqual(10);
        expect(after.consumedGenerations).toBe(1);
        expect(await attemptsOf(e)).toBe(again.accepted ? 2 : 1);
      });
    });
  });
}

defineConcurrency('memoria', async () => ({ uow: new InMemoryUnitOfWork(emptyMemoryState()), dispose: () => undefined }));
defineConcurrency('SQLite', async () => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  return { uow, dispose: () => { db.close(); } };
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const PG_MIGRATIONS = [
  '0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql', '0005_pet_media.sql',
  '0006_rate_limit_microchip_scope.sql', '0007_platform_parameters.sql', '0008_share_links.sql', '0009_home_scenes.sql', '0010_pet_life_status.sql', '0011_share_link_deceased_at.sql',
];
const PG_SCHEMA = PG_MIGRATIONS.map((m) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${m}`, import.meta.url), 'utf8')).join('\n');

describe.skipIf(!TEST_DATABASE_URL)('concurrencia de la escena contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no esta definida)', { timeout: 60_000 }, () => {
  defineConcurrency('PostgreSQL', async () => {
    const schema = `argos_cc_${randomUUID().replaceAll('-', '')}`;
    const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 8 });
    await pool.query(PG_SCHEMA);
    return {
      uow: new PostgresUnitOfWork(pool, (client: PoolClientLike) => createPostgresRepositories(client)),
      dispose: async () => {
        await closePool(pool);
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await closePool(admin);
      },
    };
  });
});
