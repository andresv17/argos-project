/**
 * Avatar de la mascota (feature 004, T584): `PUT`, `GET` (proxy autenticado de la misma origen) y `DELETE` de `/pets/{petId}/avatar`
 * (REQ-AVA-001, INV-AVA-001, REQ-GCS-004, REQ-GCS-006, INV-ARC-001).
 *
 * `PUT` sigue el flujo de la subida de archivos (intención previa → `put` → transacción final con candado de mascota y permiso re-verificado) pero el
 * resultado es `UPDATE pets SET avatar_version = avatar_version + 1, avatar_object_id = :nuevo`; la clave anterior (si existía) entra en la cola con
 * `DELETE` en la misma transacción. Cada versión es un objeto nuevo (`pets/{petId}/avatar/{uuid}`): una clave nunca se reutiliza. El avatar no cuenta
 * para la cuota. Los permisos son los de «Editar datos básicos» (`EDIT_PET_BASICS`); ver el avatar es `READ_MEDIA`.
 * `DELETE` solo pone `avatar_object_id = NULL` (la versión no baja ni se reinicia) y es idempotente: sin avatar no hace nada.
 *
 * @implements REQ-AVA-001, INV-AVA-001, REQ-GCS-004, REQ-GCS-006, INV-ARC-001, INV-GCS-002, REQ-BOR-005
 */

import { AVATAR_MAX_BYTES, avatarObjectKey, detectMediaType, isAvatarMime } from '../../domain/media/index.ts';
import { DomainError as DomainErrorV31, type AvatarVersionResult } from '../../generated/v31/index.ts';
import { mapStorageError, purgeObjects, requireMedia } from './media-use-cases.ts';
import { lockPet, requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/** @implements REQ-AVA-001, REQ-GCS-006, INV-AVA-001, INV-ARC-001 */
export class PutAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, bytes: Uint8Array): Promise<AvatarVersionResult> {
    const media = requireMedia(this.deps);
    const { deps } = this;

    // 1. Acceso (`EDIT_PET_BASICS`), tamaño, firma e intención previa.
    const prepared = await deps.uow.runInTransaction(async (r) => {
      await requirePetAction(r, userId, petId, 'EDIT_PET_BASICS');
      if (bytes.length > AVATAR_MAX_BYTES) throw new DomainErrorV31('ERR-MEDIA-TOO-LARGE');
      const detection = detectMediaType(bytes);
      if (!detection.ok || !isAvatarMime(detection.mime)) throw new DomainErrorV31('ERR-MEDIA-TYPE-NOT-ALLOWED');
      const objectId = deps.ids.nextId();
      const key = avatarObjectKey(petId, objectId);
      await r.mediaQueue.enqueue(key, 'INTENT', deps.clock.nowIsoTimestamp());
      return { objectId, key, mime: detection.mime };
    });

    // 2. El objeto sube fuera de toda transacción.
    try {
      await media.storage.put(prepared.key, bytes, prepared.mime);
    } catch (error) {
      throw mapStorageError(error);
    }

    // 3. Transacción final: candado de mascota, permiso re-verificado, versión +1 y cola de la clave anterior.
    let previousKey: string | null = null;
    try {
      const version = await deps.uow.runInTransaction(async (r) => {
        await lockPet(r, petId);
        await requirePetAction(r, userId, petId, 'EDIT_PET_BASICS');
        const previous = await r.pets.findAvatar(petId);
        const next = await r.pets.replaceAvatar(petId, prepared.objectId);
        previousKey = previous?.objectId == null ? null : avatarObjectKey(petId, previous.objectId);
        if (previousKey !== null) await r.mediaQueue.enqueue(previousKey, 'DELETE', deps.clock.nowIsoTimestamp());
        await r.mediaQueue.remove(prepared.key);
        return next.version;
      });
      if (previousKey !== null) await purgeObjects(deps, [previousKey]);
      return { avatarVersion: version };
    } catch (error) {
      try {
        await deps.uow.runInTransaction((r) => r.mediaQueue.enqueue(prepared.key, 'DELETE', deps.clock.nowIsoTimestamp()));
        await purgeObjects(deps, [prepared.key]);
      } catch {
        // la fila INTENT sigue; el mantenimiento la convierte en DELETE tras 1 h
      }
      throw error;
    }
  }
}

export interface AvatarImage {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /** `v` igual a la versión actual: la respuesta puede cachearse como inmutable (REQ-AVA-001). */
  readonly immutable: boolean;
}

/** @implements REQ-AVA-001, INV-AVA-001, REQ-ARC-002 */
export class GetAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `version` es el valor crudo de `?v=`: ausente es válido; presente debe ser un entero >= 1. */
  async execute(userId: string, petId: string, version: unknown): Promise<AvatarImage> {
    const media = requireMedia(this.deps);
    const requested = parseVersion(version);
    const state = await this.deps.uow.runInTransaction(async (r) => {
      await requirePetAction(r, userId, petId, 'READ_MEDIA');
      return r.pets.findAvatar(petId);
    });
    if (state === null || state.objectId === null) throw new DomainErrorV31('ERR-MEDIA-NOT-FOUND');
    let object;
    try {
      object = await media.storage.get(avatarObjectKey(petId, state.objectId));
    } catch (error) {
      throw mapStorageError(error);
    }
    if (object === null) throw new DomainErrorV31('ERR-MEDIA-NOT-FOUND');
    return { bytes: object.bytes, contentType: object.contentType, immutable: requested === state.version };
  }
}

function parseVersion(value: unknown): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === 'string' && /^[0-9]{1,9}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) throw new DomainErrorV31('ERR-SCHEMA-VALIDATION-FAILED', 'v debe ser un entero mayor o igual que 1.', 'v');
  return parsed;
}

/** @implements REQ-AVA-001, REQ-GCS-004, INV-AVA-001, INV-GCS-002 */
export class DeleteAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<void> {
    const { deps } = this;
    const key = await deps.uow.runInTransaction(async (r) => {
      await lockPet(r, petId);
      await requirePetAction(r, userId, petId, 'EDIT_PET_BASICS');
      const current = await r.pets.findAvatar(petId);
      if (current === null || current.objectId === null) return null;
      const objectKey = avatarObjectKey(petId, current.objectId);
      await r.mediaQueue.enqueue(objectKey, 'DELETE', deps.clock.nowIsoTimestamp());
      await r.pets.clearAvatar(petId);
      return objectKey;
    });
    if (key !== null) await purgeObjects(deps, [key]);
  }
}
