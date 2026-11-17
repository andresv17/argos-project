/**
 * Casos de uso de medios de la mascota (feature 004): subida, listado paginado, acceso por URL firmada y borrado (REQ-ARC-001, REQ-ARC-002,
 * REQ-ARC-003, REQ-ARC-005, REQ-ALB-001, REQ-GCS-004, REQ-GCS-006, INV-ARC-001..004, INV-GCS-002).
 *
 * Subida (data-model.md §3): (1) transacción corta con acceso `WRITE_MEDIA` (404 antes que 403), validación en orden (tipo de `kind`, tamaño,
 * firma, tipo permitido para `kind`, cuota previa) e inserción de la fila `INTENT` de la clave; (2) `put` fuera de toda transacción;
 * (3) transacción final con los candados propietario → mascota (REQ-BOR-005), permiso y cuota re-verificados, `pet_media`, auditoría `PET_MEDIA`
 * y retiro de la fila `INTENT`. Cualquier fallo de la transacción final cambia la fila a `DELETE` y borra el objeto de inmediato (EDGE-011).
 * Un fallo del `put` o un corte del proceso deja la fila `INTENT`, que el mantenimiento convierte en `DELETE` tras 1 h (EDGE-012).
 *
 * Borrado: la clave entra en la cola con `DELETE` en la misma transacción que borra la fila; tras el `COMMIT` se borra el objeto y la fila de la cola
 * y cualquier fallo del almacenamiento queda en la cola (`attempts + 1`) para el mantenimiento: el caso de uso no falla (204 siempre).
 *
 * @implements REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ARC-005, REQ-ALB-001, REQ-GCS-004, REQ-GCS-006, INV-ARC-001, INV-ARC-002, INV-ARC-003, INV-ARC-004, INV-ALB-001, INV-GCS-002, REQ-BOR-005
 */

import {
  MEDIA_PAGE_SIZE,
  canonicalMediaName,
  detectMediaType,
  isAllowedForKind,
  mediaObjectKey,
  neutralFilename,
  type MediaKind,
} from '../../domain/media/index.ts';
import { DomainError as DomainErrorV31, type MediaAccess, type MediaItem, type MediaPage } from '../../generated/v31/index.ts';
import { MediaStorageUnavailableError } from '../ports/media-storage.port.ts';
import type { PetMediaRecord } from '../ports/repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import { lockOwnerThenPet, lockPet, requirePetAction, type ApplicationDeps, type MediaServices } from './use-case-support.ts';

const unavailable = () => new DomainErrorV31('ERR-MEDIA-STORAGE-UNAVAILABLE');

/** Los medios no están conectados en la composición: falla cerrado con un error interno (nunca un comportamiento a medias). */
export function requireMedia(deps: ApplicationDeps): MediaServices {
  if (deps.media === undefined) throw new DomainErrorV31('ERR-INTERNAL-UNEXPECTED', 'El almacenamiento de medios no está configurado.');
  return deps.media;
}

/** Cualquier fallo del almacenamiento es ERR-MEDIA-STORAGE-UNAVAILABLE; un error de programación sigue siendo interno. */
export function mapStorageError(error: unknown): unknown {
  return error instanceof MediaStorageUnavailableError ? unavailable() : error;
}

/**
 * Borra los objetos tras el COMMIT y retira sus filas de la cola; un fallo suma un intento y deja la fila (REQ-GCS-004). Nunca lanza.
 * @implements REQ-GCS-004, INV-GCS-002
 */
export async function purgeObjects(deps: ApplicationDeps, keys: readonly string[]): Promise<void> {
  const media = deps.media;
  if (media === undefined) return;
  for (const key of keys) {
    try {
      await media.storage.delete(key);
      await deps.uow.runInTransaction((r) => r.mediaQueue.remove(key));
    } catch {
      try {
        await deps.uow.runInTransaction((r) => r.mediaQueue.recordFailure(key));
      } catch {
        // La fila queda como estaba: el mantenimiento la reintenta sin tope (REQ-GCS-004).
      }
    }
  }
}

function parseKind(value: unknown): MediaKind {
  if (value === 'FILE' || value === 'PHOTO') return value;
  throw new DomainErrorV31('ERR-SCHEMA-VALIDATION-FAILED', 'kind debe ser FILE o PHOTO.', 'kind');
}

const toItem = (media: PetMediaRecord): MediaItem => ({
  id: media.id,
  petId: media.petId,
  kind: media.kind,
  mime: media.mime as MediaItem['mime'],
  sizeBytes: media.sizeBytes,
  originalName: media.originalName,
  createdAt: media.createdAt,
});

export interface UploadMediaInput {
  /** Valor crudo de `?kind=`; el caso de uso lo valida. */
  readonly kind: unknown;
  /** Nombre original ya decodificado de `X-Argos-Filename`, o null si no vino. Solo texto de listado (INV-ARC-003). */
  readonly filename: string | null;
  readonly bytes: Uint8Array;
}

/** @implements REQ-ARC-001, REQ-ARC-002, REQ-ARC-005, REQ-GCS-006, INV-ARC-001, INV-ARC-002, INV-ARC-003, SC-ALM-026 */
export class UploadMediaUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, input: UploadMediaInput): Promise<MediaItem> {
    const media = requireMedia(this.deps);
    const { deps } = this;
    const size = input.bytes.length;

    // 1. Acceso, validación en orden, cuota previa e intención (transacción corta).
    const prepared = await deps.uow.runInTransaction(async (r) => {
      const { pet } = await requirePetAction(r, userId, petId, 'WRITE_MEDIA');
      const kind = parseKind(input.kind);
      if (size > media.limits.maxBytes) throw new DomainErrorV31('ERR-MEDIA-TOO-LARGE');
      const detection = detectMediaType(input.bytes);
      if (!detection.ok || !isAllowedForKind(detection.mime, kind)) throw new DomainErrorV31('ERR-MEDIA-TYPE-NOT-ALLOWED');
      if ((await r.media.countBytesOfOwner(pet.ownerUserId)) + size > media.limits.maxBytesPerOwner) throw new DomainErrorV31('ERR-MEDIA-QUOTA-EXCEEDED');
      const id = deps.ids.nextId();
      const key = mediaObjectKey(petId, kind, id);
      await r.mediaQueue.enqueue(key, 'INTENT', deps.clock.nowIsoTimestamp());
      return { id, key, kind, mime: detection.mime };
    });

    // 2. El objeto sube fuera de toda transacción. Un fallo deja la fila INTENT (el objeto puede existir en remoto).
    try {
      await media.storage.put(prepared.key, input.bytes, prepared.mime);
    } catch (error) {
      throw mapStorageError(error);
    }

    // 3. Transacción final: candados, permiso y cuota re-verificados.
    try {
      return await deps.uow.runInTransaction(async (r) => {
        await lockOwnerThenPet(r, petId);
        const { pet } = await requirePetAction(r, userId, petId, 'WRITE_MEDIA');
        if ((await r.media.countBytesOfOwner(pet.ownerUserId)) + size > media.limits.maxBytesPerOwner) throw new DomainErrorV31('ERR-MEDIA-QUOTA-EXCEEDED');
        const record: PetMediaRecord = {
          id: prepared.id,
          petId,
          kind: prepared.kind,
          mime: prepared.mime,
          sizeBytes: size,
          originalName: canonicalMediaName(input.filename ?? '', prepared.mime),
          createdAt: deps.clock.nowIsoTimestamp(),
        };
        await r.media.insert(record);
        const item = toItem(record);
        await recordAudit(deps, r, { executorUserId: userId, mutationType: 'CREATE', entityType: 'PET_MEDIA', entityId: item.id, previous: null, next: item });
        await r.mediaQueue.remove(prepared.key);
        return item;
      });
    } catch (error) {
      await this.discard(prepared.key);
      throw error;
    }
  }

  /** Fallo posterior al put: la clave pasa a `DELETE` y se borra de inmediato; si algo falla queda en la cola (EDGE-011). */
  private async discard(key: string): Promise<void> {
    try {
      await this.deps.uow.runInTransaction((r) => r.mediaQueue.enqueue(key, 'DELETE', this.deps.clock.nowIsoTimestamp()));
    } catch {
      return; // la fila INTENT sigue; el mantenimiento la convierte en DELETE tras 1 h
    }
    await purgeObjects(this.deps, [key]);
  }
}

/** @implements REQ-ALB-001, INV-ALB-001, REQ-ARC-002 */
export class ListMediaUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `kind` ausente lista ambos tipos; `page` ausente es 1; `page < 1` o no entero es ERR-SCHEMA-VALIDATION-FAILED. */
  async execute(userId: string, petId: string, query: { readonly kind?: unknown; readonly page?: unknown }): Promise<MediaPage> {
    return this.deps.uow.runInTransaction(async (r) => {
      await requirePetAction(r, userId, petId, 'READ_MEDIA');
      const kind = query.kind === undefined ? null : parseKind(query.kind);
      const page = parsePage(query.page);
      const result = await r.media.listPage(petId, kind, MEDIA_PAGE_SIZE, (page - 1) * MEDIA_PAGE_SIZE);
      return { items: result.items.map(toItem), page, pageSize: MEDIA_PAGE_SIZE, total: result.total };
    });
  }
}

function parsePage(value: unknown): number {
  if (value === undefined) return 1;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^[0-9]{1,9}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) throw new DomainErrorV31('ERR-SCHEMA-VALIDATION-FAILED', 'page debe ser un entero mayor o igual que 1.', 'page');
  return parsed;
}

/** @implements REQ-ARC-003, REQ-ARC-002, INV-ARC-004 */
export class GetMediaAccessUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, mediaId: string): Promise<MediaAccess> {
    const media = requireMedia(this.deps);
    const found = await this.deps.uow.runInTransaction(async (r) => {
      await requirePetAction(r, userId, petId, 'READ_MEDIA');
      const row = await r.media.findById(petId, mediaId);
      if (row === null) throw new DomainErrorV31('ERR-MEDIA-NOT-FOUND');
      return row;
    });
    try {
      const signed = await media.storage.createReadUrl({
        key: mediaObjectKey(petId, found.kind, found.id),
        contentType: found.mime,
        filename: neutralFilename(found.kind, found.mime as MediaItem['mime']),
        ttlSeconds: media.limits.signedUrlTtlSeconds,
      });
      return { url: signed.url, expiresAt: signed.expiresAt, mime: found.mime as MediaItem['mime'] };
    } catch (error) {
      throw mapStorageError(error);
    }
  }
}

/** @implements REQ-GCS-004, REQ-ARC-002, INV-GCS-002, REQ-BOR-005 */
export class DeleteMediaUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, mediaId: string): Promise<void> {
    const { deps } = this;
    const key = await deps.uow.runInTransaction(async (r) => {
      await lockPet(r, petId);
      await requirePetAction(r, userId, petId, 'DELETE_MEDIA');
      const found = await r.media.findById(petId, mediaId);
      if (found === null) throw new DomainErrorV31('ERR-MEDIA-NOT-FOUND');
      const objectKey = mediaObjectKey(petId, found.kind, found.id);
      await r.mediaQueue.enqueue(objectKey, 'DELETE', deps.clock.nowIsoTimestamp());
      await r.media.remove(petId, mediaId);
      await recordAudit(deps, r, { executorUserId: userId, mutationType: 'DELETE', entityType: 'PET_MEDIA', entityId: found.id, previous: toItem(found), next: null });
      return objectKey;
    });
    await purgeObjects(deps, [key]);
  }
}
