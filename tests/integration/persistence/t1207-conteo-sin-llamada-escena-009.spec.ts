/**
 * T1207, T1279, T1211 (009, Fase 1, bloque A, `#60`): batería ÚNICA de conteo de intentos sin llamada al proveedor, ejecutada en Memoria, SQLite y PostgreSQL real
 * (se OMITE sin TEST_DATABASE_URL), más la forma del SQL de PostgreSQL contra el doble del cliente y la ausencia de migración nueva por `#60`.
 * REQ-LIM9-001, REQ-LIM9-002, REQ-LIM9-004, REQ-LIM9-005, REQ-LIM9-006, INV-LIM9-001; EDGE-009-027, EDGE-009-029, EDGE-009-030, EDGE-009-041, EDGE-009-043;
 * SC-009-036, SC-009-037, SC-009-040, SC-009-041, SC-009-042, SC-009-043.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserAccount } from '../../../src/application/ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { evaluateAttemptLimits } from '../../../src/domain/scene/attempt-limits.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { fixtures, HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { fakeClient } from '../../fixtures/pg-fake-client.ts';
import { allPostgresMigrationsSql } from '../../fixtures/postgres-migrations.ts';

const account = (user: object): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash: 'h' }) as UserAccount;
const ANDRES = account(fixtures.users[0]);
const MARIA = account(fixtures.users[1]);
const NOW = '2026-11-18T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const OTHER_SCENE = 'a1000000-0000-4000-8000-000000000002';
const attemptId = (n: number): string => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scene = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE_ID, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW, ...over,
});
const attempt = (n: number, over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: attemptId(n), sceneId: SCENE_ID, actorUserId: ANDRES.id, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}',
  resultObjectId: `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, quotaWindow: '2026-11', quotaMax: 10,
  outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null, ...over,
});
/** Intento cerrado: `called` = con marca de llamada. */
const closed = (outcome: 'FAILED' | 'CANCELLED' | 'SUCCEEDED', t: number, called: boolean, over: Partial<SceneAttemptRecord> = {}): Partial<SceneAttemptRecord> => ({
  startedAt: at(t), finishedAt: at(t + 5), phase: 'DONE', outcome, providerCallStartedAt: called ? at(t + 1) : null, ...over,
});

type Factory = () => Promise<UnitOfWorkPort>;

function defineBattery(name: string, create: Factory, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`batería de conteo sin llamada (#60) (${name})`, () => {
    afterEach(async () => dispose());
    const prepare = async () => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.households.insert(HOUSEHOLD);
        await r.scenes.insert(scene());
      });
      return uow;
    };
    // Cada intento se inserta con su propio T1; el arrendamiento previo se vence para admitir el siguiente.
    const put = async (uow: UnitOfWorkPort, n: number, over: Partial<SceneAttemptRecord>) => {
      await uow.runInTransaction(async (r) => {
        await r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(n, over), now: over.startedAt ?? NOW, leaseExpiresAt: at(-1) });
      });
    };

    it('[SC-009-036][REQ-LIM9-001][INV-LIM9-001][EDGE-009-029] tres FAILED sin marca no cuentan para FAILED_LIMIT ni suben startedByActor (cerrados); las filas heredadas sin marca dejan de contar', async () => {
      const uow = await prepare();
      for (const n of [1, 2, 3]) await put(uow, n, closed('FAILED', n * 100, false));
      const result = await uow.runInTransaction(async (r) => ({
        failed: await r.scenes.countFailedAttemptsByScene(SCENE_ID, at(0)),
        actor: await r.scenes.countAttemptsByActor(ANDRES.id, at(0)),
      }));
      expect(result).toEqual({ failed: { count: 0, oldestAt: null }, actor: 0 });
      const limits = evaluateAttemptLimits({ now: at(2000), lastStartedAt: at(300), failedInWindow: result.failed.count, oldestFailedStartedAt: result.failed.oldestAt, startedByActor: result.actor, oldestActorStartedAt: null });
      expect(limits).toEqual({ allowed: true });
    });

    it('[SC-009-037][REQ-LIM9-006] un FAILED con marca de llamada sigue contando para FAILED_LIMIT y para ACTOR_LIMIT, con su instante más antiguo', async () => {
      const uow = await prepare();
      await put(uow, 1, closed('FAILED', 100, true));
      await put(uow, 2, closed('FAILED', 200, true));
      await put(uow, 3, closed('FAILED', 300, false));
      await put(uow, 4, closed('SUCCEEDED', 400, true));
      const result = await uow.runInTransaction(async (r) => [await r.scenes.countFailedAttemptsByScene(SCENE_ID, at(0)), await r.scenes.countAttemptsByActor(ANDRES.id, at(0))]);
      expect(result).toEqual([{ count: 2, oldestAt: at(100) }, 3]);
    });

    it('[EDGE-009-027][INV-LIM9-001] un intento en vuelo (sin outcome y sin marca) cuenta para ACTOR_LIMIT mientras esté activo; no cuenta para FAILED_LIMIT; al cerrarse sin llamada deja de contar', async () => {
      const uow = await prepare();
      await put(uow, 1, { startedAt: at(100) });
      const active = await uow.runInTransaction(async (r) => [await r.scenes.countAttemptsByActor(ANDRES.id, at(0)), (await r.scenes.countFailedAttemptsByScene(SCENE_ID, at(0))).count]);
      expect(active).toEqual([1, 0]);
      await uow.runInTransaction(async (r) => {
        await r.scenes.closeAttempt({ sceneId: SCENE_ID, attemptId: attemptId(1), outcome: 'CANCELLED', errorCode: null, degraded: false, now: at(110) });
      });
      expect(await uow.runInTransaction((r) => r.scenes.countAttemptsByActor(ANDRES.id, at(0)))).toBe(0);
    });

    it('[SC-009-043][EDGE-009-030] el cooldown de 60 s se mantiene para todo intento, con o sin marca (lastAttemptStartedAt y countAttemptsByScene no filtran)', async () => {
      const uow = await prepare();
      await put(uow, 1, closed('FAILED', 100, false));
      const seen = await uow.runInTransaction(async (r) => [await r.scenes.lastAttemptStartedAt(SCENE_ID), await r.scenes.countAttemptsByScene(SCENE_ID, at(0))]);
      expect(seen).toEqual([at(100), 1]);
      expect(evaluateAttemptLimits({ now: at(130), lastStartedAt: at(100), failedInWindow: 0, oldestFailedStartedAt: null, startedByActor: 0, oldestActorStartedAt: null })).toMatchObject({ allowed: false, reason: 'COOLDOWN' });
    });

    it('[EDGE-009-041][REQ-LIM9-002] cancelStaleUnmarkedAttempts cierra CANCELLED sin llamada el intento sin outcome ni marca iniciado antes del plazo; deja intactos los marcados, los recientes y los de otra escena/actor; libera la escena', async () => {
      const uow = await prepare();
      await put(uow, 1, { startedAt: at(0) });
      await uow.runInTransaction(async (r) => {
        await r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(2, { startedAt: at(700), providerCallStartedAt: at(701) }), now: at(700), leaseExpiresAt: at(2000) });
      });
      const cancelled = await uow.runInTransaction((r) => r.scenes.cancelStaleUnmarkedAttempts(SCENE_ID, ANDRES.id, at(100), at(700)));
      expect(cancelled).toBe(1);
      const state = await uow.runInTransaction(async (r) => [await r.scenes.findAttemptById(attemptId(1)), await r.scenes.findAttemptById(attemptId(2)), await r.scenes.findById(SCENE_ID)]);
      expect(state[0]).toMatchObject({ outcome: 'CANCELLED', phase: 'DONE', providerCallStartedAt: null, finishedAt: at(700) });
      expect(state[1]).toMatchObject({ outcome: null, providerCallStartedAt: at(701) });
      expect(state[2]).toMatchObject({ runState: 'generating', currentAttemptId: attemptId(2) });
      expect(await uow.runInTransaction((r) => r.scenes.cancelStaleUnmarkedAttempts(SCENE_ID, ANDRES.id, at(100), at(701)))).toBe(0);
    });

    it('[EDGE-009-041] a los 10 min exactos del inicio el intento sin marca sale del conteo del actor (plazo único) y queda CANCELLED', async () => {
      const uow = await prepare();
      await put(uow, 1, { startedAt: at(0) });
      const before = await uow.runInTransaction(async (r) => {
        await r.scenes.cancelStaleUnmarkedAttempts(SCENE_ID, ANDRES.id, at(0 - 600 + 599), at(599));
        return r.scenes.countAttemptsByActor(ANDRES.id, at(-86_400));
      });
      expect(before).toBe(1);
      const after = await uow.runInTransaction(async (r) => {
        await r.scenes.cancelStaleUnmarkedAttempts(SCENE_ID, ANDRES.id, at(1), at(601));
        return [await r.scenes.countAttemptsByActor(ANDRES.id, at(-86_400)), (await r.scenes.findAttemptById(attemptId(1)))?.outcome];
      });
      expect(after).toEqual([0, 'CANCELLED']);
    });

    it('[EDGE-009-043] countClosedWithoutCallByScene cuenta los intentos cerrados sin marca de la escena (FAILED y CANCELLED), con su instante más antiguo; ni los marcados, ni los en vuelo, ni los de otra escena', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => void (await r.scenes.insert(scene({ id: OTHER_SCENE, householdId: null, ownerUserId: MARIA.id }))));
      await put(uow, 1, closed('FAILED', 100, false));
      await put(uow, 2, closed('CANCELLED', 200, false));
      await put(uow, 3, closed('FAILED', 300, true));
      await put(uow, 4, { startedAt: at(400) });
      await uow.runInTransaction(async (r) => {
        await r.scenes.beginGeneration({ sceneId: OTHER_SCENE, attempt: attempt(5, { sceneId: OTHER_SCENE, ...closed('FAILED', 500, false) }), now: at(500), leaseExpiresAt: at(-1) });
      });
      const counts = await uow.runInTransaction(async (r) => [
        await r.scenes.countClosedWithoutCallByScene(SCENE_ID, at(0)),
        await r.scenes.countClosedWithoutCallByScene(SCENE_ID, at(150)),
        await r.scenes.countClosedWithoutCallByScene(SCENE_ID, at(1000)),
      ]);
      expect(counts).toEqual([{ count: 2, oldestAt: at(100) }, { count: 1, oldestAt: at(200) }, { count: 0, oldestAt: null }]);
    });

    it('[EDGE-009-043] con 20 intentos cerrados sin llamada en 24 h la evaluación responde FAILED_LIMIT (mismo código); con 19 permite; el valor máximo entra como dato', () => {
      const base = { now: at(5000), lastStartedAt: at(1), failedInWindow: 0, oldestFailedStartedAt: null, startedByActor: 0, oldestActorStartedAt: null };
      expect(evaluateAttemptLimits({ ...base, closedWithoutCall: { count: 19, oldestAt: at(10), max: 20 } })).toEqual({ allowed: true });
      expect(evaluateAttemptLimits({ ...base, closedWithoutCall: { count: 20, oldestAt: at(10), max: 20 } })).toEqual({ allowed: false, reason: 'FAILED_LIMIT', retryAfterSeconds: 86_400 + 10 - 5000 });
    });
  });
}

defineBattery('memoria', async () => new InMemoryUnitOfWork());

let sqliteDb: SqliteDatabase | undefined;
defineBattery(
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
describe.skipIf(!TEST_DATABASE_URL)('batería de conteo sin llamada (#60) contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', { timeout: 60_000 }, () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineBattery(
    'PostgreSQL',
    async () => {
      schema = `argos_sc9_${randomUUID().replaceAll('-', '')}`;
      admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(TEST_DATABASE_URL ?? '');
      url.searchParams.set('options', `-c search_path=${schema}`);
      pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
      await pool.query(allPostgresMigrationsSql());
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

describe('SQL de PostgreSQL del conteo sin llamada (doble del cliente; REQ-LIM9-001, REQ-LIM9-002, REQ-LIM9-004)', () => {
  it('[SC-009-040][REQ-LIM9-001] countFailedAttemptsByScene filtra outcome = FAILED y provider_call_started_at IS NOT NULL, parametrizado', async () => {
    const client = fakeClient({ rows: [{ n: '0', oldest: null }] });
    await createPostgresRepositories(client as never).scenes.countFailedAttemptsByScene(SCENE_ID, at(0));
    expect(client.calls).toEqual([
      { sql: "SELECT count(*) AS n, min(started_at) AS oldest FROM scene_attempts WHERE scene_id = $1 AND outcome = 'FAILED' AND provider_call_started_at IS NOT NULL AND started_at >= $2", values: [SCENE_ID, at(0)] },
    ]);
  });

  it('[SC-009-040][REQ-LIM9-002] countAttemptsByActor cuenta marcados O en vuelo (outcome IS NULL), parametrizado', async () => {
    const client = fakeClient({ rows: [{ n: '0' }] });
    await createPostgresRepositories(client as never).scenes.countAttemptsByActor(ANDRES.id, at(0));
    expect(client.calls).toEqual([
      { sql: 'SELECT count(*) AS n FROM scene_attempts WHERE actor_user_id = $1 AND started_at >= $2 AND (provider_call_started_at IS NOT NULL OR outcome IS NULL)', values: [ANDRES.id, at(0)] },
    ]);
  });

  it('[EDGE-009-043][REQ-LIM9-004] countClosedWithoutCallByScene: outcome no nulo y provider_call_started_at nulo', async () => {
    const client = fakeClient({ rows: [{ n: '0', oldest: null }] });
    await createPostgresRepositories(client as never).scenes.countClosedWithoutCallByScene(SCENE_ID, at(0));
    expect(client.calls).toEqual([
      { sql: 'SELECT count(*) AS n, min(started_at) AS oldest FROM scene_attempts WHERE scene_id = $1 AND outcome IS NOT NULL AND provider_call_started_at IS NULL AND started_at >= $2', values: [SCENE_ID, at(0)] },
    ]);
  });
});

describe('sin migración nueva por #60 (REQ-LIM9-005, SC-009-041)', () => {
  const root = join(__dirname, '../../../src/infrastructure/persistence');
  it.each(['sqlite', 'postgres'])('[SC-009-041][REQ-LIM9-005] en %s la columna provider_call_started_at se declara solo en la migración que crea scene_attempts y ninguna migración la altera ni la indexa', (engine) => {
    const dir = join(root, engine, 'migrations');
    const mentions = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('provider_call_started_at'));
    expect(mentions).toEqual([engine === 'sqlite' ? '0013_home_scenes.sql' : '0009_home_scenes.sql']);
  });
});
