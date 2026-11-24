import { describe, expect, it } from 'vitest';
import type { SceneAttemptRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { DomainError } from '../../src/generated/index.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1315 (009, Fase 5d, D9-31; SC-009-059, SC-009-060): el reinicio real de los cuatro limites con `limits_reset_at` (escena) y una marca por actor, a nivel de caso de uso y en memoria
 * (la paridad SQLite/PostgreSQL de las marcas la cubre `t1268-reinicio-cuota-009`). `evaluateLimits` cuenta solo intentos con inicio ESTRICTAMENTE posterior a `max(ahora - 24 h, marca)`.
 * @implements REQ-CFG9-006, REQ-LIM9-001, REQ-LIM9-002, REQ-LIM9-004, INV-LIM9-001
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const SUB = 'google-sub-t1315';
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OTHER_SCENE = 'c1000000-0000-4000-8000-0000000015ee';
const UPDATE = { action: 'UPDATE' } as const;

function setup() {
  const h = createHarness(canonicalState());
  const request = new RequestSceneGenerationUseCase(withScene(h.deps, sceneFixture()));
  return { h, request };
}
type T = ReturnType<typeof setup>;
const attempt = (n: number, over: Partial<SceneAttemptRecord>): SceneAttemptRecord => ({
  id: `c2000000-0000-4000-8000-${String(n + 15_000).padStart(12, '0')}`, sceneId: OTHER_SCENE, actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64),
  inputsSnapshot: '{"v":1}', resultObjectId: `c3000000-0000-4000-8000-${String(n + 15_000).padStart(12, '0')}`, phase: 'DONE', claimedAt: null, providerCallStartedAt: null,
  quotaWindow: '2026-11', quotaMax: 10, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: at(-1000), finishedAt: at(-999), ...over,
});
const code = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
};
/** Siembra `count` intentos de la escena del hogar del actor (cerrados con `over`) y devuelve el id de la escena. */
async function seedHouseholdAttempts(t: T, count: number, over: Partial<SceneAttemptRecord>): Promise<string> {
  await t.request.execute(ANDRES, HOUSE, UPDATE, key(900));
  const first = t.h.uow.snapshot().sceneAttempts?.[0];
  const sceneId = first?.sceneId ?? '';
  await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId, attemptId: first?.id ?? '', outcome: 'CANCELLED', errorCode: null, degraded: false, now: at(-500) }));
  await t.h.uow.runInTransaction(async (r) => {
    for (let n = 1; n <= count; n += 1) await r.scenes.beginGeneration({ sceneId, attempt: attempt(n, { sceneId, actorUserId: 'ajeno', ...over }), now: over.startedAt ?? at(-1000), leaseExpiresAt: at(-5000) });
  });
  return sceneId;
}
const reset = (t: T, now: string) =>
  t.h.uow.runInTransaction(async (r) => {
    await r.authIdentities.insertIfAbsent({ provider: 'GOOGLE', providerSubject: SUB, userId: HOUSEHOLD.ownerUserId, createdAt: now });
    return r.adminParameters.resetAdminAccountsSceneQuota([SUB], [], now);
  });

describe('T1315 reinicio de FAILED_LIMIT (3 fallos con llamada en 24 h por escena)', () => {
  it('[SC-009-059] 3 FAILED con llamada bloquean; tras el reinicio se admite un intento; 3 fallos NUEVOS posteriores bloquean de nuevo; scene_attempts intactos', async () => {
    const t = setup();
    const sceneId = await seedHouseholdAttempts(t, 3, { startedAt: at(-1000), providerCallStartedAt: at(-990) });
    t.h.clock.setClock('2026-11-05', at(0));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-RATE-LIMITED');
    const before = JSON.stringify(t.h.uow.snapshot().sceneAttempts);
    expect(await reset(t, at(10))).toEqual({ accountsReset: 1 });
    expect(JSON.stringify(t.h.uow.snapshot().sceneAttempts)).toBe(before); // SC-009-060: ni outcome ni provider_call_started_at cambian
    t.h.clock.setClock('2026-11-05', at(20));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe('OK');
    // El intento nuevo falla y se suman 2 fallos posteriores al reinicio: con 3 nuevos se bloquea de nuevo.
    await t.h.uow.runInTransaction(async (r) => {
      const open = (await r.scenes.findByHouseholdId(HOUSEHOLD.id))?.currentAttemptId ?? '';
      await r.scenes.markProviderCall(open, at(21), { model: 'gemini-2.5-flash-image', location: 'us-central1' });
      await r.scenes.closeAttempt({ sceneId, attemptId: open, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: at(22) });
      for (let n = 10; n <= 11; n += 1) await r.scenes.beginGeneration({ sceneId, attempt: attempt(n, { sceneId, actorUserId: 'ajeno', startedAt: at(30 + n), providerCallStartedAt: at(31 + n) }), now: at(30 + n), leaseExpiresAt: at(-5000) });
    });
    t.h.clock.setClock('2026-11-05', at(100));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(3)))).toBe('ERR-RATE-LIMITED');
  });

  it('un intento que inicia EXACTAMENTE en el instante del reinicio no es posterior y no cuenta', async () => {
    const t = setup();
    await seedHouseholdAttempts(t, 3, { startedAt: at(10), providerCallStartedAt: at(11) });
    await reset(t, at(10));
    t.h.clock.setClock('2026-11-05', at(20));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('OK');
  });
});

describe('T1315 reinicio de closedWithoutCall (valor vigente de maxClosedWithoutCallPerDay)', () => {
  it('[SC-009-059] con el tope de cerrados sin llamada alcanzado bloquea; el reinicio lo libera sin tocar el valor del tope', async () => {
    const t = setup();
    await seedHouseholdAttempts(t, 20, { startedAt: at(-1000), outcome: 'CANCELLED', errorCode: null });
    t.h.clock.setClock('2026-11-05', at(0));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-RATE-LIMITED');
    await reset(t, at(10));
    t.h.clock.setClock('2026-11-05', at(20));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe('OK');
  });
});

describe('T1315 reinicio de ACTOR_LIMIT (12 intentos por actor, incluso en escenas ajenas)', () => {
  it('[SC-009-059] 12 intentos con llamada del actor en una escena ajena bloquean; la marca del actor los libera (la escena ajena y sus intentos siguen intactos)', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert({ id: OTHER_SCENE, householdId: null, ownerUserId: 'f0000000-0000-4000-8000-000000000001', runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
      for (let n = 1; n <= 12; n += 1) await r.scenes.beginGeneration({ sceneId: OTHER_SCENE, attempt: attempt(n, { actorUserId: ANDRES, startedAt: at(-1000), providerCallStartedAt: at(-990), outcome: 'FAILED' }), now: at(-1000), leaseExpiresAt: at(-5000) });
    });
    t.h.clock.setClock('2026-11-05', at(0));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-RATE-LIMITED');
    await reset(t, at(10));
    t.h.clock.setClock('2026-11-05', at(20));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe('OK');
  });
});

describe('T1315 lo que el reinicio NO toca (SC-009-060)', () => {
  it('el enfriamiento de 60 s tras SUCCEEDED no se reinicia', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const first = t.h.uow.snapshot().sceneAttempts?.[0];
    await t.h.uow.runInTransaction((r) => r.scenes.publishImage({ sceneId: first?.sceneId ?? '', attemptId: first?.id ?? '', image: { id: 'c4000000-0000-4000-8000-000000001515', mime: 'image/png', sizeBytes: 10, fingerprint: 'a'.repeat(64), inputsSnapshot: '{"v":1}', createdAt: at(5) }, degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: at(5) }));
    await reset(t, at(10));
    t.h.clock.setClock('2026-11-05', at(30));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe('ERR-RATE-LIMITED');
  });

  it('una escena con intento activo (generating) conserva su estado; una en failed queda reintentable (run_state nulo) y la cuota queda en 0', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const scene = t.h.uow.snapshot().scenes?.[0];
    expect(scene?.runState).toBe('generating');
    await reset(t, at(10));
    expect(t.h.uow.snapshot().scenes?.[0]).toMatchObject({ runState: 'generating', currentAttemptId: scene?.currentAttemptId, consumedGenerations: 0 });
    const first = t.h.uow.snapshot().sceneAttempts?.[0];
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: first?.sceneId ?? '', attemptId: first?.id ?? '', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: at(15) }));
    expect(t.h.uow.snapshot().scenes?.[0]?.runState).toBe('failed');
    await reset(t, at(20));
    expect(t.h.uow.snapshot().scenes?.[0]).toMatchObject({ runState: null, currentAttemptId: null });
  });
});
