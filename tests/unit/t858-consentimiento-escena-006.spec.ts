import { describe, expect, it } from 'vitest';
import { GetSceneNoticeUseCase, GrantSceneConsentUseCase, RevokeSceneConsentUseCase } from '../../src/application/use-cases/scene-consent-use-cases.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { PutHouseholdPhotoUseCase } from '../../src/application/use-cases/scene-photo-use-cases.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, loadLiveInputs, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DomainError } from '../../src/generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../src/generated/v34/index.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUCIA, LUNA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';

/**
 * T858 (006, Fase 5): consentimiento (`grant/revokeSceneConsent`). Registro por usuario, ámbito, versión del aviso y proveedor; `409 ERR-SCENE-NOTICE-OUTDATED`;
 * consentimiento por propietario de los datos; retiro con purga inmediata, cancelación de intentos en vuelo e idempotencia; hogar compartido (D6-16, D6-17);
 * sin consentimiento no hay llamada. REQ-ESC6-023, REQ-ESC6-024, REQ-ESC6-025, REQ-ESC6-030; INV-ESC6-014; EDGE-ESC6-018, EDGE-ESC6-019, EDGE-ESC6-020;
 * ERR-SCENE-CONSENT-REQUIRED, ERR-SCENE-NOTICE-OUTDATED; SC-ESC6-035..039, SC-ESC6-047, SC-ESC6-096.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const IMG = 'c2000000-0000-4000-8000-000000000001';
const SCENE = 'c1000000-0000-4000-8000-000000000001';
const BOTH = { noticeVersion: '1', providerId: 'vertex-gemini-image', scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] };
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV34) return error.code;
    throw error;
  }
};

function setup(options: SceneFixtureOptions = {}) {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({ realDriver: true, ...options });
  const storage = new ControlledStorage(() => new Date(NOW));
  const deps: ApplicationDeps = { ...withScene(h.deps, fixture), media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  return { h, fixture, storage, deps, grant: new GrantSceneConsentUseCase(deps), revoke: new RevokeSceneConsentUseCase(deps), get: new GetSceneUseCase(deps), request: new RequestSceneGenerationUseCase(deps), notice: new GetSceneNoticeUseCase(deps) };
}
type T = ReturnType<typeof setup>;
const snap = (t: T) => t.h.uow.snapshot();
async function pngBytes(): Promise<Uint8Array> {
  const r = await new FakeSceneImageGenerator().generate({ prompt: 'x', references: [], signal: new AbortController().signal });
  if (!r.ok) throw new Error('sin imagen');
  return r.image.bytes;
}
async function withImage(t: T, sources: string[] = [ANDRES]): Promise<void> {
  await t.h.uow.runInTransaction(async (r) => {
    const live = await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' });
    await r.scenes.insert({ id: SCENE, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 2, quotaWindow: '2026-11', createdAt: NOW, updatedAt: NOW });
    await r.scenes.publishImage({ sceneId: SCENE, attemptId: 'c4000000-0000-4000-8000-000000000009', image: { id: IMG, mime: 'image/png', sizeBytes: 9, fingerprint: live.fingerprint, inputsSnapshot: JSON.stringify(live.snapshot), createdAt: NOW }, degraded: false, consumedGenerations: 2, quotaWindow: '2026-11', ownerUserIds: sources, now: NOW });
  });
  await t.storage.put(`scenes/${SCENE}/images/${IMG}`, new Uint8Array([1, 2, 3]), 'image/png');
}

describe('grantSceneConsent (T858)', () => {
  it('[SC-ESC6-035][REQ-ESC6-023] registra un consentimiento por ámbito con usuario, fecha UTC del reloj, versión del aviso y proveedor, y devuelve el estado de consentimiento', async () => {
    const t = setup();
    const state = await t.grant.execute(ANDRES, BOTH);
    expect(state).toEqual({ required: false, noticeVersion: '1', providerId: 'vertex-gemini-image', householdPhotoGranted: true, petPhotosGranted: true });
    const rows = snap(t).sceneConsents ?? [];
    expect(rows.map((c) => [c.userId, c.scope, c.providerId, c.noticeVersion, c.grantedAt, c.revokedAt]).sort()).toEqual([
      [ANDRES, 'HOUSEHOLD_PHOTO', 'vertex-gemini-image', '1', NOW, null],
      [ANDRES, 'PET_PHOTOS', 'vertex-gemini-image', '1', NOW, null],
    ]);
  });

  it('[REQ-ESC6-023] repetir el consentimiento es idempotente: no duplica filas ni cambia la fecha', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    t.h.clock.setClock('2026-11-06', '2026-11-06T09:00:00.000Z');
    await t.grant.execute(ANDRES, { ...BOTH, scopes: ['PET_PHOTOS'] });
    expect(snap(t).sceneConsents).toHaveLength(2);
    expect(snap(t).sceneConsents?.every((c) => c.grantedAt === NOW)).toBe(true);
  });

  it('[SC-ESC6-036][EDGE-ESC6-018] una versión de aviso o un proveedor que no son los vigentes dan 409 ERR-SCENE-NOTICE-OUTDATED y no escriben nada; si la versión vigente cambia, el consentimiento previo deja de valer y la escena vigente se conserva', async () => {
    const t = setup();
    expect(await codeOf(t.grant.execute(ANDRES, { ...BOTH, noticeVersion: '0' }))).toBe('ERR-SCENE-NOTICE-OUTDATED');
    expect(await codeOf(t.grant.execute(ANDRES, { ...BOTH, providerId: 'otro' }))).toBe('ERR-SCENE-NOTICE-OUTDATED');
    expect(snap(t).sceneConsents ?? []).toEqual([]);
    await t.grant.execute(ANDRES, BOTH);
    await withImage(t);
    const v2 = { ...t.deps, scene: { ...t.deps.scene!, noticeVersion: '2' } };
    const view = await new GetSceneUseCase(v2).execute(ANDRES, HOUSE);
    expect(view).toMatchObject({ imageTag: IMG, consent: { required: true, noticeVersion: '2', petPhotosGranted: false } });
    expect(await codeOf(new RequestSceneGenerationUseCase(v2).execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(1)))).toBe('ERR-SCENE-CONSENT-REQUIRED');
    expect(snap(t).scenes?.[0]?.image?.id).toBe(IMG);
  });

  it('[REQ-ESC6-023] un cuerpo mal formado (sin ámbitos, ámbito desconocido, campos extra, duplicados) es ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const t = setup();
    for (const bad of [{ ...BOTH, scopes: [] }, { ...BOTH, scopes: ['OTRO'] }, { ...BOTH, extra: 1 }, { ...BOTH, scopes: ['PET_PHOTOS', 'PET_PHOTOS'] }, { noticeVersion: '1' }, null, 'x']) {
      expect(await codeOf(t.grant.execute(ANDRES, bad))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
    expect(snap(t).sceneConsents ?? []).toEqual([]);
  });

  it('[REQ-ESC6-026] el aviso vigente expone solo la versión, el proveedor y los ámbitos', () => {
    expect(setup().notice.execute()).toEqual({ noticeVersion: '1', providerId: 'vertex-gemini-image', scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
  });
});

describe('consentimiento por propietario de los datos (T858)', () => {
  it('[SC-ESC6-037][EDGE-ESC6-019] la mascota de un propietario sin consentimiento va sin foto y la del que consintió con foto; consentir o retirar cambia la huella', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => { await r.pets.replaceAvatar(ARGOS.id, 'e1000000-0000-4000-8000-000000000001'); await r.pets.replaceAvatar(LUNA.id, 'e1000000-0000-4000-8000-000000000002'); });
    await t.grant.execute(ANDRES, BOTH);
    const photos = async () => t.h.uow.runInTransaction(async (r) => (await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' })));
    const before = await photos();
    expect(before.snapshot.pets.map((p) => [p.id === ARGOS.id ? 'A' : p.id === LUNA.id ? 'B' : '?', p.photo !== null])).toEqual(expect.arrayContaining([['A', true], ['B', false]]));
    await t.grant.execute(MARIA, BOTH);
    const after = await photos();
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.snapshot.pets.find((p) => p.id === LUNA.id)?.photo).toBe('e1000000-0000-4000-8000-000000000002');
  });

  it('[SC-ESC6-038][REQ-ESC6-024] la foto del hogar solo cuenta si quien la subió tiene consentimiento vigente de ese ámbito; sin él el hogar va genérico', async () => {
    const t = setup();
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: 'f1000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 9, uploadedByUserId: ANDRES, createdAt: NOW }); });
    const household = async () => t.h.uow.runInTransaction(async (r) => (await loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' })).snapshot.household);
    expect(await household()).toBeNull();
    await t.grant.execute(ANDRES, { ...BOTH, scopes: ['PET_PHOTOS'] });
    expect(await household()).toBeNull();
    await t.grant.execute(ANDRES, { ...BOTH, scopes: ['HOUSEHOLD_PHOTO'] });
    expect(await household()).toBe('f1000000-0000-4000-8000-000000000001');
  });

  it('[SC-ESC6-035][INV-ESC6-014] sin consentimiento vigente el POST rechaza con ERR-SCENE-CONSENT-REQUIRED y el generador recibe 0 llamadas; tras consentir procede', async () => {
    const t = setup();
    expect(await codeOf(t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1)))).toBe('ERR-SCENE-CONSENT-REQUIRED');
    expect(t.fixture.generator.calls).toHaveLength(0);
    await t.grant.execute(ANDRES, BOTH);
    expect((await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1))).accepted).toBe(true);
  });
});

describe('revokeSceneConsent (T858)', () => {
  it('[SC-ESC6-039][REQ-ESC6-025] fija revokedAt, retira y purga la imagen derivada de sus datos, la foto del hogar que subió, deshabilita el botón para él y es idempotente', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    await withImage(t, [ANDRES]);
    await t.h.uow.runInTransaction(async (r) => { await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: 'f1000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 9, uploadedByUserId: ANDRES, createdAt: NOW }); });
    await t.storage.put(`households/${HOUSEHOLD.id}/photo/f1000000-0000-4000-8000-000000000001`, await pngBytes(), 'image/png');
    const state = await t.revoke.execute(ANDRES);
    expect(state).toMatchObject({ required: true, householdPhotoGranted: false, petPhotosGranted: false });
    expect(snap(t).sceneConsents?.every((c) => c.revokedAt === NOW)).toBe(true);
    expect(snap(t).scenes?.[0]).toMatchObject({ image: null, consumedGenerations: 2 });
    expect(snap(t).sceneImageSources ?? []).toEqual([]);
    expect(snap(t).householdPhotos ?? []).toEqual([]);
    expect([await t.storage.keys('scenes/'), await t.storage.keys('households/'), snap(t).mediaQueue]).toEqual([[], [], []]);
    expect((await t.get.execute(ANDRES, HOUSE)).actions).toMatchObject({ canUpdate: false, blockedReason: 'CONSENT_REQUIRED' });
    const again = JSON.stringify(snap(t));
    expect(await codeOf(t.revoke.execute(ANDRES))).toBe('OK');
    expect(JSON.stringify(snap(t))).toBe(again);
    expect(snap(t).pets.length).toBeGreaterThan(0);
  });

  it('[EDGE-ESC6-025][REQ-ESC6-025] cancela los intentos en vuelo que contienen sus datos: CANCELLED, escena sin run_state y el INTENT pasa a DELETE', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    const attempt = snap(t).sceneAttempts?.[0];
    await t.revoke.execute(ANDRES);
    expect(snap(t).sceneAttempts?.[0]).toMatchObject({ phase: 'DONE', outcome: 'CANCELLED' });
    expect(snap(t).scenes?.[0]).toMatchObject({ runState: null, currentAttemptId: null });
    // BRECHA-SMITH-02: el objeto del intento aun no existe (el put del worker puede llegar despues), asi que la fila DELETE se conserva (REQ-ESC6-029, INV-GCS-002).
    expect(snap(t).mediaQueue.map((e) => `${e.reason}:${e.objectKey}`)).toEqual([`DELETE:scenes/${attempt?.sceneId}/images/${attempt?.resultObjectId}`]);
    expect(await t.storage.keys('scenes/')).toEqual([]);
    expect(attempt?.phase).toBe('PENDING');
  });

  it('[H-KEY-F5-6][SC-ESC6-039] dueño sin foto enviada retira, la imagen se conserva: sus referencias propias se purgan y su intento en vuelo se cancela, pero la imagen sigue porque su foto no viajó', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    await t.grant.execute(MARIA, BOTH);
    const avatar = 'e1000000-0000-4000-8000-000000000001';
    await t.h.uow.runInTransaction(async (r) => { await r.pets.replaceAvatar(ARGOS.id, avatar); });
    await t.storage.put(`pets/${ARGOS.id}/avatar/${avatar}`, await pngBytes(), 'image/png');
    const run = new RunSceneGenerationUseCase(t.deps);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    const first = snap(t).sceneAttempts![0]!;
    expect(await run.execute({ sceneId: first.sceneId, attemptId: first.id }, new AbortController().signal)).toBe('PUBLISHED');
    expect((snap(t).sceneImageSources ?? []).map((x) => x.ownerUserId)).toEqual([ANDRES]);
    const imageId = snap(t).scenes?.[0]?.image?.id;
    // Un intento en vuelo cuyo snapshot incluye la mascota de MARIA (sin foto enviada).
    await t.h.uow.runInTransaction(async (r) => { const pet = (await r.pets.findById(ARGOS.id))!; await r.pets.save({ ...pet, breed: 'Cambio', breedCode: null }); });
    t.h.clock.setClock('2026-11-05', '2026-11-05T12:05:00.000Z');
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(2));
    await t.revoke.execute(MARIA);
    expect(snap(t).scenes?.[0]?.image?.id).toBe(imageId);
    expect((snap(t).sceneImageSources ?? []).map((x) => x.ownerUserId)).toEqual([ANDRES]);
    expect(snap(t).sceneAttempts?.[1]).toMatchObject({ outcome: 'CANCELLED' });
    expect((await t.get.execute(ANDRES, HOUSE)).imageTag).toBe(imageId);
    await t.revoke.execute(ANDRES);
    expect(snap(t).scenes?.[0]?.image).toBeNull();
  });

  it('[D6-17][REQ-ESC6-030] el retiro de un usuario sin relación con la imagen ni con la escena no la toca', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    await t.grant.execute(LUCIA, BOTH);
    await withImage(t, [ANDRES]);
    await t.revoke.execute(LUCIA);
    expect(snap(t).scenes?.[0]?.image?.id).toBe(IMG);
    expect((await t.get.execute(ANDRES, HOUSE)).consent.required).toBe(false);
  });

  it('[REQ-ESC6-025] retirar el consentimiento no penaliza el resto: el usuario sigue leyendo la escena y la fuente que aportó otro usuario conserva su imagen hasta que ese usuario retire', async () => {
    const t = setup();
    await t.grant.execute(ANDRES, BOTH);
    await t.grant.execute(MARIA, BOTH);
    await withImage(t, [MARIA]);
    await t.revoke.execute(ANDRES);
    expect(snap(t).scenes?.[0]?.image?.id).toBe(IMG);
    expect((await t.get.execute(ANDRES, HOUSE)).status).toBe('ready');
    await t.revoke.execute(MARIA);
    expect(snap(t).scenes?.[0]?.image).toBeNull();
  });
});

describe('subida de la foto del hogar y consentimiento (T858)', () => {
  it('[REQ-ESC6-024] la foto subida por un usuario con consentimiento viaja en la huella; el retiro la quita y la escena queda outdated', async () => {
    const t = setup();
    const put = new PutHouseholdPhotoUseCase(t.deps);
    await t.grant.execute(ANDRES, BOTH);
    const photo = await put.execute(ANDRES, HOUSEHOLD.id, await pngBytes());
    const live = () => t.h.uow.runInTransaction((r) => loadLiveInputs(t.deps, r, { householdId: HOUSEHOLD.id, ownerUserId: null, role: 'OWNER' }));
    expect((await live()).snapshot.household).toBe(photo.tag);
    await t.revoke.execute(ANDRES);
    expect(snap(t).householdPhotos ?? []).toEqual([]);
    expect((await live()).snapshot.household).toBeNull();
  });
});
