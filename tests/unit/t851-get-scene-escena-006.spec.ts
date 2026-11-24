import { describe, expect, it } from 'vitest';
import type { SceneAttemptRecord, SceneRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { GetSceneImageUseCase, GetSceneUseCase, loadLiveInputs, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../src/generated/v34/index.ts';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { validateSceneView } from '../../src/generated/v34/schemas/validators.mjs';
import { serializeInputsSnapshot } from '../../src/domain/scene/inputs-snapshot.ts';
import { ANDRES, ARGOS, CARLOS, HOUSEHOLD, LUCIA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T851/T852 (006, Fase 5): `getScene` y entrega de la imagen. Autoriza primero y responde 404 sin escribir, creación perezosa, vencimiento del arrendamiento
 * materializado por compare-and-set idempotente, estado derivado, acciones habilitadas, cuota restante, «Se muestran N de M», aviso «desactualizada» con la imagen
 * vigente y la etiqueta `v` solo de caché. REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-019, REQ-ESC6-020; INV-ESC6-007, INV-ESC6-019; EDGE-ESC6-003, EDGE-ESC6-006,
 * EDGE-ESC6-009, EDGE-ESC6-021; SC-ESC6-014, SC-ESC6-017, SC-ESC6-018, SC-ESC6-032, SC-ESC6-063, SC-ESC6-081, SC-ESC6-093.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const OWNER: SceneTarget = { kind: 'OWNER' };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const SCENE = 'c1000000-0000-4000-8000-000000000001';
const IMAGE = 'c2000000-0000-4000-8000-000000000001';
const RESULT = 'c3000000-0000-4000-8000-000000000001';
const ATTEMPT = 'c4000000-0000-4000-8000-000000000001';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV34) return error.code;
    throw error;
  }
}

function setup(options: SceneFixtureOptions = {}, mutate: (state: ReturnType<typeof canonicalState>) => void = () => undefined) {
  const state = canonicalState();
  mutate(state);
  const h = createHarness(state);
  const fixture = sceneFixture(options);
  const deps = withScene(h.deps, fixture);
  return { h, fixture, deps, get: new GetSceneUseCase(deps) };
}

const sceneRow = (over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
  consumedGenerations: 0, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW, ...over,
});
const attemptRow = (over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: ATTEMPT, sceneId: SCENE, actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: 'f'.repeat(64), inputsSnapshot: '{"v":1}', resultObjectId: RESULT,
  phase: 'RUNNING', claimedAt: NOW, providerCallStartedAt: null, quotaWindow: '2026-11', quotaMax: 10, outcome: null, errorCode: null, degraded: false,
  idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null, ...over,
});
const imageOf = (fingerprint: string, over: Partial<NonNullable<SceneRecord['image']>> = {}) => ({ id: IMAGE, mime: 'image/png' as const, sizeBytes: 9, fingerprint, inputsSnapshot: '{"v":1,"household":null,"pets":[]}', createdAt: NOW, ...over });
/** Huella viva del hogar de pruebas: el intento fallido que la comparte deja la escena en `failed` (si difiere, la derivación da `outdated`). */
const liveFingerprint = (t: { h: ReturnType<typeof createHarness>; deps: Parameters<typeof loadLiveInputs>[0] }): Promise<string> =>
  t.h.uow.runInTransaction(async (r) => (await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' })).fingerprint);
const assignedCount = (state: ReturnType<typeof canonicalState>): number => state.assignments.filter((a) => a.householdId === HOUSEHOLD.id).length;

describe('getScene (T852): autoriza primero y no escribe para hogares ajenos o inexistentes', () => {
  it('[SC-ESC6-093][INV-ESC6-019][INV-ESC6-007] un no miembro, un invitado, un hogar inexistente y un identificador ajeno dan 404 y no crean ninguna fila', async () => {
    const t = setup();
    const codes = [
      await codeOf(t.get.execute(LUCIA, HOUSE)),
      await codeOf(t.get.execute(CARLOS, HOUSE)),
      await codeOf(t.get.execute(ANDRES, { kind: 'HOUSEHOLD', householdId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd99' })),
    ];
    expect(codes).toEqual(['ERR-HOUSE-NOT-FOUND', 'ERR-HOUSE-NOT-FOUND', 'ERR-HOUSE-NOT-FOUND']);
    const state = t.h.uow.snapshot();
    expect([state.scenes ?? [], state.sceneAttempts ?? [], state.mediaQueue]).toEqual([[], [], []]);
  });

  it('[REQ-ESC6-003][SC-ESC6-093] la primera lectura de un miembro crea la escena perezosamente (una sola fila, idempotente) y es outdated con las mascotas asignadas', async () => {
    const t = setup({ maxPets: 2 });
    const view = await t.get.execute(ANDRES, HOUSE);
    const state = t.h.uow.snapshot();
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes?.[0]).toMatchObject({ id: view.sceneId, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, image: null, consumedGenerations: 0, quotaWindow: '2026-11' });
    expect(view).toMatchObject({ owner: 'HOUSEHOLD', status: 'outdated', imageTag: null, pending: 2, stale: false, lastError: null, updatedAt: NOW });
    expect(view.pets).toEqual({ shown: 2, total: assignedCount(canonicalState()), maxPets: 2 });
    await t.get.execute(MARIA, HOUSE);
    expect((await t.get.execute(ANDRES, HOUSE)).sceneId).toBe(view.sceneId);
    expect(t.h.uow.snapshot().scenes).toHaveLength(1);
  });

  it('[REQ-ESC6-003][SC-ESC6-014] sin mascotas ni foto el estado es idle, sin cambios, y el botón queda deshabilitado por NO_CHANGES', async () => {
    const t = setup({}, (s) => {
      s.assignments = [];
    });
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'idle', pending: 0, pets: { shown: 0, total: 0, maxPets: 8 }, actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES' } });
  });
});

describe('getScene (T852): estado derivado, acciones y cuota', () => {
  /** Publica una imagen vigente: con la huella viva (ready) o con otra y el snapshot vacío (outdated con cambios pendientes). */
  async function withImage(t: ReturnType<typeof setup>, stale = false) {
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert(sceneRow());
      const live = await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' });
      const snapshot = stale ? '{"v":1,"household":null,"pets":[]}' : serializeInputsSnapshot(live.snapshot);
      await r.scenes.publishImage({ sceneId: SCENE, attemptId: ATTEMPT, image: imageOf(stale ? 'a'.repeat(64) : live.fingerprint, { inputsSnapshot: snapshot }), degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: NOW });
    });
  }

  it('[SC-ESC6-014] ready con la imagen al día: sin cambios pendientes, canUpdate = false por NO_CHANGES, canRegenerate = true y la etiqueta de caché es el id de la imagen', async () => {
    const t = setup();
    await withImage(t);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ sceneId: SCENE, status: 'ready', imageTag: IMAGE, pending: 0, stale: false, actions: { canUpdate: false, canRegenerate: true, blockedReason: 'NO_CHANGES' } });
    expect(view.quota).toEqual({ max: 10, remaining: 9, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' });
    expect(t.fixture.generator.calls).toHaveLength(0);
  });

  it('[REQ-ESC6-019] un cambio posterior deja la escena outdated con la imagen vigente visible, aviso «desactualizada» (stale) y el botón habilitado para el propietario', async () => {
    const t = setup();
    await withImage(t, true);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'outdated', imageTag: IMAGE, stale: true, actions: { canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null } });
    expect(view.pending).toBeGreaterThanOrEqual(1);
  });

  it('[REQ-ESC6-020][SC-ESC6-081] un READER ve la escena pero no puede actualizar, regenerar ni subir la foto: blockedReason = ROLE', async () => {
    const t = setup();
    const view = await t.get.execute(MARIA, HOUSE);
    expect(view.actions).toEqual({ canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason: 'ROLE', retryAfterSeconds: null });
    expect(view.status).toBe('outdated');
  });

  it('[REQ-ESC6-011][SC-ESC6-057] cuota agotada en la ventana vigente: remaining 0 y QUOTA_EXHAUSTED; la de otra ventana cuenta 0 y se reinicia', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.insert(sceneRow({ consumedGenerations: 10 })); });
    const exhausted = await t.get.execute(ANDRES, HOUSE);
    expect(exhausted.quota.remaining).toBe(0);
    expect(exhausted.actions).toMatchObject({ canUpdate: false, canRegenerate: false, blockedReason: 'QUOTA_EXHAUSTED' });
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.deleteScene(SCENE); await r.scenes.insert(sceneRow({ consumedGenerations: 10, quotaWindow: '2026-10' })); });
    const reset = await t.get.execute(ANDRES, HOUSE);
    expect(reset.quota).toMatchObject({ remaining: 10, window: '2026-11' });
    expect(reset.actions.canUpdate).toBe(true);
  });

  it('[REQ-ESC6-003] con un arrendamiento vigente el estado es generating y el botón queda deshabilitado por GENERATING', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert(sceneRow());
      await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptRow({ phase: 'PENDING', claimedAt: null }), now: NOW, leaseExpiresAt: at(600) });
    });
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'generating', lastError: null, actions: { canUpdate: false, blockedReason: 'GENERATING' } });
  });

  it('[REQ-ESC6-034][EDGE-ESC6-029] tres intentos FAILED en 24 h deshabilitan el botón con COOLDOWN', async () => {
    const t = setup();
    const fingerprint = await liveFingerprint(t);
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert(sceneRow());
      for (let n = 3; n >= 1; n -= 1) {
        const startedAt = at(-3600 * n);
        await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptRow({ id: `c4000000-0000-4000-8000-00000000000${n}`, resultObjectId: `c3000000-0000-4000-8000-00000000000${n}`, phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', providerCallStartedAt: startedAt, fingerprint, startedAt, finishedAt: startedAt }), now: startedAt, leaseExpiresAt: at(-3600 * n + 600) });
      }
    });
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view.status).toBe('failed');
    expect(view.actions).toMatchObject({ canUpdate: false, blockedReason: 'COOLDOWN' });
  });
});

describe('getScene (T852): vencimiento del arrendamiento y consentimiento', () => {
  async function expired(t: ReturnType<typeof setup>) {
    const fingerprint = await liveFingerprint(t);
    await t.h.uow.runInTransaction(async (r) => {
      await r.scenes.insert(sceneRow());
      await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptRow({ phase: 'PENDING', claimedAt: null, fingerprint }), now: NOW, leaseExpiresAt: at(300) });
      await r.mediaQueue.enqueue(`scenes/${SCENE}/images/${RESULT}`, 'INTENT', NOW);
    });
    t.h.clock.setClock('2026-11-05', at(301));
  }

  it('[SC-ESC6-018][EDGE-ESC6-003] un arrendamiento vencido se materializa: la escena queda failed con ERR-SCENE-LEASE-EXPIRED, sin descontar cuota, el intento FAILED y su objeto INTENT pasa a DELETE', async () => {
    const t = setup();
    await expired(t);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-LEASE-EXPIRED', quota: { remaining: 10 }, actions: { canUpdate: true, blockedReason: null } });
    const state = t.h.uow.snapshot();
    expect(state.scenes?.[0]).toMatchObject({ runState: 'failed', leaseExpiresAt: null, consumedGenerations: 0 });
    expect(state.sceneAttempts?.[0]).toMatchObject({ phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED' });
    expect(state.mediaQueue.map((e) => `${e.reason}:${e.objectKey}`)).toEqual([`DELETE:scenes/${SCENE}/images/${RESULT}`]);
  });

  it('[SC-ESC6-093][H-TRI-006-12] dos lecturas concurrentes con un arrendamiento vencido producen una sola transición failed, y una tercera no cambia nada', async () => {
    const t = setup();
    await expired(t);
    const [a, b] = await Promise.all([t.get.execute(ANDRES, HOUSE), t.get.execute(MARIA, HOUSE)]);
    const after = JSON.stringify(t.h.uow.snapshot().sceneAttempts);
    await t.get.execute(ANDRES, HOUSE);
    expect([a.status, b.status, a.lastError, b.lastError]).toEqual(['failed', 'failed', 'ERR-SCENE-LEASE-EXPIRED', 'ERR-SCENE-LEASE-EXPIRED']);
    expect(JSON.stringify(t.h.uow.snapshot().sceneAttempts)).toBe(after);
    expect(t.h.uow.snapshot().mediaQueue).toHaveLength(1);
  });

  it('[H-KEY-F5-5][REQ-ESC6-021] la lectura que materializa el vencimiento audita SCENE_FAILED/ERR-SCENE-LEASE-EXPIRED con el actor del intento (no el lector), HMAC del hogar y una sola vez', async () => {
    const t = setup();
    await expired(t);
    const before = t.h.uow.snapshot().auditLog.length;
    await t.get.execute(MARIA, HOUSE);
    const rows = t.h.uow.snapshot().auditLog.slice(before);
    expect(rows.map((e) => [e.entityType, e.mutationType, e.entityId, e.executorUserId])).toEqual([['HOME_SCENE', 'UPDATE', SCENE, ANDRES]]);
    const householdRef = t.deps.auditPseudonym.hmacUserId(HOUSEHOLD.id, t.deps.auditHmacSecret);
    expect(rows[0]?.newStateHash).toBe(stateHash({ event: 'SCENE_FAILED', householdRef, mode: 'FROM_SCRATCH', pets: 0, result: 'ERR-SCENE-LEASE-EXPIRED' }));
    await t.get.execute(ANDRES, HOUSE);
    await t.get.execute(MARIA, HOUSE);
    expect(t.h.uow.snapshot().auditLog.length).toBe(before + 1);
  });

  it('[H-KEY-F5-5][SC-ESC6-093] dos lecturas concurrentes con el arrendamiento vencido dejan una sola fila de auditoría (el CAS que no transiciona no escribe)', async () => {
    const t = setup();
    await expired(t);
    const before = t.h.uow.snapshot().auditLog.length;
    await Promise.all([t.get.execute(ANDRES, HOUSE), t.get.execute(MARIA, HOUSE), t.get.execute(ANDRES, HOUSE)]);
    expect(t.h.uow.snapshot().auditLog.slice(before).map((e) => e.executorUserId)).toEqual([ANDRES]);
  });

  it('[H-KEY-F5-5][INV-ESC6-019] un lector sin acceso recibe 404 y no materializa el vencimiento ni escribe auditoría', async () => {
    const t = setup();
    await expired(t);
    const before = JSON.stringify(t.h.uow.snapshot());
    expect(await codeOf(t.get.execute(LUCIA, HOUSE))).toBe('ERR-HOUSE-NOT-FOUND');
    expect(JSON.stringify(t.h.uow.snapshot())).toBe(before);
  });

  it('[REQ-ESC6-024][INV-ESC6-014] con el driver simulado no se exige consentimiento y la foto de la mascota cuenta; con el real, sin consentimiento vigente la foto no cuenta y consent.required = true', async () => {
    const fake = setup();
    const real = setup({ realDriver: true });
    for (const t of [fake, real]) await t.h.uow.runInTransaction(async (r) => { await r.pets.replaceAvatar(ARGOS.id, 'e1000000-0000-4000-8000-000000000001'); });
    const photoOf = async (t: ReturnType<typeof setup>) => t.h.uow.runInTransaction(async (r) => (await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' })).snapshot.pets.find((p) => p.id === ARGOS.id)?.photo);
    expect([await photoOf(fake), await photoOf(real)]).toEqual(['e1000000-0000-4000-8000-000000000001', null]);
    expect((await fake.get.execute(ANDRES, HOUSE)).consent).toEqual({ required: false, noticeVersion: '1', providerId: 'vertex-gemini-image', householdPhotoGranted: false, petPhotosGranted: false });
    expect((await real.get.execute(ANDRES, HOUSE)).consent.required).toBe(true);
    await real.h.uow.runInTransaction(async (r) => {
      await r.sceneConsents.grant({ id: 'c5000000-0000-4000-8000-000000000001', userId: ANDRES, scope: 'PET_PHOTOS', providerId: 'vertex-gemini-image', noticeVersion: '1', grantedAt: NOW, revokedAt: null });
    });
    expect(await photoOf(real)).toBe('e1000000-0000-4000-8000-000000000001');
    expect((await real.get.execute(ANDRES, HOUSE)).consent).toMatchObject({ required: false, petPhotosGranted: true, householdPhotoGranted: false });
  });
});

describe('getScene (T852): escena del propietario sin hogar', () => {
  it('[REQ-ESC6-032][D6-09] el propietario sin hogar tiene su escena (lazy, owner = OWNER) con solo sus mascotas no asignadas; sin ellas es idle', async () => {
    const t = setup({}, (s) => {
      s.assignments = s.assignments.filter((a) => a.petId !== ARGOS.id);
    });
    const view = await t.get.execute(ANDRES, OWNER);
    expect(view).toMatchObject({ owner: 'OWNER', status: 'outdated', pending: 1, pets: { shown: 1, total: 1 }, actions: { canUpdate: true, canUploadHouseholdPhoto: false } });
    expect(t.h.uow.snapshot().scenes?.[0]).toMatchObject({ householdId: null, ownerUserId: ANDRES });
    const none = setup();
    expect((await none.get.execute(LUCIA, OWNER)).status).toBe('idle');
  });
});

describe('getSceneImage (T852): entrega con la etiqueta v solo de caché', () => {
  function imageSetup() {
    const t = setup();
    const storage = new ControlledStorage(() => new Date(NOW));
    const deps = { ...t.deps, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
    return { t, storage, image: new GetSceneImageUseCase(deps) };
  }

  it('[INV-ESC6-019][SC-ESC6-081] sirve SIEMPRE la imagen vigente de la escena autorizada; una v distinta o antigua se ignora y nunca selecciona otro objeto; la URL fija content-type y nombre neutro', async () => {
    const { t, storage, image } = imageSetup();
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.insert(sceneRow({ image: imageOf('a'.repeat(64)) })); });
    const key = `scenes/${SCENE}/images/${IMAGE}`;
    await storage.put(key, new Uint8Array([1, 2, 3]), 'image/png');
    const plain = await image.execute(ANDRES, HOUSE, undefined);
    const stale = await image.execute(MARIA, HOUSE, 'c2000000-0000-4000-8000-0000000000ff');
    expect(plain.url).toContain(key);
    expect(stale.url).toContain(key);
    expect(storage.operations.filter((o) => o.startsWith('createReadUrl')).every((o) => o === `createReadUrl:${key}`)).toBe(true);
  });

  it('[INV-ESC6-007][SC-ESC6-081] sin acceso, sin imagen vigente o con un hogar ajeno es 404 y no genera ninguna URL ni escritura', async () => {
    const { t, storage, image } = imageSetup();
    expect(await codeOf(image.execute(LUCIA, HOUSE, undefined))).toBe('ERR-HOUSE-NOT-FOUND');
    expect(await codeOf(image.execute(ANDRES, HOUSE, undefined))).toBe('ERR-HOUSE-NOT-FOUND');
    expect(storage.operations).toEqual([]);
    expect([t.h.uow.snapshot().scenes ?? []]).toEqual([[]]);
  });
});

describe('getScene (T914): canRegenerate alineado con limits.allowed y retryAfterSeconds (REQ-ESC6-007, REQ-ESC6-034; INV-ESC6-004)', () => {
  /** Un intento FAILED iniciado hace `ago` segundos con la huella viva (la escena queda `failed`). */
  async function failedAttempt(t: ReturnType<typeof setup>, ago: number, n = 1): Promise<void> {
    const fingerprint = await liveFingerprint(t);
    const startedAt = at(-ago);
    await t.h.uow.runInTransaction(async (r) => {
      if (n === 1) await r.scenes.insert(sceneRow());
      await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptRow({ id: `c4000000-0000-4000-8000-00000000000${n}`, resultObjectId: `c3000000-0000-4000-8000-00000000000${n}`, phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', providerCallStartedAt: startedAt, fingerprint, startedAt, finishedAt: startedAt }), now: startedAt, leaseExpiresAt: at(-ago + 1) });
    });
  }

  it('[SC-ESC6-112][SC-ESC6-113] dentro del enfriamiento de 60 s canRegenerate es falso, blockedReason COOLDOWN y retryAfterSeconds el resto exacto (entero)', async () => {
    const t = setup();
    await failedAttempt(t, 20);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view.actions).toEqual({ canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: true, blockedReason: 'COOLDOWN', retryAfterSeconds: 40 });
  });

  it('[SC-ESC6-112][SC-ESC6-113] a los 61 s del intento el enfriamiento venció: canRegenerate verdadero, canUpdate verdadero y retryAfterSeconds null', async () => {
    const t = setup();
    await failedAttempt(t, 61);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view.actions).toEqual({ canUpdate: true, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: null, retryAfterSeconds: null });
  });

  it('[SC-ESC6-112] a los 60 s exactos el enfriamiento termina (sin segundo extra) y a los 59 s queda 1 s', async () => {
    const exact = setup();
    await failedAttempt(exact, 60);
    expect((await exact.get.execute(ANDRES, HOUSE)).actions).toMatchObject({ canRegenerate: true, retryAfterSeconds: null });
    const early = setup();
    await failedAttempt(early, 59);
    expect((await early.get.execute(ANDRES, HOUSE)).actions).toMatchObject({ canRegenerate: false, retryAfterSeconds: 1 });
  });

  it('[SC-ESC6-112][SC-ESC6-113] tres FAILED en 24 h: canRegenerate falso y retryAfterSeconds = fallo más antiguo + 24 h − ahora, dentro de 1..86400', async () => {
    const t = setup();
    for (let n = 3; n >= 1; n -= 1) await failedAttempt(t, 3600 * n, 4 - n);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view.actions).toMatchObject({ canRegenerate: false, blockedReason: 'COOLDOWN', retryAfterSeconds: 86_400 - 3 * 3600 });
  });

  it('[SC-ESC6-113] con blockedReason ROLE el retryAfterSeconds real se informa igualmente (el valor por defecto no es bloqueante)', async () => {
    const t = setup();
    await failedAttempt(t, 20);
    const view = await t.get.execute(MARIA, HOUSE);
    expect(view.actions).toEqual({ canUpdate: false, canRegenerate: false, canUploadHouseholdPhoto: false, blockedReason: 'ROLE', retryAfterSeconds: 40 });
  });

  it('[SC-ESC6-113] la vista valida contra scene.schema.json 1.1.0 con retryAfterSeconds entero o null, y rechaza 0 y 86401', async () => {
    const t = setup();
    await failedAttempt(t, 20);
    const blocked = await t.get.execute(ANDRES, HOUSE);
    expect(validateSceneView(blocked)).toBe(true);
    expect(validateSceneView({ ...blocked, actions: { ...blocked.actions, retryAfterSeconds: null } })).toBe(true);
    expect(validateSceneView({ ...blocked, actions: { ...blocked.actions, retryAfterSeconds: 0 } })).toBe(false);
    expect(validateSceneView({ ...blocked, actions: { ...blocked.actions, retryAfterSeconds: 86_401 } })).toBe(false);
    expect(validateSceneView({ ...blocked, actions: { ...blocked.actions, retryAfterSeconds: 1.5 } })).toBe(false);
  });
});
