/**
 * Retención y ciclo de vida de la evidencia de disputas de chip (Feature 012, Bloque B, #23, T1641; REQ-CHP12-008, INV-CHP12-005, SC-012-082, SC-012-118, SC-012-120). Funciones de MANTENIMIENTO que
 * `runMaintenance` invoca ANTES de la cola de medios: vencimiento de disputas, purga de evidencia vencida (orden de SC-012-118) y barrido de huérfanos del área de espera. Todas idempotentes.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, INV-CHP12-005, EDGE-012-064, SC-012-082, SC-012-118, SC-012-120
 */

import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { DAY_MS, DISPUTE_EVIDENCE_RETENTION_DAYS, DISPUTE_EVIDENCE_STAGING_TTL_HOURS } from '../../domain/platform/feature-012-limits.ts';
import { settledRequest } from './co-ownership-support.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/**
 * Vencimiento de las disputas no resueltas a los `DISPUTE_MAX_OPEN_DAYS` (60): `EXPIRED` SIN cooldown, `resolution` nula; libera la reserva y fija la retención de la evidencia desde `closed_at`
 * (= `expires_at`). Idempotente; materialización perezosa y del mantenimiento (P-1, EDGE-012-064). Devuelve cuántas venció.
 */
export async function expireLapsedDisputes(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<number> {
  return deps.uow.runInTransaction(async (repositories) => {
    const now = deps.clock.nowIsoTimestamp();
    let expired = 0;
    for (const dispute of await repositories.ownerRequests.listAll()) {
      if (dispute.action !== 'CHIP_DISPUTE' || dispute.status !== 'UNDER_REVIEW' || now < dispute.expiresAt) continue;
      const next = settledRequest(dispute, { status: 'EXPIRED', decidedAt: dispute.expiresAt, resolution: null, executesAfter: null });
      if (await repositories.ownerRequests.update(next, 'UNDER_REVIEW')) {
        await repositories.disputeEvidence.setDeleteAfter(dispute.id, addMillis(dispute.expiresAt, DISPUTE_EVIDENCE_RETENTION_DAYS * DAY_MS));
        expired += 1;
      }
    }
    return expired;
  });
}

/**
 * Purga de la evidencia vencida (`delete_after <= now`) en UNA unidad de trabajo y en este ORDEN (SC-012-118): (1) filas de `dispute_evidence` borradas físicamente y (2) claves encoladas en
 * `media_deletion_queue` con `DELETE`, ambas en la misma transacción (el expediente `owner_requests` solo puede purgarse después: la FK es RESTRICT); (3) el borrado de los objetos lo ejecuta la
 * pasada de la cola del mantenimiento (`runMediaQueueMaintenance`), que corre a continuación. Devuelve cuántas filas purgó.
 */
export async function purgeExpiredDisputeEvidence(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<number> {
  const now = deps.clock.nowIsoTimestamp();
  return deps.uow.runInTransaction(async (repositories) => {
    const due = await repositories.disputeEvidence.listDue(now);
    if (due.length === 0) return 0;
    await repositories.disputeEvidence.deleteByIds(due.map((e) => e.id));
    for (const evidence of due) await repositories.mediaQueue.enqueue(evidence.objectKey, 'DELETE', now);
    return due.length;
  });
}

/**
 * Barrido de huérfanos del área de espera (SC-012-120, rama N-F, Neo): borra los objetos `claims/…` con más de `DISPUTE_EVIDENCE_STAGING_TTL_HOURS` (24 h) que NO tienen fila en `dispute_evidence`
 * (subidas de aperturas que terminaron en el 202 sin fila o cuyo proceso murió). Idempotente; nunca lanza. Devuelve cuántos borró.
 */
export async function sweepOrphanDisputeEvidence(deps: Pick<ApplicationDeps, 'uow' | 'clock' | 'media'>): Promise<number> {
  const media = deps.media;
  if (media === undefined) return 0;
  try {
    const cutoff = addMillis(deps.clock.nowIsoTimestamp(), -DISPUTE_EVIDENCE_STAGING_TTL_HOURS * 3_600_000);
    let swept = 0;
    for (const entry of await media.storage.list('claims/')) {
      if (entry.createdAt >= cutoff) continue;
      const requestId = entry.key.split('/')[1] ?? '';
      const hasRow = await deps.uow.runInTransaction(async (r) => (await r.disputeEvidence.listByRequest(requestId)).some((e) => e.objectKey === entry.key));
      if (hasRow) continue;
      await media.storage.delete(entry.key);
      swept += 1;
    }
    return swept;
  } catch {
    return 0; // la siguiente pasada lo reintenta
  }
}
