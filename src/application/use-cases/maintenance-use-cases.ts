/**
 * Mantenimiento de retención (ADR-002-14): purga sesiones expiradas o revocadas con más de 7 días, tokens de
 * confirmación vencidos, membresías e invitaciones terminales con más de 90 días y auditoría (`audit_log` y `admin_audit_entries`, sumadas en `auditRowsPurged`) con más de 24 meses.
 * Devuelve solo conteos; no es una mutación del usuario, por eso no escribe fila de auditoría ni registra identificadores.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-001
 */

import { RECONCILED_PREFIXES, isMediaObjectKey, reconciliationAgeMinutes } from '../../domain/media/index.ts';
import {
  ARBITER_AUDIT_RETENTION_DAYS,
  CARE_LOG_MEDICATION_RETENTION_DAYS,
  CARE_LOG_OTHER_RETENTION_DAYS,
  CARE_LOG_REVERTED_RETENTION_DAYS,
  CARE_ROUTINE_INACTIVE_RETENTION_DAYS,
  DISPUTE_ABSENCE_RETENTION_DAYS,
  OWNERSHIP_TERMINAL_RETENTION_DAYS,
} from '../../domain/platform/feature-012-limits.ts';
import { purgeIpRateEvents } from './chip-ip-rate-limit.ts';
import { executeDueDisputeDecisions } from './chip-dispute-admin-use-cases.ts';
import { expireLapsedDisputes, purgeExpiredDisputeEvidence, sweepOrphanDisputeEvidence } from './chip-dispute-retention.ts';
import { retentionCutoffs } from '../../domain/sharing/share-link.ts';
import { monthlyAnniversary, parseIsoCalendarDate, shiftIsoTimestamp } from '../../domain/shared/date-utils.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
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

/** Conteos de la purga de delegados: solo números, nunca correos ni identificadores. */
export interface DelegateMaintenanceResult {
  readonly invitationsPurged: number;
  readonly disabledAnonymized: number;
}

const NO_DELEGATE_PURGE: DelegateMaintenanceResult = { invitationsPurged: 0, disabledAnonymized: 0 };

/**
 * Retención por defecto de delegados cuando no se inyecta `adminDelegateRetention` (autorizado por Neo, Nivel 2). Duplica a propósito los valores de
 * `ADMIN_DELEGATE_*` de `infrastructure/config/app-config.ts` (la capa de aplicación no importa infraestructura); si cambian allí, cambian aquí.
 */
const DEFAULT_DELEGATE_RETENTION = { invitationTtlHours: 72, expiredInvitationRetentionDays: 30, disabledRetentionDays: 365 } as const;

/**
 * Purga diaria de delegados de `/admin` (feature 011, DEUDA-011-PURGA-DELEGADOS, D-1 y D-2): borra las invitaciones `INVITED` con más de `expiredInvitationRetentionDays` días tras su caducidad
 * (`invited_at` + `invitationTtlHours`) y anonimiza correo y `sub` de los delegados `DISABLED` con más de `disabledRetentionDays` días, retirando su identidad de acceso (`admin_identities`).
 * Se conserva el `admin_id` opaco (la auditoría lo referencia). Nunca toca filas `ACTIVE`. Sin `adminDelegateRetention` en las deps aplica `DEFAULT_DELEGATE_RETENTION`; la inyectada gana. Una transacción; no escribe auditoría ni
 * registra correos ni identificadores. Nunca lanza: la siguiente pasada lo reintenta.
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
export async function purgeDelegateData(deps: Pick<ApplicationDeps, 'uow' | 'clock' | 'adminDelegateRetention'>): Promise<DelegateMaintenanceResult> {
  const retention = deps.adminDelegateRetention ?? DEFAULT_DELEGATE_RETENTION;
  try {
    const now = deps.clock.nowIsoTimestamp();
    const invitedBefore = shiftIsoTimestamp(now, -(retention.invitationTtlHours * HOUR_MS + retention.expiredInvitationRetentionDays * DAY_MS));
    const disabledBefore = shiftIsoTimestamp(now, -retention.disabledRetentionDays * DAY_MS);
    return await deps.uow.runInTransaction(async (r) => {
      const invitationsPurged = await r.adminDelegates.purgeExpiredInvitations(invitedBefore);
      const anonymized = await r.adminDelegates.anonymizeDisabledBefore(disabledBefore);
      // D8 (012): con expedientes (`resolved_by_admin_id` / `second_approver_admin_id`, FK RESTRICT) la identidad NO se borra: se anonimiza y se conserva el vínculo. Sin expedientes, se retira.
      const requests = anonymized.length > 0 ? await r.ownerRequests.listAll() : [];
      for (const adminId of anonymized) {
        if (requests.some((x) => x.resolvedByAdminId === adminId || x.secondApproverAdminId === adminId)) await r.adminIdentities.anonymizeIdentity(adminId);
        else await r.adminIdentities.deleteById(adminId);
      }
      await releaseExpiredPersonIds(r, deps.clock.nowIsoTimestamp());
      return { invitationsPurged, disabledAnonymized: anonymized.length };
    });
  } catch (error) {
    reportMaintenanceFailure('purgeDelegateData', error);
    return NO_DELEGATE_PURGE;
  }
}

/** Traza de un fallo de mantenimiento sin PII: solo la tarea y el nombre del tipo de error (nunca el mensaje, que puede traer correos o identificadores). La transacción ya se revirtió; la siguiente pasada reintenta. */
function reportMaintenanceFailure(task: string, error: unknown): void {
  console.error(`[maintenance] ${task} falló y se revirtió (${error instanceof Error ? error.name : 'Unknown'}); se reintenta en la próxima pasada`);
}

/**
 * D8 (012): `person_id = NULL` en las identidades de operador ya anonimizadas cuando venció el plazo de su ÚLTIMO expediente: `closed_at` (= `resolved_at ?? decided_at ?? expires_at`) + 1095 días en
 * apropiación de chip (`ARBITER_AUDIT_RETENTION_DAYS`), + 90 días en ausencia (`DISPUTE_ABSENCE_RETENTION_DAYS`) o en cualquier otro expediente (`OWNERSHIP_TERMINAL_RETENTION_DAYS`). Un expediente
 * aún abierto lo retiene. Sin expedientes restantes (ya purgados) el plazo venció. Nunca toca a operadores activos.
 */
async function releaseExpiredPersonIds(r: RepositorySet, now: string): Promise<void> {
  const candidates = await r.adminIdentities.listAnonymizedWithPersonId();
  if (candidates.length === 0) return;
  const requests = await r.ownerRequests.listAll();
  for (const adminId of candidates) {
    let releaseAt = '';
    let open = false;
    for (const x of requests) {
      if (x.resolvedByAdminId !== adminId && x.secondApproverAdminId !== adminId) continue;
      if (x.status === 'PENDING' || x.status === 'UNDER_REVIEW') {
        open = true;
        break;
      }
      const closedAt = x.resolvedAt ?? x.decidedAt ?? x.expiresAt;
      const days = x.action === 'CHIP_DISPUTE' && x.disputeReason === 'CHIP_APPROPRIATION' ? ARBITER_AUDIT_RETENTION_DAYS : x.action === 'CHIP_DISPUTE' ? DISPUTE_ABSENCE_RETENTION_DAYS : OWNERSHIP_TERMINAL_RETENTION_DAYS;
      const due = shiftIsoTimestamp(closedAt, days * DAY_MS);
      if (due > releaseAt) releaseAt = due;
    }
    if (!open && releaseAt < now) await r.adminIdentities.clearPersonId(adminId);
  }
}

/** Conteos de la purga de co-propiedad: solo números, nunca identificadores. */
export interface OwnershipMaintenanceResult {
  readonly coOwnersPurged: number;
  readonly requestsPurged: number;
}

const NO_OWNERSHIP_PURGE: OwnershipMaintenanceResult = { coOwnersPurged: 0, requestsPurged: 0 };

/**
 * Purga diaria de co-propiedad (feature 012, NFR-012-009, T1623; patrón de `purgeDelegateData`, sin job nuevo): filas terminales de `pet_co_owners` y solicitudes de `owner_requests` terminales (`APPROVED`,
 * `REJECTED`, `EXPIRED`, `CANCELLED`, o `PENDING` ya vencida) con más de `OWNERSHIP_TERMINAL_RETENTION_DAYS` = 90 días desde su decisión, y las disputas por ausencia resueltas con más de
 * `DISPUTE_ABSENCE_RETENTION_DAYS` = 90 días desde su `RESOLVED`/`EXPIRED`. **H-08 de `trinity` T1612 (`P-2`)**: la purga EXCLUYE toda solicitud referenciada por `trigger_request_ids` de una disputa no terminal, y la
 * retención de la solicitud sellada cuenta desde el `RESOLVED`/`EXPIRED` de la disputa (`TRIGGER_LOST` nunca puede originarse en la purga). Las disputas de apropiación de chip (365 días con evidencia) las purga el Bloque #23.
 * Una transacción; no escribe auditoría ni registra identificadores. Nunca lanza: la siguiente pasada lo reintenta.
 * @implements NFR-012-009, REQ-OWN12-009, REQ-CHP12-008
 */
export async function purgeOwnershipData(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<OwnershipMaintenanceResult> {
  try {
    const now = deps.clock.nowIsoTimestamp();
    const cutoff = shiftIsoTimestamp(now, -OWNERSHIP_TERMINAL_RETENTION_DAYS * DAY_MS);
    return await deps.uow.runInTransaction(async (r) => {
      const coOwnersPurged = await r.coOwners.purgeTerminalBefore(cutoff);
      const requests = await r.ownerRequests.listAll();
      const NON_TERMINAL_DISPUTE = new Set(['PENDING', 'UNDER_REVIEW']);
      const terminalDate = (request: (typeof requests)[number]): string => request.resolvedAt ?? request.decidedAt ?? request.expiresAt;
      // Solicitudes selladas por una disputa: protegidas mientras la disputa siga viva; después, 90 días desde que ella terminó.
      const retainedUntil = new Map<string, string>();
      for (const dispute of requests.filter((x) => x.action === 'CHIP_DISPUTE' && x.triggerRequestIds !== null)) {
        const stamp = NON_TERMINAL_DISPUTE.has(dispute.status) ? '9999-12-31T23:59:59.999Z' : terminalDate(dispute);
        for (const id of dispute.triggerRequestIds ?? []) if ((retainedUntil.get(id) ?? '') < stamp) retainedUntil.set(id, stamp);
      }
      const TERMINAL = new Set(['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'RESOLVED']);
      const withEvidence = new Set<string>();
      for (const x of requests) if (x.action === 'CHIP_DISPUTE' && (await r.disputeEvidence.listByRequest(x.id)).length > 0) withEvidence.add(x.id);
      const doomed = requests
        .filter((x) => {
          if (x.action === 'CHIP_DISPUTE' && x.disputeReason === 'CHIP_APPROPRIATION') return TERMINAL.has(x.status) && !withEvidence.has(x.id) && terminalDate(x) < shiftIsoTimestamp(now, -ARBITER_AUDIT_RETENTION_DAYS * DAY_MS);
          if (x.action === 'CHIP_DISPUTE') return x.disputeReason !== 'CHIP_APPROPRIATION' && TERMINAL.has(x.status) && terminalDate(x) < cutoff;
          // Bloque B (#23): las reclamaciones terminales siguen la misma retención de 90 días; el expediente de una disputa de chip se conserva ARBITER_AUDIT_RETENTION_DAYS (1095) desde su
          // cierre (`closed_at`) y SOLO cuando su evidencia ya fue purgada (`dispute_evidence` es RESTRICT: primero las filas de evidencia, SC-012-118).
          if (x.action === 'CLAIM_CO_OWNERSHIP') return TERMINAL.has(x.status) && terminalDate(x) < cutoff;
          const terminal = TERMINAL.has(x.status) || (x.status === 'PENDING' && x.expiresAt < now);
          if (!terminal) return false;
          const reference = retainedUntil.get(x.id);
          const effective = reference !== undefined && reference > terminalDate(x) ? reference : terminalDate(x);
          return effective < cutoff;
        })
        .map((x) => x.id);
      return { coOwnersPurged, requestsPurged: await r.ownerRequests.deleteByIds(doomed) };
    });
  } catch (error) {
    reportMaintenanceFailure('purgeOwnershipData', error);
    return NO_OWNERSHIP_PURGE;
  }
}

/** Conteos de la purga de cuidado: solo números. */
export interface CareMaintenanceResult {
  readonly entriesPurged: number;
  readonly routinesPurged: number;
}

const NO_CARE_PURGE: CareMaintenanceResult = { entriesPurged: 0, routinesPurged: 0 };

/**
 * Purga diaria del Modo Cuidador (feature 012, T1661, REQ-CAR12-007, SC-012-089; techo máximo, no piso; sin job nuevo ni columna de retención): borra los registros de `MEDICATION` con `occurrence_date` anterior a hoy - 1095 días,
 * los de `MEAL`/`WALK`/`OTHER` anterior a hoy - 365, los revertidos con `reverted_at` anterior a ahora - 30 días y, después, las rutinas inactivas (`active = false`) desactivadas hace más de 365 días (`updated_at`; lectura del
 * data-model, reserva para Architect: x-sdd-constants dice «desde su última ocurrencia») que ninguna versión posterior referencia y que ya no tienen registros vivos (D-D(b), Neo: una rutina con registros se conserva hasta que el último venza). Un registro con exactamente N días de antigüedad aún se conserva. «Hoy» es `todayIsoDate`
 * (America/Bogota). Los registros van antes que las rutinas para contar cada borrado donde corresponde (la cascada de la rutina solo arrastra lo que aún queda). Una transacción; no escribe auditoría ni registra identificadores.
 * Nunca lanza: la siguiente pasada lo reintenta.
 * @implements REQ-CAR12-007, SC-012-089
 */
export async function purgeCareData(deps: Pick<ApplicationDeps, 'uow' | 'clock'>): Promise<CareMaintenanceResult> {
  try {
    const now = deps.clock.nowIsoTimestamp();
    const dateBefore = (days: number): string => shiftIsoTimestamp(`${deps.clock.todayIsoDate()}T00:00:00.000Z`, -days * DAY_MS).slice(0, 10);
    return await deps.uow.runInTransaction(async (r) => {
      const entriesPurged = await r.careLog.purgeExpired({
        medicationBefore: dateBefore(CARE_LOG_MEDICATION_RETENTION_DAYS),
        otherBefore: dateBefore(CARE_LOG_OTHER_RETENTION_DAYS),
        revertedBefore: shiftIsoTimestamp(now, -CARE_LOG_REVERTED_RETENTION_DAYS * DAY_MS),
      });
      const routinesPurged = await r.careRoutines.purgeInactiveBefore(shiftIsoTimestamp(now, -CARE_ROUTINE_INACTIVE_RETENTION_DAYS * DAY_MS));
      return { entriesPurged, routinesPurged };
    });
  } catch (error) {
    reportMaintenanceFailure('purgeCareData', error);
    return NO_CARE_PURGE;
  }
}

/**
 * Ejecuta una pasada de mantenimiento con el reloj de la aplicación; sin almacenamiento con purga devuelve ceros. Con medios conectados recorre también
 * la cola de borrado y entrega su resultado a `onMediaQueue` (la respuesta de `/internal/maintenance` conserva sus 5 conteos).
 */
export async function runMaintenance(
  deps: Pick<ApplicationDeps, 'uow' | 'clock' | 'media' | 'adminDelegateRetention'>,
  onMediaQueue?: (result: MediaQueueResult) => void,
): Promise<MaintenanceCounts> {
  // Bloque B (#23) ANTES de la cola de medios: contadores por IP (25 h), vencimiento de disputas (60 d), evidencia vencida (365 d desde `closed_at`: filas físicas + claves a la cola en una unidad, SC-012-118)
  // y barrido de huérfanos del área de espera (24 h). La cola de medios que sigue borra los objetos. Nunca lanzan.
  await purgeIpRateEvents(deps);
  await expireLapsedDisputes(deps).catch(() => 0);
  await purgeExpiredDisputeEvidence(deps).catch(() => 0);
  await sweepOrphanDisputeEvidence(deps);
  if ((deps as Partial<ApplicationDeps>).ids !== undefined) await executeDueDisputeDecisions(deps as unknown as ApplicationDeps).catch(() => 0);
  const queue = await runMediaQueueMaintenance(deps);
  if (deps.media !== undefined) onMediaQueue?.(queue);
  await purgeShareData(deps);
  await purgeSceneData(deps);
  await purgeDelegateData(deps);
  await purgeOwnershipData(deps);
  await purgeCareData(deps);
  if (deps.uow.purgeExpired === undefined) return NO_PURGE;
  return deps.uow.purgeExpired(maintenanceCutoffs(deps.clock.nowIsoTimestamp()));
}
