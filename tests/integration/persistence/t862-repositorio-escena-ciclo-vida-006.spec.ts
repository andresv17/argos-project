/**
 * T862..T868 (006, Fase 5): operaciones de ciclo de vida del repositorio de la escena que usan los ganchos de privacidad (retiro de la imagen vigente, cancelación del
 * intento en vuelo, fuentes de la imagen, migración D6-09, seudonimización, borrado de la escena y de la foto, y subida del consumo). Contrato único para memoria,
 * SQLite y PostgreSQL real (se omite sin TEST_DATABASE_URL). REQ-ESC6-025, REQ-ESC6-029, REQ-ESC6-030, REQ-ESC6-032; INV-ESC6-005; EDGE-ESC6-021, EDGE-ESC6-030,
 * EDGE-ESC6-033; SC-ESC6-044, SC-ESC6-045, SC-ESC6-047, SC-ESC6-058.
 */
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

const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const NOW = '2026-11-18T12:00:00.000Z';
const LATER = '2026-11-18T12:05:00.000Z';
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const OWNER_SCENE_ID = 'a1000000-0000-4000-8000-000000000002';
const IMAGE_ID = 'a5000000-0000-4000-8000-000000000001';
const attemptId = 'a2000000-0000-4000-8000-000000000001';
const resultId = 'a3000000-0000-4000-8000-000000000001';
const f64 = 'f'.repeat(64);

const withImage: Partial<SceneRecord> = { image: { id: IMAGE_ID, mime: 'image/png', sizeBytes: 10, fingerprint: f64, inputsSnapshot: '{"v":1}', createdAt: NOW }, imageDegraded: true, consumedGenerations: 3 };
const scene = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE_ID, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW, ...over,
});
const attempt = (over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: attemptId, sceneId: SCENE_ID, actorUserId: ANDRES.id, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: f64, inputsSnapshot: '{"v":1}', resultObjectId: resultId,
  phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, providerModel: null, providerLocation: null, quotaWindow: '2026-11', quotaMax: 10, outcome: null, errorCode: null, degraded: false,
  idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null, ...over,
});

type Factory = () => Promise<UnitOfWorkPort>;

function defineLifecycleContract(name: string, create: Factory, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`ciclo de vida de la escena en el repositorio (${name})`, () => {
    afterEach(async () => dispose());
    const prepare = async (over: Partial<SceneRecord> = {}) => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.households.insert(HOUSEHOLD);
        await r.scenes.insert(scene(over));
      });
      return uow;
    };

    it('[REQ-ESC6-030] las fuentes de la imagen se reemplazan completas, sin duplicados y ordenadas; una escena sin fuentes devuelve vacío', async () => {
      const uow = await prepare(withImage);
      const out = await uow.runInTransaction(async (r) => {
        const empty = await r.scenes.findImageSources(SCENE_ID);
        await r.scenes.replaceImageSources(SCENE_ID, [MARIA.id, ANDRES.id, MARIA.id]);
        const first = await r.scenes.findImageSources(SCENE_ID);
        await r.scenes.replaceImageSources(SCENE_ID, [ANDRES.id]);
        return [empty, first, await r.scenes.findImageSources(SCENE_ID)];
      });
      expect(out).toEqual([[], [ANDRES.id, MARIA.id].sort(), [ANDRES.id]]);
    });

    it('[REQ-ESC6-030][SC-ESC6-047] retireImage deja image_* y degradación en NULL/0, vacía las fuentes, conserva la cuota y devuelve el id retirado; sin imagen devuelve null', async () => {
      const uow = await prepare(withImage);
      const out = await uow.runInTransaction(async (r) => {
        await r.scenes.replaceImageSources(SCENE_ID, [ANDRES.id]);
        const retired = await r.scenes.retireImage(SCENE_ID, LATER);
        return [retired, await r.scenes.findById(SCENE_ID), await r.scenes.findImageSources(SCENE_ID), await r.scenes.retireImage(SCENE_ID, LATER)];
      });
      expect(out).toEqual([IMAGE_ID, scene({ consumedGenerations: 3, updatedAt: LATER }), [], null]);
    });

    it('[EDGE-ESC6-021][INV-ESC6-005] cancelInFlight cierra el intento vigente como CANCELLED/DONE y deja la escena sin run_state; devuelve el objeto resultante; sin intento en vuelo devuelve null', async () => {
      const uow = await prepare();
      await uow.runInTransaction((r) => r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(), now: NOW, leaseExpiresAt: '2026-11-18T12:10:00.000Z' }));
      const out = await uow.runInTransaction(async (r) => [
        await r.scenes.cancelInFlight(SCENE_ID, LATER),
        await r.scenes.findById(SCENE_ID),
        await r.scenes.findAttemptById(attemptId),
        await r.scenes.cancelInFlight(SCENE_ID, LATER),
      ]);
      expect(out).toEqual([{ attemptId, resultObjectId: resultId }, scene({ updatedAt: LATER }), attempt({ phase: 'DONE', outcome: 'CANCELLED', finishedAt: LATER }), null]);
    });

    it('[EDGE-ESC6-021] cancelInFlight no toca una escena fallida ni sin intento', async () => {
      const uow = await prepare({ runState: 'failed', currentAttemptId: attemptId });
      expect(await uow.runInTransaction((r) => r.scenes.cancelInFlight(SCENE_ID, LATER))).toBeNull();
      expect(await uow.runInTransaction((r) => r.scenes.findById(SCENE_ID))).toEqual(scene({ runState: 'failed', currentAttemptId: attemptId }));
    });

    it('[REQ-ESC6-032][SC-ESC6-058] adoptOwnerScene migra la escena del propietario al hogar conservando imagen y cuota, y devuelve su id; sin escena propia devuelve null', async () => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.households.insert(HOUSEHOLD);
        await r.scenes.insert(scene({ ...withImage, id: OWNER_SCENE_ID, householdId: null, ownerUserId: MARIA.id }));
      });
      const out = await uow.runInTransaction(async (r) => [
        await r.scenes.adoptOwnerScene(ANDRES.id, HOUSEHOLD.id, LATER),
        await r.scenes.adoptOwnerScene(MARIA.id, HOUSEHOLD.id, LATER),
        await r.scenes.findById(OWNER_SCENE_ID),
        await r.scenes.findByOwnerUserId(MARIA.id),
      ]);
      expect(out).toEqual([null, OWNER_SCENE_ID, scene({ ...withImage, id: OWNER_SCENE_ID, updatedAt: LATER }), null]);
    });

    it('[EDGE-ESC6-030] adoptOwnerScene fusiona: si el hogar ya tenía otra escena (sin imagen) se elimina y se conserva la migrada', async () => {
      const uow = await prepare();
      await uow.runInTransaction((r) => r.scenes.insert(scene({ ...withImage, id: OWNER_SCENE_ID, householdId: null, ownerUserId: MARIA.id })));
      const out = await uow.runInTransaction(async (r) => [await r.scenes.adoptOwnerScene(MARIA.id, HOUSEHOLD.id, LATER), await r.scenes.findById(SCENE_ID), (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.id]);
      expect(out).toEqual([OWNER_SCENE_ID, null, OWNER_SCENE_ID]);
    });

    it('[EDGE-ESC6-033] raiseConsumed sube el consumo de la ventana indicada y nunca lo baja ni toca otra ventana', async () => {
      const uow = await prepare({ consumedGenerations: 3 });
      const out = await uow.runInTransaction(async (r) => {
        await r.scenes.raiseConsumed(SCENE_ID, '2026-11', 7);
        const raised = (await r.scenes.findById(SCENE_ID))?.consumedGenerations;
        await r.scenes.raiseConsumed(SCENE_ID, '2026-11', 2);
        await r.scenes.raiseConsumed(SCENE_ID, '2026-10', 9);
        return [raised, (await r.scenes.findById(SCENE_ID))?.consumedGenerations];
      });
      expect(out).toEqual([7, 7]);
    });

    it('[REQ-ESC6-029] deleteScene borra la escena con sus intentos y fuentes; deleteHouseholdPhoto borra la foto y es idempotente', async () => {
      const uow = await prepare(withImage);
      await uow.runInTransaction(async (r) => {
        await r.scenes.replaceImageSources(SCENE_ID, [ANDRES.id]);
        await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: IMAGE_ID, mime: 'image/png', sizeBytes: 5, uploadedByUserId: ANDRES.id, createdAt: NOW });
      });
      const out = await uow.runInTransaction(async (r) => {
        await r.scenes.deleteHouseholdPhoto(HOUSEHOLD.id);
        await r.scenes.deleteHouseholdPhoto(HOUSEHOLD.id);
        await r.scenes.deleteScene(SCENE_ID);
        return [await r.scenes.findHouseholdPhoto(HOUSEHOLD.id), await r.scenes.findById(SCENE_ID), await r.scenes.findImageSources(SCENE_ID)];
      });
      expect(out).toEqual([null, null, []]);
    });

    it('[REQ-ESC6-029][EDGE-ESC6-022] pseudonymizeUser sustituye el usuario por su seudónimo en las fuentes, la foto y los intentos, sin tocar a otros usuarios', async () => {
      const uow = await prepare(withImage);
      const pseudonym = 'b'.repeat(64);
      await uow.runInTransaction(async (r) => {
        await r.scenes.replaceImageSources(SCENE_ID, [ANDRES.id, MARIA.id]);
        await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: IMAGE_ID, mime: 'image/png', sizeBytes: 5, uploadedByUserId: ANDRES.id, createdAt: NOW });
        await r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(), now: NOW, leaseExpiresAt: '2026-11-18T12:10:00.000Z' });
      });
      const out = await uow.runInTransaction(async (r) => {
        await r.scenes.pseudonymizeUser(ANDRES.id, pseudonym);
        return [await r.scenes.findImageSources(SCENE_ID), (await r.scenes.findHouseholdPhoto(HOUSEHOLD.id))?.uploadedByUserId, (await r.scenes.findAttemptById(attemptId))?.actorUserId];
      });
      expect(out).toEqual([[MARIA.id, pseudonym].sort(), pseudonym, pseudonym]);
    });
  });
}

defineLifecycleContract('memoria', async () => new InMemoryUnitOfWork());

let sqliteDb: SqliteDatabase | undefined;
defineLifecycleContract(
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
// Todas las migraciones vigentes (descubiertas del directorio real: una nueva entra sola; H-J-2, T1116).
const PG_SCHEMA = allPostgresMigrationsSql();

describe.skipIf(!TEST_DATABASE_URL)('ciclo de vida de la escena contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no esta definida)', { timeout: 60_000 }, () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineLifecycleContract(
    'PostgreSQL',
    async () => {
      schema = `argos_lc_${randomUUID().replaceAll('-', '')}`;
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
