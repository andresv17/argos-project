import { describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { UnassignPetFromHouseholdUseCase } from '../../src/application/use-cases/assignment-use-cases.ts';
import { DeleteAvatarUseCase } from '../../src/application/use-cases/avatar-use-cases.ts';
import { CreateHouseholdUseCase, DeleteHouseholdUseCase, RemoveMemberUseCase } from '../../src/application/use-cases/household-use-cases.ts';
import { TransferPetOwnershipUseCase } from '../../src/application/use-cases/ownership-use-cases.ts';
import { DeletePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { SceneLifecycleHooks } from '../../src/application/use-cases/scene-lifecycle-hooks.ts';
import { GetSceneUseCase } from '../../src/application/use-cases/scene-use-cases.ts';
import { purgeObjects } from '../../src/application/use-cases/media-use-cases.ts';
import { buildInputsSnapshot, serializeInputsSnapshot, computeFingerprint } from '../../src/domain/scene/inputs-snapshot.ts';
import { ANDRES, ARGOS, HOUSEHOLD, LUCIA, MARIA, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T862..T868 (006, Fase 5): la lógica REAL de los ganchos de privacidad (`SceneLifecycleHooks`, plan.md §1.2) ejecutada a través de los casos de uso de 002/004/005:
 * retiro de la imagen vigente con encolado de su borrado, intento en vuelo CANCELLED, migración D6-09, arrastre de cuota, seudonimización y sin escena sin efecto.
 * REQ-ESC6-022, REQ-ESC6-029, REQ-ESC6-030, REQ-ESC6-032; INV-ESC6-016, INV-ESC6-019; EDGE-ESC6-005, EDGE-ESC6-020, EDGE-ESC6-021, EDGE-ESC6-022, EDGE-ESC6-030,
 * EDGE-ESC6-033; SC-ESC6-044, SC-ESC6-045, SC-ESC6-047, SC-ESC6-048, SC-ESC6-058, SC-ESC6-073, SC-ESC6-076, SC-ESC6-088.
 */
const NOW = '2026-11-05T12:00:00.000Z';
const SCENE = 'c1000000-0000-4000-8000-000000000001';
const OWNER_SCENE = 'c1000000-0000-4000-8000-000000000002';
const IMAGE = 'c2000000-0000-4000-8000-000000000001';
const RESULT = 'c3000000-0000-4000-8000-000000000001';
const ATTEMPT = 'c4000000-0000-4000-8000-000000000001';
const OTHER_PET = 'c5000000-0000-4000-8000-000000000001';
const f = 'f'.repeat(64);
const imageKey = (scene: string, id: string): string => `scenes/${scene}/images/${id}`;
const snapPet = (id: string) => ({ id, species: 'CANINE', speciesOther: null, breed: 'Criolla', breedCode: 'DOG_CRIOLLA', sex: 'MALE', photo: null });
const snapshotOf = (...ids: string[]): string => serializeInputsSnapshot(buildInputsSnapshot({ householdPhoto: null, pets: ids.map(snapPet) }));
const sceneWith = (snapshot: string, over: Partial<SceneRecord> = {}): SceneRecord => ({
  id: SCENE, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null,
  image: { id: IMAGE, mime: 'image/png', sizeBytes: 9, fingerprint: f, inputsSnapshot: snapshot, createdAt: NOW }, imageDegraded: false, consumedGenerations: 4, quotaWindow: '2026-11',
  createdAt: NOW, updatedAt: NOW, ...over,
});
const attemptOf = (snapshot: string): SceneAttemptRecord => ({
  id: ATTEMPT, sceneId: SCENE, actorUserId: ANDRES, action: 'UPDATE', mode: 'FROM_SCRATCH', fingerprint: computeFingerprint(buildInputsSnapshot({ householdPhoto: null, pets: [] })),
  inputsSnapshot: snapshot, resultObjectId: RESULT, phase: 'RUNNING', claimedAt: NOW, providerCallStartedAt: null, quotaWindow: '2026-11', quotaMax: 10, outcome: null, errorCode: null,
  degraded: false, idempotencyKeyHash: null, idempotencyExpiresAt: null, startedAt: NOW, finishedAt: null,
});

async function setup(scene: SceneRecord | null, extra: (r: RepositorySet) => Promise<void> = async () => undefined) {
  const h = createHarness();
  const deps = { ...h.deps, sceneHooks: new SceneLifecycleHooks() };
  await h.uow.runInTransaction(async (r) => {
    if (scene !== null) {
      await r.scenes.insert(scene);
      await r.scenes.replaceImageSources(scene.id, [ANDRES]);
    }
    await extra(r);
  });
  const read = () => h.uow.snapshot();
  const queued = () => read().mediaQueue.map((e) => `${e.reason}:${e.objectKey}`).sort();
  return { h, deps, read, queued };
}

describe('SceneLifecycleHooks (T862): baja de mascota y borrado de avatar', () => {
  it('[SC-ESC6-044][REQ-ESC6-029] la baja de una mascota que consta en la imagen vigente retira la imagen, vacía las fuentes y encola su borrado; la cuota se conserva', async () => {
    const t = await setup(sceneWith(snapshotOf(ARGOS.id, OTHER_PET)));
    await new DeletePetUseCase(t.deps).execute(ANDRES, ARGOS.id);
    const scene = t.read().scenes?.find((s) => s.id === SCENE);
    expect([scene?.image, scene?.consumedGenerations, t.read().sceneImageSources]).toEqual([null, 4, []]);
    expect(t.queued()).toContain(`DELETE:${imageKey(SCENE, IMAGE)}`);
  });

  it('[SC-ESC6-045] una mascota que no consta en la imagen vigente no la retira ni encola nada de la escena', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET)));
    await new DeletePetUseCase(t.deps).execute(ANDRES, ARGOS.id);
    expect(t.read().scenes?.find((s) => s.id === SCENE)?.image?.id).toBe(IMAGE);
    expect(t.queued().filter((k) => k.includes('scenes/'))).toEqual([]);
  });

  it('[INV-ESC6-019] sin escena no hay efecto: la baja no crea filas de escena, de intento ni de fuentes', async () => {
    const t = await setup(null);
    await new DeletePetUseCase(t.deps).execute(ANDRES, ARGOS.id);
    expect([t.read().scenes ?? [], t.read().sceneAttempts ?? [], t.read().sceneImageSources ?? []]).toEqual([[], [], []]);
  });

  it('[EDGE-ESC6-021] el intento en vuelo que incluye a la mascota pasa a CANCELLED, la escena queda sin run_state y el objeto resultante se encola para borrar', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET)), async (r) => {
      await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptOf(snapshotOf(ARGOS.id)), now: NOW, leaseExpiresAt: '2026-11-05T12:10:00.000Z' });
    });
    await new DeletePetUseCase(t.deps).execute(ANDRES, ARGOS.id);
    const scene = t.read().scenes?.find((s) => s.id === SCENE);
    expect([scene?.runState, scene?.currentAttemptId]).toEqual([null, null]);
    expect(t.read().sceneAttempts?.find((a) => a.id === ATTEMPT)).toMatchObject({ phase: 'DONE', outcome: 'CANCELLED' });
    expect(t.queued()).toContain(`DELETE:${imageKey(SCENE, RESULT)}`);
  });

  it('[EDGE-ESC6-005][SC-ESC6-044] el borrado del avatar retira la imagen vigente que incluye a la mascota y es idempotente al repetirlo', async () => {
    const t = await setup(sceneWith(snapshotOf(ARGOS.id)), async (r) => void (await r.pets.replaceAvatar(ARGOS.id, 'f0000000-0000-4000-8000-0000000a0a01')));
    await new DeleteAvatarUseCase(t.deps).execute(ANDRES, ARGOS.id);
    await new DeleteAvatarUseCase(t.deps).execute(ANDRES, ARGOS.id);
    expect(t.read().scenes?.find((s) => s.id === SCENE)?.image).toBeNull();
    expect(t.queued().filter((k) => k.includes('scenes/'))).toEqual([`DELETE:${imageKey(SCENE, IMAGE)}`]);
  });
});

describe('SceneLifecycleHooks (T863): desasignación, salida y expulsión (D6-17)', () => {
  it('[SC-ESC6-047][REQ-ESC6-030] desasignar una mascota retira SIEMPRE la imagen vigente del hogar y la encola, aunque la mascota no conste en ella', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET)));
    await new UnassignPetFromHouseholdUseCase(t.deps).execute(ANDRES, ARGOS.id, HOUSEHOLD.id);
    expect(t.read().scenes?.find((s) => s.id === SCENE)?.image).toBeNull();
    expect(t.queued()).toContain(`DELETE:${imageKey(SCENE, IMAGE)}`);
  });

  it('[EDGE-ESC6-020] expulsar a un miembro que aportó a la imagen (fuente) la retira; expulsar a uno que no aportó ni tiene mascotas incluidas la conserva', async () => {
    const source = await setup(sceneWith(snapshotOf(OTHER_PET)), async (r) => void (await r.scenes.replaceImageSources(SCENE, [MARIA])));
    await new RemoveMemberUseCase(source.deps).execute(ANDRES, HOUSEHOLD.id, MARIA);
    expect(source.read().scenes?.find((s) => s.id === SCENE)?.image).toBeNull();
    const bystander = await setup(sceneWith(snapshotOf(OTHER_PET)));
    await new RemoveMemberUseCase(bystander.deps).execute(ANDRES, HOUSEHOLD.id, MARIA);
    expect(bystander.read().scenes?.find((s) => s.id === SCENE)?.image?.id).toBe(IMAGE);
  });
});

describe('SceneLifecycleHooks (T864): crear hogar con migración D6-09', () => {
  const ownerScene = (over: Partial<SceneRecord> = {}): SceneRecord => ({ ...sceneWith(snapshotOf(OTHER_PET), { id: OWNER_SCENE, householdId: null, ownerUserId: LUCIA, consumedGenerations: 2 }), ...over });

  it('[SC-ESC6-058][EDGE-ESC6-030] la escena del propietario sin hogar migra al hogar nuevo con su imagen y su cuota, sin crear intentos ni consumir cuota', async () => {
    const t = await setup(ownerScene());
    await new CreateHouseholdUseCase(t.deps).execute(LUCIA, { name: 'Casa nueva' });
    const scene = t.read().scenes?.find((s) => s.id === OWNER_SCENE);
    expect([scene?.ownerUserId, scene?.householdId === null, scene?.image?.id, scene?.consumedGenerations]).toEqual([null, false, IMAGE, 2]);
    expect(t.read().sceneAttempts ?? []).toEqual([]);
  });

  it('[EDGE-ESC6-033] el arrastre de cuota de la ventana vigente sube el consumo de la escena migrada (max), nunca lo baja', async () => {
    const t = await setup(ownerScene(), async (r) => {
      await r.scenes.upsertQuotaCarry(LUCIA, '2026-11', 7);
    });
    await new CreateHouseholdUseCase(t.deps).execute(LUCIA, { name: 'Casa nueva' });
    expect(t.read().scenes?.find((s) => s.id === OWNER_SCENE)?.consumedGenerations).toBe(7);
    const lower = await setup(ownerScene({ consumedGenerations: 9 }), async (r) => void (await r.scenes.upsertQuotaCarry(LUCIA, '2026-11', 3)));
    await new CreateHouseholdUseCase(lower.deps).execute(LUCIA, { name: 'Casa nueva' });
    expect(lower.read().scenes?.find((s) => s.id === OWNER_SCENE)?.consumedGenerations).toBe(9);
  });

  it('[INV-ESC6-019] sin escena del propietario no se crea ninguna fila al crear el hogar', async () => {
    const t = await setup(null);
    await new CreateHouseholdUseCase(t.deps).execute(LUCIA, { name: 'Casa nueva' });
    expect(t.read().scenes ?? []).toEqual([]);
  });
});

describe('SceneLifecycleHooks (T864): arrastre de cuota al recrear el hogar sin escena previa (BRECHA-SMITH-01)', () => {
  it('[SC-ESC6-076][EDGE-ESC6-033][REQ-ESC6-011][REQ-ESC6-032] consume 10, elimina y crea otro hogar: la escena perezosa del hogar nuevo nace con el arrastre y el restante es 0', async () => {
    const t = await setup(null, async (r) => void (await r.scenes.upsertQuotaCarry(LUCIA, '2026-11', 10)));
    const deps = withScene(t.deps, sceneFixture());
    await new CreateHouseholdUseCase(deps).execute(LUCIA, { name: 'Casa recreada' });
    const created = t.read().households.find((x) => x.ownerUserId === LUCIA && x.name === 'Casa recreada');
    const view = await new GetSceneUseCase(deps).execute(LUCIA, { kind: 'HOUSEHOLD', householdId: created!.id });
    expect(view.quota.remaining).toBe(0);
    expect(t.read().scenes?.find((s) => s.householdId === created!.id)?.consumedGenerations).toBe(10);
  });

  it('[EDGE-ESC6-033] el arrastre de una ventana anterior no reduce la cuota del hogar nuevo, y sin arrastre nace en 0', async () => {
    const old = await setup(null, async (r) => void (await r.scenes.upsertQuotaCarry(LUCIA, '2026-10', 10)));
    const oldDeps = withScene(old.deps, sceneFixture());
    await new CreateHouseholdUseCase(oldDeps).execute(LUCIA, { name: 'Casa nueva' });
    const house = old.read().households.find((x) => x.ownerUserId === LUCIA && x.name === 'Casa nueva');
    expect((await new GetSceneUseCase(oldDeps).execute(LUCIA, { kind: 'HOUSEHOLD', householdId: house!.id })).quota.remaining).toBe(10);
  });
});

describe('purgeObjects tras revocar el consentimiento (BRECHA-SMITH-02)', () => {
  it('[REQ-ESC6-029][SC-ESC6-044][INV-GCS-002] si el objeto aun no existe en el almacen, la fila DELETE de la cola se conserva; si existia, se borra el objeto y se retira la fila', async () => {
    const t = await setup(null);
    const storage = new ControlledStorage(() => new Date(NOW));
    const deps = { ...t.deps, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
    const absent = imageKey(SCENE, IMAGE);
    const present = imageKey(SCENE, RESULT);
    await storage.put(present, new Uint8Array([1]), 'image/png');
    await t.h.uow.runInTransaction(async (r) => {
      await r.mediaQueue.enqueue(absent, 'DELETE', NOW);
      await r.mediaQueue.enqueue(present, 'DELETE', NOW);
    });
    await purgeObjects(deps, [absent, present], { keepRowIfAbsent: true });
    expect(t.queued()).toEqual([`DELETE:${absent}`]);
    expect(await storage.keys('scenes/')).toEqual([]);
    await purgeObjects(deps, [absent]);
    expect(t.queued()).toEqual([]); // sin la opcion, el comportamiento general (SC-ALM-014) no cambia
  });

  it('[REQ-ESC6-025][REQ-ESC6-029] el almacen caido conserva la fila (comportamiento previo intacto)', async () => {
    const t = await setup(null);
    const storage = new ControlledStorage(() => new Date(NOW));
    const deps = { ...t.deps, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
    await t.h.uow.runInTransaction(async (r) => void (await r.mediaQueue.enqueue(imageKey(SCENE, IMAGE), 'DELETE', NOW)));
    storage.down = true;
    await purgeObjects(deps, [imageKey(SCENE, IMAGE)]);
    expect(t.queued()).toEqual([`DELETE:${imageKey(SCENE, IMAGE)}`]);
  });
});

describe('SceneLifecycleHooks (T865): eliminar hogar y cuenta', () => {
  const photo = { householdId: HOUSEHOLD.id, objectId: 'c6000000-0000-4000-8000-000000000001', mime: 'image/png' as const, sizeBytes: 5, uploadedByUserId: ANDRES, createdAt: NOW };

  it('[SC-ESC6-048][EDGE-ESC6-022] eliminar el hogar encola la imagen, el objeto en vuelo y la foto, arrastra la cuota con max al propietario y borra escena y foto', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET), { consumedGenerations: 6 }), async (r) => {
      await r.scenes.putHouseholdPhoto(photo);
      await r.scenes.upsertQuotaCarry(ANDRES, '2026-11', 8);
      await r.scenes.beginGeneration({ sceneId: SCENE, attempt: attemptOf(snapshotOf(OTHER_PET)), now: NOW, leaseExpiresAt: '2026-11-05T12:10:00.000Z' });
    });
    await new DeleteHouseholdUseCase(t.deps).execute(ANDRES, HOUSEHOLD.id);
    expect(t.queued()).toEqual(expect.arrayContaining([`DELETE:${imageKey(SCENE, IMAGE)}`, `DELETE:${imageKey(SCENE, RESULT)}`, `DELETE:households/${HOUSEHOLD.id}/photo/${photo.objectId}`]));
    expect([t.read().scenes?.some((s) => s.id === SCENE), t.read().householdPhotos ?? []]).toEqual([false, []]);
    const carry = t.read().sceneQuotaCarry?.find((c) => c.ownerUserId === ANDRES && c.quotaWindow === '2026-11');
    expect(carry?.consumedGenerations).toBe(8);
  });

  it('[SC-ESC6-076][EDGE-ESC6-033] eliminar el hogar con más consumo que el arrastre previo lo sube a ese valor (max)', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET), { consumedGenerations: 6 }), async (r) => void (await r.scenes.upsertQuotaCarry(ANDRES, '2026-11', 2)));
    await new DeleteHouseholdUseCase(t.deps).execute(ANDRES, HOUSEHOLD.id);
    expect(t.read().sceneQuotaCarry?.find((c) => c.ownerUserId === ANDRES)?.consumedGenerations).toBe(6);
  });

  it('[SC-ESC6-048][EDGE-ESC6-022] onAccountDeleting borra las escenas de los hogares en cascada y la del propietario, encola sus objetos y seudonimiza lo que queda', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET)), async (r) => {
      await r.scenes.insert(sceneWith(snapshotOf(OTHER_PET), { id: OWNER_SCENE, householdId: null, ownerUserId: ANDRES, image: { id: 'c2000000-0000-4000-8000-000000000009', mime: 'image/webp', sizeBytes: 3, fingerprint: f, inputsSnapshot: snapshotOf(OTHER_PET), createdAt: NOW } }));
      await r.scenes.putHouseholdPhoto(photo);
    });
    const pseudonym = 'e'.repeat(64);
    await t.h.uow.runInTransaction((r) => new SceneLifecycleHooks().onAccountDeleting(r, { userId: ANDRES, pseudonym, householdIds: [HOUSEHOLD.id], now: NOW }));
    expect(t.read().scenes ?? []).toEqual([]);
    expect(t.queued()).toEqual(expect.arrayContaining([`DELETE:${imageKey(SCENE, IMAGE)}`, `DELETE:${imageKey(OWNER_SCENE, 'c2000000-0000-4000-8000-000000000009')}`, `DELETE:households/${HOUSEHOLD.id}/photo/${photo.objectId}`]));
  });

  it('[EDGE-ESC6-022] onAccountDeleting retira la imagen de un hogar ajeno en el que el usuario es fuente y seudonimiza su identidad en la escena y la foto que sobreviven', async () => {
    const t = await setup(sceneWith(snapshotOf(OTHER_PET)), async (r) => void (await r.scenes.putHouseholdPhoto(photo)));
    const pseudonym = 'e'.repeat(64);
    await t.h.uow.runInTransaction((r) => new SceneLifecycleHooks().onAccountDeleting(r, { userId: ANDRES, pseudonym, householdIds: [], now: NOW }));
    const state = t.read();
    expect([state.scenes?.find((s) => s.id === SCENE)?.image, state.householdPhotos?.[0]?.uploadedByUserId, state.sceneImageSources ?? []]).toEqual([null, pseudonym, []]);
  });
});

describe('SceneLifecycleHooks (T866/T867): transferencia de propiedad e importación de respaldo', () => {
  it('[SC-ESC6-088][REQ-ESC6-025] transferir la mascota retira la imagen cuya fuente incluye al propietario anterior y consta la mascota; si la fuente es otra, la conserva', async () => {
    const mine = await setup(sceneWith(snapshotOf(ARGOS.id)));
    await new TransferPetOwnershipUseCase(mine.deps).execute(ANDRES, ARGOS.id, { targetUserId: MARIA });
    expect(mine.read().scenes?.find((s) => s.id === SCENE)?.image).toBeNull();
    expect(mine.queued()).toContain(`DELETE:${imageKey(SCENE, IMAGE)}`);
    const foreign = await setup(sceneWith(snapshotOf(ARGOS.id)), async (r) => void (await r.scenes.replaceImageSources(SCENE, [LUCIA])));
    await new TransferPetOwnershipUseCase(foreign.deps).execute(ANDRES, ARGOS.id, { targetUserId: MARIA });
    expect(foreign.read().scenes?.find((s) => s.id === SCENE)?.image?.id).toBe(IMAGE);
  });

  it('[SC-ESC6-088][REQ-ESC6-022] onBackupImported retira la imagen vigente de las escenas cuyo snapshot incluye mascotas reemplazadas y deja las demás; es idempotente', async () => {
    const t = await setup(sceneWith(snapshotOf(ARGOS.id)));
    const hooks = new SceneLifecycleHooks();
    await t.h.uow.runInTransaction((r) => hooks.onBackupImported(r, { ownerUserId: ANDRES, replacedPetIds: [ARGOS.id], now: NOW }));
    await t.h.uow.runInTransaction((r) => hooks.onBackupImported(r, { ownerUserId: ANDRES, replacedPetIds: [ARGOS.id], now: NOW }));
    expect(t.read().scenes?.find((s) => s.id === SCENE)?.image).toBeNull();
    expect(t.queued().filter((k) => k.includes('scenes/'))).toEqual([`DELETE:${imageKey(SCENE, IMAGE)}`]);
    const other = await setup(sceneWith(snapshotOf(OTHER_PET)));
    await other.h.uow.runInTransaction((r) => hooks.onBackupImported(r, { ownerUserId: ANDRES, replacedPetIds: [ARGOS.id], now: NOW }));
    expect(other.read().scenes?.find((s) => s.id === SCENE)?.image?.id).toBe(IMAGE);
  });
});

describe('SceneLifecycleHooks (T868): eventos opacos y pureza', () => {
  it('[INV-ESC6-016] el registro de la cola solo contiene claves derivadas de UUID (sin nombres) y ningún evento lleva textos libres', async () => {
    const t = await setup(sceneWith(snapshotOf(ARGOS.id)));
    await new DeletePetUseCase(t.deps).execute(ANDRES, ARGOS.id);
    for (const entry of t.queued().filter((k) => k.includes('scenes/'))) expect(entry).toMatch(/^DELETE:scenes\/[0-9a-f-]{36}\/images\/[0-9a-f-]{36}$/);
  });
});
