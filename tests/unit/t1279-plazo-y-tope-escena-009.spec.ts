import { describe, expect, it } from 'vitest';
import type { SceneAttemptRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { DomainError } from '../../src/generated/index.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1279 (009, Fase 1, bloque A, `#60`): plazo único de 10 min del intento sin marca y tope diario de intentos cerrados sin llamada, a nivel de caso de uso (el
 * conteo por repositorio se prueba en `t1207-conteo-sin-llamada-escena-009`). REQ-LIM9-001, REQ-LIM9-002, INV-LIM9-001; EDGE-009-041, EDGE-009-043; SC-009-036..043.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OTHER_SCENE = 'c1000000-0000-4000-8000-0000000000ee';
const UPDATE = { action: 'UPDATE' } as const;

function setup() {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture();
  const deps = withScene(h.deps, fixture);
  return { h, fixture, request: new RequestSceneGenerationUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const attempt = (n: number, over: Partial<SceneAttemptRecord>): SceneAttemptRecord => ({
  id: `c2000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sceneId: OTHER_SCENE, actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64),
  inputsSnapshot: '{"v":1}', resultObjectId: `c3000000-0000-4000-8000-${String(n).padStart(12, '0')}`, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null,
  quotaWindow: '2026-11', quotaMax: 10, outcome: null, errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: at(-1000), finishedAt: null, ...over,
});
/** Escena ajena del mismo actor (propietaria) con intentos sembrados directamente: solo importan los contadores por actor. */
async function seedActorAttempts(t: T, count: number, over: Partial<SceneAttemptRecord>): Promise<void> {
  await t.h.uow.runInTransaction(async (r) => {
    await r.scenes.insert({ id: OTHER_SCENE, householdId: null, ownerUserId: ANDRES, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
    for (let n = 1; n <= count; n += 1) await r.scenes.beginGeneration({ sceneId: OTHER_SCENE, attempt: attempt(n, { ...over, startedAt: over.startedAt ?? at(-1000) }), now: over.startedAt ?? at(-1000), leaseExpiresAt: at(-2000) });
  });
}
const code = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
};

describe('plazo único de 10 min del intento sin marca (T1279, EDGE-009-041, P5-01 = B)', () => {
  it('[EDGE-009-041][REQ-LIM9-002] 12 intentos del actor en vuelo y sin marca bloquean por ACTOR_LIMIT dentro de los 10 min; a los 10 min dejan de contar, se cierran CANCELLED sin llamada y se admite el nuevo', async () => {
    const t = setup();
    await seedActorAttempts(t, 12, { startedAt: at(0) });
    t.h.clock.setClock('2026-11-05', at(599));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-RATE-LIMITED');
    t.h.clock.setClock('2026-11-05', at(600));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('OK');
    const seeded = (t.h.uow.snapshot().sceneAttempts ?? []).filter((a) => a.sceneId === OTHER_SCENE);
    expect(seeded).toHaveLength(12);
    for (const a of seeded) expect(a).toMatchObject({ outcome: 'CANCELLED', providerCallStartedAt: null });
  });

  it('[EDGE-009-041] un intento sin outcome pero CON marca de llamada nunca se cierra por el plazo: sigue contando como intento con llamada', async () => {
    const t = setup();
    await seedActorAttempts(t, 12, { startedAt: at(0), providerCallStartedAt: at(1) });
    t.h.clock.setClock('2026-11-05', at(700));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-RATE-LIMITED');
    for (const a of (t.h.uow.snapshot().sceneAttempts ?? []).filter((x) => x.sceneId === OTHER_SCENE)) expect(a.outcome).toBeNull();
  });
});

describe('tope diario de intentos cerrados sin llamada (T1279, EDGE-009-043, D9-25)', () => {
  it('[EDGE-009-043] 20 intentos cerrados sin llamada de la escena en 24 h bloquean con el código de FAILED_LIMIT (ERR-RATE-LIMITED); con 19 se admite', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const first = t.h.uow.snapshot().sceneAttempts?.[0];
    const sceneId = first?.sceneId ?? '';
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId, attemptId: first?.id ?? '', outcome: 'CANCELLED', errorCode: null, degraded: false, now: at(5) }));
    // 18 intentos más cerrados sin llamada (total 19): el tope es 20.
    await t.h.uow.runInTransaction(async (r) => {
      for (let n = 1; n <= 18; n += 1) {
        await r.scenes.beginGeneration({ sceneId, attempt: attempt(n, { sceneId, actorUserId: 'ajeno', startedAt: at(10 + n), phase: 'DONE', outcome: 'CANCELLED', finishedAt: at(11 + n) }), now: at(10 + n), leaseExpiresAt: at(-1) });
      }
    });
    t.h.clock.setClock('2026-11-05', at(200));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe('OK');
    const second = t.h.uow.snapshot().sceneAttempts?.find((a) => a.idempotencyKeyHash !== null && a.startedAt === at(200));
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId, attemptId: second?.id ?? '', outcome: 'CANCELLED', errorCode: null, degraded: false, now: at(205) }));
    t.h.clock.setClock('2026-11-05', at(300));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(3)))).toBe('ERR-RATE-LIMITED');
    t.h.clock.setClock('2026-11-06', at(86_400 + 12));
    expect(await code(t.request.execute(ANDRES, HOUSE, UPDATE, key(4)))).toBe('OK');
  });

  it('[REQ-LIM9-001][EDGE-009-043] la cuota por propietario solo se consume con marca: un intento cerrado sin llamada deja consumedGenerations en 0', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const first = t.h.uow.snapshot().sceneAttempts?.[0];
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: first?.sceneId ?? '', attemptId: first?.id ?? '', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: at(5) }));
    expect(t.h.uow.snapshot().scenes?.[0]?.consumedGenerations).toBe(0);
  });
});
