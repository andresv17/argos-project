/**
 * Casos de uso de la escena del hogar (feature 006, T852+): lectura del estado y entrega de la imagen. La autorización y el 404 ocurren ANTES de cualquier
 * escritura (INV-ESC6-007, INV-ESC6-019, SC-ESC6-093): un tercero, un invitado o un hogar inexistente reciben `ERR-HOUSE-NOT-FOUND` y no se crea ninguna fila. La
 * escena se crea perezosamente en la primera lectura de un miembro ACTIVE. El estado `idle|outdated|ready` NO se guarda: se deriva en cada lectura con
 * `deriveStatus` sobre la huella del estado vivo (REQ-ESC6-003, ADR-006-09); lo único que la lectura materializa es el vencimiento del arrendamiento, por
 * compare-and-set idempotente bajo el candado de la escena (data-model.md §7, `H-TRI-006-12`). El reloj y los identificadores salen de los puertos (INV-ARCH-001/002).
 *
 * @implements REQ-ESC6-003, REQ-ESC6-004, REQ-ESC6-005, REQ-ESC6-008, REQ-ESC6-011, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-024, REQ-ESC6-032, REQ-ESC6-034, INV-ESC6-007, INV-ESC6-014, INV-ESC6-019, EDGE-ESC6-003, EDGE-ESC6-006, SC-ESC6-014, SC-ESC6-018, SC-ESC6-081, SC-ESC6-093
 */

import { householdPhotoObjectKey, sceneImageObjectKey } from '../../domain/media/media-keys.ts';
import { isOwnerRow } from '../../domain/households/household-policies.ts';
import { ATTEMPT_WINDOW_SECONDS, ATTEMPT_COOLDOWN_SECONDS, evaluateAttemptLimits } from '../../domain/scene/attempt-limits.ts';
import { buildInputsSnapshot, computeFingerprint, countPendingChanges, hasInputs, parseInputsSnapshot, type InputsSnapshot, type SnapshotPet } from '../../domain/scene/inputs-snapshot.ts';
import { quotaWindowOf, remainingQuota, windowResetsAt } from '../../domain/scene/quota-window.ts';
import { canGenerateScene, canManageHouseholdPhoto, type SceneRole } from '../../domain/scene/scene-policy.ts';
import { deriveStatus, type DerivedStatus } from '../../domain/scene/scene-state.ts';
import { selectVisiblePets } from '../../domain/scene/select-visible-pets.ts';
import { shiftIsoTimestamp } from '../../domain/shared/date-utils.ts';
import { DomainError } from '../../generated/index.ts';
import type { SceneErrorCode, SceneView } from '../../generated/v34/schemas/types.ts';
import { DomainError as DomainErrorV31 } from '../../generated/v31/index.ts';
import type { MediaReadUrl } from '../ports/media-storage.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { SceneAttemptRecord, SceneConsentScope, SceneRecord } from '../ports/scene-repositories.port.ts';
import { requireMedia } from './media-use-cases.ts';
import type { ApplicationDeps, SceneServices } from './use-case-support.ts';

export type SceneTarget = { readonly kind: 'HOUSEHOLD'; readonly householdId: string } | { readonly kind: 'OWNER' };

/** Quién consulta y sobre qué escena: hogar (con su rol) o propietario sin hogar. */
export interface SceneAccess {
  readonly householdId: string | null;
  readonly ownerUserId: string | null;
  readonly role: SceneRole;
}

/** Los servicios de la escena no están conectados en la composición: falla cerrado con un error interno. */
export function requireScene(deps: ApplicationDeps): SceneServices {
  if (deps.scene === undefined) throw new DomainErrorV31('ERR-INTERNAL-UNEXPECTED', 'La escena del hogar no está configurada.');
  return deps.scene;
}

/**
 * Autoriza ANTES de leer o escribir nada de la escena: hogar inexistente, usuario sin membresía ACTIVE o invitado = `ERR-HOUSE-NOT-FOUND` (404 sin revelar,
 * INV-ESC6-007). El propietario del hogar es `OWNER`; la escena sin hogar es del propietario (`OWNER`).
 */
export async function resolveSceneAccess(r: RepositorySet, userId: string, target: SceneTarget): Promise<SceneAccess> {
  if (target.kind === 'OWNER') return { householdId: null, ownerUserId: userId, role: 'OWNER' };
  const household = await r.households.findById(target.householdId);
  const membership = (await r.households.listMembershipsOfUsers([userId])).find((m) => m.householdId === target.householdId && m.status === 'ACTIVE');
  if (household === null || membership === undefined) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
  const role: SceneRole = isOwnerRow(membership) ? 'OWNER' : membership.role === 'ADMIN' ? 'ADMIN' : membership.role === 'CAREGIVER' ? 'CAREGIVER' : 'READER';
  return { householdId: target.householdId, ownerUserId: null, role };
}

export const findSceneOf = (r: RepositorySet, access: SceneAccess): Promise<SceneRecord | null> =>
  access.householdId !== null ? r.scenes.findByHouseholdId(access.householdId) : r.scenes.findByOwnerUserId(access.ownerUserId ?? '');

/** Consentimiento vigente del usuario para el ámbito, la versión del aviso y el proveedor actuales (REQ-ESC6-023). */
export async function hasActiveConsent(r: RepositorySet, svc: SceneServices, userId: string, scope: SceneConsentScope): Promise<boolean> {
  return (await r.sceneConsents.findActive(userId, scope, svc.providerId, svc.noticeVersion)) !== null;
}

export interface LiveInputs {
  readonly snapshot: InputsSnapshot;
  readonly fingerprint: string;
  /** Mascotas visibles (`N`) y asignadas (`M`) para «Se muestran N de M». */
  readonly shown: number;
  readonly total: number;
}

/**
 * Estado vivo de las entradas de la escena (REQ-ESC6-004, REQ-ESC6-008, REQ-ESC6-024): las primeras `N` mascotas asignadas al hogar (o, sin hogar, las del
 * propietario no asignadas a ninguno), con su avatar solo si su Propietario Legal tiene consentimiento vigente (driver real; con el simulado cuenta siempre,
 * REQ-ESC6-023), y la foto del hogar si quien la subió lo tiene. NUNCA nombres ni datos clínicos (INV-ESC6-010).
 */
export async function loadLiveInputs(deps: ApplicationDeps, r: RepositorySet, access: SceneAccess): Promise<LiveInputs> {
  const svc = requireScene(deps);
  const candidates: Array<{ id: string; assignedAt: string }> = [];
  if (access.householdId !== null) {
    for (const assignment of await r.assignments.listByHousehold(access.householdId)) candidates.push({ id: assignment.petId, assignedAt: assignment.assignedAt });
  } else {
    for (const pet of await r.pets.listByOwners([access.ownerUserId ?? ''])) {
      if ((await r.assignments.listByPet(pet.id)).length === 0) candidates.push({ id: pet.id, assignedAt: pet.createdAt });
    }
  }
  const { visible, total } = selectVisiblePets(candidates, svc.maxPets);
  const pets: SnapshotPet[] = [];
  for (const entry of visible) {
    const pet = await r.pets.findById(entry.id);
    if (pet === null) continue;
    const objectId = (await r.pets.findAvatar(pet.id))?.objectId ?? null;
    const photo = objectId !== null && (!svc.realDriver || (await hasActiveConsent(r, svc, pet.ownerUserId, 'PET_PHOTOS'))) ? objectId : null;
    pets.push({ id: pet.id, species: pet.species, speciesOther: pet.speciesOther ?? null, breed: pet.breed, breedCode: pet.breedCode ?? null, sex: pet.sex, photo });
  }
  let householdPhoto: string | null = null;
  if (access.householdId !== null) {
    const stored = await r.scenes.findHouseholdPhoto(access.householdId);
    if (stored !== null && (!svc.realDriver || (await hasActiveConsent(r, svc, stored.uploadedByUserId, 'HOUSEHOLD_PHOTO')))) householdPhoto = stored.objectId;
  }
  const snapshot = buildInputsSnapshot({ householdPhoto, pets });
  return { snapshot, fingerprint: computeFingerprint(snapshot), shown: pets.length, total };
}

/** Instante desde el que un intento iniciado cuenta como «reciente» para el enfriamiento de 60 s (`started_at > now - 60 s`). */
const cooldownSince = (now: string): string => shiftIsoTimestamp(now, -(ATTEMPT_COOLDOWN_SECONDS * 1000 - 1));

interface SceneReading {
  readonly scene: SceneRecord;
  readonly live: LiveInputs;
  readonly derived: DerivedStatus;
  readonly last: InputsSnapshot | null;
  readonly window: string;
  readonly now: string;
}

/** Deriva el estado de una escena ya cargada; el intento fallido vigente aporta su huella y su código (data-model.md §4). */
async function readScene(deps: ApplicationDeps, r: RepositorySet, access: SceneAccess, scene: SceneRecord, now: string, window: string): Promise<SceneReading> {
  const live = await loadLiveInputs(deps, r, access);
  const attempt: SceneAttemptRecord | null = scene.runState === 'failed' && scene.currentAttemptId !== null ? await r.scenes.findAttemptById(scene.currentAttemptId) : null;
  const derived = deriveStatus({
    now,
    runState: scene.runState,
    leaseExpiresAt: scene.leaseExpiresAt,
    hasImage: scene.image !== null,
    imageFingerprint: scene.image?.fingerprint ?? null,
    imageDegraded: scene.imageDegraded,
    fingerprintNow: live.fingerprint,
    hasInputs: hasInputs(live.snapshot),
    failedAttemptFingerprint: attempt?.fingerprint ?? null,
    lastErrorCode: (attempt?.errorCode ?? null) as SceneErrorCode | null,
  });
  const last = scene.image === null ? null : parseInputsSnapshot(scene.image.inputsSnapshot);
  return { scene, live, derived, last, window, now };
}

/** Vista de la escena (contrato `SceneView`): estado derivado, cambios pendientes, cuota, acciones habilitadas y consentimiento del usuario que consulta. */
async function buildView(deps: ApplicationDeps, r: RepositorySet, userId: string, access: SceneAccess, reading: SceneReading): Promise<SceneView> {
  const svc = requireScene(deps);
  const { scene, live, derived, last, window, now } = reading;
  const pending = countPendingChanges(last, live.snapshot);
  const remaining = remainingQuota({ max: svc.quotaMax, consumed: scene.consumedGenerations, consumedWindow: scene.quotaWindow, currentWindow: window });
  const petPhotosGranted = await hasActiveConsent(r, svc, userId, 'PET_PHOTOS');
  const householdPhotoGranted = await hasActiveConsent(r, svc, userId, 'HOUSEHOLD_PHOTO');
  const consentRequired = svc.realDriver && !petPhotosGranted && !householdPhotoGranted;
  const limits = evaluateAttemptLimits({
    now,
    lastStartedAt: (await r.scenes.countAttemptsByScene(scene.id, cooldownSince(now))) > 0 ? now : null,
    failedInWindow: (await r.scenes.countFailedAttemptsByScene(scene.id, shiftIsoTimestamp(now, -ATTEMPT_WINDOW_SECONDS * 1000))).count,
    oldestFailedStartedAt: null,
    startedByActor: await r.scenes.countAttemptsByActor(userId, shiftIsoTimestamp(now, -ATTEMPT_WINDOW_SECONDS * 1000)),
    oldestActorStartedAt: null,
  });
  const roleOk = canGenerateScene(access.role);
  const hasChange = pending >= 1 || derived.status === 'failed' || (scene.image === null && hasInputs(live.snapshot));
  const statusOk = derived.status === 'outdated' || derived.status === 'failed';
  let blockedReason: SceneView['actions']['blockedReason'] = null;
  if (!roleOk) blockedReason = 'ROLE';
  else if (derived.status === 'generating') blockedReason = 'GENERATING';
  else if (consentRequired) blockedReason = 'CONSENT_REQUIRED';
  else if (remaining < 1) blockedReason = 'QUOTA_EXHAUSTED';
  else if (!statusOk || !hasChange) blockedReason = 'NO_CHANGES';
  else if (!limits.allowed) blockedReason = 'COOLDOWN';
  return {
    sceneId: scene.id,
    owner: access.householdId !== null ? 'HOUSEHOLD' : 'OWNER',
    status: derived.status,
    imageTag: scene.image?.id ?? null,
    pending,
    quota: { max: svc.quotaMax, remaining, window, resetsAt: windowResetsAt(window, svc.utcOffsetMinutes) },
    pets: { shown: live.shown, total: live.total, maxPets: svc.maxPets },
    actions: {
      canUpdate: blockedReason === null,
      canRegenerate: roleOk && remaining >= 1 && !consentRequired && derived.status !== 'generating',
      canUploadHouseholdPhoto: access.householdId !== null && canManageHouseholdPhoto(access.role),
      blockedReason,
    },
    consent: { required: consentRequired, noticeVersion: svc.noticeVersion, providerId: svc.providerId, householdPhotoGranted, petPhotosGranted },
    lastError: derived.status === 'failed' ? derived.lastError : null,
    stale: scene.image !== null && derived.status !== 'ready',
    updatedAt: scene.updatedAt,
  };
}

/** `getHouseholdScene` / `getOwnerScene` (REQ-ESC6-003, REQ-ESC6-019, SC-ESC6-093). */
export class GetSceneUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, target: SceneTarget): Promise<SceneView> {
    const { deps } = this;
    requireScene(deps);
    return deps.uow.runInTransaction(async (r) => {
      const access = await resolveSceneAccess(r, userId, target);
      const now = deps.clock.nowIsoTimestamp();
      const window = quotaWindowOf(deps.clock.todayIsoDate());
      let scene = await findSceneOf(r, access);
      if (scene === null) {
        const fresh: SceneRecord = {
          id: deps.ids.nextId(), householdId: access.householdId, ownerUserId: access.ownerUserId, runState: null, currentAttemptId: null, leaseExpiresAt: null,
          image: null, imageDegraded: false, consumedGenerations: 0, quotaWindow: window, createdAt: now, updatedAt: now,
        };
        await r.scenes.insert(fresh);
        scene = (await findSceneOf(r, access)) ?? fresh;
      }
      let reading = await readScene(deps, r, access, scene, now, window);
      if (reading.derived.leaseExpired) {
        await r.scenes.lockScene(scene.id);
        const expired = await r.scenes.expireLease(scene.id, now);
        if (expired !== null) await r.mediaQueue.enqueue(sceneImageObjectKey(scene.id, expired.resultObjectId), 'DELETE', now);
        scene = (await findSceneOf(r, access)) ?? scene;
        reading = await readScene(deps, r, access, scene, now, window);
      }
      return buildView(deps, r, userId, access, reading);
    });
  }
}

const SCENE_IMAGE_FILENAME = 'escena.png';

/**
 * `getHouseholdSceneImage` / `getOwnerSceneImage` (REQ-ESC6-019, INV-ESC6-019, SC-ESC6-081): resuelve SIEMPRE la imagen vigente de la escena autorizada (la clave sale
 * del registro, nunca de parámetros); `v` es solo una etiqueta de caché y un valor distinto o antiguo se ignora. Sin acceso o sin imagen: 404 sin escribir nada.
 */
export class GetSceneImageUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, target: SceneTarget, _v: string | undefined): Promise<MediaReadUrl & { readonly mime: string }> {
    const { deps } = this;
    const media = requireMedia(deps);
    requireScene(deps);
    const found = await deps.uow.runInTransaction(async (r) => {
      const access = await resolveSceneAccess(r, userId, target);
      const scene = await findSceneOf(r, access);
      if (scene === null || scene.image === null) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
      return { key: sceneImageObjectKey(scene.id, scene.image.id), mime: scene.image.mime };
    });
    const access = await media.storage.createReadUrl({ key: found.key, contentType: found.mime, filename: found.mime === 'image/webp' ? 'escena.webp' : SCENE_IMAGE_FILENAME, ttlSeconds: media.limits.signedUrlTtlSeconds });
    return { ...access, mime: found.mime };
  }
}

/** Clave de objeto de la foto del hogar para la lectura autorizada (la usa `getHouseholdPhoto`, T857). */
export const householdPhotoKeyOf = householdPhotoObjectKey;
