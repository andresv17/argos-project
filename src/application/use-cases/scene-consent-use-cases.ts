/**
 * Consentimiento de la escena (feature 006, T860): `getSceneNotice`, `grantSceneConsent` y `revokeSceneConsent` (REQ-ESC6-023, REQ-ESC6-024, REQ-ESC6-025,
 * REQ-ESC6-026, REQ-ESC6-030; INV-ESC6-014). El consentimiento es del USUARIO, por ámbito (`HOUSEHOLD_PHOTO`, `PET_PHOTOS`), versión del aviso y proveedor; el texto
 * del aviso vive en el cliente y el servidor solo conoce `noticeVersion` y `providerId`. Una versión o un proveedor que no son los vigentes es `409
 * ERR-SCENE-NOTICE-OUTDATED` y no escribe nada; consentir es idempotente. Retirar fija `revokedAt`, retira y purga DE INMEDIATO la imagen cuyas fuentes incluyen al
 * usuario y la foto del hogar que subió, y cancela los intentos en vuelo que contienen sus datos (su objeto resultante pasa a `DELETE`); es idempotente y no toca
 * nada ajeno (D6-17). Todo se encola en la transacción y se purga tras el COMMIT. Los datos ya enviados al proveedor no se recuperan (RR-06-11).
 *
 * @implements REQ-ESC6-023, REQ-ESC6-024, REQ-ESC6-025, REQ-ESC6-026, REQ-ESC6-030, INV-ESC6-014, INV-ESC6-016, EDGE-ESC6-018, EDGE-ESC6-019, EDGE-ESC6-020, EDGE-ESC6-025, ERR-SCENE-NOTICE-OUTDATED, SC-ESC6-035, SC-ESC6-036, SC-ESC6-037, SC-ESC6-038, SC-ESC6-039, SC-ESC6-096
 */

import { householdPhotoObjectKey, sceneImageObjectKey } from '../../domain/media/media-keys.ts';
import { parseInputsSnapshot } from '../../domain/scene/inputs-snapshot.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../generated/v34/index.ts';
import type { ConsentScope, SceneConsentState, SceneNotice } from '../../generated/v34/schemas/types.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { SceneConsentRecord, SceneRecord } from '../ports/scene-repositories.port.ts';
import { purgeObjects } from './media-use-cases.ts';
import { opaqueRef, recordSceneAudit } from './scene-audit.ts';
import { currentNoticeVersion, currentProviderId, hasActiveConsent, requireScene } from './scene-use-cases.ts';
import type { ApplicationDeps, SceneServices } from './use-case-support.ts';

const SCOPES: readonly ConsentScope[] = ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'];

async function consentState(r: RepositorySet, svc: SceneServices, userId: string): Promise<SceneConsentState> {
  const noticeVersion = await currentNoticeVersion(svc);
  const providerId = await currentProviderId(svc);
  const householdPhotoGranted = await hasActiveConsent(r, svc, userId, 'HOUSEHOLD_PHOTO');
  const petPhotosGranted = await hasActiveConsent(r, svc, userId, 'PET_PHOTOS');
  return { required: svc.realDriver && !householdPhotoGranted && !petPhotosGranted, noticeVersion, providerId, householdPhotoGranted, petPhotosGranted };
}

const invalid = (detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, 'scopes');

/** `getSceneNotice` (REQ-ESC6-026): versión vigente del aviso, proveedor y ámbitos; el texto lo sirve el cliente. */
export class GetSceneNoticeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<SceneNotice> {
    const svc = requireScene(this.deps);
    return { noticeVersion: await currentNoticeVersion(svc), providerId: await currentProviderId(svc), scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] };
  }
}

/** @implements REQ-ESC6-023, REQ-ESC6-024, EDGE-ESC6-018, ERR-SCENE-NOTICE-OUTDATED */
export class GrantSceneConsentUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, input: unknown): Promise<SceneConsentState> {
    const { deps } = this;
    const svc = requireScene(deps);
    const noticeVersion = await currentNoticeVersion(svc);
    const providerId = await currentProviderId(svc);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw invalid('El cuerpo debe ser un objeto.');
    const body = input as Record<string, unknown>;
    const scopes = body['scopes'];
    if (Object.keys(body).some((k) => !['noticeVersion', 'providerId', 'scopes'].includes(k)) || typeof body['noticeVersion'] !== 'string' || typeof body['providerId'] !== 'string') {
      throw invalid('Se esperan noticeVersion, providerId y scopes.');
    }
    if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 2 || new Set(scopes).size !== scopes.length || scopes.some((s) => !SCOPES.includes(s as ConsentScope))) {
      throw invalid('scopes debe tener 1 o 2 ámbitos distintos.');
    }
    if (body['noticeVersion'] !== noticeVersion || body['providerId'] !== providerId) throw new DomainErrorV34('ERR-SCENE-NOTICE-OUTDATED');
    return deps.uow.runInTransaction(async (r) => {
      const now = deps.clock.nowIsoTimestamp();
      const created: ConsentScope[] = [];
      for (const scope of scopes as ConsentScope[]) {
        if ((await r.sceneConsents.findActive(userId, scope, providerId, noticeVersion)) !== null) continue;
        const record: SceneConsentRecord = { id: deps.ids.nextId(), userId, scope, providerId, noticeVersion, grantedAt: now, revokedAt: null };
        await r.sceneConsents.grant(record);
        created.push(scope);
      }
      if (created.length > 0) {
        await recordSceneAudit(deps, r, {
          executorUserId: userId, mutationType: 'CREATE', entityType: 'SCENE_CONSENT', entityId: opaqueRef(deps, userId), event: 'SCENE_CONSENT_GRANTED',
          detail: { actorRef: opaqueRef(deps, userId), scopes: [...created].sort(), noticeVersion, providerId },
        });
      }
      return consentState(r, svc, userId);
    });
  }
}

/** @implements REQ-ESC6-025, REQ-ESC6-030, INV-ESC6-016, EDGE-ESC6-020, EDGE-ESC6-025, SC-ESC6-039 */
export class RevokeSceneConsentUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<SceneConsentState> {
    const { deps } = this;
    const svc = requireScene(deps);
    const noticeVersion = await currentNoticeVersion(svc);
    const providerId = await currentProviderId(svc);
    const outcome = await deps.uow.runInTransaction(async (r) => {
      const now = deps.clock.nowIsoTimestamp();
      const revoked: ConsentScope[] = [];
      for (const scope of SCOPES) {
        const active = await r.sceneConsents.findActive(userId, scope, providerId, noticeVersion);
        if (active !== null && (await r.sceneConsents.revoke(active.id, now))) revoked.push(scope);
      }
      const latest = await r.sceneConsents.findByUserId(userId);
      if (latest !== null && latest.revokedAt === null && (await r.sceneConsents.revoke(latest.id, now)) && !revoked.includes(latest.scope)) revoked.push(latest.scope);
      if (revoked.length > 0) {
        await recordSceneAudit(deps, r, {
          executorUserId: userId, mutationType: 'UPDATE', entityType: 'SCENE_CONSENT', entityId: opaqueRef(deps, userId), event: 'SCENE_CONSENT_REVOKED',
          detail: { actorRef: opaqueRef(deps, userId), scopes: [...revoked].sort(), noticeVersion, providerId },
        });
      }

      const keys: string[] = [];
      const scenes = new Map<string, SceneRecord>();
      // La foto del hogar que subió el usuario se borra aunque el hogar aún no tenga escena.
      const removedPhotos = new Map<string, string>();
      for (const membership of (await r.households.listMembershipsOfUsers([userId])).filter((m) => m.status === 'ACTIVE')) {
        const photo = await r.scenes.findHouseholdPhoto(membership.householdId);
        if (photo !== null && photo.uploadedByUserId === userId) {
          const key = householdPhotoObjectKey(membership.householdId, photo.objectId);
          await r.mediaQueue.enqueue(key, 'DELETE', now);
          await r.scenes.deleteHouseholdPhoto(membership.householdId);
          removedPhotos.set(membership.householdId, photo.objectId);
          keys.push(key);
        }
        const scene = await r.scenes.findByHouseholdId(membership.householdId);
        if (scene !== null) scenes.set(scene.id, scene);
      }
      const own = await r.scenes.findByOwnerUserId(userId);
      if (own !== null) scenes.set(own.id, own);
      const ownedPets = new Set((await r.pets.listByOwners([userId])).map((p) => p.id));

      for (const found of scenes.values()) {
        await r.scenes.lockScene(found.id);
        const scene = (await r.scenes.findById(found.id)) ?? found;
        const removedPhoto = scene.householdId === null ? null : (removedPhotos.get(scene.householdId) ?? null);
        if (scene.image !== null && (await r.scenes.findImageSources(scene.id)).includes(userId)) {
          const imageId = await r.scenes.retireImage(scene.id, now);
          if (imageId !== null) {
            const key = sceneImageObjectKey(scene.id, imageId);
            await r.mediaQueue.enqueue(key, 'DELETE', now);
            keys.push(key);
          }
        }
        if (scene.runState === 'generating' && scene.currentAttemptId !== null) {
          const attempt = await r.scenes.findAttemptById(scene.currentAttemptId);
          const snapshot = attempt === null ? null : parseInputsSnapshot(attempt.inputsSnapshot);
          const involved = attempt !== null && (attempt.actorUserId === userId || (snapshot !== null && (snapshot.pets.some((p) => ownedPets.has(p.id)) || (removedPhoto !== null && snapshot.household === removedPhoto))));
          if (involved) {
            const cancelled = await r.scenes.cancelInFlight(scene.id, now);
            if (cancelled !== null) {
              const key = sceneImageObjectKey(scene.id, cancelled.resultObjectId);
              await r.mediaQueue.enqueue(key, 'DELETE', now);
              keys.push(key);
            }
          }
        }
      }
      return { keys, state: await consentState(r, svc, userId) };
    });
    await purgeObjects(deps, outcome.keys, { keepRowIfAbsent: true });
    return outcome.state;
  }
}
