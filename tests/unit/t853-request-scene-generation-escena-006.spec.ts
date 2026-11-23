import { describe, expect, it } from 'vitest';
import { RequestSceneGenerationUseCase, loadLiveInputs, sceneIdempotencyHash, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { sha256Hex } from '../../src/domain/audit/sha256.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../src/generated/v34/index.ts';
import { ANDRES, HOUSEHOLD, LUCIA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T853/T854 (006, Fase 5): `requestSceneGeneration` (T1). Rol, consentimiento, cuota, contadores y enfriamiento, botón habilitado solo con cambios pendientes y
 * cuota, `UPDATE`/`REGENERATE`, un solo generador, idempotencia con una sola clave recordada (la última, 24 h), clave de otro usuario o acción distinta, intento
 * `INTENT` en la misma transacción, `enqueue` ambiguo y `ALREADY_EXISTS`. REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-011, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036;
 * INV-ESC6-003, INV-ESC6-004, INV-ESC6-014; EDGE-ESC6-007, EDGE-ESC6-014, EDGE-ESC6-016, EDGE-ESC6-024, EDGE-ESC6-029, EDGE-ESC6-031, EDGE-ESC6-032;
 * ERR-SCENE-QUOTA-EXCEEDED; SC-ESC6-014, SC-ESC6-015, SC-ESC6-016, SC-ESC6-021, SC-ESC6-054, SC-ESC6-057, SC-ESC6-065, SC-ESC6-074, SC-ESC6-075, SC-ESC6-078,
 * SC-ESC6-079, SC-ESC6-080.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const UPDATE = { action: 'UPDATE' } as const;
const REGENERATE = { action: 'REGENERATE' } as const;

async function failure(promise: Promise<unknown>): Promise<DomainError | DomainErrorV34 | Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('se esperaba un rechazo');
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV34) return error.code;
    throw error;
  }
};

function setup(options: SceneFixtureOptions = {}, mutate: (state: ReturnType<typeof canonicalState>) => void = () => undefined) {
  const state = canonicalState();
  mutate(state);
  const h = createHarness(state);
  const fixture = sceneFixture(options);
  const deps = withScene(h.deps, fixture);
  return { h, fixture, deps, request: new RequestSceneGenerationUseCase(deps) };
}
const asAdmin = (state: ReturnType<typeof canonicalState>): void => {
  state.memberships = state.memberships.map((m) => (m.userId === MARIA && m.householdId === HOUSEHOLD.id ? { ...m, role: 'ADMIN' as const } : m));
};
const snap = (t: ReturnType<typeof setup>) => t.h.uow.snapshot();
const attemptsOf = (t: ReturnType<typeof setup>) => snap(t).sceneAttempts ?? [];

describe('requestSceneGeneration (T854): T1 completo', () => {
  it('[REQ-ESC6-036][SC-ESC6-016][SC-ESC6-075] UPDATE con cambios: un intento PENDING con huella, ventana y máximo fijados, arrendamiento ahora + T_QUEUE, INTENT del objeto resultante, tarea encolada tras el COMMIT y 0 llamadas al generador', async () => {
    const t = setup();
    const result = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const [attempt] = attemptsOf(t);
    const scene = snap(t).scenes?.[0];
    expect(result.accepted).toBe(true);
    expect(result.view).toMatchObject({ status: 'generating', sceneId: scene?.id, actions: { canUpdate: false, blockedReason: 'GENERATING' } });
    expect(attemptsOf(t)).toHaveLength(1);
    const live = await t.h.uow.runInTransaction((r) => loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' }));
    expect(attempt).toMatchObject({
      sceneId: scene?.id, actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: live.fingerprint, phase: 'PENDING', claimedAt: null, providerCallStartedAt: null,
      quotaWindow: '2026-11', quotaMax: 10, outcome: null, degraded: false, startedAt: NOW, finishedAt: null,
      idempotencyKeyHash: sceneIdempotencyHash(ANDRES, scene?.id ?? '', 'UPDATE', key(1)), idempotencyExpiresAt: at(86_400),
    });
    expect(scene).toMatchObject({ runState: 'generating', currentAttemptId: attempt?.id, leaseExpiresAt: at(600), consumedGenerations: 0 });
    expect(snap(t).mediaQueue.map((e) => `${e.reason}:${e.objectKey}`)).toEqual([`INTENT:scenes/${scene?.id}/images/${attempt?.resultObjectId}`]);
    expect(t.fixture.dispatcher.jobs).toEqual([{ sceneId: scene?.id, attemptId: attempt?.id }]);
    expect(t.fixture.generator.calls).toHaveLength(0);
  });

  it('[SC-ESC6-016][EDGE-ESC6-016] el hash guardado es SHA-256 de actor ‖ escena ‖ acción ‖ clave y nunca la clave en claro', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const scene = snap(t).scenes?.[0]?.id ?? '';
    const hash = attemptsOf(t)[0]?.idempotencyKeyHash;
    expect(hash).toBe(sceneIdempotencyHash(ANDRES, scene, 'UPDATE', key(1)));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(`${ANDRES}\u001f${scene}\u001fUPDATE\u001f${key(1)}`)).toBe(hash);
    expect(JSON.stringify(snap(t)).includes(key(1))).toBe(false);
    expect(sceneIdempotencyHash(MARIA, scene, 'UPDATE', key(1))).not.toBe(hash);
    expect(sceneIdempotencyHash(ANDRES, scene, 'REGENERATE', key(1))).not.toBe(hash);
  });

  it('[REQ-ESC6-007][SC-ESC6-021] REGENERATE sin cambios pendientes ni imagen pasa por el mismo T1 con modo FROM_SCRATCH/REGENERATE y no consume cuota al pedirse', async () => {
    const t = setup({}, (s) => {
      s.assignments = [];
    });
    const result = await t.request.execute(ANDRES, HOUSE, REGENERATE, key(1));
    expect(result.accepted).toBe(true);
    expect(attemptsOf(t)[0]).toMatchObject({ action: 'REGENERATE', mode: 'REGENERATE' });
    expect(snap(t).scenes?.[0]?.consumedGenerations).toBe(0);
  });

  it('[SC-ESC6-014][D14] UPDATE con la escena al día o sin entradas responde el estado vigente sin intento, sin tarea y sin llamada al generador', async () => {
    const t = setup({}, (s) => {
      s.assignments = [];
    });
    const result = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(result).toMatchObject({ accepted: false, view: { status: 'idle', actions: { blockedReason: 'NO_CHANGES' } } });
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length, t.fixture.generator.calls.length, snap(t).mediaQueue.length]).toEqual([0, 0, 0, 0]);
  });

  it('[REQ-ESC6-006][EDGE-ESC6-014] con imagen vigente y una mascota nueva el modo es INCREMENTAL_ADD; tras un fallo sin cambios el reintento regenera desde el estado actual (FROM_SCRATCH)', async () => {
    const t = setup({ maxPets: 1 });
    const live = await t.h.uow.runInTransaction((r) => loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' }));
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert({ id: 'c1000000-0000-4000-8000-000000000001', householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
      await r.scenes.publishImage({
        sceneId: 'c1000000-0000-4000-8000-000000000001', attemptId: 'c4000000-0000-4000-8000-000000000009',
        image: { id: 'c2000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 9, fingerprint: 'a'.repeat(64), inputsSnapshot: JSON.stringify({ v: 1, household: null, pets: [] }), createdAt: NOW },
        degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: NOW,
      });
    });
    expect(live.snapshot.pets).toHaveLength(1);
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(attemptsOf(t)[0]).toMatchObject({ mode: 'INCREMENTAL_ADD', action: 'UPDATE' });
  });
});

describe('requestSceneGeneration (T854): rol, consentimiento y cuota', () => {
  it('[REQ-ESC6-020][SC-ESC6-081] un READER recibe ERR-ACC-FORBIDDEN, un tercero ERR-HOUSE-NOT-FOUND sin crear la escena, y ninguno deja intento ni tarea', async () => {
    const t = setup();
    expect(await codeOf(t.request.execute(MARIA, HOUSE, UPDATE, key(1)))).toBe('ERR-ACC-FORBIDDEN');
    const fresh = setup();
    expect(await codeOf(fresh.request.execute(LUCIA, HOUSE, UPDATE, key(1)))).toBe('ERR-HOUSE-NOT-FOUND');
    expect(snap(fresh).scenes ?? []).toEqual([]);
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length]).toEqual([0, 0]);
  });

  it('[INV-ESC6-014][SC-ESC6-035] con el driver real y sin consentimiento vigente: 403 ERR-SCENE-CONSENT-REQUIRED, 0 tareas y 0 llamadas; con consentimiento procede', async () => {
    const t = setup({ realDriver: true });
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-SCENE-CONSENT-REQUIRED');
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length, t.fixture.generator.calls.length]).toEqual([0, 0, 0]);
    await t.h.uow.runInTransaction(async (r) => {
      await r.sceneConsents.grant({ id: 'c5000000-0000-4000-8000-000000000001', userId: ANDRES, scope: 'PET_PHOTOS', providerId: 'vertex-gemini-image', noticeVersion: '1', grantedAt: NOW, revokedAt: null });
    });
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(2))).accepted).toBe(true);
  });

  it('[REQ-ESC6-011][SC-ESC6-057][ERR-SCENE-QUOTA-EXCEEDED] con la cuota de la ventana agotada: 409, la imagen vigente se conserva y no hay intento; en otra ventana la cuota se reinicia', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert({ id: 'c1000000-0000-4000-8000-000000000001', householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 10, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
    });
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, UPDATE, key(1)))).toBe('ERR-SCENE-QUOTA-EXCEEDED');
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, REGENERATE, key(2)))).toBe('ERR-SCENE-QUOTA-EXCEEDED');
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length]).toEqual([0, 0]);
    t.h.clock.setClock('2026-12-01', '2026-12-01T12:00:00.000Z');
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(3))).accepted).toBe(true);
    expect(attemptsOf(t)[0]).toMatchObject({ quotaWindow: '2026-12', quotaMax: 10 });
  });

  it('[SC-ESC6-016][SC-ESC6-065] una acción o una clave mal formada es ERR-SCHEMA-VALIDATION-FAILED y no escribe nada, ni siquiera la escena', async () => {
    const t = setup();
    for (const [input, k] of [[{ action: 'DELETE' }, key(1)], [{}, key(1)], [UPDATE, 'no-es-uuid'], [UPDATE, 7], [UPDATE, undefined], [{ action: 'UPDATE', extra: 1 }, key(1)]] as const) {
      expect(await codeOf(t.request.execute(ANDRES, HOUSE, input, k))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
    expect([snap(t).scenes ?? [], attemptsOf(t)]).toEqual([[], []]);
  });
});

describe('requestSceneGeneration (T854): un solo generador e idempotencia', () => {
  it('[REQ-ESC6-012][SC-ESC6-016][D16] dos solicitudes simultáneas (doble clic o dos usuarios) obtienen un solo intento y una sola tarea; la otra recibe el estado generating sin descuento', async () => {
    const t = setup({}, asAdmin);
    const [a, b] = await Promise.all([t.request.execute(ANDRES, HOUSE, UPDATE, key(1)), t.request.execute(MARIA, HOUSE, UPDATE, key(2))]);
    expect([a.accepted, b.accepted].sort()).toEqual([false, true]);
    expect([a.view.status, b.view.status]).toEqual(['generating', 'generating']);
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length, snap(t).scenes?.[0]?.consumedGenerations]).toEqual([1, 1, 0]);
  });

  it('[EDGE-ESC6-016][SC-ESC6-080] la misma clave y la misma acción repetidas devuelven el estado vigente sin segundo intento; la misma clave con otra acción es 422', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const again = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(again).toMatchObject({ accepted: false, view: { status: 'generating' } });
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, REGENERATE, key(1)))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length]).toEqual([1, 1]);
  });

  it('[EDGE-ESC6-016][H-TRI-006-05] la repetición reevalúa permisos: quien ya no tiene acceso recibe 404 y no la respuesta almacenada', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(await codeOf(t.request.execute(LUCIA, HOUSE, UPDATE, key(1)))).toBe('ERR-HOUSE-NOT-FOUND');
  });

  it('[EDGE-ESC6-016][H-MIF-006-03] solo se recuerda la ÚLTIMA clave: tras un intento terminal, su clave devuelve 200 sin bloquear una nueva; una clave anterior a la última no se reconoce y se trata como nueva', async () => {
    const t = setup();
    const settle = async (n: number) => {
      const attempt = attemptsOf(t)[n - 1];
      await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: t.h.clock.nowIsoTimestamp() }));
    };
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    await settle(1);
    t.h.clock.setClock('2026-11-05', at(120));
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(1))).accepted).toBe(false);
    expect(attemptsOf(t)).toHaveLength(1);
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(2))).accepted).toBe(true);
    expect(attemptsOf(t).map((a) => a.idempotencyKeyHash !== null)).toEqual([false, true]);
    await settle(2);
    t.h.clock.setClock('2026-11-05', at(300));
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(1))).accepted).toBe(true);
    expect(attemptsOf(t)).toHaveLength(3);
  });

  it('[REQ-ESC6-012] una clave vencida (24 h) no se reconoce', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const first = attemptsOf(t)[0];
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: first?.sceneId ?? '', attemptId: first?.id ?? '', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: at(10) }));
    t.h.clock.setClock('2026-11-06', at(86_401));
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(1))).accepted).toBe(true);
    expect(attemptsOf(t)).toHaveLength(2);
  });
});

describe('requestSceneGeneration (T854): contadores y enfriamiento (REQ-ESC6-034)', () => {
  async function fail(t: ReturnType<typeof setup>, n: number): Promise<void> {
    const attempt = attemptsOf(t)[n - 1];
    // 009 `#60` (REQ-LIM9-001): solo un FAILED con llamada al proveedor (marca `provider_call_started_at`) cuenta para el tope de fallos y el de actor; los FAILED sin llamada no.
    await t.h.uow.runInTransaction((r) => r.scenes.markProviderCall(attempt?.id ?? '', t.h.clock.nowIsoTimestamp()));
    await t.h.uow.runInTransaction((r) => r.scenes.closeAttempt({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now: t.h.clock.nowIsoTimestamp() }));
  }
  const retryAfter = async (promise: Promise<unknown>): Promise<number> => {
    const error = await failure(promise);
    expect((error as DomainError).code).toBe('ERR-RATE-LIMITED');
    return (error as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
  };

  it('[SC-ESC6-078] enfriamiento: un nuevo intento a menos de 60 s del anterior da 429 ERR-RATE-LIMITED con Retry-After y 0 tareas nuevas', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    await fail(t, 1);
    t.h.clock.setClock('2026-11-05', at(20));
    expect(await retryAfter(t.request.execute(ANDRES, HOUSE, UPDATE, key(2)))).toBe(40);
    expect([attemptsOf(t).length, t.fixture.dispatcher.jobs.length]).toEqual([1, 1]);
    t.h.clock.setClock('2026-11-05', at(60));
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(2))).accepted).toBe(true);
  });

  it('[SC-ESC6-079][H-KEY-F5-3] el tercer FAILED en 24 h bloquea con Retry-After = fallo más antiguo + 24 h − ahora; los intentos exitosos no cuentan', async () => {
    const t = setup();
    for (let n = 1; n <= 3; n += 1) {
      t.h.clock.setClock('2026-11-05', at(n * 100));
      await t.request.execute(ANDRES, HOUSE, UPDATE, key(n));
      await fail(t, n);
    }
    t.h.clock.setClock('2026-11-05', at(1000));
    expect(await retryAfter(t.request.execute(ANDRES, HOUSE, UPDATE, key(4)))).toBe(86_400 - 900);
    expect(attemptsOf(t)).toHaveLength(3);
    t.h.clock.setClock('2026-11-06', at(86_400 + 101));
    expect((await t.request.execute(ANDRES, HOUSE, UPDATE, key(5))).accepted).toBe(true);
  });

  it('[H-KEY-F5-3] varios intentos SUCCEEDED no bloquean por el tope de fallos', async () => {
    const t = setup();
    for (let n = 1; n <= 4; n += 1) {
      t.h.clock.setClock('2026-11-05', at(n * 100));
      await t.request.execute(ANDRES, HOUSE, REGENERATE, key(n));
      const attempt = attemptsOf(t)[n - 1];
      await t.h.uow.runInTransaction((r) =>
        r.scenes.publishImage({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '', image: { id: `c2000000-0000-4000-8000-00000000000${n}`, mime: 'image/png', sizeBytes: 9, fingerprint: 'e'.repeat(64), inputsSnapshot: '{"v":1}', createdAt: NOW }, degraded: false, consumedGenerations: n, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: NOW }),
      );
    }
    expect(attemptsOf(t).map((a) => a.outcome)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
  });

  it('[SC-ESC6-079][EDGE-ESC6-029] 100 pulsaciones consecutivas tras un fallo producen como máximo 3 intentos y una sola tarea por intento', async () => {
    const t = setup();
    let accepted = 0;
    for (let n = 1; n <= 100; n += 1) {
      t.h.clock.setClock('2026-11-05', at(n * 61));
      try {
        if ((await t.request.execute(ANDRES, HOUSE, UPDATE, key(n))).accepted) {
          accepted += 1;
          await fail(t, accepted);
        }
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'ERR-RATE-LIMITED') throw error;
      }
    }
    expect([accepted, attemptsOf(t).length, t.fixture.dispatcher.jobs.length]).toEqual([3, 3, 3]);
  });

  it('[REQ-ESC6-034] el tope de 12 intentos por actor en 24 h cuenta todas las escenas que dispara', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert({ id: 'c1000000-0000-4000-8000-000000000001', householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
      await r.scenes.insert({ id: 'c1000000-0000-4000-8000-000000000002', householdId: null, ownerUserId: ANDRES, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
      for (let n = 1; n <= 12; n += 1) {
        const startedAt = at(-3600 * 12 + n * 600);
        await r.scenes.beginGeneration({
          sceneId: 'c1000000-0000-4000-8000-000000000002',
          attempt: { id: `c4000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, sceneId: 'c1000000-0000-4000-8000-000000000002', actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}', resultObjectId: `c3000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, phase: 'DONE', claimedAt: null, providerCallStartedAt: startedAt, quotaWindow: '2026-11', quotaMax: 10, outcome: 'SUCCEEDED', errorCode: null, degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt, finishedAt: startedAt },
          now: startedAt, leaseExpiresAt: at(-3600 * 12 + n * 600 + 1),
        });
      }
    });
    expect(await retryAfter(t.request.execute(ANDRES, HOUSE, REGENERATE, key(1)))).toBe(43_800);
    expect(attemptsOf(t).filter((a) => a.sceneId === 'c1000000-0000-4000-8000-000000000001')).toEqual([]);
  });
});

describe('requestSceneGeneration (T854): encolado tras el COMMIT (EDGE-ESC6-032)', () => {
  it('[EDGE-ESC6-032] ALREADY_EXISTS es éxito: el intento sigue PENDING y la escena generating', async () => {
    const t = setup();
    t.fixture.dispatcher.alreadyExists = true;
    const result = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(result.accepted).toBe(true);
    expect(attemptsOf(t)[0]).toMatchObject({ phase: 'PENDING', outcome: null });
  });

  it('[EDGE-ESC6-032] un encolado ambiguo (tiempo agotado) NO marca failed: el intento sigue PENDING y el arrendamiento T_QUEUE resuelve el caso', async () => {
    const t = setup();
    t.fixture.dispatcher.ambiguous = true;
    const result = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    expect(result.accepted).toBe(true);
    expect(attemptsOf(t)[0]).toMatchObject({ phase: 'PENDING', outcome: null });
    expect(snap(t).scenes?.[0]).toMatchObject({ runState: 'generating', leaseExpiresAt: at(600) });
  });

  it('[EDGE-ESC6-017][EDGE-ESC6-032] un rechazo determinista del despachador deja el intento FAILED, la escena failed, el INTENT en DELETE y devuelve el estado failed sin consumir cuota', async () => {
    const t = setup();
    t.fixture.dispatcher.failing = true;
    const result = await t.request.execute(ANDRES, HOUSE, UPDATE, key(1));
    const [attempt] = attemptsOf(t);
    expect(result.accepted).toBe(false);
    expect(result.view).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED', quota: { remaining: 10 } });
    expect(attempt).toMatchObject({ phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED' });
    expect(snap(t).mediaQueue.map((e) => e.reason)).toEqual(['DELETE']);
    expect(JSON.stringify(result)).not.toContain('cola caída');
  });
});
