import { afterEach, describe, expect, it } from 'vitest';
import type { SceneRecord } from '../../../src/application/ports/scene-repositories.port.ts';
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
    const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([SUB], []));
    expect(result).toEqual({ accountsReset: 1 });
    const read = await engine.read(async (r) => ({
      a: (await r.scenes.findByOwnerUserId(a))?.consumedGenerations,
      b: (await r.scenes.findByOwnerUserId(b))?.consumedGenerations,
      carry: [await r.scenes.findQuotaCarry(a, WINDOW), await r.scenes.findQuotaCarry(b, WINDOW), await r.scenes.findQuotaCarry(c, WINDOW)],
    }));
    expect(read).toEqual({ a: 0, b: 5, carry: [0, 4, 6] });
  });

  it('sin cuentas coincidentes devuelve accountsReset = 0 sin error', async () => {
    engine = await openEngine(name, stateWith([]));
    expect(await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota(['no-existe'], ['nadie@example.test']))).toEqual({ accountsReset: 0 });
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
    const result = await engine.uow.runInTransaction((r) => r.adminParameters.resetAdminAccountsSceneQuota([], ['admin1268@example.test', 'pendiente1268@example.test']));
    expect(result).toEqual({ accountsReset: 1 });
    const read = await engine.read(async (r) => ({
      verified: (await r.scenes.findByOwnerUserId(verified.id))?.consumedGenerations,
      unverified: (await r.scenes.findByOwnerUserId(unverified.id))?.consumedGenerations,
      household: (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.consumedGenerations,
      carry: [await r.scenes.findQuotaCarry(verified.id, WINDOW), await r.scenes.findQuotaCarry(unverified.id, WINDOW)],
      global: await r.adminParameters.find(GLOBAL),
    }));
    expect(read).toEqual({ verified: 0, unverified: 7, household: 9, carry: [0, 8], global: { value: '37', updatedAt: T0 } });
  });
});
