import { describe, expect, it } from 'vitest';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { GrantSceneConsentUseCase, RevokeSceneConsentUseCase } from '../../src/application/use-cases/scene-consent-use-cases.ts';
import { DeleteHouseholdPhotoUseCase, PutHouseholdPhotoUseCase } from '../../src/application/use-cases/scene-photo-use-cases.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../src/application/ports/scene-image-generator.port.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T859 (006, Fase 5): registros y auditoría de la escena. Una fila de `audit_log` por operación y en la MISMA transacción, con `entity_type` de `N2-06` (a)
 * (`HOME_SCENE`, `SCENE_CONSENT`, `HOUSEHOLD_PHOTO`), evento y datos opacos solo en el hash del estado, `actorId` y `householdId` seudonimizados por HMAC, y nada de
 * prompt, bytes, nombres, URL firmadas, `X-Goog-*`, claves de objeto, cuerpos de error del proveedor ni clave de idempotencia. REQ-ESC6-021; INV-ESC6-016;
 * SC-ESC6-027, SC-ESC6-033, SC-ESC6-046, SC-ESC6-094.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const KEY = 'b0000000-0000-4000-8000-000000000001';
const SECRET_ERROR = 'https://aiplatform.googleapis.com/v1/projects/x:generateContent?X-Goog-Signature=SECRETO&key=AIzaSECRETO prompt=Create a single cohesive';
const BOTH = { noticeVersion: '1', providerId: 'vertex-gemini-image', scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] };

class ThrowingGenerator implements SceneImageGeneratorPort {
  async generate(_request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    throw Object.assign(new Error(SECRET_ERROR), { cause: new Error(SECRET_ERROR), code: 'ECONNRESET' });
  }
}

function setup(generator?: SceneImageGeneratorPort) {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({ realDriver: false });
  const storage = new ControlledStorage(() => new Date(NOW));
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = { ...base, scene: { ...base.scene!, generator: generator ?? fixture.generator }, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  return { h, fixture, storage, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const audit = (t: T) => t.h.uow.snapshot().auditLog.filter((e) => ['HOME_SCENE', 'SCENE_CONSENT', 'HOUSEHOLD_PHOTO'].includes(e.entityType));
const hmac = (t: T, value: string): string => t.deps.auditPseudonym.hmacUserId(value, t.deps.auditHmacSecret);
async function png(): Promise<Uint8Array> {
  const r = await new FakeSceneImageGenerator().generate({ prompt: 'x', references: [], seed: 0, signal: new AbortController().signal });
  if (!r.ok) throw new Error('sin imagen');
  return r.image.bytes;
}

describe('auditoría de la escena (T859)', () => {
  it('[REQ-ESC6-021][SC-ESC6-027] SCENE_REQUESTED y SCENE_PUBLISHED: filas HOME_SCENE/UPDATE del actor, con el id de la escena y el evento, el hogar y el modo solo en el hash (HMAC), sin PII', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal);
    const rows = audit(t);
    expect(rows.map((e) => [e.entityType, e.mutationType, e.entityId, e.executorUserId, e.previousStateHash === null ? 'prev-null' : 'prev'])).toEqual([
      ['HOME_SCENE', 'UPDATE', attempt.sceneId, ANDRES, 'prev'],
      ['HOME_SCENE', 'UPDATE', attempt.sceneId, ANDRES, 'prev'],
    ]);
    const pets = JSON.parse(attempt.inputsSnapshot).pets.length as number;
    const householdRef = hmac(t, HOUSEHOLD.id);
    expect(rows[0]?.newStateHash).toBe(stateHash({ event: 'SCENE_REQUESTED', householdRef, mode: attempt.mode, pets, result: 'ACCEPTED' }));
    expect(rows[1]?.newStateHash).toBe(stateHash({ event: 'SCENE_PUBLISHED', householdRef, mode: attempt.mode, pets, result: 'OK' }));
  });

  it('[REQ-ESC6-021][SC-ESC6-046] SCENE_FAILED lleva el código estable del intento y nada del proveedor', async () => {
    const t = setup();
    t.fixture.generator.setMode('fail');
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal);
    const last = audit(t).at(-1);
    expect(last).toMatchObject({ entityType: 'HOME_SCENE', mutationType: 'UPDATE', entityId: attempt.sceneId, executorUserId: ANDRES });
    expect(last?.newStateHash).toBe(stateHash({ event: 'SCENE_FAILED', householdRef: hmac(t, HOUSEHOLD.id), mode: attempt.mode, pets: JSON.parse(attempt.inputsSnapshot).pets.length, result: 'ERR-SCENE-GENERATION-FAILED' }));
  });

  it('[REQ-ESC6-021][H-TRI-006-08] consentir y retirar: filas SCENE_CONSENT con el actor opaco (HMAC) como entityId, nunca el userId en claro; repetir no añade filas', async () => {
    const t = setup();
    const grant = new GrantSceneConsentUseCase(t.deps);
    const revoke = new RevokeSceneConsentUseCase(t.deps);
    await grant.execute(ANDRES, BOTH);
    await grant.execute(ANDRES, BOTH);
    await revoke.execute(ANDRES);
    await revoke.execute(ANDRES);
    expect(audit(t).map((e) => [e.entityType, e.mutationType, e.entityId, e.executorUserId])).toEqual([
      ['SCENE_CONSENT', 'CREATE', hmac(t, ANDRES), ANDRES],
      ['SCENE_CONSENT', 'UPDATE', hmac(t, ANDRES), ANDRES],
    ]);
    expect(audit(t)[0]?.newStateHash).toBe(stateHash({ event: 'SCENE_CONSENT_GRANTED', actorRef: hmac(t, ANDRES), scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'], noticeVersion: '1', providerId: 'vertex-gemini-image' }));
    expect(audit(t)[1]?.newStateHash).toBe(stateHash({ event: 'SCENE_CONSENT_REVOKED', actorRef: hmac(t, ANDRES), scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'], noticeVersion: '1', providerId: 'vertex-gemini-image' }));
  });

  it('[REQ-ESC6-021] HOUSEHOLD_PHOTO_CHANGED: CREATE al subir, UPDATE al reemplazar y DELETE al borrar (idempotente: sin fila si no había foto), con el hogar como HMAC', async () => {
    const t = setup();
    const put = new PutHouseholdPhotoUseCase(t.deps);
    await put.execute(ANDRES, HOUSEHOLD.id, await png());
    await put.execute(ANDRES, HOUSEHOLD.id, await png());
    const del = new DeleteHouseholdPhotoUseCase(t.deps);
    await del.execute(ANDRES, HOUSEHOLD.id);
    await del.execute(ANDRES, HOUSEHOLD.id);
    expect(audit(t).map((e) => [e.entityType, e.mutationType, e.entityId, e.executorUserId])).toEqual([
      ['HOUSEHOLD_PHOTO', 'CREATE', hmac(t, HOUSEHOLD.id), ANDRES],
      ['HOUSEHOLD_PHOTO', 'UPDATE', hmac(t, HOUSEHOLD.id), ANDRES],
      ['HOUSEHOLD_PHOTO', 'DELETE', hmac(t, HOUSEHOLD.id), ANDRES],
    ]);
    expect(audit(t)[0]?.previousStateHash).toBeNull();
    expect(audit(t)[2]?.newStateHash).toBeNull();
  });

  it('[H-KEY-F5-5][REQ-ESC6-021] el POST que materializa el vencimiento de un intento vencido audita SCENE_FAILED/ERR-SCENE-LEASE-EXPIRED (una vez) antes del SCENE_REQUESTED del nuevo intento', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const first = t.h.uow.snapshot().sceneAttempts![0]!;
    t.h.clock.setClock('2026-11-05', '2026-11-05T12:10:01.000Z');
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000003');
    const rows = audit(t);
    expect(rows.map((e) => e.executorUserId)).toEqual([ANDRES, ANDRES, ANDRES]);
    const householdRef = hmac(t, HOUSEHOLD.id);
    const pets = JSON.parse(first.inputsSnapshot).pets.length as number;
    expect(rows[1]?.newStateHash).toBe(stateHash({ event: 'SCENE_FAILED', householdRef, mode: first.mode, pets, result: 'ERR-SCENE-LEASE-EXPIRED' }));
    expect(rows[2]?.newStateHash).toBe(stateHash({ event: 'SCENE_REQUESTED', householdRef, mode: first.mode, pets, result: 'ACCEPTED' }));
  });

  it('[INV-ESC6-016][SC-ESC6-033] una operación rechazada (429, 403, validación) no deja fila de auditoría', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const before = audit(t).length;
    await expect(t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, 'b0000000-0000-4000-8000-000000000002')).resolves.toMatchObject({ accepted: false });
    await expect(t.request.execute(ANDRES, HOUSE, { action: 'DELETE' }, KEY)).rejects.toMatchObject({ code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    expect(audit(t).length).toBe(before);
  });
});

describe('registros sin secretos (T859)', () => {
  it('[SC-ESC6-094][INV-ESC6-016] una excepción de red del generador se captura y se descarta: ni el mensaje, ni la causa, ni la URL con X-Goog-* o clave quedan en el estado persistido, en la auditoría ni en las vistas', async () => {
    const t = setup(new ThrowingGenerator());
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    expect(await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal)).toBe('FAILED');
    const view = await t.get.execute(ANDRES, HOUSE);
    const everything = JSON.stringify({ state: t.h.uow.snapshot(), view });
    for (const leaked of ['SECRETO', 'X-Goog', 'AIza', 'googleapis', 'Create a single cohesive', 'ECONNRESET']) expect(everything.includes(leaked)).toBe(false);
    expect(view).toMatchObject({ status: 'failed', lastError: 'ERR-SCENE-GENERATION-FAILED' });
  });

  it('[SC-ESC6-046][SC-ESC6-027] el estado persistido de la escena no contiene la clave de idempotencia, el prompt, bytes de imagen, nombres de mascota ni URL firmadas', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal);
    await t.get.execute(ANDRES, HOUSE);
    const persisted = JSON.stringify({ scenes: t.h.uow.snapshot().scenes, attempts: t.h.uow.snapshot().sceneAttempts, audit: audit(t), queue: t.h.uow.snapshot().mediaQueue, sources: t.h.uow.snapshot().sceneImageSources });
    for (const leaked of [KEY, ARGOS.name, 'Create a single cohesive', 'X-Goog', 'https://', 'storage.googleapis.com']) expect(persisted.includes(leaked)).toBe(false);
  });
});
