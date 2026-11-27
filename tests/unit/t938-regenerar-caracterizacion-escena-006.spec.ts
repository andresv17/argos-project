import { describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { PutHouseholdPhotoUseCase } from '../../src/application/use-cases/scene-photo-use-cases.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../src/generated/v34/index.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUNA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T938 (006, Fase 13; D6-21; pruebas de CARACTERIZACIÓN del servidor, sin cambio de `src/`): el botón único de la interfaz siempre envía `POST generate` con
 * `action = REGENERATE`. Se comprueba, con el generador simulado y la harness de aplicación, que desde `ready` sin cambios, `failed` con escena previa, sin imagen con
 * foto del hogar y foto de mascota, y `outdated` con imagen y mascotas `KEEP`, el servidor produce `mode = REGENERATE`, sin escena previa, con todas las mascotas
 * `RENDER`, con las referencias de la foto del hogar y de todas las fotos vigentes, sin leer la imagen previa, con 1 unidad de cuota solo al publicar y sin transición nueva;
 * el enfriamiento responde 429 con Retry-After, la misma clave devuelve el estado vigente, `UPDATE` directo sobre `ready` sin cambios no invoca al generador y los
 * modos incrementales siguen existiendo con `UPDATE` (t839 intacta). 0 llamadas de red. Si alguna sale roja es Caso B y vuelve a `/architect`.
 * REQ-ESC6-007, REQ-ESC6-034; INV-ESC6-004; STATE-SCENE-001; SC-ESC6-014, SC-ESC6-134.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AVATAR = 'e1000000-0000-4000-8000-000000000001';
const LUNA_AVATAR = 'e1000000-0000-4000-8000-000000000002';

async function png(): Promise<Uint8Array> {
  const r = await new FakeSceneImageGenerator().generate({ prompt: 'ref', references: [], seed: 0, signal: new AbortController().signal });
  if (!r.ok) throw new Error('el generador simulado no devolvió imagen');
  return r.image.bytes;
}

function setup(options: SceneFixtureOptions = {}) {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture(options);
  const storage = new ControlledStorage(() => new Date(NOW));
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = { ...base, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  return { h, fixture, storage, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps), putHousehold: new PutHouseholdPhotoUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
const sceneOf = (t: T) => snap(t).scenes?.[0];
const attempts = (t: T) => snap(t).sceneAttempts ?? [];
const signal = (): AbortSignal => new AbortController().signal;
const tick = (t: T, seconds: number): void => t.h.clock.setClock('2026-11-05', at(seconds));
const lastJob = (t: T) => ({ sceneId: attempts(t).at(-1)?.sceneId ?? '', attemptId: attempts(t).at(-1)?.id ?? '' });
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV34) return error.code;
    throw error;
  }
};
const retryAfter = async (promise: Promise<unknown>): Promise<number> => {
  try {
    await promise;
  } catch (error) {
    return (error as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
  }
  throw new Error('se esperaba un rechazo');
};
/** Ranuras `IMG_n` citadas por las líneas de foto del prompt (`Translate this pet from IMG_n into …` en desde-cero; `Use IMG_n as the exact visual reference …` en incrementales); el JSON 16-bit ya no lleva `photoRef`. */
const photoRefsOf = (prompt: string): string[] => [...prompt.matchAll(/(?:Use|Translate this pet from) (IMG_\d+) (?:as the exact visual reference for this |into the 16-bit isometric pixel art illustration)/g)].map((m) => m[1] ?? '');

async function giveAvatar(t: T, petId: string, objectId: string): Promise<void> {
  await t.h.uow.runInTransaction(async (r) => { await r.pets.replaceAvatar(petId, objectId); });
  await t.storage.put(`pets/${petId}/avatar/${objectId}`, await png(), 'image/png');
}
/** Publica una primera imagen con `UPDATE` (clave 1) y avanza 120 s. */
async function published(t: T): Promise<string> {
  await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
  expect(await t.run.execute(lastJob(t), signal())).toBe('PUBLISHED');
  tick(t, 120);
  return sceneOf(t)?.image?.id ?? '';
}
const changePet = async (t: T): Promise<void> => {
  await t.h.uow.runInTransaction(async (r) => {
    const pet = (await r.pets.findById(ARGOS.id))!;
    await r.pets.save({ ...pet, sex: pet.sex === 'MALE' ? 'FEMALE' : 'MALE' });
  });
};

/** Verifica el contrato común de una generación limpia ya solicitada con `REGENERATE` y ejecutada por el worker. */
async function expectCleanRun(t: T, previousImageId: string | null, expectedRefs: readonly string[]): Promise<void> {
  const operationsBefore = t.storage.operations.length;
  const consumedBefore = sceneOf(t)?.consumedGenerations ?? 0;
  const result = await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(9));
  expect(result.accepted).toBe(true);
  const attempt = attempts(t).at(-1);
  expect(attempt).toMatchObject({ action: 'REGENERATE', mode: 'REGENERATE' });
  expect(sceneOf(t)?.consumedGenerations).toBe(consumedBefore); // la cuota no se descuenta al pedir
  const callsBefore = t.fixture.generator.calls.length;
  expect(await t.run.execute(lastJob(t), signal())).toBe('PUBLISHED');
  expect(sceneOf(t)?.consumedGenerations).toBe(consumedBefore + 1); // 1 unidad solo al publicar
  expect(t.fixture.generator.calls).toHaveLength(callsBefore + 1);
  const call = t.fixture.generator.calls.at(-1);
  const callPrompt = t.fixture.generator.prompts.at(-1) ?? '';
  expect(call?.references.map((r) => r.ref)).toEqual(expectedRefs);
  const prompt = callPrompt;
  expect(prompt).not.toContain('as the exact base scene');
  // Todas RENDER (desde cero): ninguna línea de cambio incremental ni de retirada y el conteo exacto cubre todas las visibles.
  for (const marker of ['Apply only these changes', '- Add: ', '- Replace only: ', '- Remove only: ']) expect(prompt.includes(marker)).toBe(false);
  expect(prompt.includes('Exact animal count: ')).toBe(true);
  const reads = t.storage.operations.slice(operationsBefore).filter((op) => op.startsWith('get:scenes/'));
  expect(reads).toEqual([]); // la imagen previa no se lee ni se envía
  if (previousImageId !== null) expect(sceneOf(t)?.image?.id).not.toBe(previousImageId);
}

describe('T938 REGENERATE desde cero en cuatro estados (SC-ESC6-134)', () => {
  it('[SC-ESC6-134] (a) desde ready sin cambios: modo REGENERATE, sin escena previa, todas RENDER, cuota +1 solo al publicar', async () => {
    const t = setup();
    const previous = await published(t);
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'ready', pending: 0, actions: { canUpdate: false, canRegenerate: true } });
    await expectCleanRun(t, previous, []);
    expect(sceneOf(t)?.consumedGenerations).toBe(2);
  });

  it('[SC-ESC6-134] (b) desde failed con escena previa: REGENERATE genera desde cero y deja la escena lista', async () => {
    const t = setup();
    const previous = await published(t);
    await changePet(t);
    t.fixture.generator.setMode('fail');
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(2));
    expect(await t.run.execute(lastJob(t), signal())).toBe('FAILED');
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'failed', imageTag: previous });
    t.fixture.generator.setMode('ok');
    tick(t, 300);
    await expectCleanRun(t, previous, []);
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'ready', pending: 0 });
  });

  it('[SC-ESC6-134] (c) sin imagen, con 1 mascota con foto y foto del hogar con consentimiento: las referencias son la foto del hogar y la foto de la mascota', async () => {
    const t = setup();
    await t.putHousehold.execute(ANDRES, HOUSEHOLD.id, await png());
    await giveAvatar(t, ARGOS.id, AVATAR);
    expect(sceneOf(t)?.image ?? null).toBeNull();
    await expectCleanRun(t, null, ['IMG_1', 'IMG_2']);
    const prompt = t.fixture.generator.prompts.at(-1) ?? '';
    expect(photoRefsOf(prompt)).toEqual(['IMG_2']);
  });

  it('[SC-ESC6-134] (d) outdated con imagen y mascotas KEEP: REGENERATE las trata a todas como RENDER y envía todas las fotos vigentes sin la imagen previa', async () => {
    const t = setup();
    await giveAvatar(t, ARGOS.id, AVATAR);
    const previous = await published(t);
    await giveAvatar(t, LUNA.id, LUNA_AVATAR);
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ status: 'outdated', stale: true });
    await expectCleanRun(t, previous, ['IMG_1', 'IMG_2']);
    expect(photoRefsOf(t.fixture.generator.prompts.at(-1) ?? '')).toEqual(['IMG_1', 'IMG_2']);
  });

  it('[SC-ESC6-134][STATE-SCENE-001] el intento sigue el ciclo PENDING → DONE: ninguna fase ni resultado nuevos y la escena vuelve a runState null', async () => {
    const t = setup();
    await published(t);
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(9));
    expect(sceneOf(t)).toMatchObject({ runState: 'generating' });
    expect(attempts(t).at(-1)?.phase).toBe('PENDING');
    await t.run.execute(lastJob(t), signal());
    expect(attempts(t).at(-1)).toMatchObject({ phase: 'DONE', outcome: 'SUCCEEDED' });
    expect(sceneOf(t)).toMatchObject({ runState: null, currentAttemptId: null });
    expect([...new Set(attempts(t).map((a) => a.phase))].sort()).toEqual(['DONE']);
  });
});

describe('T938 enfriamiento, idempotencia y UPDATE directo (SC-ESC6-134, SC-ESC6-014)', () => {
  it('[SC-ESC6-134][REQ-ESC6-034] un segundo REGENERATE dentro de los 60 s responde ERR-RATE-LIMITED con Retry-After y 0 tareas nuevas', async () => {
    const t = setup();
    await published(t);
    tick(t, 120);
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(2));
    await t.run.execute(lastJob(t), signal());
    const jobs = t.fixture.dispatcher.jobs.length;
    tick(t, 140);
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(3)))).toBe('ERR-RATE-LIMITED');
    expect(await retryAfter(t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(3)))).toBe(40);
    expect(t.fixture.dispatcher.jobs).toHaveLength(jobs);
  });

  it('[SC-ESC6-134][EDGE-ESC6-016] la misma Idempotency-Key repetida devuelve 200 con el estado vigente, sin segundo intento ni segunda tarea', async () => {
    const t = setup();
    await published(t);
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(2));
    const again = await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(2));
    expect(again).toMatchObject({ accepted: false, view: { status: 'generating' } });
    expect([attempts(t).length, t.fixture.dispatcher.jobs.length]).toEqual([2, 2]);
  });

  it('[SC-ESC6-014][SC-ESC6-134] UPDATE directo sobre ready sin cambios no invoca al generador, no crea intento ni tarea', async () => {
    const t = setup();
    await published(t);
    const calls = t.fixture.generator.calls.length;
    const result = await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(2));
    expect(result.accepted).toBe(false);
    expect([t.fixture.generator.calls.length, attempts(t).length, t.fixture.dispatcher.jobs.length]).toEqual([calls, 1, 1]);
  });

  it('[SC-ESC6-134] UPDATE directo con cambios sigue produciendo un modo incremental (decide-mode intacto en el servidor)', async () => {
    const t = setup();
    await giveAvatar(t, ARGOS.id, AVATAR);
    await published(t);
    await giveAvatar(t, LUNA.id, LUNA_AVATAR);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(2));
    expect(attempts(t).at(-1)?.mode).toBe('INCREMENTAL_REPLACE');
    expect(await t.run.execute(lastJob(t), signal())).toBe('PUBLISHED');
    expect(t.fixture.generator.prompts.at(-1)).toContain('as the exact base scene');
  });
});
