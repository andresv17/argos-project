/**
 * Mantenimiento de retención (ADR-002-14): purga sesiones expiradas o revocadas con más de 7 días, tokens de
 * confirmación vencidos, membresías e invitaciones terminales con más de 90 días y auditoría con más de 24 meses.
 * Devuelve solo conteos; no es una mutación del usuario, por eso no escribe fila de auditoría ni registra identificadores.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-001
 */

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
}

const NO_MEDIA_QUEUE: MediaQueueResult = { promoted: 0, deleted: 0, failed: 0, overdue: 0 };
/** Una pasada procesa hasta este número de filas; el resto sigue en la cola para la siguiente (el reintento por fila no tiene tope). */
const MEDIA_QUEUE_BATCH = 1000;
const HOUR_MS = 3_600_000;
const INTENT_STALE_HOURS = 1;
const OVERDUE_HOURS = 48;

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
  return { promoted, deleted, failed, overdue };
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
  if (deps.uow.purgeExpired === undefined) return NO_PURGE;
  return deps.uow.purgeExpired(maintenanceCutoffs(deps.clock.nowIsoTimestamp()));
}
