/**
 * Ganchos de privacidad y ciclo de vida de la escena (feature 006, T862..T868; plan.md §1.2 «Puerto ScenePrivacyHooksPort», enmienda N2-06 (d)). Implementa el
 * puerto con sus 6 reglas: (1) solo escribe filas en el `RepositorySet` de la transacción de la causa (sin transacción propia ni E/S externa; el borrado físico
 * ocurre después del COMMIT por la cola de 004); (2) se invoca ANTES de la mutación, salvo `onHouseholdCreated`; (3) eventos opacos (identificadores, `cause`,
 * seudónimo y `now`); (4) sin escena no hay efecto ni se crean filas (INV-ESC6-019) y repetir el evento no cambia nada (idempotente); (5) un evento por causa;
 * (6) opcional: ausente = comportamiento de 001..005. Retira la imagen vigente, encola su borrado, cancela el intento en vuelo (su objeto `INTENT` pasa a `DELETE`),
 * migra la escena D6-09 con arrastre de cuota y seudonimiza. Sin reloj ni entropía: `now` llega en el evento (INV-ESC6-001).
 *
 * @implements REQ-ESC6-022, REQ-ESC6-024, REQ-ESC6-025, REQ-ESC6-029, REQ-ESC6-030, REQ-ESC6-032, INV-ESC6-016, INV-ESC6-019, EDGE-ESC6-005, EDGE-ESC6-020, EDGE-ESC6-021, EDGE-ESC6-022, EDGE-ESC6-030, EDGE-ESC6-033, INV-ARCH-005
 */

import { householdPhotoObjectKey, sceneImageObjectKey } from '../../domain/media/media-keys.ts';
import { parseInputsSnapshot } from '../../domain/scene/inputs-snapshot.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { ScenePrivacyHooksPort } from '../ports/scene-privacy-hooks.port.ts';
import type { SceneRecord } from '../ports/scene-repositories.port.ts';

const snapshotHasPet = (snapshot: string | null, petId: string): boolean => {
  if (snapshot === null) return false;
  const parsed = parseInputsSnapshot(snapshot);
  return parsed !== null && parsed.pets.some((p) => p.id === petId);
};

/** ¿La imagen vigente de la escena incluye a la mascota? */
const imageHasPet = (scene: SceneRecord, petId: string): boolean => snapshotHasPet(scene.image?.inputsSnapshot ?? null, petId);

/** ¿El intento en vuelo de la escena incluye a la mascota? */
async function inFlightHasPet(repositories: RepositorySet, scene: SceneRecord, petId: string): Promise<boolean> {
  if (scene.runState !== 'generating' || scene.currentAttemptId === null) return false;
  const attempt = await repositories.scenes.findAttemptById(scene.currentAttemptId);
  return attempt !== null && snapshotHasPet(attempt.inputsSnapshot, petId);
}

async function retireImage(repositories: RepositorySet, scene: SceneRecord, now: string): Promise<void> {
  const imageId = await repositories.scenes.retireImage(scene.id, now);
  if (imageId !== null) await repositories.mediaQueue.enqueue(sceneImageObjectKey(scene.id, imageId), 'DELETE', now);
}

/** Cancela el intento en vuelo: su fila `INTENT` (objeto resultante) pasa a `DELETE` en la misma transacción (EDGE-ESC6-021). */
async function cancelInFlight(repositories: RepositorySet, scene: SceneRecord, now: string): Promise<void> {
  const cancelled = await repositories.scenes.cancelInFlight(scene.id, now);
  if (cancelled !== null) await repositories.mediaQueue.enqueue(sceneImageObjectKey(scene.id, cancelled.resultObjectId), 'DELETE', now);
}

/** Escenas que pueden incluir a la mascota: las de los hogares a los que está asignada y la del propietario sin hogar. */
async function scenesOfPet(repositories: RepositorySet, petId: string, ownerUserIds: readonly string[]): Promise<SceneRecord[]> {
  const found = new Map<string, SceneRecord>();
  for (const assignment of await repositories.assignments.listByPet(petId)) {
    const scene = await repositories.scenes.findByHouseholdId(assignment.householdId);
    if (scene !== null) found.set(scene.id, scene);
  }
  for (const owner of ownerUserIds) {
    const scene = await repositories.scenes.findByOwnerUserId(owner);
    if (scene !== null) found.set(scene.id, scene);
  }
  return [...found.values()];
}

async function ownerOf(repositories: RepositorySet, petId: string): Promise<string[]> {
  const pet = await repositories.pets.findById(petId);
  return pet === null ? [] : [pet.ownerUserId];
}

/** Retira la imagen de las escenas que incluyen a la mascota y cancela los intentos en vuelo que la incluyen. */
async function withdrawPetFrom(repositories: RepositorySet, petId: string, scenes: readonly SceneRecord[], now: string): Promise<void> {
  for (const scene of scenes) {
    if (imageHasPet(scene, petId)) await retireImage(repositories, scene, now);
    if (await inFlightHasPet(repositories, scene, petId)) await cancelInFlight(repositories, scene, now);
  }
}

/** Encola los objetos de una escena que va a desaparecer (imagen vigente, objeto en vuelo y, si procede, la foto del hogar) y borra sus filas. */
async function purgeScene(repositories: RepositorySet, scene: SceneRecord, now: string): Promise<void> {
  if (scene.image !== null) await repositories.mediaQueue.enqueue(sceneImageObjectKey(scene.id, scene.image.id), 'DELETE', now);
  await cancelInFlight(repositories, scene, now);
  await repositories.scenes.deleteScene(scene.id);
}

async function purgeHouseholdScene(repositories: RepositorySet, householdId: string, now: string): Promise<SceneRecord | null> {
  const photo = await repositories.scenes.findHouseholdPhoto(householdId);
  if (photo !== null) {
    await repositories.mediaQueue.enqueue(householdPhotoObjectKey(householdId, photo.objectId), 'DELETE', now);
    await repositories.scenes.deleteHouseholdPhoto(householdId);
  }
  const scene = await repositories.scenes.findByHouseholdId(householdId);
  if (scene !== null) await purgeScene(repositories, scene, now);
  return scene;
}

export class SceneLifecycleHooks implements ScenePrivacyHooksPort {
  /** T862 (REQ-ESC6-029/030; EDGE-ESC6-005/021): baja de mascota o borrado de avatar. */
  async onPetRemoved(repositories: RepositorySet, event: { petId: string; cause: 'PET_DELETED' | 'AVATAR_DELETED'; now: string }): Promise<void> {
    const scenes = await scenesOfPet(repositories, event.petId, await ownerOf(repositories, event.petId));
    await withdrawPetFrom(repositories, event.petId, scenes, event.now);
  }

  /** T863 (D6-17): la desasignación retira SIEMPRE la imagen vigente del hogar y cancela el intento en vuelo. */
  async onPetUnassigned(repositories: RepositorySet, event: { petId: string; householdId: string; now: string }): Promise<void> {
    const scene = await repositories.scenes.findByHouseholdId(event.householdId);
    if (scene === null) return;
    await retireImage(repositories, scene, event.now);
    await cancelInFlight(repositories, scene, event.now);
  }

  /** T863 (D6-17, EDGE-ESC6-020): salida o expulsión; retira si el miembro aportó a la imagen o sus mascotas constan en ella (subsume la desasignación). */
  async onMemberRemoved(repositories: RepositorySet, event: { householdId: string; userId: string; cause: 'LEFT' | 'REMOVED'; now: string }): Promise<void> {
    const scene = await repositories.scenes.findByHouseholdId(event.householdId);
    if (scene === null) return;
    const sources = await repositories.scenes.findImageSources(scene.id);
    const pets = await repositories.pets.listByOwners([event.userId]);
    const involvedImage = sources.includes(event.userId) || pets.some((p) => imageHasPet(scene, p.id));
    if (involvedImage) await retireImage(repositories, scene, event.now);
    let involvedFlight = false;
    for (const p of pets) involvedFlight = involvedFlight || (await inFlightHasPet(repositories, scene, p.id));
    if (involvedFlight) await cancelInFlight(repositories, scene, event.now);
  }

  /** T864 (REQ-ESC6-032, D6-09; EDGE-ESC6-030/033): la escena del propietario sin hogar migra al hogar nuevo con el arrastre de cuota; no llama a la IA ni consume cuota. */
  async onHouseholdCreated(repositories: RepositorySet, event: { householdId: string; ownerUserId: string; now: string }): Promise<void> {
    const sceneId = await repositories.scenes.adoptOwnerScene(event.ownerUserId, event.householdId, event.now);
    if (sceneId === null) return;
    const scene = await repositories.scenes.findById(sceneId);
    if (scene === null) return;
    const carried = await repositories.scenes.findQuotaCarry(event.ownerUserId, scene.quotaWindow);
    if (carried !== null) await repositories.scenes.raiseConsumed(scene.id, scene.quotaWindow, carried);
  }

  /** T865 (REQ-ESC6-029; EDGE-ESC6-022/033): antes del DELETE del hogar, encola los objetos, arrastra la cuota con max al propietario y borra escena y foto. */
  async onHouseholdDeleting(repositories: RepositorySet, event: { householdId: string; now: string }): Promise<void> {
    const household = await repositories.households.findById(event.householdId);
    const scene = await purgeHouseholdScene(repositories, event.householdId, event.now);
    if (scene !== null && household !== null && scene.consumedGenerations > 0) {
      await repositories.scenes.upsertQuotaCarry(household.ownerUserId, scene.quotaWindow, scene.consumedGenerations);
    }
  }

  /** T865 (REQ-ESC6-029/032; EDGE-ESC6-022): eliminación de cuenta; los hogares en cascada y la escena del propietario se purgan; en otros hogares se retira lo que aportó y se seudonimiza. */
  async onAccountDeleting(repositories: RepositorySet, event: { userId: string; pseudonym: string; householdIds: readonly string[]; now: string }): Promise<void> {
    const cascade = new Set(event.householdIds);
    for (const householdId of cascade) await purgeHouseholdScene(repositories, householdId, event.now);
    const own = await repositories.scenes.findByOwnerUserId(event.userId);
    if (own !== null) await purgeScene(repositories, own, event.now);
    for (const membership of await repositories.households.listMembershipsOfUsers([event.userId])) {
      if (cascade.has(membership.householdId)) continue;
      const scene = await repositories.scenes.findByHouseholdId(membership.householdId);
      if (scene === null) continue;
      if ((await repositories.scenes.findImageSources(scene.id)).includes(event.userId)) await retireImage(repositories, scene, event.now);
    }
    await repositories.scenes.pseudonymizeUser(event.userId, event.pseudonym);
  }

  /** T866 (REQ-ESC6-024/025/030): la transferencia retira las imágenes que incluyen la mascota y cuyas fuentes incluyen al propietario anterior; el consentimiento efectivo pasa al nuevo Propietario Legal por derivación. */
  async onPetOwnershipTransferred(repositories: RepositorySet, event: { petId: string; previousOwnerUserId: string; newOwnerUserId: string; now: string }): Promise<void> {
    const scenes = await scenesOfPet(repositories, event.petId, [event.previousOwnerUserId]);
    for (const scene of scenes) {
      if (imageHasPet(scene, event.petId) && (await repositories.scenes.findImageSources(scene.id)).includes(event.previousOwnerUserId)) await retireImage(repositories, scene, event.now);
      if (await inFlightHasPet(repositories, scene, event.petId)) await cancelInFlight(repositories, scene, event.now);
    }
  }

  /** T867 (REQ-ESC6-022): la importación reemplaza mascotas y deja `avatar_object_id = NULL`; se retira la imagen de toda escena cuyo snapshot incluye mascotas reemplazadas. */
  async onBackupImported(repositories: RepositorySet, event: { ownerUserId: string; replacedPetIds: readonly string[]; now: string }): Promise<void> {
    for (const petId of event.replacedPetIds) {
      const scenes = await scenesOfPet(repositories, petId, [event.ownerUserId]);
      await withdrawPetFrom(repositories, petId, scenes, event.now);
    }
  }
}
