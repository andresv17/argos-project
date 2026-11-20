/**
 * Foto de referencia del hogar (feature 006, T860): `putHouseholdPhoto`, `deleteHouseholdPhoto` y `getHouseholdPhoto` (REQ-ESC6-001, REQ-ESC6-018, REQ-ESC6-020,
 * REQ-ESC6-027). Misma validación que REQ-ARC-001: tipo por contenido (JPEG, PNG o WebP; SVG, PDF y HTML se rechazan), tope de bytes de `ARGOS_MEDIA_MAX_BYTES` y,
 * además, los límites de megapíxeles y lado de REQ-ESC6-027; todo ANTES de almacenar. Solo el propietario del hogar y `ADMIN` suben, reemplazan o borran
 * (`READER` y `CAREGIVER`: 403 tras el 404). Protocolo de la 004: fila `INTENT` + `put` fuera de toda transacción + transacción final que repite permisos y cuota,
 * escribe la fila, encola la foto anterior con `DELETE` y retira el `INTENT`. El borrado encola dentro de la transacción y purga tras el COMMIT; es idempotente.
 * La clave sale de `IdGeneratorPort` y nunca contiene el nombre del archivo (INV-ESC6-009). Reemplazar o borrar cambia la huella: la escena queda `outdated` por
 * derivación (sin ganchos de estado, H-MIF-006-01).
 *
 * @implements REQ-ESC6-001, REQ-ESC6-018, REQ-ESC6-020, REQ-ESC6-027, REQ-ESC6-029, INV-ESC6-007, INV-ESC6-009, EDGE-ESC6-012, EDGE-ESC6-013, SC-ESC6-004, SC-ESC6-019, SC-ESC6-028, SC-ESC6-052, SC-ESC6-064
 */

import { detectMediaType, isAllowedForKind } from '../../domain/media/index.ts';
import { householdPhotoObjectKey } from '../../domain/media/media-keys.ts';
import { canManageHouseholdPhoto } from '../../domain/scene/scene-policy.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV31 } from '../../generated/v31/index.ts';
import type { HouseholdPhotoView } from '../../generated/v34/schemas/types.ts';
import type { MediaReadUrl } from '../ports/media-storage.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { HouseholdPhotoRecord } from '../ports/scene-repositories.port.ts';
import { mapStorageError, purgeObjects, requireMedia } from './media-use-cases.ts';
import { opaqueRef, recordSceneAudit } from './scene-audit.ts';
import { requireScene, resolveSceneAccess } from './scene-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

const toView = (photo: HouseholdPhotoRecord): HouseholdPhotoView => ({ tag: photo.objectId, mime: photo.mime, sizeBytes: photo.sizeBytes, createdAt: photo.createdAt });

/** Autoriza (404 antes que 403) y exige poder gestionar la foto del hogar. */
async function requireManager(r: RepositorySet, userId: string, householdId: string) {
  const access = await resolveSceneAccess(r, userId, { kind: 'HOUSEHOLD', householdId });
  if (!canManageHouseholdPhoto(access.role)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  return access;
}

/** Cuota de 1 GiB del propietario del hogar tras sustituir la foto actual por una de `size` bytes. */
async function assertQuota(r: RepositorySet, householdId: string, size: number, max: number): Promise<void> {
  const household = await r.households.findById(householdId);
  const current = await r.scenes.findHouseholdPhoto(householdId);
  if (household === null) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
  if ((await r.media.countBytesOfOwner(household.ownerUserId)) - (current?.sizeBytes ?? 0) + size > max) throw new DomainErrorV31('ERR-MEDIA-QUOTA-EXCEEDED');
}

/** @implements REQ-ESC6-001, REQ-ESC6-018, REQ-ESC6-020, REQ-ESC6-027, INV-ESC6-009 */
export class PutHouseholdPhotoUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, bytes: Uint8Array): Promise<HouseholdPhotoView> {
    const { deps } = this;
    const media = requireMedia(deps);
    const svc = requireScene(deps);
    const size = bytes.length;
    const prepared = await deps.uow.runInTransaction(async (r) => {
      await requireManager(r, userId, householdId);
      if (size > media.limits.maxBytes) throw new DomainErrorV31('ERR-MEDIA-TOO-LARGE');
      const detection = detectMediaType(bytes);
      if (!detection.ok || !isAllowedForKind(detection.mime, 'PHOTO') || !svc.images.withinLimits(detection.mime, bytes)) throw new DomainErrorV31('ERR-MEDIA-TYPE-NOT-ALLOWED');
      await assertQuota(r, householdId, size, media.limits.maxBytesPerOwner);
      const objectId = deps.ids.nextId();
      const key = householdPhotoObjectKey(householdId, objectId);
      await r.mediaQueue.enqueue(key, 'INTENT', deps.clock.nowIsoTimestamp());
      return { objectId, key, mime: detection.mime };
    });
    try {
      await media.storage.put(prepared.key, bytes, prepared.mime);
    } catch (error) {
      throw mapStorageError(error);
    }
    try {
      const { view, previousKey } = await deps.uow.runInTransaction(async (r) => {
        await requireManager(r, userId, householdId);
        await assertQuota(r, householdId, size, media.limits.maxBytesPerOwner);
        const now = deps.clock.nowIsoTimestamp();
        const previous = await r.scenes.findHouseholdPhoto(householdId);
        const record: HouseholdPhotoRecord = {
          householdId, objectId: prepared.objectId, mime: prepared.mime as HouseholdPhotoRecord['mime'], sizeBytes: size, uploadedByUserId: userId, createdAt: now,
        };
        await r.scenes.putHouseholdPhoto(record);
        const old = previous === null ? null : householdPhotoObjectKey(householdId, previous.objectId);
        if (old !== null) await r.mediaQueue.enqueue(old, 'DELETE', now);
        await r.mediaQueue.remove(prepared.key);
        await recordSceneAudit(this.deps, r, {
          executorUserId: userId, mutationType: previous === null ? 'CREATE' : 'UPDATE', entityType: 'HOUSEHOLD_PHOTO', entityId: opaqueRef(this.deps, householdId), event: 'HOUSEHOLD_PHOTO_CHANGED',
          detail: { householdRef: opaqueRef(this.deps, householdId), change: previous === null ? 'CREATED' : 'REPLACED' },
        });
        return { view: toView(record), previousKey: old };
      });
      if (previousKey !== null) await purgeObjects(deps, [previousKey]);
      return view;
    } catch (error) {
      await this.discard(prepared.key);
      throw error;
    }
  }

  /** Fallo posterior al `put`: la clave pasa a `DELETE` y se borra de inmediato; si algo falla queda en la cola (EDGE-ESC6-021). */
  private async discard(key: string): Promise<void> {
    try {
      await this.deps.uow.runInTransaction((r) => r.mediaQueue.enqueue(key, 'DELETE', this.deps.clock.nowIsoTimestamp()));
    } catch {
      return;
    }
    await purgeObjects(this.deps, [key]);
  }
}

/** @implements REQ-ESC6-001, REQ-ESC6-020, REQ-ESC6-029 */
export class DeleteHouseholdPhotoUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Idempotente: sin foto no escribe nada (204). */
  async execute(userId: string, householdId: string): Promise<void> {
    const { deps } = this;
    requireMedia(deps);
    const key = await deps.uow.runInTransaction(async (r) => {
      await requireManager(r, userId, householdId);
      const photo = await r.scenes.findHouseholdPhoto(householdId);
      if (photo === null) return null;
      const objectKey = householdPhotoObjectKey(householdId, photo.objectId);
      await r.mediaQueue.enqueue(objectKey, 'DELETE', deps.clock.nowIsoTimestamp());
      await r.scenes.deleteHouseholdPhoto(householdId);
      await recordSceneAudit(deps, r, {
        executorUserId: userId, mutationType: 'DELETE', entityType: 'HOUSEHOLD_PHOTO', entityId: opaqueRef(deps, householdId), event: 'HOUSEHOLD_PHOTO_CHANGED',
        detail: { householdRef: opaqueRef(deps, householdId), change: 'DELETED' },
      });
      return objectKey;
    });
    if (key !== null) await purgeObjects(deps, [key]);
  }
}

/** URL firmada de la foto del hogar para cualquier miembro ACTIVE; la clave sale del registro (INV-ESC6-019). */
export class GetHouseholdPhotoUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string): Promise<MediaReadUrl & { readonly mime: string }> {
    const { deps } = this;
    const media = requireMedia(deps);
    const found = await deps.uow.runInTransaction(async (r) => {
      await resolveSceneAccess(r, userId, { kind: 'HOUSEHOLD', householdId });
      const photo = await r.scenes.findHouseholdPhoto(householdId);
      if (photo === null) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
      return { key: householdPhotoObjectKey(householdId, photo.objectId), mime: photo.mime };
    });
    const ext = found.mime === 'image/png' ? 'png' : found.mime === 'image/webp' ? 'webp' : 'jpg';
    const access = await media.storage.createReadUrl({ key: found.key, contentType: found.mime, filename: `hogar.${ext}`, ttlSeconds: media.limits.signedUrlTtlSeconds });
    return { ...access, mime: found.mime };
  }
}
