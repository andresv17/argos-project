/**
 * Casos de uso de la sección pública «Acerca de» (feature 010, Bloque E, T1430; D10-07, REQ-ACE10-001..004, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-007, EDGE-010-011).
 * - Lectura pública (`GetPublicAboutUseCase`): la vista CERRADA `{ bodyMarkdown, photoUrl, photoAlt, updatedAt }`; sin fila, el estado vacío limpio. Nunca la clave del objeto, la versión ni el autor.
 * - Lectura de administración (`GetAdminAboutUseCase`): la pública más `version` y `etag` (`"<versión>"`, `"0"` sin contenido).
 * - Texto (`UpdateAboutTextUseCase`): orden esquema (If-Match `"<n>"` ausente o mal formado, cuerpo cerrado, tope de 20 000 caracteres: 422 `ERR-SCHEMA-VALIDATION-FAILED`) -> precondición (412
 *   `ERR-ACE10-PRECONDITION-FAILED`). Guarda el texto SANITIZADO, conserva la foto, suma 1 a `version` y escribe `ABOUT_UPDATE` (objeto `about`, sin el texto) en la misma transacción.
 * - Foto (`PutAboutPhotoUseCase`): If-Match (422) -> formato y peso (422 `ERR-ACE10-PHOTO-INVALID`) -> precondición (412) -> almacenamiento (502). El tipo lo decide la firma; el objeto se reescribe
 *   SIN EXIF, XMP ni comentarios (`stripImageMetadata`, INV-ACE10-001) antes de guardarlo. Protocolo de 004/006: fila `INTENT` + `put` fuera de toda transacción + transacción final con el
 *   compare-and-set, la entrada `ABOUT_PHOTO_UPDATE`, el `DELETE` de la foto anterior y el retiro del `INTENT`. SIEMPRE suma 1 a `version` (EDGE-010-006). Si la versión cambió durante la subida
 *   (412) o falla algo tras el `put`, el objeto subido se limpia: sin huérfanos.
 * - Foto pública (`GetPublicAboutPhotoUseCase`): bytes y tipo del objeto vigente, o 404 sin foto.
 * La clave `about/photo/<uuid>` (H-ARCH-ACE-KEY) sale de `IdGeneratorPort`; los instantes, de `ClockPort` (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-007, EDGE-010-011, SC-010-027, SC-010-028, SC-010-029, SC-010-030, SC-010-031, SC-010-032, SC-010-033, SC-010-034, INV-ARCH-001, INV-ARCH-002
 */

import { ABOUT_BODY_MAX_CHARS, ABOUT_PHOTO_ALT_MAX_CHARS, sanitizeAboutMarkdown } from '../../domain/about/about-markdown.ts';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, readImageDimensions, stripImageMetadata, type StrippableMime } from '../../domain/images/image-metadata-stripper.ts';
import { detectMediaType, isAllowedForKind } from '../../domain/media/index.ts';
import { aboutPhotoObjectKey } from '../../domain/media/media-keys.ts';
import { DomainError } from '../../generated/v36/index.ts';
import type { AboutContentRecord } from '../ports/about.port.ts';
import { mapStorageError, purgeObjects, requireMedia } from './media-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Acciones auditadas de «Acerca de» (cerradas; sin valores) y su objeto. */
export const ABOUT_AUDIT_ACTIONS = { textUpdate: 'ABOUT_UPDATE', photoUpdate: 'ABOUT_PHOTO_UPDATE' } as const;
const ABOUT_AUDIT_OBJECT = 'about';
/** Ruta pública de la foto; `?v=<versión>` hace que el navegador pida la nueva tras cada escritura. */
const PHOTO_PATH = '/api/about/photo';

const IF_MATCH = /^"([0-9]+)"$/;

export interface PublicAboutView {
  readonly bodyMarkdown: string;
  readonly photoUrl: string | null;
  readonly photoAlt: string;
  readonly updatedAt: string | null;
}

export interface AdminAboutView extends PublicAboutView {
  readonly version: number;
  readonly etag: string;
}

const invalid = (field: string, detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);
const stale = (): DomainError => new DomainError('ERR-ACE10-PRECONDITION-FAILED');
const photoInvalid = (): DomainError => new DomainError('ERR-ACE10-PHOTO-INVALID');

const publicViewOf = (row: AboutContentRecord | null): PublicAboutView => ({
  bodyMarkdown: row?.bodyMarkdown ?? '',
  photoUrl: row === null || row.photoObjectKey === null ? null : `${PHOTO_PATH}?v=${row.version}`,
  photoAlt: row?.photoAlt ?? '',
  updatedAt: row?.updatedAt ?? null,
});

const adminViewOf = (row: AboutContentRecord | null): AdminAboutView => {
  const version = row?.version ?? 0;
  return { ...publicViewOf(row), version, etag: `"${version}"` };
};

/** Versión esperada de la cabecera `If-Match`: `"<n>"` exacto (sin comodín, sin lista). Ausente o con otra forma, 422. Un número fuera del rango seguro no puede coincidir nunca (412). */
function expectedVersionOf(ifMatch: unknown): number {
  const match = typeof ifMatch === 'string' ? IF_MATCH.exec(ifMatch) : null;
  if (match === null) throw invalid('If-Match', 'If-Match debe ser el etag vigente del contenido, por ejemplo "3".');
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : Number.MAX_SAFE_INTEGER;
}

/** Cuerpo cerrado `{ bodyMarkdown, photoAlt }`; el tope se mide sobre el texto recibido, antes de sanitizar (EDGE-010-011). */
function parseTextBody(body: unknown): { readonly bodyMarkdown: string; readonly photoAlt: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('body', 'El cuerpo debe ser un objeto.');
  const record = body as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => key !== 'bodyMarkdown' && key !== 'photoAlt');
  if (extra.length > 0) throw invalid(extra[0]!, 'El cuerpo solo admite bodyMarkdown y photoAlt.');
  const { bodyMarkdown, photoAlt } = record;
  if (typeof bodyMarkdown !== 'string') throw invalid('bodyMarkdown', 'bodyMarkdown debe ser un texto.');
  if (typeof photoAlt !== 'string') throw invalid('photoAlt', 'photoAlt debe ser un texto.');
  if (bodyMarkdown.length > ABOUT_BODY_MAX_CHARS) throw invalid('bodyMarkdown', `bodyMarkdown admite hasta ${ABOUT_BODY_MAX_CHARS} caracteres.`);
  if (photoAlt.length > ABOUT_PHOTO_ALT_MAX_CHARS) throw invalid('photoAlt', `photoAlt admite hasta ${ABOUT_PHOTO_ALT_MAX_CHARS} caracteres.`);
  return { bodyMarkdown, photoAlt };
}

/** @implements REQ-ACE10-001, EDGE-010-004, SC-010-027, SC-010-028 */
export class GetPublicAboutUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<PublicAboutView> {
    return publicViewOf(await this.deps.uow.runInTransaction((r) => r.aboutContent.get()));
  }
}

/** @implements REQ-ACE10-002, REQ-ACE10-003 */
export class GetAdminAboutUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<AdminAboutView> {
    return adminViewOf(await this.deps.uow.runInTransaction((r) => r.aboutContent.get()));
  }
}

/** @implements REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, EDGE-010-006, EDGE-010-007, EDGE-010-011, SC-010-030, SC-010-031, SC-010-034 */
export class UpdateAboutTextUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `ifMatch` y `body` llegan tal como los envió el cliente; cualquier valor fuera del contrato es 422 y no escribe ni audita. */
  async execute(input: { readonly adminId: string; readonly ifMatch: unknown; readonly body: unknown }): Promise<AdminAboutView> {
    const expected = expectedVersionOf(input.ifMatch);
    const { bodyMarkdown, photoAlt } = parseTextBody(input.body);
    const sanitized = sanitizeAboutMarkdown(bodyMarkdown);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (r) => {
      const current = await r.aboutContent.get();
      if ((current?.version ?? 0) !== expected) throw stale();
      const written = await r.aboutContent.replace({ bodyMarkdown: sanitized, photoObjectKey: current?.photoObjectKey ?? null, photoAlt, updatedAt: now, updatedBy: input.adminId }, expected);
      if (written === null) throw stale();
      // Solo el id del administrador, la acción, el objeto y la marca de tiempo: nunca el texto ni el alt.
      await r.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: input.adminId, action: ABOUT_AUDIT_ACTIONS.textUpdate, objectRef: ABOUT_AUDIT_OBJECT, occurredAt: now });
      return adminViewOf(written);
    });
  }
}

/** Foto ya validada y reescrita sin metadatos, lista para almacenar. */
interface PreparedPhoto {
  readonly mime: StrippableMime;
  readonly bytes: Uint8Array;
}

/** @implements REQ-ACE10-002, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-007, SC-010-032, SC-010-033, SC-010-034 */
export class PutAboutPhotoUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: { readonly adminId: string; readonly ifMatch: unknown; readonly bytes: Uint8Array }): Promise<AdminAboutView> {
    const { deps } = this;
    const media = requireMedia(deps);
    const expected = expectedVersionOf(input.ifMatch);
    const photo = this.prepare(input.bytes, media.limits.maxBytes);
    const key = await deps.uow.runInTransaction(async (r) => {
      // Rechazo barato: con la versión ya vencida no se sube nada.
      if (((await r.aboutContent.get())?.version ?? 0) !== expected) throw stale();
      const objectKey = aboutPhotoObjectKey(deps.ids.nextId());
      await r.mediaQueue.enqueue(objectKey, 'INTENT', deps.clock.nowIsoTimestamp());
      return objectKey;
    });
    try {
      await media.storage.put(key, photo.bytes, photo.mime);
    } catch (error) {
      throw mapStorageError(error);
    }
    try {
      const { view, previousKey } = await deps.uow.runInTransaction(async (r) => {
        const now = deps.clock.nowIsoTimestamp();
        const current = await r.aboutContent.get();
        if ((current?.version ?? 0) !== expected) throw stale();
        const written = await r.aboutContent.replace(
          { bodyMarkdown: current?.bodyMarkdown ?? '', photoObjectKey: key, photoAlt: current?.photoAlt ?? '', updatedAt: now, updatedBy: input.adminId },
          expected,
        );
        if (written === null) throw stale();
        const previous = current?.photoObjectKey ?? null;
        if (previous !== null) await r.mediaQueue.enqueue(previous, 'DELETE', now);
        await r.mediaQueue.remove(key);
        await r.adminAudit.insert({ id: deps.ids.nextId(), adminId: input.adminId, action: ABOUT_AUDIT_ACTIONS.photoUpdate, objectRef: ABOUT_AUDIT_OBJECT, occurredAt: now });
        return { view: adminViewOf(written), previousKey: previous };
      });
      if (previousKey !== null) await purgeObjects(deps, [previousKey]);
      return view;
    } catch (error) {
      await this.discard(key);
      throw error;
    }
  }

  /** Peso, firma (JPEG, PNG o WebP), dimensiones y reescritura sin metadatos; cualquier fallo es `ERR-ACE10-PHOTO-INVALID` y no toca el almacenamiento. */
  private prepare(bytes: Uint8Array, maxBytes: number): PreparedPhoto {
    if (bytes.length === 0 || bytes.length > maxBytes) throw photoInvalid();
    const detection = detectMediaType(bytes);
    if (!detection.ok || !isAllowedForKind(detection.mime, 'PHOTO')) throw photoInvalid();
    const mime = detection.mime as StrippableMime;
    const size = readImageDimensions(mime, bytes);
    if (size === null || size.width * size.height > MAX_IMAGE_PIXELS || Math.max(size.width, size.height) > MAX_IMAGE_SIDE) throw photoInvalid();
    const clean = stripImageMetadata(mime, bytes);
    if (!clean.ok) throw photoInvalid();
    return { mime: clean.mime, bytes: clean.bytes };
  }

  /** Fallo posterior al `put`: la clave pasa a `DELETE` y se borra de inmediato; si algo falla queda en la cola para el mantenimiento. */
  private async discard(key: string): Promise<void> {
    try {
      await this.deps.uow.runInTransaction((r) => r.mediaQueue.enqueue(key, 'DELETE', this.deps.clock.nowIsoTimestamp()));
    } catch {
      return;
    }
    await purgeObjects(this.deps, [key]);
  }
}

/** Foto vigente para el visitante anónimo: bytes y tipo del objeto, sin exponer la clave. @implements REQ-ACE10-001, REQ-ACE10-003, INV-ACE10-001 */
export class GetPublicAboutPhotoUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<{ readonly bytes: Uint8Array; readonly mime: StrippableMime }> {
    const { media } = this.deps;
    const row = await this.deps.uow.runInTransaction((r) => r.aboutContent.get());
    if (media === undefined || row === null || row.photoObjectKey === null) throw new DomainError('ERR-MEDIA-NOT-FOUND');
    let object: Awaited<ReturnType<typeof media.storage.get>>;
    try {
      object = await media.storage.get(row.photoObjectKey);
    } catch (error) {
      throw mapStorageError(error);
    }
    if (object === null) throw new DomainError('ERR-MEDIA-NOT-FOUND');
    // El tipo se vuelve a decidir por firma: nunca se sirve algo que no sea JPEG, PNG o WebP.
    const detection = detectMediaType(object.bytes);
    if (!detection.ok || !isAllowedForKind(detection.mime, 'PHOTO')) throw new DomainError('ERR-MEDIA-NOT-FOUND');
    return { bytes: object.bytes, mime: detection.mime as StrippableMime };
  }
}
