import { afterEach, describe, expect, it } from 'vitest';
import type { SceneAttemptRecord, SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
import { HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { account, CANONICAL_USER_IDS, ENGINE_NAMES, HAS_POSTGRES, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

/**
 * T1268 (Feature 009, Fase 5a, #20): `adminParameters.resetAdminAccountsSceneQuota` sobre los tres motores (memoria, SQLite, PostgreSQL si hay TEST_DATABASE_URL). Opcion A de Neo: pone a cero solo
 * `home_scenes.owner_user_id` y `scene_quota_carry` de las cuentas del administrador, identificadas por `sub` de Google vinculado o por correo VERIFICADO de la lista (sin distinguir
 * mayusculas). Prueba que quedan intactos: cuentas ajenas, correo sin verificar, escena de hogar con `owner_user_id` NULL y la fila `scene.global_quota_used.*`. La rama de perdida de la
 * carrera (`null`) la cubre `tests/unit/t1268-reinicio-cuota-cas-009.spec.ts`.
 @implements REQ-CFG9-006, EDGE-009-022, SC-009-026
 */
const ENGINES: EngineName[] = ENGINE_NAMES.filter((n) => n !== 'PostgreSQL' || HAS_POSTGRES);
const WINDOW = '2026-11';
const T0 = '2026-11-01T00:00:00.000Z';
const SUB = 'sub-admin-1268';
const SINCE = '2026-10-31T12:00:00.000Z';
const scene = (id: string, owner: { household?: string; user?: string }, consumed: number): SceneRecord => ({
  id,
  householdId: owner.household ?? null,
  ownerUserId: owner.user ?? null,
  runState: null,
  currentAttemptId: null,
  leaseExpiresAt: null,
  image: null,
  imageDegraded: false,
  consumedGenerations: consumed,
  quotaWindow: WINDOW,
  createdAt: T0,
  updatedAt: T0,
});

describe.each(ENGINES)('T1268 [REQ-CFG9-006] reinicio de cuota de las cuentas del administrador sobre %s', (name) => {
  let engine: IdentityEngine | null = null;
  afterEach(async () => {
    await engine?.dispose();
    engine = null;
  });

  it('pone a cero solo las cuentas vinculadas por sub o por correo verificado; deja intactos el hogar compartido y las cuentas ajenas', async () => {
    engine = await openEngine(name, stateWith([]));
    const [a, b, c] = CANONICAL_USER_IDS as unknown as readonly [string, string, string];
    await engine.uow.runInTransaction(async (r) => {
      await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: a, createdAt: T0 });
      await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000001', { user: a }, 3));
      await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000002', { user: b }, 5));
      await r.scenes.upsertQuotaCarry(a, WINDOW, 2);
      await r.scenes.upsertQuotaCarry(b, WINDOW, 4);
      await r.scenes.upsertQuotaCarry(c, WINDOW, 6);
    });
    const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([SUB], [], SINCE));
    expect(result).toEqual({ accountsReset: 1 });
    const read = await engine.read(async (r) => ({
      a: (await r.scenes.findByOwnerUserId(a))?.consumedGenerations,
      b: (await r.scenes.findByOwnerUserId(b))?.consumedGenerations,
      carry: [await r.scenes.findQuotaCarry(a, WINDOW), await r.scenes.findQuotaCarry(b, WINDOW), await r.scenes.findQuotaCarry(c, WINDOW)],
    }));
    expect(read).toEqual({ a: 0, b: 5, carry: [null, 4, 6] });
  });

  it('sin cuentas coincidentes devuelve accountsReset = 0 sin error', async () => {
    engine = await openEngine(name, stateWith([]));
    expect(await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota(['no-existe'], ['nadie@example.test'], SINCE))).toEqual({ accountsReset: 0 });
  });

  it('por correo: reinicia el verificado en mayusculas; deja intactos el correo sin verificar, la escena de hogar (owner NULL) y la fila global', async () => {
    const verified = { ...account(idOf(1268), 'admin.verificado', 'x', 'ADMIN1268@Example.Test'), emailVerifiedAt: T0 };
    const unverified = account(idOf(1269), 'admin.sinverificar', 'x', 'pendiente1268@example.test');
    engine = await openEngine(name, stateWith([verified, unverified]));
    const GLOBAL = `scene.global_quota_used.${WINDOW}`;
    await engine.uow.runInTransaction(async (r) => {
      await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000011', { user: verified.id }, 4));
      await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000012', { user: unverified.id }, 7));
      await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000013', { household: HOUSEHOLD.id }, 9));
      await r.scenes.upsertQuotaCarry(verified.id, WINDOW, 3);
      await r.scenes.upsertQuotaCarry(unverified.id, WINDOW, 8);
      expect(await r.adminParameters.compareAndSet(GLOBAL, 'consumo global', { value: '37', updatedAt: T0 }, null)).toBe(true);
    });
    const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([], ['admin1268@example.test', 'pendiente1268@example.test'], SINCE));
    expect(result).toEqual({ accountsReset: 1 });
    const read = await engine.read(async (r) => ({
      verified: (await r.scenes.findByOwnerUserId(verified.id))?.consumedGenerations,
      unverified: (await r.scenes.findByOwnerUserId(unverified.id))?.consumedGenerations,
      household: (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.consumedGenerations,
      carry: [await r.scenes.findQuotaCarry(verified.id, WINDOW), await r.scenes.findQuotaCarry(unverified.id, WINDOW)],
      global: await r.adminParameters.find(GLOBAL),
    }));
    expect(read).toEqual({ verified: 0, unverified: 7, household: 9, carry: [null, 8], global: { value: '37', updatedAt: T0 } });
  });
  describe('alcance amplio (fix 009 produccion): hogar propio del admin y bloqueo FAILED_LIMIT', () => {
    const NOW = '2026-11-24T12:00:00.000Z';
    const IN_WINDOW = '2026-11-24T10:00:00.000Z';
    const OLD = '2026-11-20T10:00:00.000Z';
    const CALL = '2026-11-24T10:00:31.000Z';
    const attemptOf = (n: number, sceneId: string, actor: string, startedAt: string): SceneAttemptRecord => ({
      id: `d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sceneId, actorUserId: actor, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}',
      resultObjectId: `d2000000-0000-4000-8000-${String(n).padStart(12, '0')}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, quotaWindow: WINDOW, quotaMax: 5,
      outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt, finishedAt: null,
    });

    it('pone a cero la escena del hogar del que el admin es propietario legal y su arrastre; deja el hogar ajeno', async () => {
      engine = await openEngine(name, stateWith([]));
      const owner = HOUSEHOLD.ownerUserId;
      const other = CANONICAL_USER_IDS.find((u) => u !== owner)!;
      const HS = 'd0000000-0000-4000-8000-000000000031';
      await engine.uow.runInTransaction(async (r) => {
        await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: owner, createdAt: T0 });
        await r.scenes.insert(scene(HS, { household: HOUSEHOLD.id }, 4));
        await r.scenes.insert(scene('d0000000-0000-4000-8000-000000000032', { user: owner }, 2));
        await r.scenes.upsertQuotaCarry(owner, WINDOW, 3);
        await r.scenes.upsertQuotaCarry(other, WINDOW, 6);
      });
      const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([SUB], [], SINCE));
      expect(result).toEqual({ accountsReset: 1 });
      const read = await engine.read(async (r) => ({
        household: (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.consumedGenerations,
        own: (await r.scenes.findByOwnerUserId(owner))?.consumedGenerations,
        carry: [await r.scenes.findQuotaCarry(owner, WINDOW), await r.scenes.findQuotaCarry(other, WINDOW)],
      }));
      expect(read).toEqual({ household: 0, own: 0, carry: [null, 6] });
    });

    it('FAILED de las ultimas 24 h pasan a CANCELLED con provider_call_started_at intacto y run_state failed se limpia; los antiguos y los de otras escenas no cambian', async () => {
      engine = await openEngine(name, stateWith([]));
      const owner = HOUSEHOLD.ownerUserId;
      const other = CANONICAL_USER_IDS.find((u) => u !== owner)!;
      const HS = 'd0000000-0000-4000-8000-000000000041';
      const FOREIGN = 'd0000000-0000-4000-8000-000000000042';
      await engine.uow.runInTransaction(async (r) => {
        await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: owner, createdAt: T0 });
        await r.scenes.insert(scene(HS, { household: HOUSEHOLD.id }, 0));
        await r.scenes.insert(scene(FOREIGN, { user: other }, 0));
      });
      const plan: Array<[number, string, string, string]> = [
        [1, HS, owner, IN_WINDOW],
        [2, HS, owner, IN_WINDOW],
        [3, HS, owner, OLD],
        [4, FOREIGN, other, IN_WINDOW],
      ];
      for (const [n, sceneId, actor, startedAt] of plan) {
        const a = attemptOf(n, sceneId, actor, startedAt);
        await engine.uow.runInTransaction((r) => r.scenes.beginGeneration({ sceneId, attempt: a, now: startedAt, leaseExpiresAt: '2026-11-24T23:00:00.000Z' }));
        await engine.uow.runInTransaction((r) => r.scenes.markProviderCall(a.id, CALL, { model: 'gemini-2.5-flash-image', location: 'us-central1' }));
        await engine.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId, attemptId: a.id, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: NOW }));
      }
      const before = await engine.read(async (r) => ({ hs: (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.runState, f: (await r.scenes.findByOwnerUserId(other))?.runState }));
      expect(before).toEqual({ hs: 'failed', f: 'failed' });
      await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([SUB], [], '2026-11-23T12:00:00.000Z'));
      const after = await engine.read(async (r) => ({
        hs: (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.runState ?? null,
        f: (await r.scenes.findByOwnerUserId(other))?.runState,
        a: await Promise.all([1, 2, 3, 4].map(async (n) => {
          const row = await r.scenes.findAttemptById(`d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
          return [row?.outcome, row?.providerCallStartedAt];
        })),
        failedNow: await r.scenes.countFailedAttemptsByScene(HS, '2026-11-23T12:00:00.000Z'),
      }));
      expect(after.hs).toBeNull();
      expect(after.f).toBe('failed');
      expect(after.a).toEqual([['CANCELLED', CALL], ['CANCELLED', CALL], ['FAILED', CALL], ['FAILED', CALL]]);
      expect(after.failedNow.count).toBe(0);
    });

    it('T1312 (OBS-A): aserción de hogar ajeno — si el admin NO es propietario legal del hogar, su escena, su arrastre, su run_state y sus FAILED quedan intactos', async () => {
      engine = await openEngine(name, stateWith([]));
      const legalOwner = HOUSEHOLD.ownerUserId;
      const admin = CANONICAL_USER_IDS.find((u) => u !== legalOwner)!;
      const HS = 'd0000000-0000-4000-8000-000000000051';
      const a = attemptOf(51, HS, legalOwner, IN_WINDOW);
      await engine.uow.runInTransaction(async (r) => {
        await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: admin, createdAt: T0 });
        await r.scenes.insert(scene(HS, { household: HOUSEHOLD.id }, 4));
        await r.scenes.upsertQuotaCarry(legalOwner, WINDOW, 6);
      });
      await engine.uow.runInTransaction((r) => r.scenes.beginGeneration({ sceneId: HS, attempt: a, now: IN_WINDOW, leaseExpiresAt: '2026-11-24T23:00:00.000Z' }));
      await engine.uow.runInTransaction((r) => r.scenes.markProviderCall(a.id, CALL, { model: 'gemini-2.5-flash-image', location: 'us-central1' }));
      await engine.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: HS, attemptId: a.id, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: NOW }));
      const snapshot = () =>
        engine!.read(async (r) => {
          const row = await r.scenes.findByHouseholdId(HOUSEHOLD.id);
          const att = await r.scenes.findAttemptById(a.id);
          return { consumed: row?.consumedGenerations, runState: row?.runState, outcome: att?.outcome, call: att?.providerCallStartedAt, carry: await r.scenes.findQuotaCarry(legalOwner, WINDOW) };
        });
      const before = await snapshot();
      expect(before).toMatchObject({ consumed: 4, runState: 'failed', outcome: 'FAILED', call: CALL });
      const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([SUB], [], SINCE));
      expect(result).toEqual({ accountsReset: 1 });
      expect(await snapshot()).toEqual(before);
    });
  });
});
