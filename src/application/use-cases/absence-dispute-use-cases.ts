/**
 * Disputa formal por ausencia (Feature 012, Bloque A, T1627; REQ-OWN12-009, N2-R1, H-09, P-1, P-3, P-5): apertura con disparador objetivo SELLADO, ancla `(pet_id, target_user_id)`, congelación por `pet_id` que permite
 * `LEAVE`, y respuesta única del `target`. No hay efecto automático: la resolución es una decisión humana en la cola de `/admin` (Bloque #23, T1632).
 * - Apertura bajo el bloqueo por mascota (REQ-OWN12-011) DESPUÉS de autorizar (H-03): quien no es propietario ACTIVE de la mascota, o un `target` que no es propietario de ELLA, recibe el mismo 404 uniforme.
 * - `ERR-CHP12-ABSENCE-NOT-ELIGIBLE` (sin disparador, ancla ya abierta, `target` = solicitante, variante que no corresponde) solo llega a propietarios ACTIVE y NUNCA indica la causa.
 * - «Sesión activa» del `target` = cualquier petición autenticada o renovación de su sesión (`sessions.last_activity_at`); `target_last_active_at` es ese máximo (fuente fijada aquí, sin columna nueva). Limitación
 *   documentada: el mantenimiento purga las sesiones 7 días después de vencer (ADR-002-14), de modo que la actividad de solo lectura anterior a esa ventana no es observable; sin registro cuenta como inactivo.
 *
 * @implements REQ-OWN12-009, REQ-OWN12-011, INV-OWN12-004, INV-OWN12-006, SC-012-091, SC-012-092, SC-012-093, SC-012-102, SC-012-114, SC-012-115
 */

import { DomainError } from '../../generated/v38/index.ts';
import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { validateAbsenceResponseRequest, validateOpenAbsenceDisputeRequest, type AbsenceDisputeOpened, type AbsenceResponseRequest, type OpenAbsenceDisputeRequest } from '../../generated/v38/index.ts';
import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { addBusinessDays, evaluateAbsenceTrigger } from '../../domain/pet/absence-trigger.ts';
import { DAY_MS, DISPUTE_FREEZE_MAX_DAYS, DISPUTE_MAX_OPEN_DAYS, DISPUTE_REJECTED_COOLDOWN_DAYS, DISPUTE_SLA_BUSINESS_DAYS, MAX_OPEN_DISPUTES_PER_USER } from '../../domain/platform/feature-012-limits.ts';
import type { OwnerRequestRecord } from '../ports/co-ownership.port.ts';
import { materializeExpiredInvitations, runOwnershipTransaction, materializeExpiredRequests, openAbsenceDisputes, ownersOf, recordOwnershipAudit, requireOwner } from './co-ownership-support.ts';
import { assertMatchesSchema, type ApplicationDeps } from './use-case-support.ts';

const notFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
const notEligible = (): DomainError => new DomainError('ERR-CHP12-ABSENCE-NOT-ELIGIBLE');

/** @implements REQ-OWN12-009, REQ-OWN12-011, INV-OWN12-004, INV-OWN12-006, SC-012-091, SC-012-114, SC-012-115 */
export class OpenAbsenceDisputeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<AbsenceDisputeOpened> {
    const body = assertMatchesSchema<OpenAbsenceDisputeRequest>('OpenAbsenceDisputeRequest', validateOpenAbsenceDisputeRequest, input);
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      await requireOwner(repositories, actorUserId, petId); // autorización (404 uniforme) ANTES del bloqueo (H-03)
      const state = await repositories.pets.findOwnershipForUpdate(petId);
      if (state === null) throw notFound();
      const now = deps.clock.nowIsoTimestamp();
      const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
      const owners = ownersOf(state.ownerUserId, rows);
      if (!owners.includes(actorUserId)) throw notFound();
      // Un `target` que no es propietario de ESTA mascota da el mismo 404 que una mascota ajena (H-04): el cuerpo no lleva `petId`.
      if (!owners.includes(body.targetUserId)) throw notFound();
      if (body.targetUserId === actorUserId) throw notEligible();
      const principalTarget = isPrincipalOfPet(body.targetUserId, state);
      // Variante única por `target`: el principal solo con `PRINCIPAL_ABSENT`; un co-propietario solo con `CO_OWNER_ABSENT_OR_BLOCKING`.
      if (body.disputeReason !== (principalTarget ? 'PRINCIPAL_ABSENT' : 'CO_OWNER_ABSENT_OR_BLOCKING')) throw notEligible();
      const requests = await materializeExpiredRequests(repositories, await repositories.ownerRequests.listByPet(petId), now);
      if (requests.some((r) => r.action === 'CHIP_DISPUTE' && r.status === 'UNDER_REVIEW' && r.targetUserId === body.targetUserId)) throw notEligible(); // ancla (pet_id, target_user_id) ya abierta
      const trigger = evaluateAbsenceTrigger({
        targetUserId: body.targetUserId,
        now,
        requests: requests.map((r) => ({ id: r.id, action: r.action, status: r.status, createdAt: r.createdAt, expiresAt: r.expiresAt, approverSet: r.approverSet, approvals: r.approvals, rejectedBy: r.rejectedBy, staleReason: r.staleReason })),
        targetLastActiveAt: await repositories.sessions.findLastActivityOfUser(body.targetUserId),
      });
      if (!trigger.eligible) throw notEligible();
      // Límites del solicitante (REQ-CHP12-004): hasta MAX_OPEN_DISPUTES_PER_USER simultáneas y cooldown de 90 días tras un `REJECT` de `/admin` sobre la misma ancla (el vencimiento y el cierre sin efecto no lo activan, P-1).
      const mine = await repositories.ownerRequests.listByRequester(actorUserId);
      if (mine.filter((r) => r.action === 'CHIP_DISPUTE' && r.status === 'UNDER_REVIEW').length >= MAX_OPEN_DISPUTES_PER_USER) throw new DomainError('ERR-CHP12-DISPUTE-LIMIT');
      const cooldownStart = addMillis(now, -DISPUTE_REJECTED_COOLDOWN_DAYS * DAY_MS);
      if (mine.some((r) => r.action === 'CHIP_DISPUTE' && r.petId === petId && r.targetUserId === body.targetUserId && r.resolution === 'REJECT' && r.mootReason === null && r.resolvedAt !== null && r.resolvedAt > cooldownStart)) {
        throw new DomainError('ERR-CHP12-DISPUTE-COOLDOWN');
      }
      const frozenUntil = addMillis(now, DISPUTE_FREEZE_MAX_DAYS * DAY_MS);
      const slaDueAt = addBusinessDays(now, DISPUTE_SLA_BUSINESS_DAYS);
      const dispute: OwnerRequestRecord = {
        id: deps.ids.nextId(),
        action: 'CHIP_DISPUTE',
        petId,
        petVersion: state.ownershipVersion,
        requesterUserId: actorUserId,
        requesterPseudonym: null,
        targetUserId: body.targetUserId,
        targetUsernameSealed: null,
        targetResponse: null,
        triggerRequestIds: [...trigger.triggerRequestIds], // el disparador se SELLA al abrir: la ventana de 60 días solo se evalúa ahora
        status: 'UNDER_REVIEW',
        approverSet: [],
        approvals: [],
        rejectedBy: null,
        rejectedByPseudonym: null,
        message: null,
        createdAt: now,
        expiresAt: addMillis(now, DISPUTE_MAX_OPEN_DAYS * DAY_MS),
        decidedAt: null,
        staleReason: null,
        disputeReason: body.disputeReason,
        chipLast4: null,
        chipHmac: null,
        frozenUntil,
        freezeExtendedAt: null,
        slaDueAt,
        escalatedAt: null,
        resolvedAt: null,
        resolution: null,
        mootReason: null,
        resolvedByUserId: null,
        secondApproverUserId: null,
        executesAfter: null,
        version: 1,
      };
      await repositories.ownerRequests.insert(dispute);
      await recordOwnershipAudit(deps, repositories, actorUserId, 'ABSENCE_DISPUTE_OPENED', petId, null, { disputeReason: body.disputeReason, triggers: trigger.triggerRequestIds.length });
      return { status: 'UNDER_REVIEW', frozenUntil, slaDueAt } as const;
    });
  }
}

/** Respuesta única del `target` (≤ 280 puntos de código, texto plano, escritura única): una segunda llamada es `409 ERR-OWN12-STALE` sin sobrescribir. @implements REQ-OWN12-009, INV-OWN12-004, SC-012-102 */
export class RespondAbsenceDisputeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<204> {
    const normalized = typeof input === 'object' && input !== null && typeof (input as Record<string, unknown>)['response'] === 'string' ? { ...(input as Record<string, unknown>), response: ((input as Record<string, unknown>)['response'] as string).normalize('NFC') } : input;
    const { response } = assertMatchesSchema<AbsenceResponseRequest>('AbsenceResponseRequest', validateAbsenceResponseRequest, normalized);
    if ([...response].length > 280) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'La respuesta no puede superar 280 caracteres.', 'response');
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const first = (await openAbsenceDisputes(repositories, petId)).find((d) => d.targetUserId === actorUserId);
      if (first === undefined) throw notFound(); // sin disputa abierta para ese usuario: 404 uniforme
      if ((await repositories.pets.findOwnershipForUpdate(petId)) === null) throw notFound();
      const current = (await openAbsenceDisputes(repositories, petId)).find((d) => d.targetUserId === actorUserId);
      if (current === undefined) throw new DomainError('ERR-OWN12-STALE');
      if (current.targetResponse !== null) throw new DomainError('ERR-OWN12-STALE'); // escritura única: UPDATE … WHERE target_response IS NULL
      if (!(await repositories.ownerRequests.update({ ...current, targetResponse: response }, 'UNDER_REVIEW'))) throw new DomainError('ERR-OWN12-STALE');
      await recordOwnershipAudit(deps, repositories, actorUserId, 'ABSENCE_DISPUTE_TARGET_RESPONDED', petId, null, null); // sin contenido
      return 204 as const;
    });
  }
}
