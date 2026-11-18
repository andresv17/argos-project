/**
 * T834 (006, Fase 4): repositorios de la escena (SceneRepository y SceneConsentRepository) con un contrato único para memoria, SQLite y PostgreSQL real
 * (se OMITE sin TEST_DATABASE_URL) y, para PostgreSQL, el SQL exacto contra el doble del cliente (sin base).
 * INV-ESC6-003, INV-ESC6-004, INV-ESC6-012; REQ-ESC6-012, REQ-ESC6-036; EDGE-ESC6-016, EDGE-ESC6-027, EDGE-ESC6-031; SC-ESC6-016, SC-ESC6-070, SC-ESC6-074, SC-ESC6-080.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet, UserAccount } from '../../../src/application/ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneConsentRecord, SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { fixtures, HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { fakeClient } from '../../fixtures/pg-fake-client.ts';

const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const NOW = '2026-11-18T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const SCENE_ID = 'a1000000-0000-4000-8000-000000000001';
const attemptId = (n: number): string => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (c: string): string => c.repeat(64);

const scene = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE_ID,
  householdId: HOUSEHOLD.id,
  ownerUserId: null,
  runState: null,
  currentAttemptId: null,
  leaseExpiresAt: null,
  image: null,
  imageDegraded: false,
  consumedGenerations: 0,
  quotaWindow: '2026-11',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const attempt = (n: number, over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: attemptId(n),
  sceneId: SCENE_ID,
  actorUserId: ANDRES.id,
  action: 'UPDATE',
  mode: 'FROM_SCRATCH',
  fingerprint: hash('f'),
  inputsSnapshot: '{"v":1}',
  resultObjectId: `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  phase: 'PENDING',
  claimedAt: null,
  providerCallStartedAt: null,
  quotaWindow: '2026-11',
  quotaMax: 10,
  outcome: null,
  errorCode: null,
  degraded: false,
  idempotencyKeyHash: null,
  idempotencyExpiresAt: null,
  startedAt: NOW,
  finishedAt: null,
  ...over,
});
const consent = (n: number, over: Partial<SceneConsentRecord> = {}): SceneConsentRecord => ({
  id: `a4000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  userId: ANDRES.id,
  scope: 'PET_PHOTOS',
  providerId: 'vertex',
  noticeVersion: '1',
  grantedAt: at(n),
  revokedAt: null,
  ...over,
});

type Factory = () => Promise<UnitOfWorkPort>;

function defineSceneContract(name: string, create: Factory, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`suite de contratos de los repositorios de la escena (${name})`, () => {
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
    const begin = (n: number, now: string, over: Partial<SceneAttemptRecord> = {}) => (r: RepositorySet) =>
      r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(n, over), now, leaseExpiresAt: at(600) });

    it('[REQ-ESC6-012] insert/findById/findByHouseholdId/findByOwnerUserId devuelven la fila completa; una segunda escena del mismo hogar o propietario se rechaza con false', async () => {
      const uow = await prepare();
      const owner = scene({ id: 'a1000000-0000-4000-8000-000000000002', householdId: null, ownerUserId: MARIA.id });
      const result = await uow.runInTransaction(async (r) => [
        await r.scenes.insert(scene({ id: 'a1000000-0000-4000-8000-000000000009' })),
        await r.scenes.insert(owner),
        await r.scenes.insert({ ...owner, id: 'a1000000-0000-4000-8000-000000000008' }),
        await r.scenes.findById(SCENE_ID),
        await r.scenes.findByHouseholdId(HOUSEHOLD.id),
        await r.scenes.findByOwnerUserId(MARIA.id),
        await r.scenes.findById('a1000000-0000-4000-8000-0000000000ff'),
        await r.scenes.findByHouseholdId('otro'),
      ]);
      expect(result).toEqual([false, true, false, scene(), scene(), owner, null, null]);
    });

    it('[INV-ESC6-003] T1 compare-and-set: pasa de sin intento a generating con intento y arrendamiento; un segundo T1 con arrendamiento vigente devuelve false y no escribe nada', async () => {
      const uow = await prepare();
      const first = await uow.runInTransaction(begin(1, NOW, { idempotencyKeyHash: hash('a'), idempotencyExpiresAt: at(86_400) }));
      const second = await uow.runInTransaction(begin(2, at(1), { idempotencyKeyHash: hash('b') }));
      expect([first, second]).toEqual([true, false]);
      const state = await uow.runInTransaction(async (r) => [await r.scenes.findById(SCENE_ID), await r.scenes.findAttemptById(attemptId(1)), await r.scenes.findAttemptById(attemptId(2))]);
      expect(state[0]).toEqual(scene({ runState: 'generating', currentAttemptId: attemptId(1), leaseExpiresAt: at(600) }));
      expect(state[1]).toEqual(attempt(1, { idempotencyKeyHash: hash('a'), idempotencyExpiresAt: at(86_400) }));
      expect(state[2]).toBeNull();
    });

    it('[INV-ESC6-003][EDGE-ESC6-031] el arrendamiento vencido (lease_expires_at <= now) admite un nuevo T1; uno aun no vencido no', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      expect(await uow.runInTransaction(begin(2, at(599)))).toBe(false);
      expect(await uow.runInTransaction(begin(3, at(600)))).toBe(true);
      const current = await uow.runInTransaction((r) => r.scenes.findById(SCENE_ID));
      expect(current).toMatchObject({ runState: 'generating', currentAttemptId: attemptId(3) });
    });

    it('[INV-ESC6-004] un fallo previo (run_state = failed, sin arrendamiento) admite un nuevo T1', async () => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.households.insert(HOUSEHOLD);
        await r.scenes.insert(scene({ runState: 'failed', currentAttemptId: attemptId(1) }));
      });
      expect(await uow.runInTransaction(begin(2, NOW))).toBe(true);
      expect(await uow.runInTransaction((r) => r.scenes.findById(SCENE_ID))).toMatchObject({ runState: 'generating', currentAttemptId: attemptId(2), leaseExpiresAt: at(600) });
    });

    it('[EDGE-ESC6-016][SC-ESC6-080] T1 anula el hash de los intentos previos de la escena: solo se recuerda la ultima clave; los intentos se conservan', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW, { idempotencyKeyHash: hash('a'), idempotencyExpiresAt: at(86_400) }));
      await uow.runInTransaction(begin(2, at(600), { idempotencyKeyHash: hash('b'), idempotencyExpiresAt: at(87_000) }));
      await uow.runInTransaction(begin(3, at(1200), { idempotencyKeyHash: hash('c'), idempotencyExpiresAt: at(87_600) }));
      const state = await uow.runInTransaction(async (r) => [
        await r.scenes.findAttemptByIdempotencyKeyHash(hash('a')),
        await r.scenes.findAttemptByIdempotencyKeyHash(hash('b')),
        (await r.scenes.findAttemptByIdempotencyKeyHash(hash('c')))?.id,
        (await r.scenes.findAttemptById(attemptId(1)))?.idempotencyKeyHash,
        (await r.scenes.findAttemptById(attemptId(1)))?.idempotencyExpiresAt,
        (await r.scenes.findAttemptById(attemptId(2)))?.idempotencyKeyHash,
      ]);
      expect(state).toEqual([null, null, attemptId(3), null, null, null]);
    });

    it('[EDGE-ESC6-016] un T1 rechazado (0 filas) no anula el hash del intento vigente', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW, { idempotencyKeyHash: hash('a') }));
      expect(await uow.runInTransaction(begin(2, at(1), { idempotencyKeyHash: hash('b') }))).toBe(false);
      expect((await uow.runInTransaction((r) => r.scenes.findAttemptByIdempotencyKeyHash(hash('a'))))?.id).toBe(attemptId(1));
      expect(await uow.runInTransaction((r) => r.scenes.findAttemptByIdempotencyKeyHash(hash('b')))).toBeNull();
    });

    it('[REQ-ESC6-036][SC-ESC6-070] claim PENDING -> RUNNING con claimed_at y arrendamiento nuevo; el segundo claim, uno de otra escena o de un intento inexistente devuelven false sin efecto', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      const claim = (id: string, sceneId = SCENE_ID, now = at(30)) => (r: RepositorySet) => r.scenes.claimAttempt({ sceneId, attemptId: id, now, leaseExpiresAt: at(30 + 195) });
      expect(await uow.runInTransaction(claim(attemptId(1), 'a1000000-0000-4000-8000-0000000000aa'))).toBe(false);
      expect(await uow.runInTransaction(claim(attemptId(9)))).toBe(false);
      expect(await uow.runInTransaction(claim(attemptId(1)))).toBe(true);
      expect(await uow.runInTransaction(claim(attemptId(1), SCENE_ID, at(40)))).toBe(false);
      const state = await uow.runInTransaction(async (r) => [await r.scenes.findAttemptById(attemptId(1)), await r.scenes.findById(SCENE_ID)]);
      expect(state[0]).toMatchObject({ phase: 'RUNNING', claimedAt: at(30) });
      expect(state[1]).toMatchObject({ runState: 'generating', leaseExpiresAt: at(225) });
    });

    it('[REQ-ESC6-036][EDGE-ESC6-027] el claim de un intento que ya no es el vigente pasa a RUNNING pero no toca el arrendamiento de la escena', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW));
      await uow.runInTransaction(begin(2, at(600)));
      expect(await uow.runInTransaction((r) => r.scenes.claimAttempt({ sceneId: SCENE_ID, attemptId: attemptId(1), now: at(601), leaseExpiresAt: at(900) }))).toBe(true);
      expect(await uow.runInTransaction((r) => r.scenes.findById(SCENE_ID))).toMatchObject({ currentAttemptId: attemptId(2), leaseExpiresAt: at(600) });
    });

    it('[REQ-ESC6-034] los contadores cuentan intentos de la escena y del actor con started_at >= since', async () => {
      const uow = await prepare();
      await uow.runInTransaction(begin(1, NOW, { startedAt: at(0) }));
      await uow.runInTransaction(begin(2, at(600), { startedAt: at(600), actorUserId: MARIA.id }));
      await uow.runInTransaction(begin(3, at(1200), { startedAt: at(1200) }));
      const counts = await uow.runInTransaction(async (r) => [
        await r.scenes.countAttemptsByScene(SCENE_ID, at(0)),
        await r.scenes.countAttemptsByScene(SCENE_ID, at(601)),
        await r.scenes.countAttemptsByActor(ANDRES.id, at(0)),
        await r.scenes.countAttemptsByActor(ANDRES.id, at(1)),
        await r.scenes.countAttemptsByActor(MARIA.id, at(600)),
        await r.scenes.countAttemptsByActor('nadie', at(0)),
      ]);
      expect(counts).toEqual([3, 1, 2, 1, 1, 0]);
    });

    it('[EDGE-ESC6-033][SC-ESC6-074] el arrastre de cuota es un UPSERT con maximo por (propietario, ventana): nunca baja y otra ventana es independiente', async () => {
      const uow = await prepare();
      const read = async () => uow.runInTransaction(async (r) => [await r.scenes.findQuotaCarry(ANDRES.id, '2026-11'), await r.scenes.findQuotaCarry(ANDRES.id, '2026-12'), await r.scenes.findQuotaCarry(MARIA.id, '2026-11')]);
      expect(await read()).toEqual([null, null, null]);
      await uow.runInTransaction((r) => r.scenes.upsertQuotaCarry(ANDRES.id, '2026-11', 3));
      await uow.runInTransaction((r) => r.scenes.upsertQuotaCarry(ANDRES.id, '2026-11', 2));
      expect(await read()).toEqual([3, null, null]);
      await uow.runInTransaction((r) => r.scenes.upsertQuotaCarry(ANDRES.id, '2026-11', 5));
      await uow.runInTransaction((r) => r.scenes.upsertQuotaCarry(ANDRES.id, '2026-12', 1));
      expect(await read()).toEqual([5, 1, null]);
    });

    it('[INV-ESC6-012] una transaccion que lanza despues del T1 no deja intento, hash ni estado (rollback completo)', async () => {
      const uow = await prepare();
      await expect(
        uow.runInTransaction(async (r) => {
          await begin(1, NOW, { idempotencyKeyHash: hash('a') })(r);
          throw new Error('fallo tras T1');
        }),
      ).rejects.toThrow('fallo tras T1');
      expect(await uow.runInTransaction(async (r) => [await r.scenes.findById(SCENE_ID), await r.scenes.findAttemptById(attemptId(1))])).toEqual([scene(), null]);
    });

    it('[SC-ESC6-016] consentimientos: grant, uno vigente por (usuario, ambito, proveedor, version), revoke idempotente y findByUserId devuelve el mas reciente', async () => {
      const uow = await prepare();
      const result = await uow.runInTransaction(async (r) => [
        await r.sceneConsents.findByUserId(ANDRES.id),
        await r.sceneConsents.grant(consent(1)),
        await r.sceneConsents.grant(consent(2)),
        await r.sceneConsents.grant(consent(3, { scope: 'HOUSEHOLD_PHOTO' })),
        await r.sceneConsents.findActive(ANDRES.id, 'PET_PHOTOS', 'vertex', '1'),
        await r.sceneConsents.findActive(ANDRES.id, 'PET_PHOTOS', 'vertex', '2'),
        await r.sceneConsents.findByUserId(ANDRES.id),
        await r.sceneConsents.findByUserId(MARIA.id),
      ]);
      expect(result).toEqual([null, true, false, true, consent(1), null, consent(3, { scope: 'HOUSEHOLD_PHOTO' }), null]);
      const revoked = await uow.runInTransaction(async (r) => [
        await r.sceneConsents.revoke(consent(1).id, at(100)),
        await r.sceneConsents.revoke(consent(1).id, at(200)),
        await r.sceneConsents.revoke('a4000000-0000-4000-8000-0000000000ff', at(200)),
        await r.sceneConsents.findActive(ANDRES.id, 'PET_PHOTOS', 'vertex', '1'),
        await r.sceneConsents.grant(consent(4)),
      ]);
      expect(revoked).toEqual([true, false, false, null, true]);
    });
  });
}

defineSceneContract('memoria', async () => new InMemoryUnitOfWork());

let sqliteDb: SqliteDatabase | undefined;
defineSceneContract(
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
const PG_MIGRATIONS = [
  '0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql', '0005_pet_media.sql',
  '0006_rate_limit_microchip_scope.sql', '0007_platform_parameters.sql', '0008_share_links.sql', '0009_home_scenes.sql',
];
const PG_SCHEMA = PG_MIGRATIONS.map((m) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${m}`, import.meta.url), 'utf8')).join('\n');

describe.skipIf(!TEST_DATABASE_URL)('repositorios de la escena contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no esta definida)', { timeout: 60_000 }, () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineSceneContract(
    'PostgreSQL',
    async () => {
      schema = `argos_sc_${randomUUID().replaceAll('-', '')}`;
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

describe('SQL de PostgreSQL de los repositorios de la escena (doble del cliente; REQ-PG-002, INV-ESC6-003)', () => {
  it('[INV-ESC6-003] lockScene emite SELECT ... FOR UPDATE de la fila de la escena y nada mas', async () => {
    const client = fakeClient();
    await createPostgresRepositories(client as never).scenes.lockScene(SCENE_ID);
    expect(client.calls).toEqual([{ sql: 'SELECT id FROM home_scenes WHERE id = $1 FOR UPDATE', values: [SCENE_ID] }]);
  });

  it('[INV-ESC6-003][EDGE-ESC6-016] T1: UPDATE condicionado a sin intento, fallido o arrendamiento vencido; con 0 filas no anula hashes ni inserta', async () => {
    const client = fakeClient({ rowCount: 0 });
    const ok = await createPostgresRepositories(client as never).scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(1), now: NOW, leaseExpiresAt: at(600) });
    expect(ok).toBe(false);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.sql).toBe(
      "UPDATE home_scenes SET run_state = 'generating', current_attempt_id = $1, lease_expires_at = $2, updated_at = $3 WHERE id = $4 AND (run_state IS NULL OR run_state = 'failed' OR (run_state = 'generating' AND lease_expires_at <= $3))",
    );
    expect(client.calls[0]!.values).toEqual([attemptId(1), at(600), NOW, SCENE_ID]);
  });

  it('[EDGE-ESC6-016] T1 con una fila: anula el hash de los intentos previos de la escena ANTES de insertar el nuevo', async () => {
    const client = fakeClient({ rowCount: 1 }, { rowCount: 2 }, { rowCount: 1 });
    expect(await createPostgresRepositories(client as never).scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attempt(1, { idempotencyKeyHash: hash('a') }), now: NOW, leaseExpiresAt: at(600) })).toBe(true);
    expect(client.calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '))).toEqual(['UPDATE home_scenes SET', 'UPDATE scene_attempts SET', 'INSERT INTO scene_attempts']);
    expect(client.calls[1]!.sql).toBe('UPDATE scene_attempts SET idempotency_key_hash = NULL, idempotency_expires_at = NULL WHERE scene_id = $1 AND idempotency_key_hash IS NOT NULL');
    expect(client.calls[1]!.values).toEqual([SCENE_ID]);
    expect(client.calls[2]!.values).toContain(hash('a'));
  });

  it('[REQ-ESC6-036] el claim es un UPDATE condicionado a PENDING y a la pertenencia del intento a la escena; el arrendamiento solo si es el intento vigente', async () => {
    const client = fakeClient({ rowCount: 1 }, { rowCount: 1 });
    expect(await createPostgresRepositories(client as never).scenes.claimAttempt({ sceneId: SCENE_ID, attemptId: attemptId(1), now: at(30), leaseExpiresAt: at(225) })).toBe(true);
    expect(client.calls[0]!.sql).toBe("UPDATE scene_attempts SET phase = 'RUNNING', claimed_at = $1 WHERE id = $2 AND scene_id = $3 AND phase = 'PENDING'");
    expect(client.calls[1]!.sql).toBe("UPDATE home_scenes SET lease_expires_at = $1 WHERE id = $2 AND current_attempt_id = $3 AND run_state = 'generating'");
    const rejected = fakeClient({ rowCount: 0 });
    expect(await createPostgresRepositories(rejected as never).scenes.claimAttempt({ sceneId: SCENE_ID, attemptId: attemptId(1), now: at(30), leaseExpiresAt: at(225) })).toBe(false);
    expect(rejected.calls).toHaveLength(1);
  });

  it('[EDGE-ESC6-033] el arrastre de cuota es INSERT ... ON CONFLICT DO UPDATE con GREATEST', async () => {
    const client = fakeClient();
    await createPostgresRepositories(client as never).scenes.upsertQuotaCarry(ANDRES.id, '2026-11', 3);
    expect(client.calls[0]!.sql).toBe(
      'INSERT INTO scene_quota_carry (owner_user_id, quota_window, consumed_generations) VALUES ($1, $2, $3) ON CONFLICT (owner_user_id, quota_window) DO UPDATE SET consumed_generations = GREATEST(scene_quota_carry.consumed_generations, EXCLUDED.consumed_generations)',
    );
    expect(client.calls[0]!.values).toEqual([ANDRES.id, '2026-11', 3]);
  });
});
