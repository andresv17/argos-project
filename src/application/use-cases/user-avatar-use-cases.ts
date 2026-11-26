/**
 * Foto de perfil de la cuenta (feature 011, Bloque I, `#78`, T1556; D11-13 = C; REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001; anexo `user-avatar-annex.md`): `PUT`, `GET` (proxy
 * autenticado de la misma origen), `GET /meta` y `DELETE` de `/account/avatar`. SOLO la propia cuenta: el id de usuario sale de la sesión, ninguna operación recibe el de otra persona.
 *
 * `PUT` sigue el protocolo del avatar de la mascota: validación pura (tamaño -> firma -> dimensiones cuadradas 64..1024 -> saneado por lista blanca sobre los bytes, decisión de Neo 2A),
 * intención previa (`INTENT`) -> `put` fuera de toda transacción -> transacción final con el candado del usuario (`SELECT ... FOR UPDATE`) y `UPDATE users SET avatar_version = avatar_version + 1,
 * avatar_object_id = :nuevo`; la clave anterior pasa a la cola con `DELETE` en la misma transacción. Si el usuario ya no existe (carrera con la eliminación de la cuenta, Trinity H-9) el objeto
 * se descarta: no queda huérfano. `DELETE` solo pone `avatar_object_id = NULL` (la versión no baja) y es idempotente. Solo se guarda la versión saneada; la clave nunca sale en una respuesta.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, SC-011-057, SC-011-058, SC-011-059, SC-011-060, SC-011-061, SC-011-062, EDGE-011-007, INV-ARC-001, INV-GCS-002
 */

import { sanitizeUserAvatar, userAvatarMimeOf } from '../../domain/images/user-avatar-image.ts';
import { userAvatarObjectKey } from '../../domain/media/index.ts';
import { DomainError } from '../../generated/v37/index.ts';
import { mapStorageError, purgeObjects, requireMedia } from './media-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** `{avatarVersion}` de la API: `avatar_version` si hay foto y `null` en otro caso. */
export interface UserAvatarMeta {
  readonly avatarVersion: number | null;
}

/** @implements REQ-PRF11-001, SC-011-057, SC-011-061, SC-011-062, INV-GCS-002 */
export class PutUserAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, bytes: Uint8Array): Promise<{ readonly avatarVersion: number }> {
    const media = requireMedia(this.deps);
    const { deps } = this;

    // 1. Validación pura (413, 415, 422) y saneado: nada se persiste ni se encola ante un rechazo.
    const verdict = sanitizeUserAvatar(bytes);
    if (!verdict.ok) {
      throw verdict.reason === 'TOO_LARGE'
        ? new DomainError('ERR-MEDIA-TOO-LARGE')
        : verdict.reason === 'TYPE'
          ? new DomainError('ERR-MEDIA-TYPE-NOT-ALLOWED')
          : new DomainError('ERR-PRF11-AVATAR-INVALID-IMAGE');
    }

    // 2. Existencia de la cuenta e intención previa (transacción corta).
    const prepared = await deps.uow.runInTransaction(async (r) => {
      if ((await r.users.findAvatar(userId)) === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      const objectId = deps.ids.nextId();
      const key = userAvatarObjectKey(userId, objectId);
      await r.mediaQueue.enqueue(key, 'INTENT', deps.clock.nowIsoTimestamp());
      return { objectId, key };
    });

    // 3. El objeto (solo lo saneado) sube fuera de toda transacción.
    try {
      await media.storage.put(prepared.key, verdict.bytes, verdict.mime);
    } catch (error) {
      throw mapStorageError(error);
    }

    // 4. Transacción final: candado del usuario, versión +1 y cola de la clave anterior.
    let previousKey: string | null = null;
    try {
      const version = await deps.uow.runInTransaction(async (r) => {
        // Carrera con la eliminación de la cuenta (H-9): sin fila de usuario no se publica nada.
        if ((await r.users.findByIdForUpdate(userId)) === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
        const previous = await r.users.findAvatar(userId);
        const next = await r.users.replaceAvatar(userId, prepared.objectId);
        previousKey = previous?.objectId == null ? null : userAvatarObjectKey(userId, previous.objectId);
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

export interface UserAvatarImage {
  readonly bytes: Uint8Array;
  /** Derivado de la firma de los bytes guardados, nunca del tipo almacenado (Trinity H-5). */
  readonly contentType: string;
  /** `v` igual a la versión vigente: la respuesta lleva `private, max-age=300` (decisión de Neo 1A); en otro caso `private, no-cache`. */
  readonly cacheable: boolean;
}

function parseVersion(value: unknown): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === 'string' && /^[0-9]{1,9}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'v debe ser un entero mayor o igual que 1.', 'v');
  return parsed;
}

/** @implements REQ-PRF11-001, REQ-PRF11-002, SC-011-057, SC-011-058, EDGE-011-007 */
export class GetUserAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `version` es el valor crudo de `?v=`: ausente es válido; presente debe ser un entero >= 1. Sin foto u objeto ausente: 404 de catálogo (la interfaz cae a iniciales). */
  async execute(userId: string, version: unknown): Promise<UserAvatarImage> {
    const media = requireMedia(this.deps);
    const requested = parseVersion(version);
    const state = await this.deps.uow.runInTransaction((r) => r.users.findAvatar(userId));
    if (state === null || state.objectId === null) throw new DomainError('ERR-PRF11-AVATAR-NOT-FOUND');
    let object;
    try {
      object = await media.storage.get(userAvatarObjectKey(userId, state.objectId));
    } catch (error) {
      throw mapStorageError(error);
    }
    if (object === null) throw new DomainError('ERR-PRF11-AVATAR-NOT-FOUND');
    const mime = userAvatarMimeOf(object.bytes);
    if (mime === null) throw new DomainError('ERR-PRF11-AVATAR-NOT-FOUND');
    return { bytes: object.bytes, contentType: mime, cacheable: requested === state.version };
  }
}

/** @implements REQ-PRF11-001, SC-011-057, SC-011-058 */
export class GetUserAvatarMetaUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<UserAvatarMeta> {
    const state = await this.deps.uow.runInTransaction((r) => r.users.findAvatar(userId));
    return { avatarVersion: state === null || state.objectId === null ? null : state.version };
  }
}

/** @implements REQ-PRF11-001, SC-011-057, INV-GCS-002 */
export class DeleteUserAvatarUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string): Promise<void> {
    const { deps } = this;
    const key = await deps.uow.runInTransaction(async (r) => {
      if ((await r.users.findByIdForUpdate(userId)) === null) return null;
      const current = await r.users.findAvatar(userId);
      if (current === null || current.objectId === null) return null;
      const objectKey = userAvatarObjectKey(userId, current.objectId);
      await r.mediaQueue.enqueue(objectKey, 'DELETE', deps.clock.nowIsoTimestamp());
      await r.users.clearAvatar(userId);
      return objectKey;
    });
    if (key !== null) await purgeObjects(deps, [key]);
  }
}
