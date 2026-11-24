import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet, UserAccount } from '../../../src/application/ports/repositories.port.ts';
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
 * T1295 (Feature 009, Fase 5b, #20; D9-22 = A, EDGE-009-045): PRUEBAS ROJAS de las columnas `provider_model` y `provider_location` de `scene_attempts`
 * (migracion de Nivel 2 de T1298). Cada intento registra el modelo y la region de SU llamada al marcar `provider_call_started_at`, sin valores de prompt,
 * con paridad SQLite / Postgres / Memoria. REQ-CFG9-002, REQ-CFG9-004, NFR-009-003; EDGE-009-021, EDGE-009-045; SC-009-022, SC-009-027, SC-009-051.
 *
 * Forma que estas pruebas FIJAN para T1298 (propuesta de /keymaker, a confirmar por /architect): `markProviderCall(attemptId, now, { model, location })` y
 * los campos `providerModel` / `providerLocation` (`string | null`) de `SceneAttemptRecord`. Filas previas y sin llamada: `null` en ambos.
 */
const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const NOW = '2026-11-18T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const attemptId = (n: number): string => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scene = (): SceneRecord => ({
  id: SCENE_ID, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW,
});
const attempt = (n: number): SceneAttemptRecord => ({
  id: attemptId(n), sceneId: SCENE_ID, actorUserId: ANDRES.id, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}',
  resultObjectId: `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, quotaWindow: '2026-11', quotaMax: 10,
  outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null,
});
type Marked = SceneAttemptRecord & { providerModel?: string | null; providerLocation?: string | null };
type MarkWithCall = (id: string, now: string, call?: { model: string; location: string }) => Promise<void>;

function defineContract(name: string, create: () => Promise<UnitOfWorkPort>, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`T1295 [EDGE-009-045] modelo y región por intento (${name})`, () => {
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
    const begin = (n: number, now: string) => (r: RepositorySet) => r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(n), now, leaseExpiresAt: at(600) });
    const mark = (n: number, now: string, call: { model: string; location: string }) => (r: RepositorySet) => (r.scenes.markProviderCall as unknown as MarkWithCall)(attemptId(n), now, call);
    const find = (uow: UnitOfWorkPort, n: number) => uow.runInTransaction((r) => r.scenes.findAttemptById(attemptId(n))) as Promise<Marked | null>;

    it('[REQ-CFG9-004] markProviderCall guarda modelo y región de la llamada junto con provider_call_started_at', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      await uow.runInTransaction(mark(1, at(31), { model: 'gemini-3-pro-image', location: 'us-east5' }));
      expect(await find(uow, 1)).toMatchObject({ providerCallStartedAt: at(31), providerModel: 'gemini-3-pro-image', providerLocation: 'us-east5' });
    });

    it('[EDGE-009-045] dos intentos con configuraciones distintas conservan cada uno la suya (el reintento usa la de su propia llamada)', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      await uow.runInTransaction(mark(1, at(31), { model: 'gemini-2.5-flash-image', location: 'us-central1' }));
      await uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: SCENE_ID, attemptId: attemptId(1), outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: at(40) }));
      await uow.runInTransaction(begin(2, at(50)));
      await uow.runInTransaction(mark(2, at(61), { model: 'gemini-3.1-flash-image', location: 'global' }));
      expect(await find(uow, 1)).toMatchObject({ providerModel: 'gemini-2.5-flash-image', providerLocation: 'us-central1' });
      expect(await find(uow, 2)).toMatchObject({ providerModel: 'gemini-3.1-flash-image', providerLocation: 'global' });
    });

    it('[EDGE-009-045] un intento sin llamada (sin marca) deja modelo y región en null (fila previa o cerrada antes del proveedor)', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      const row = await find(uow, 1);
      expect(row?.id).toBe(attemptId(1));
      expect(row?.providerCallStartedAt).toBeNull();
      expect(row?.providerModel).toBeNull();
      expect(row?.providerLocation).toBeNull();
    });

    it('[NFR-009-003] el registro por intento no contiene valores de prompt ni inputs: solo modelo y región', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      await uow.runInTransaction(mark(1, at(31), { model: 'gemini-2.5-flash-image', location: 'us-central1' }));
      const row = (await find(uow, 1)) as Marked;
      const added = Object.keys(row).filter((k) => /^provider/.test(k)).sort();
      expect(added).toEqual(['providerCallStartedAt', 'providerLocation', 'providerModel']);
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

describe('T1295 [NFR-009-002] migración de Nivel 2: columnas en scene_attempts con paridad SQLite / Postgres', () => {
  it('SQLite: scene_attempts tiene provider_model y provider_location, TEXT, nulables (filas previas sin datos)', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      const cols = db.prepare("SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('scene_attempts')").all() as Array<{ name: string; type: string; nn: number }>;
      const byName = new Map(cols.map((c) => [c.name, c]));
      for (const name of ['provider_model', 'provider_location']) {
        expect(byName.get(name), name).toMatchObject({ type: 'TEXT', nn: 0 });
      }
    } finally {
      db.close();
    }
  });

  it('Postgres: las migraciones agregan provider_model y provider_location a scene_attempts como TEXT sin NOT NULL (paridad de nombres con SQLite)', () => {
    const sql = allPostgresMigrationsSql();
    for (const name of ['provider_model', 'provider_location']) {
      expect(sql, name).toMatch(new RegExp(`ALTER TABLE scene_attempts\\s+ADD COLUMN(?: IF NOT EXISTS)?\\s+${name}\\s+TEXT(?!\\s+NOT NULL)`, 'i'));
    }
  });

  it('las columnas nuevas no llevan DEFAULT que simule un coste (la fila previa se valora con el máximo de la tabla en 5b, no en la migración)', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      const cols = db.prepare("SELECT name, dflt_value AS d FROM pragma_table_info('scene_attempts') WHERE name IN ('provider_model','provider_location')").all() as Array<{ name: string; d: string | null }>;
      expect(cols).toHaveLength(2);
      for (const c of cols) expect(c.d).toBeNull();
    } finally {
      db.close();
    }
  });
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const PG_SCHEMA = allPostgresMigrationsSql();
describe.skipIf(TEST_DATABASE_URL === undefined)('T1295 PostgreSQL real', () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineContract(
    'PostgreSQL',
    async () => {
      schema = `argos_t1295_${randomUUID().replaceAll('-', '')}`;
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

/*
 * PENDIENTES de T1254 / 5b (cifras o decisiones no verificadas; verify-oracles prohibe it.todo, por eso van como comentario y NO como prueba):
 *  - el caso de uso de ejecución registra el modelo y la región VIGENTES de su llamada en cada intento (reintento = configuración de su marca) — depende de T1254 (lectura en caliente) y T1298
 *  - gasto mensual reconstruido por modelo × región con costes de configuración de prueba — depende de la tabla de costes (T1301/T1296); no se inventa ningún coste
 *  - filas previas sin modelo/región valoradas con el coste máximo de la tabla (cota conservadora) — depende de T1296 y de la tabla de T1301
 */
