import { describe, expect, it, vi } from 'vitest';
import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../src/application/ports/scene-image-generator.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { STYLE_BASE_TEXT } from '../../src/domain/scene/build-image-prompt.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T855/T856 (006, Fase 5): `runSceneGeneration` (worker). Claim con arrendamiento desde `claimed_at`, entrega duplicada o tardía sin efecto ni oráculo, referencias con
 * límites y degradación (nunca `ready`), reverificación de consentimiento, fallo y timeout sin descuento con la imagen anterior intacta, T2 atómico, cambios durante
 * la generación y comprobación del arrendamiento antes del `put`. REQ-ESC6-013, REQ-ESC6-014, REQ-ESC6-036; INV-ESC6-003, INV-ESC6-004, INV-ESC6-005, INV-ESC6-012;
 * EDGE-ESC6-003..006, EDGE-ESC6-017, EDGE-ESC6-021, EDGE-ESC6-024..028, EDGE-ESC6-031; ERR-SCENE-GENERATION-FAILED, ERR-SCENE-GENERATION-TIMEOUT, ERR-SCENE-LEASE-EXPIRED;
 * NFR-ESC6-002; SC-ESC6-017, SC-ESC6-018, SC-ESC6-020, SC-ESC6-032, SC-ESC6-053, SC-ESC6-055, SC-ESC6-059, SC-ESC6-062, SC-ESC6-063, SC-ESC6-068..071.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AVATAR = 'e1000000-0000-4000-8000-000000000001';
const ABSENT = { sceneId: 'c1000000-0000-4000-8000-0000000000aa', attemptId: 'c4000000-0000-4000-8000-0000000000aa' };

/** Generador que ejecuta una acción mientras «el proveedor trabaja» (cambios concurrentes, retiro de consentimiento, avance del reloj). */
class HookedGenerator implements SceneImageGeneratorPort {
  during: (() => Promise<void>) | null = null;
  constructor(readonly inner: FakeSceneImageGenerator) {}
  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    if (this.during !== null) await this.during();
    return this.inner.generate(request);
  }
}

async function validPng(): Promise<Uint8Array> {
  const result = await new FakeSceneImageGenerator().generate({ prompt: 'ref', references: [], signal: new AbortController().signal });
  if (!result.ok) throw new Error('el generador simulado no devolvió imagen');
  return result.image.bytes;
}

function setup(options: SceneFixtureOptions = {}, mutate: (state: ReturnType<typeof canonicalState>) => void = () => undefined) {
  const state = canonicalState();
  mutate(state);
  const h = createHarness(state);
  const fixture = sceneFixture(options);
  const storage = new ControlledStorage(() => new Date(NOW));
  const hooked = new HookedGenerator(fixture.generator);
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = {
    ...base,
    scene: { ...base.scene!, generator: hooked },
    media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  };
  return { h, fixture, storage, hooked, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
const job = (t: T, n = 0) => ({ sceneId: snap(t).sceneAttempts?.[n]?.sceneId ?? '', attemptId: snap(t).sceneAttempts?.[n]?.id ?? '' });
const sceneOf = (t: T) => snap(t).scenes?.[0];
const queue = (t: T): string[] => snap(t).mediaQueue.map((e) => `${e.reason}:${e.objectKey}`);
const signal = (): AbortSignal => new AbortController().signal;
async function requested(t: T, n = 1, action: 'UPDATE' | 'REGENERATE' = 'UPDATE') {
  await t.request.execute(ANDRES, HOUSE, { action }, key(n));
  return job(t, n - 1);
}

describe('runSceneGeneration (T856): camino feliz y T2 atómico', () => {
  it('[REQ-ESC6-013][INV-ESC6-004][SC-ESC6-020] publica en T2: imagen vigente con la huella del intento, cuota +1 en la ventana del intento, fuentes, intento SUCCEEDED, INTENT retirado y objeto guardado', async () => {
    const t = setup();
    const before = JSON.stringify({ pets: snap(t).pets, households: snap(t).households, records: snap(t).records });
    const j = await requested(t);
    expect(await t.run.execute(j, signal())).toBe('PUBLISHED');
    const scene = sceneOf(t);
    const attempt = snap(t).sceneAttempts?.[0];
    expect(scene).toMatchObject({ runState: null, currentAttemptId: null, leaseExpiresAt: null, consumedGenerations: 1, quotaWindow: '2026-11', imageDegraded: false });
    expect(scene?.image).toMatchObject({ id: attempt?.resultObjectId, mime: 'image/png', fingerprint: attempt?.fingerprint, inputsSnapshot: attempt?.inputsSnapshot });
    expect(attempt).toMatchObject({ phase: 'DONE', outcome: 'SUCCEEDED', claimedAt: NOW, providerCallStartedAt: NOW, finishedAt: NOW });
    expect(await t.storage.keys('scenes/')).toEqual([`scenes/${j.sceneId}/images/${attempt?.resultObjectId}`]);
    expect(queue(t)).toEqual([]);
    expect(snap(t).sceneImageSources?.map((s) => s.ownerUserId).sort()).toEqual([...new Set(snap(t).pets.filter((p) => snap(t).assignments.some((a) => a.petId === p.id && a.householdId === HOUSEHOLD.id)).map((p) => p.ownerUserId))].sort());
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'ready', pending: 0, quota: { remaining: 9 }, imageTag: attempt?.resultObjectId });
    expect(JSON.stringify({ pets: snap(t).pets, households: snap(t).households, records: snap(t).records })).toBe(before);
  });

  it('[INV-ESC6-010][INV-ESC6-017] el prompt abre con la base de estilo, no lleva nombres ni ids y el generador se llama una sola vez', async () => {
    const t = setup();
    await t.run.execute(await requested(t), signal());
    expect(t.fixture.generator.calls).toHaveLength(1);
    const prompt = t.fixture.generator.calls[0]?.prompt ?? '';
    expect(prompt.startsWith(STYLE_BASE_TEXT)).toBe(true);
    expect(prompt.includes(ARGOS.name)).toBe(false);
    expect(prompt.includes(ARGOS.id)).toBe(false);
    expect(prompt.includes(HOUSEHOLD.id)).toBe(false);
  });
});

describe('runSceneGeneration (T856): claim y entregas duplicadas o ajenas', () => {
  it('[EDGE-ESC6-024][SC-ESC6-059] la segunda entrega del mismo attemptId (SUCCEEDED o FAILED) es NOOP: sin generador, sin cuota y sin escrituras', async () => {
    const t = setup();
    const j = await requested(t);
    await t.run.execute(j, signal());
    const after = JSON.stringify(snap(t));
    expect(await t.run.execute(j, signal())).toBe('NOOP');
    expect(JSON.stringify(snap(t))).toBe(after);
    expect(t.fixture.generator.calls).toHaveLength(1);
  });

  it('[EDGE-ESC6-024][H-LCK-006-18] un attemptId inexistente o de otra escena es NOOP sin efecto alguno (sin oráculo)', async () => {
    const t = setup();
    const j = await requested(t);
    const before = JSON.stringify(snap(t));
    expect(await t.run.execute(ABSENT, signal())).toBe('NOOP');
    expect(await t.run.execute({ sceneId: ABSENT.sceneId, attemptId: j.attemptId }, signal())).toBe('NOOP');
    expect(JSON.stringify(snap(t))).toBe(before);
    expect(t.fixture.generator.calls).toHaveLength(0);
  });

  it('[SC-ESC6-070][EDGE-ESC6-027] el claim pasa PENDING a RUNNING con claimed_at y el arrendamiento queda en claimed_at + T_LEASE; la escritura de provider_call_started_at precede a la llamada', async () => {
    const t = setup({ mode: 'slow' });
    const j = await requested(t);
    t.h.clock.setClock('2026-11-05', at(30));
    const controller = new AbortController();
    const pending = t.run.execute(j, controller.signal);
    await vi.waitFor(() => expect(t.fixture.generator.calls).toHaveLength(1));
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ phase: 'RUNNING', claimedAt: at(30), providerCallStartedAt: at(30) });
    expect(sceneOf(t)).toMatchObject({ runState: 'generating', leaseExpiresAt: at(30 + 150) });
    controller.abort();
    expect(await pending).toBe('FAILED');
  });

  it('[SC-ESC6-069][EDGE-ESC6-003] el arrendamiento de espera en cola vencido antes del claim cierra el intento FAILED/ERR-SCENE-LEASE-EXPIRED sin llamar al generador ni descontar cuota', async () => {
    const t = setup();
    const j = await requested(t);
    t.h.clock.setClock('2026-11-05', at(601));
    expect(await t.run.execute(j, signal())).toBe('NOOP');
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ phase: 'DONE', outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED' });
    expect(sceneOf(t)).toMatchObject({ runState: 'failed', consumedGenerations: 0 });
    expect(queue(t)).toEqual([]);
    expect(await t.storage.keys('scenes/')).toEqual([]);
    expect(t.fixture.generator.calls).toHaveLength(0);
  });
});

describe('runSceneGeneration (T856): fallos sin descuento y con la imagen anterior intacta', () => {
  async function withImage(t: T): Promise<string> {
    await t.run.execute(await requested(t, 1), signal());
    const imageId = sceneOf(t)?.image?.id ?? '';
    await t.h.uow.runInTransaction(async (r) => {
      const pet = (await r.pets.findById(ARGOS.id))!;
      await r.pets.save({ ...pet, breed: 'Mestizo cambiado', breedCode: null });
    });
    t.h.clock.setClock('2026-11-05', at(120));
    return imageId;
  }

  it('[REQ-ESC6-013][SC-ESC6-017] el generador falla: la imagen anterior sigue vigente, la cuota no cambia, el estado es failed con código estable y el botón se habilita', async () => {
    const t = setup();
    const imageId = await withImage(t);
    t.fixture.generator.setMode('fail');
    expect(await t.run.execute(await requested(t, 2), signal())).toBe('FAILED');
    expect(sceneOf(t)).toMatchObject({ runState: 'failed', consumedGenerations: 1 });
    expect(sceneOf(t)?.image?.id).toBe(imageId);
    expect(snap(t).sceneAttempts?.[1]).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED' });
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED', imageTag: imageId, quota: { remaining: 9 } });
    t.h.clock.setClock('2026-11-05', at(240));
    expect((await t.get.execute(ANDRES, HOUSE)).actions.canUpdate).toBe(true);
    expect(await t.storage.keys('scenes/')).toEqual([`scenes/${sceneOf(t)?.id}/images/${imageId}`]);
  });

  it('[SC-ESC6-018][EDGE-ESC6-003] un proveedor que no responde: al abortarse la señal (T_GEN) el intento queda FAILED con ERR-SCENE-GENERATION-TIMEOUT sin descuento', async () => {
    const t = setup({ mode: 'slow' });
    const j = await requested(t);
    const controller = new AbortController();
    const pending = t.run.execute(j, controller.signal);
    await vi.waitFor(() => expect(t.fixture.generator.calls).toHaveLength(1));
    controller.abort();
    expect(await pending).toBe('FAILED');
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(sceneOf(t)).toMatchObject({ runState: 'failed', consumedGenerations: 0, image: null });
  });

  it('[SC-ESC6-062][EDGE-ESC6-004][EDGE-ESC6-029] una salida inválida (JPEG) es ERR-SCENE-INVALID-IMAGE: no se guarda objeto, no hay cuota y el INTENT pasa a borrarse', async () => {
    const t = setup({ mode: 'invalid' });
    const j = await requested(t);
    expect(await t.run.execute(j, signal())).toBe('FAILED');
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-INVALID-IMAGE' });
    expect(await t.storage.keys('scenes/')).toEqual([]);
    expect([sceneOf(t)?.consumedGenerations, sceneOf(t)?.image]).toEqual([0, null]);
    expect(queue(t)).toEqual([]);
  });

  it('[EDGE-ESC6-028] en modo incremental sin escena previa (imagen retirada tras T1) el intento falla sin cuota y sin llamar al generador: el worker no cambia de modo', async () => {
    const t = setup();
    await withImage(t);
    const j = await requested(t, 2);
    expect(snap(t).sceneAttempts?.[1]?.mode).toBe('INCREMENTAL_REPLACE');
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.retireImage(j.sceneId, NOW); });
    expect(await t.run.execute(j, signal())).toBe('FAILED');
    expect(t.fixture.generator.calls).toHaveLength(1);
    expect(sceneOf(t)).toMatchObject({ runState: 'failed', consumedGenerations: 1, image: null });
  });
});

describe('runSceneGeneration (T856): referencias, degradación y límites', () => {
  async function withAvatar(t: T, bytes: Uint8Array | null): Promise<void> {
    await t.h.uow.runInTransaction(async (r) => { await r.pets.replaceAvatar(ARGOS.id, AVATAR); });
    if (bytes !== null) await t.storage.put(`pets/${ARGOS.id}/avatar/${AVATAR}`, bytes, 'image/png');
  }

  it('[REQ-ESC6-027] la referencia de la mascota se lee, se normaliza y viaja con su ranura IMG_n; la imagen resultante no queda degradada', async () => {
    const t = setup();
    await withAvatar(t, await validPng());
    await t.run.execute(await requested(t), signal());
    expect(t.fixture.generator.calls[0]?.references.map((r) => [r.ref, r.mime])).toEqual([['IMG_1', 'image/png']]);
    expect(t.fixture.generator.calls[0]?.prompt).toContain('Use IMG_1 as the exact visual reference for this pet');
    expect(sceneOf(t)?.imageDegraded).toBe(false);
  });

  it('[SC-ESC6-032][EDGE-ESC6-009][EDGE-ESC6-028] un objeto de foto ausente: la mascota se envía sin foto, la generación termina sin error y la imagen queda degradada (nunca ready)', async () => {
    const t = setup();
    await withAvatar(t, null);
    expect(await t.run.execute(await requested(t), signal())).toBe('PUBLISHED');
    expect(t.fixture.generator.calls[0]?.references).toEqual([]);
    expect(sceneOf(t)?.imageDegraded).toBe(true);
    expect(snap(t).sceneAttempts?.[0]?.degraded).toBe(true);
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view.status).toBe('outdated');
    expect(view.stale).toBe(true);
  });

  it('[REQ-ESC6-027][SC-ESC6-083] una referencia ilegible (no PNG/JPEG/WebP válido) se trata como ausente y degrada, sin error', async () => {
    const t = setup();
    await withAvatar(t, new TextEncoder().encode('esto no es una imagen'));
    expect(await t.run.execute(await requested(t), signal())).toBe('PUBLISHED');
    expect(t.fixture.generator.calls[0]?.references).toEqual([]);
    expect(sceneOf(t)?.imageDegraded).toBe(true);
  });

  it('[EDGE-ESC6-028] si el tope agregado de referencias no admite ninguna, se omiten por prioridad, se registra degradación y el intento termina', async () => {
    const t = setup({ images: { fit: () => ({ kept: 0, degraded: true }) } });
    await withAvatar(t, await validPng());
    expect(await t.run.execute(await requested(t), signal())).toBe('PUBLISHED');
    expect(t.fixture.generator.calls[0]?.references).toEqual([]);
    expect(sceneOf(t)?.imageDegraded).toBe(true);
  });
});

describe('runSceneGeneration (T856): consentimiento, cambios y arrendamiento durante la generación', () => {
  const consent = (userId: string) => ({ id: 'c5000000-0000-4000-8000-000000000001', userId, scope: 'PET_PHOTOS' as const, providerId: 'vertex-gemini-image', noticeVersion: '1', grantedAt: NOW, revokedAt: null });

  it('[EDGE-ESC6-025][REQ-ESC6-036] con el driver real y el consentimiento retirado antes del claim: el intento queda CANCELLED, 0 llamadas y el INTENT se borra', async () => {
    const t = setup({ realDriver: true });
    await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.grant(consent(ANDRES)); });
    const j = await requested(t);
    await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.revoke(consent(ANDRES).id, NOW); });
    expect(await t.run.execute(j, signal())).toBe('CANCELLED');
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'CANCELLED' });
    expect(sceneOf(t)).toMatchObject({ runState: null, consumedGenerations: 0, image: null });
  });

  it('[EDGE-ESC6-025][SC-ESC6-053] el consentimiento se retira MIENTRAS el proveedor trabaja: T2 no publica, el intento queda CANCELLED y el objeto subido se purga', async () => {
    const t = setup({ realDriver: true });
    await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.grant(consent(ANDRES)); });
    const j = await requested(t);
    t.hooked.during = async () => { await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.revoke(consent(ANDRES).id, NOW); }); };
    expect(await t.run.execute(j, signal())).toBe('CANCELLED');
    expect(sceneOf(t)).toMatchObject({ image: null, consumedGenerations: 0 });
    expect(await t.storage.keys('scenes/')).toEqual([]);
    expect(queue(t)).toEqual([]);
  });

  it('[REQ-ESC6-014][SC-ESC6-017] los cambios durante la generación se publican con la huella del intento: la escena queda ready para lo generado y outdated por lo nuevo', async () => {
    const t = setup();
    const j = await requested(t);
    t.hooked.during = async () => {
      await t.h.uow.runInTransaction(async (r) => {
        const pet = (await r.pets.findById(ARGOS.id))!;
        await r.pets.save({ ...pet, breed: 'Otra raza', breedCode: null });
      });
    };
    expect(await t.run.execute(j, signal())).toBe('PUBLISHED');
    const view = await t.get.execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ status: 'outdated', stale: true });
    expect(view.pending).toBeGreaterThanOrEqual(1);
  });

  it('[EDGE-ESC6-021][SC-ESC6-063] el intento se cancela mientras corre (baja, retiro o hogar eliminado): T2 no publica sobre la entidad, el objeto se purga y la escena no consume cuota', async () => {
    const t = setup();
    const j = await requested(t);
    t.hooked.during = async () => { await t.h.uow.runInTransaction(async (r) => { await r.scenes.cancelInFlight(j.sceneId, NOW); }); };
    expect(await t.run.execute(j, signal())).toBe('CANCELLED');
    expect(sceneOf(t)).toMatchObject({ runState: null, image: null, consumedGenerations: 0 });
    expect(await t.storage.keys('scenes/')).toEqual([]);
  });

  it('[H-LCK-006-11][EDGE-ESC6-026] un arrendamiento vencido antes del put: no se sube el objeto, el intento queda FAILED/ERR-SCENE-LEASE-EXPIRED y no hay cuota', async () => {
    const t = setup();
    const j = await requested(t);
    t.hooked.during = async () => { t.h.clock.setClock('2026-11-05', at(400)); };
    expect(await t.run.execute(j, signal())).toBe('FAILED');
    expect(t.storage.operations.some((o) => o.startsWith('put:scenes/'))).toBe(false);
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ outcome: 'FAILED', errorCode: 'ERR-SCENE-LEASE-EXPIRED' });
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 0, image: null });
  });

  it('[EDGE-ESC6-031][SC-ESC6-074] la ventana y el máximo se toman del intento: iniciada el 30-nov y publicada el 1-dic se imputa a noviembre, aunque la configuración cambie', async () => {
    const t = setup();
    t.h.clock.setClock('2026-11-30', '2026-11-30T23:59:50.000Z');
    const j = await requested(t);
    t.hooked.during = async () => { t.h.clock.setClock('2026-12-01', '2026-12-01T00:00:25.000Z'); };
    const shrunk = new RunSceneGenerationUseCase({ ...t.deps, scene: { ...t.deps.scene!, quotaMax: 1 } });
    expect(await shrunk.execute(j, signal())).toBe('PUBLISHED');
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 1, quotaWindow: '2026-11' });
    expect((await t.get.execute(ANDRES, HOUSE)).quota).toMatchObject({ window: '2026-12', remaining: 10 });
  });

  it('[INV-ESC6-004] si la cuota del intento se agotó mientras corría, T2 no publica ni descuenta de más y la imagen anterior queda intacta', async () => {
    const t = setup();
    const j = await requested(t);
    t.hooked.during = async () => { await t.h.uow.runInTransaction(async (r) => { await r.scenes.raiseConsumed(j.sceneId, '2026-11', 10); }); };
    expect(await t.run.execute(j, signal())).toBe('FAILED');
    expect(sceneOf(t)).toMatchObject({ consumedGenerations: 10, image: null });
    expect(await t.storage.keys('scenes/')).toEqual([]);
  });
});
