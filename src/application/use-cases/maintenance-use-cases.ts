/**
 * Mantenimiento de retención (ADR-002-14): purga sesiones expiradas o revocadas con más de 7 días, tokens de
 * confirmación vencidos, membresías e invitaciones terminales con más de 90 días y auditoría (`audit_log` y `admin_audit_entries`, sumadas en `auditRowsPurged`) con más de 24 meses.
 * Devuelve solo conteos; no es una mutación del usuario, por eso no escribe fila de auditoría ni registra identificadores.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-001
 */

import { RECONCILED_PREFIXES, isMediaObjectKey, reconciliationAgeMinutes } from '../../domain/media/index.ts';
import { retentionCutoffs } from '../../domain/sharing/share-link.ts';
import { monthlyAnniversary, parseIsoCalendarDate, shiftIsoTimestamp } from '../../domain/shared/date-utils.ts';
import type { MaintenanceCounts, MaintenanceCutoffs } from '../ports/unit-of-work.port.ts';
import type { ApplicationDeps } from './use-case-support.ts';

const AUDIT_RETENTION_MONTHS = 24;

/** Umbral de auditoría: mismo día y hora, 24 meses de calendario antes (fin de mes si el día no existe). Sin objetos Date. */
export function maintenanceCutoffs(nowIsoTimestamp: string): MaintenanceCutoffs {
  const { year, month, day } = monthlyAnniversary(parseIsoCalendarDate(nowIsoTimestamp.slice(0, 10), 'now'), -AUDIT_RETENTION_MONTHS);
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return { now: nowIsoTimestamp, auditBefore: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}${nowIsoTimestamp.slice(10)}` };
}

const NO_PURGE: MaintenanceCounts = { sessionsPurged: 0, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 0 };

/** Conteos de la cola de borrado de medios en una pasada (E3-04): solo números, nunca claves ni identificadores. */
export interface MediaQueueResult {
  /** Filas `INTENT` con más de 1 h que pasaron a `DELETE`. */
  readonly promoted: number;
  /** Objetos borrados y filas retiradas de la cola. */
  readonly deleted: number;
  /** Intentos fallidos (la fila sigue con `attempts + 1`). */
  readonly failed: number;
  /** Filas con más de 48 h en la cola: motivo de la alerta a Neo (REQ-GCS-004). */
  readonly overdue: number;
  /** Objetos de más de 24 h sin referencia que la conciliación encoló con `DELETE` (REQ-GCS-006). */
  readonly reconciled: number;
}

const NO_MEDIA_QUEUE: MediaQueueResult = { promoted: 0, deleted: 0, failed: 0, overdue: 0, reconciled: 0 };
/** Una pasada procesa hasta este número de filas; el resto sigue en la cola para la siguiente (el reintento por fila no tiene tope). */
const MEDIA_QUEUE_BATCH = 1000;
const HOUR_MS = 3_600_000;
const INTENT_STALE_HOURS = 1;
const OVERDUE_HOURS = 48;
const MINUTE_MS = 60_000;

/**
 * Conciliación diaria (REQ-GCS-006, INV-GCS-002, SC-ALM-031; 006: REQ-ESC6-029, EDGE-ESC6-021): lista los prefijos `pets/`, `scenes/`, `households/`, `about/` y `users/` (una sola
 * rutina, `RECONCILED_PREFIXES`) y encola con `DELETE` todo objeto más antiguo que su ventana (24 h en `pets/`, 15 min en `scenes/`, `households/`, `about/` y `users/`, porque un
 * worker zombi puede subir un objeto tras vencer el arrendamiento) cuya clave no esté referenciada: `pet_media` (derivada) o `pets.avatar_object_id` en `pets/`;
 * `home_scenes.image_id` en `scenes/`; `household_photos.object_id` en `households/`; `about_content.photo_object_key` en `about/` (010, H-ARCH-ACE-KEY); `users.avatar_object_id` en `users/` (011, ENM-004-MINOR); ni en la cola (incluidas las filas `INTENT`). Las claves que no tienen el
 * formato de los objetos de medios no se tocan. La comprobación y el encolado van en una misma transacción por objeto. Si `list` falla en un prefijo, ese
 * prefijo se omite: la siguiente pasada lo reintenta. Nunca lanza.
 */
async function reconcileObjects(deps: Pick<ApplicationDeps, 'uow' | 'media'>, now: string): Promise<number> {
  const media = deps.media;
  if (media === undefined) return 0;
  let enqueued = 0;
  for (const prefix of RECONCILED_PREFIXES) {
    let entries: Awaited<ReturnType<typeof media.storage.list>>;
    try {
      entries = await media.storage.list(prefix);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!isMediaObjectKey(entry.key) || entry.createdAt >= shiftIsoTimestamp(now, -reconciliationAgeMinutes(entry.key) * MINUTE_MS)) continue;
      const [root, ownerId, folder, objectId] = entry.key.split('/') as [string, string, string, string];
      const aboutKey = root === 'about';
      try {
        const orphan = await deps.uow.runInTransaction(async (r) => {
          if ((await r.mediaQueue.findByKey(entry.key)) !== null) return false;
          if (aboutKey) return (await r.aboutContent.get())?.photoObjectKey !== entry.key;
          if (root === 'scenes') return (await r.scenes.findById(ownerId))?.image?.id !== objectId;
          if (root === 'households') return (await r.scenes.findHouseholdPhoto(ownerId))?.objectId !== objectId;
          if (root === 'users') return (await r.users.findAvatar(ownerId))?.objectId !== objectId; // ENM-004-MINOR (011, #78)
          if (folder === 'avatar') return (await r.pets.findAvatar(ownerId))?.objectId !== objectId;
          return (await r.media.findById(ownerId, objectId))?.kind !== (folder === 'photos' ? 'PHOTO' : 'FILE');
        });
        if (!orphan) continue;
        await deps.uow.runInTransaction((r) => r.mediaQueue.enqueue(entry.key, 'DELETE', now));
        enqueued += 1;
      } catch {
        // la siguiente pasada lo reintenta
      }
    }
  }
  return enqueued;
}

/**
 * Mantenimiento de la cola de borrado (E3-04, REQ-GCS-004, REQ-GCS-006): convierte en `DELETE` los `INTENT` de más de 1 h (proceso caído, EDGE-012);
 * para cada `DELETE` borra el objeto (inexistente = éxito) y retira la fila, y si falla suma un intento sin tope; informa el conteo de filas con más
 * de 48 h. Sin medios conectados no hace nada. Nunca lanza por un fallo del almacenamiento.
 * @implements REQ-GCS-004, REQ-GCS-006, INV-GCS-002
 */
export async function runMediaQueueMaintenance(deps: Pick<ApplicationDeps, 'uow' | 'clock' | 'media'>): Promise<MediaQueueResult> {
  const media = deps.media;
  if (media === undefined) return NO_MEDIA_QUEUE;
  const now = deps.clock.nowIsoTimestamp();
  const before = (hours: number) => shiftIsoTimestamp(now, -hours * HOUR_MS);
  const reconciled = await reconcileObjects(deps, now);
  const { promoted, entries } = await deps.uow.runInTransaction(async (r) => ({
    promoted: await r.mediaQueue.promoteStaleIntents(before(INTENT_STALE_HOURS)),
    entries: await r.mediaQueue.listPending(MEDIA_QUEUE_BATCH),
  }));
  let deleted = 0;
  let failed = 0;
  for (const entry of entries) {
    if (entry.reason !== 'DELETE' && !(entry.reason === 'INTENT' && entry.enqueuedAt < before(INTENT_STALE_HOURS))) continue;
    try {
      await media.storage.delete(entry.objectKey);
      await deps.uow.runInTransaction((r) => r.mediaQueue.remove(entry.objectKey));
      deleted += 1;
    } catch {
      failed += 1;
      try {
        await deps.uow.runInTransaction((r) => r.mediaQueue.recordFailure(entry.objectKey));
      } catch {
        // la fila queda como estaba; la siguiente pasada la reintenta
      }
    }
  }
  const overdue = await deps.uow.runInTransaction((r) => r.mediaQueue.countOlderThan(before(OVERDUE_HOURS)));
  return { promoted, deleted, failed, overdue, reconciled };
}

/**
 * Purga diaria del enlace veterinario (feature 005, REQ-CLD-007, REQ-VET-013, SC-005-042): enlaces vencidos o revocados a 30 días, auditoría sin IP a 90 días y
 * toda fila con `ip_hmac` a 30 (PN-06). Una transacción; no escribe auditoría ni registra identificadores. Nunca lanza: la siguiente pasada lo reintenta.
 * @implements REQ-VET-013, REQ-VET-010, REQ-CLD-007, SC-005-042
 */
export async function purgeShareData(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<void> {
  try {
    const cutoffs = retentionCutoffs(deps.clock.nowIsoTimestamp());
    await deps.uow.runInTransaction(async (r) => {
      await r.shareLinks.purge(cutoffs.links);
      await r.shareAudit.purge({ withoutIpBefore: cutoffs.auditWithoutIp, withIpBefore: cutoffs.auditWithIp });
    });
  } catch {
    // la siguiente pasada diaria lo reintenta
  }
}

/** Retención de los intentos terminales de la escena (N2-11 ratificada por Neo): 30 días. */
const SCENE_ATTEMPT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

/** Conteos de la purga de la escena: solo números (SC-ESC6-095). */
export interface SceneMaintenanceResult {
  readonly attemptsPurged: number;
  readonly hashesCleared: number;
  readonly carryPurged: number;
}

const NO_SCENE_PURGE: SceneMaintenanceResult = { attemptsPurged: 0, hashesCleared: 0, carryPurged: 0 };

/**
 * Purga diaria de la escena (feature 006, `N2-11`, SC-ESC6-095, REQ-ESC6-012, INV-ESC6-016): intentos terminales de más de 30 días (salvo el vigente de la
 * escena), hashes de clave de idempotencia vencidos (a las 24 h; la fila se conserva) y arrastres de cuota de ventanas anteriores a la actual (`YYYY-MM` en
 * APP_TIMEZONE, de `todayIsoDate`). Una transacción; no escribe auditoría ni registra identificadores. Nunca lanza: la siguiente pasada lo reintenta.
 * @implements REQ-ESC6-012, INV-ESC6-016, SC-ESC6-095
 */
export async function purgeSceneData(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<SceneMaintenanceResult> {
  try {
    const now = deps.clock.nowIsoTimestamp();
    const currentWindow = deps.clock.todayIsoDate().slice(0, 7);
    return await deps.uow.runInTransaction(async (r) => ({
      attemptsPurged: await r.scenes.purgeTerminalAttempts(shiftIsoTimestamp(now, -SCENE_ATTEMPT_RETENTION_DAYS * DAY_MS)),
      hashesCleared: await r.scenes.clearExpiredIdempotencyHashes(now),
      carryPurged: await r.scenes.purgeQuotaCarryBefore(currentWindow),
    }));
  } catch {
    return NO_SCENE_PURGE;
  }
}

/**
 * Ejecuta una pasada de mantenimiento con el reloj de la aplicación; sin almacenamiento con purga devuelve ceros. Con medios conectados recorre también
 * la cola de borrado y entrega su resultado a `onMediaQueue` (la respuesta de `/internal/maintenance` conserva sus 5 conteos).
 */
export async function runMaintenance(
  deps: Pick<ApplicationDeps, 'uow' | 'clock' | 'media'>,
  onMediaQueue?: (result: MediaQueueResult) => void,
): Promise<MaintenanceCounts> {
  const queue = await runMediaQueueMaintenance(deps);
  if (deps.media !== undefined) onMediaQueue?.(queue);
  await purgeShareData(deps);
  await purgeSceneData(deps);
  if (deps.uow.purgeExpired === undefined) return NO_PURGE;
  return deps.uow.purgeExpired(maintenanceCutoffs(deps.clock.nowIsoTimestamp()));
}
