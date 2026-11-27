/**
 * Arbitraje de disputas desde `/admin` (Feature 012, Bloque B, #23, T1642/T1645/T1646; REQ-CHP12-004, REQ-CHP12-009, REQ-CHP12-010, INV-CHP12-005, INV-CHP12-006, EDGE-012-043, EDGE-012-060,
 * EDGE-012-061, EDGE-012-064; contratos `admin-disputes.openapi.yaml` y `admin-disputes.schema.json`).
 * - ÁRBITRO NO ES PARTE: el administrador no puede decidir, confirmar, prorrogar, cancelar ni cerrar si es parte (por la cuenta de usuario vinculada a su correo): `ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`
 *   (403, texto neutro, sin indicar el vínculo). Se evalúa DENTRO de la transacción de escritura. `person_id` (opaco, persona física verificada) AUSENTE o IGUAL al del resolutor => falla CERRADA con el mismo error.
 * - CONTROL DUAL OBLIGATORIO en `CHIP_APPROPRIATION` para todo desenlace que cambia titularidad (`ADD_CO_OWNER`, `REQUEST_CHANGE_PRINCIPAL`): `resolve` registra (fase derivada `AWAITING_CONFIRMATION`, la fila
 *   sigue `UNDER_REVIEW`, no ejecuta) y `confirm` lo ejecuta un segundo administrador DISTINTO por `admin_id` Y por `person_id`, que no es parte y que leyó antes la evidencia (lectura auditada).
 * - VENTANA de `ARBITRATION_DELAY_HOURS` (72 h) SOLO en `CO_OWNER_ABSENT_OR_BLOCKING` y `PRINCIPAL_ABSENT` (a elección): `executes_after = now + 72 h`, cancelable hasta entonces por cualquier administrador no parte;
 *   el temporizador NO decide, solo ejecuta una decisión humana ya registrada y revalidada. `REJECT` cierra el caso (cooldown de 90 días) sin control dual ni ventana.
 * - STEP-UP: `assertStepUpGrant` es la compuerta de la capa de rutas (grant de UN SOLO USO ligado a `(adminId, disputeId, acción)`, vigente `ADMIN_STEPUP_WINDOW_MINUTES` = 5); sin grant vigente, 403 genérico de `/admin`
 *   (`AdminForbiddenError`, sin código de catálogo nuevo) y no se ejecuta nada. Los casos de uso asumen un actor ya verificado.
 * - Cero transferencia automática (INV-CHP12-006): ningún estado cambia sin una decisión humana registrada. Prórroga única de `DISPUTE_FREEZE_EXTENSION_DAYS` (30) con techo de 60 días desde la apertura.
 * - NO FUGA DE IDENTIDAD (T1645): el aviso al reclamante es solo el desenlace cerrado (`chipRequestView`); el expediente expone alias (`AdminActorView`), y los identificadores (`AdminActorIdentity`) solo a SUPER_ADMIN.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-009, REQ-CHP12-010, INV-CHP12-004, INV-CHP12-005, INV-CHP12-006, EDGE-012-043, EDGE-012-060, EDGE-012-061, EDGE-012-064, SC-012-080, SC-012-098, SC-012-102, SC-012-104
 */

import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { DomainError } from '../../generated/v38/index.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import { occupiesSlot } from '../../domain/pet/co-ownership.ts';
import {
  ADMIN_STEPUP_WINDOW_MINUTES,
  ARBITRATION_DELAY_HOURS,
  DAY_MS,
  DECISION_REASON_MAX_CHARS,
  DISPUTE_EVIDENCE_RETENTION_DAYS,
  DISPUTE_FREEZE_ABSOLUTE_MAX_DAYS,
  DISPUTE_FREEZE_EXTENSION_DAYS,
  MAX_CO_OWNERS_PER_PET,
} from '../../domain/platform/feature-012-limits.ts';
import type { OwnerRequestRecord } from '../ports/co-ownership.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { materializeExpiredInvitations, ownersOf, recordOwnershipAudit, retryable, revokeLinksOfNonOwners, runOwnershipTransaction, settledRequest } from './co-ownership-support.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT';

/** Administrador ya autenticado por la capa de rutas (el rol se resuelve desde BD en cada petición, EDGE-011-015). `personId` opaco o `null` si no está asignado. */
export interface ArbiterActor {
  readonly adminId: string;
  readonly role: AdminRole;
  readonly personId: string | null;
}

/** 404 uniforme de `/admin` (sesión inexistente o expediente inexistente): la ruta lo traduce al manejador de rutas inexistentes. */
export class DisputeNotFoundError extends Error {
  constructor() {
    super('No encontrado.');
    this.name = 'DisputeNotFoundError';
  }
}

/** 403 genérico de `/admin` SIN código de catálogo nuevo (decisión de Neo, Nivel 2, 2026-11-27): sin reautenticación vigente, o confirmación sin evidencia leída. No se ejecuta nada. */
export class AdminForbiddenError extends Error {
  constructor() {
    super('Operación no permitida.');
    this.name = 'AdminForbiddenError';
  }
}

export type DisputeResolutionKind = 'REJECT' | 'ADD_CO_OWNER' | 'REQUEST_CHANGE_PRINCIPAL' | 'END_CO_OWNERSHIP';
export type DecisionPhase = 'NONE' | 'AWAITING_CONFIRMATION' | 'SCHEDULED_EXECUTION';

export interface ResolveBody {
  readonly resolution: DisputeResolutionKind;
  readonly reason?: string;
  /** Solo disputas por ausencia; `CHIP_APPROPRIATION` fija `DUAL_CONTROL`. */
  readonly executionMode?: 'DUAL_CONTROL' | 'WINDOW_72H';
}
export interface ReasonBody {
  readonly reason?: string;
}

/** Instante de cierre de una disputa (`closed_at`, ancla común de retención): derivado de la decisión humana o del vencimiento. */
export const closedAtOf = (row: Pick<OwnerRequestRecord, 'resolvedAt' | 'decidedAt' | 'expiresAt'>): string => row.resolvedAt ?? row.decidedAt ?? row.expiresAt;

/** Fase de decisión DERIVADA de las columnas (la fila sigue en `UNDER_REVIEW`; no es un estado de STATE-OWNREQ12-001). */
export function decisionPhaseOf(row: Pick<OwnerRequestRecord, 'status' | 'resolution' | 'executesAfter'>): DecisionPhase {
  if (row.status !== 'UNDER_REVIEW' || row.resolution === null) return 'NONE';
  return row.executesAfter === null ? 'AWAITING_CONFIRMATION' : 'SCHEDULED_EXECUTION';
}

/** Step-up de UN SOLO USO ligado a `(adminId, disputeId, acción)`: lo emite `/admin/disputes/{id}/step-up` y lo consume la ruta antes de `resolve` o `confirm`. */
export interface StepUpGrantRecord {
  readonly grantId: string;
  readonly adminId: string;
  readonly disputeId: string;
  readonly action: 'resolve' | 'confirm';
  readonly issuedAt: string;
  readonly usedAt: string | null;
}

/**
 * Compuerta del step-up (REQ-CHP12-009): el grant debe existir, ser del mismo administrador, disputa y acción, no estar usado y tener menos de `ADMIN_STEPUP_WINDOW_MINUTES` minutos. Devuelve el grant
 * consumido (la ruta lo persiste); cualquier otra cosa lanza el 403 genérico `AdminForbiddenError`.
 */
export function assertStepUpGrant(grant: StepUpGrantRecord | null, expected: { readonly adminId: string; readonly disputeId: string; readonly action: 'resolve' | 'confirm' }, now: string): StepUpGrantRecord {
  if (grant === null || grant.adminId !== expected.adminId || grant.disputeId !== expected.disputeId || grant.action !== expected.action || grant.usedAt !== null) throw new AdminForbiddenError();
  if (now >= addMillis(grant.issuedAt, ADMIN_STEPUP_WINDOW_MINUTES * 60_000)) throw new AdminForbiddenError();
  return { ...grant, usedAt: now };
}

function assertReason(reason: unknown): void {
  if (reason === undefined) return;
  if (typeof reason !== 'string' || [...reason.normalize('NFC')].length > DECISION_REASON_MAX_CHARS) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', `El motivo no puede superar ${DECISION_REASON_MAX_CHARS} caracteres.`, 'reason');
}

const conflict = (): DomainError => new DomainError('ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT');
const stale = (): DomainError => new DomainError('ERR-OWN12-STALE');

/** ¿El administrador es parte? Por la cuenta de usuario vinculada a su correo: solicitante, `target`, principal o co-propietario de la mascota. Sin identidad o sin cuenta vinculada: no es parte. */
async function isParty(repositories: RepositorySet, actor: ArbiterActor, dispute: OwnerRequestRecord): Promise<boolean> {
  const identity = await repositories.adminIdentities.findById(actor.adminId);
  if (identity === null) return false;
  const linked = (await repositories.users.listByEmail(identity.email.trim().toLowerCase())).map((u) => u.id);
  if (linked.length === 0) return false;
  const parties = new Set<string>([dispute.requesterUserId, dispute.targetUserId].filter((id): id is string => id !== null));
  if (dispute.petId !== null) {
    const pet = await repositories.pets.findById(dispute.petId);
    if (pet !== null) {
      parties.add(pet.ownerUserId);
      for (const row of await repositories.coOwners.listByPet(dispute.petId)) if (row.userId !== null && occupiesSlot(row)) parties.add(row.userId);
    }
  }
  return linked.some((id) => parties.has(id));
}

interface Loaded {
  readonly dispute: OwnerRequestRecord;
  readonly now: string;
}

/** Carga común dentro de la transacción de escritura: rol (deny-by-default), existencia, vigencia y recusación. */
async function loadForArbitration(deps: ApplicationDeps, repositories: RepositorySet, actor: ArbiterActor, disputeId: string, options: { readonly requireUnderReview?: boolean } = {}): Promise<Loaded> {
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'OPERATOR') throw new DomainError('ERR-ADM11-ROLE-NOT-AUTHORIZED');
  const dispute = await repositories.ownerRequests.findById(disputeId);
  if (dispute === null || dispute.action !== 'CHIP_DISPUTE') throw new DisputeNotFoundError();
  if (await isParty(repositories, actor, dispute)) throw conflict();
  const now = deps.clock.nowIsoTimestamp();
  if (options.requireUnderReview !== false && (dispute.status !== 'UNDER_REVIEW' || now >= dispute.expiresAt)) throw stale();
  return { dispute, now };
}

async function auditArbiter(deps: ApplicationDeps, repositories: RepositorySet, actor: ArbiterActor, action: string, disputeId: string, now: string): Promise<void> {
  // Solo ids internos: `person_id`, motivo libre y datos de las partes nunca se auditan aquí (rama NUEVO-7).
  await repositories.adminAudit.insert({ id: deps.auditIds.nextId(), adminId: actor.adminId, action, objectRef: `dispute:${disputeId}`, occurredAt: now });
}

/** Cierra la disputa: fila terminal + retención de la evidencia desde `closed_at`. */
async function closeDispute(repositories: RepositorySet, dispute: OwnerRequestRecord, patch: Partial<OwnerRequestRecord> & { readonly status: 'RESOLVED' }, closedAt: string): Promise<OwnerRequestRecord> {
  const next = settledRequest(dispute, { ...patch, decidedAt: closedAt, resolvedAt: patch.resolvedAt ?? closedAt, executesAfter: null });
  if (!(await repositories.ownerRequests.update(next, 'UNDER_REVIEW'))) throw stale();
  await repositories.disputeEvidence.setDeleteAfter(dispute.id, addMillis(closedAt, DISPUTE_EVIDENCE_RETENTION_DAYS * DAY_MS));
  return { ...next, version: dispute.version + 1 };
}

/** Una sola prórroga de `DISPUTE_FREEZE_EXTENSION_DAYS` con motivo, con techo absoluto de 60 días desde la apertura (EDGE-012-061). @implements REQ-CHP12-004, EDGE-012-061, SC-012-098 */
export class ExtendChipDisputeFreezeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, body: ReasonBody = {}): Promise<OwnerRequestRecord> {
    assertReason(body.reason);
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId);
      if (dispute.frozenUntil === null || dispute.freezeExtendedAt !== null) throw new DomainError('ERR-CHP12-DISPUTE-LIMIT'); // segunda prórroga
      const ceiling = addMillis(dispute.createdAt, DISPUTE_FREEZE_ABSOLUTE_MAX_DAYS * DAY_MS);
      const extended = addMillis(dispute.frozenUntil, DISPUTE_FREEZE_EXTENSION_DAYS * DAY_MS);
      if (dispute.frozenUntil >= ceiling) throw new DomainError('ERR-CHP12-DISPUTE-LIMIT'); // ya en el techo
      const next = { ...dispute, frozenUntil: extended > ceiling ? ceiling : extended, freezeExtendedAt: now };
      if (!(await repositories.ownerRequests.update(next, 'UNDER_REVIEW'))) throw stale();
      await auditArbiter(deps, repositories, actor, 'DISPUTE_FREEZE_EXTENDED', disputeId, now);
      return { ...next, version: dispute.version + 1 };
    });
  }
}

/** Resultado de validar una decisión contra el tipo de disputa. */
function validateResolution(dispute: OwnerRequestRecord, body: ResolveBody): void {
  const reason = dispute.disputeReason;
  const ok =
    body.resolution === 'REJECT' ||
    (body.resolution === 'ADD_CO_OWNER' && reason === 'CHIP_APPROPRIATION') ||
    (body.resolution === 'REQUEST_CHANGE_PRINCIPAL' && (reason === 'CHIP_APPROPRIATION' || reason === 'PRINCIPAL_ABSENT')) ||
    (body.resolution === 'END_CO_OWNERSHIP' && reason === 'CO_OWNER_ABSENT_OR_BLOCKING');
  if (!ok) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Desenlace no válido para este tipo de disputa.', 'resolution');
  if (body.executionMode !== undefined && (reason === 'CHIP_APPROPRIATION' ? body.executionMode !== 'DUAL_CONTROL' : false)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Vía de ejecución no permitida.', 'executionMode');
}

/** Identidad del arbitraje que se guarda en la fila: el `admin_id` solo si existe en `admin_identities` (FK RESTRICT); `person_id` es copia seudónima sin FK. */
async function actorColumns(repositories: RepositorySet, actor: ArbiterActor): Promise<{ readonly adminId: string | null; readonly personId: string }> {
  if (actor.personId === null || actor.personId === '') throw conflict(); // falla CERRADA: sin person_id no hay arbitraje
  const known = (await repositories.adminIdentities.findById(actor.adminId)) !== null;
  return { adminId: known ? actor.adminId : null, personId: actor.personId };
}

/**
 * Registra la decisión del árbitro principal. `REJECT` cierra (RESOLVED, cooldown de 90 días); el resto queda en espera de confirmación (control dual) o programado (ventana de 72 h, solo ausencia);
 * NO ejecuta nada. @implements REQ-CHP12-009, INV-CHP12-006, EDGE-012-060, SC-012-102, SC-012-104
 */
export class ResolveChipDisputeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, body: ResolveBody): Promise<OwnerRequestRecord> {
    assertReason(body.reason);
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId);
      const columns = await actorColumns(repositories, actor);
      if (dispute.resolution !== null) throw stale(); // ya hay una decisión registrada
      validateResolution(dispute, body);
      let result: OwnerRequestRecord;
      if (body.resolution === 'REJECT') {
        result = await closeDispute(repositories, dispute, { status: 'RESOLVED', resolution: 'REJECT', resolvedByAdminId: columns.adminId, resolvedByPersonId: columns.personId }, now);
      } else {
        const window = dispute.disputeReason !== 'CHIP_APPROPRIATION' && body.executionMode === 'WINDOW_72H';
        const next = { ...dispute, resolution: body.resolution, resolvedAt: now, resolvedByAdminId: columns.adminId, resolvedByPersonId: columns.personId, executesAfter: window ? addMillis(now, ARBITRATION_DELAY_HOURS * 3_600_000) : null };
        if (!(await repositories.ownerRequests.update(next, 'UNDER_REVIEW'))) throw stale();
        result = { ...next, version: dispute.version + 1 };
      }
      await auditArbiter(deps, repositories, actor, body.resolution === 'REJECT' ? 'DISPUTE_REJECTED' : 'DISPUTE_DECISION_RECORDED', disputeId, now);
      return result;
    });
  }
}

/**
 * Ejecuta la decisión registrada bajo el bloqueo por mascota (misma transacción que quien la dispara: `confirm` o el temporizador). Revalida: si la mascota ya no existe cierra sin efecto (`PET_GONE`,
 * `REJECT`, sin cooldown); el tope y el estado de las partes se comprueban antes de escribir. Sube `ownership_version` UNA vez (invalida las solicitudes obsoletas).
 */
async function executeDecision(deps: ApplicationDeps, repositories: RepositorySet, dispute: OwnerRequestRecord, closedBy: { readonly adminId: string | null; readonly personId: string | null }, now: string): Promise<OwnerRequestRecord> {
  const closedFields = { secondApproverAdminId: closedBy.adminId, secondApproverPersonId: closedBy.personId, secondApprovedAt: now };
  const moot = (mootReason: 'PET_GONE' | 'REQUESTER_NOT_ACTIVE'): Promise<OwnerRequestRecord> =>
    closeDispute(repositories, dispute, { status: 'RESOLVED', resolution: 'REJECT', mootReason, ...closedFields }, now);
  const petId = dispute.petId;
  const state = petId === null ? null : await repositories.pets.findOwnershipForUpdate(petId);
  if (petId === null || state === null) return moot('PET_GONE');
  const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(petId), now);
  const owners = ownersOf(state.ownerUserId, rows);
  const requester = dispute.requesterUserId;
  if (requester === null) return moot('REQUESTER_NOT_ACTIVE');
  switch (dispute.resolution) {
    case 'ADD_CO_OWNER': {
      if (owners.includes(requester)) return moot('REQUESTER_NOT_ACTIVE');
      if (rows.filter(occupiesSlot).length >= MAX_CO_OWNERS_PER_PET - 1) throw new DomainError('ERR-OWN12-CO-OWNER-LIMIT');
      if ((await repositories.pets.bumpOwnershipVersion(petId, state.ownershipVersion)) !== 1) throw retryable();
      await repositories.coOwners.insert({ id: deps.ids.nextId(), petId, userId: requester, userPseudonym: null, status: 'ACTIVE', invitedByUserId: null, invitedAt: now, expiresAt: now, joinedAt: now, leftAt: null, promotionKind: null, promotionNoticeAckAt: null, version: 1 });
      break;
    }
    case 'REQUEST_CHANGE_PRINCIPAL': {
      if (isPrincipalOfPet(requester, state)) return moot('REQUESTER_NOT_ACTIVE');
      const requesterRow = rows.find((r) => r.status === 'ACTIVE' && r.userId === requester);
      if (requesterRow === undefined && rows.filter(occupiesSlot).length >= MAX_CO_OWNERS_PER_PET - 1) throw new DomainError('ERR-OWN12-CO-OWNER-LIMIT');
      await deps.sceneHooks?.onPetOwnershipTransferred(repositories, { petId, previousOwnerUserId: state.ownerUserId, newOwnerUserId: requester, now });
      if ((await repositories.pets.compareAndSetOwner(petId, state.ownerUserId, state.ownershipVersion, requester)) !== 1) throw retryable();
      if (requesterRow !== undefined && !(await repositories.coOwners.transition(requesterRow.id, 'ACTIVE', { status: 'PROMOTED', leftAt: now, promotionKind: 'DESIGNATED' }))) throw retryable();
      // El principal anterior sigue siendo propietario (nunca se elimina ni se expulsa): pasa a co-propietario ACTIVE.
      await repositories.coOwners.insert({ id: deps.ids.nextId(), petId, userId: state.ownerUserId, userPseudonym: null, status: 'ACTIVE', invitedByUserId: null, invitedAt: now, expiresAt: now, joinedAt: now, leftAt: null, promotionKind: null, promotionNoticeAckAt: null, version: 1 });
      await revokeLinksOfNonOwners(deps, repositories, petId, requester, now);
      break;
    }
    case 'END_CO_OWNERSHIP': {
      const target = dispute.targetUserId;
      const targetRow = rows.find((r) => r.status === 'ACTIVE' && r.userId === target);
      if (targetRow === undefined) return moot('REQUESTER_NOT_ACTIVE'); // el `target` ya no es co-propietario ACTIVE: cierre sin efecto
      if ((await repositories.pets.bumpOwnershipVersion(petId, state.ownershipVersion)) !== 1) throw retryable();
      if (!(await repositories.coOwners.transition(targetRow.id, 'ACTIVE', { status: 'ENDED', leftAt: now }))) throw retryable();
      await revokeLinksOfNonOwners(deps, repositories, petId, requester, now);
      break;
    }
    default:
      throw stale();
  }
  await recordOwnershipAudit(deps, repositories, requester, dispute.resolution === 'END_CO_OWNERSHIP' ? 'CO_OWNER_ENDED' : 'PRINCIPAL_CHANGED_BY_DISPUTE', petId, null, { resolution: dispute.resolution });
  return closeDispute(repositories, dispute, { status: 'RESOLVED', resolution: dispute.resolution as DisputeResolutionKind, resolvedAt: dispute.resolvedAt ?? now, ...closedFields }, now);
}

/**
 * Segundo administrador (control dual): DISTINTO del resolutor por `admin_id` Y por `person_id` (dos cuentas del mismo humano no cuentan), no parte y con la evidencia leída (lectura auditada).
 * @implements REQ-CHP12-009, INV-CHP12-006, SC-012-104
 */
export class ConfirmChipDisputeDecisionUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, body: ReasonBody = {}): Promise<OwnerRequestRecord> {
    assertReason(body.reason);
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId);
      if (decisionPhaseOf(dispute) !== 'AWAITING_CONFIRMATION') throw stale();
      const columns = await actorColumns(repositories, actor);
      if (actor.adminId === dispute.resolvedByAdminId || columns.personId === dispute.resolvedByPersonId) throw conflict(); // mismo humano: falla cerrada
      if ((await repositories.disputeEvidence.listByRequest(disputeId)).length > 0) {
        const read = (await repositories.adminAudit.listByAdmin(actor.adminId)).some((e) => e.action === 'DISPUTE_EVIDENCE_READ' && e.objectRef === `dispute:${disputeId}`);
        if (!read) throw new AdminForbiddenError(); // debe haber leído la evidencia antes de confirmar
      }
      const closed = await executeDecision(deps, repositories, dispute, { adminId: columns.adminId, personId: columns.personId }, now);
      await auditArbiter(deps, repositories, actor, 'DISPUTE_DECISION_CONFIRMED', disputeId, now);
      return closed;
    });
  }
}

/** Cancela la ventana de 72 h (veto): vuelve a `UNDER_REVIEW` sin decisión y sin cambiar nada. Cualquier administrador no parte. @implements EDGE-012-060, SC-012-104 */
export class CancelChipDisputeExecutionUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, body: ReasonBody = {}): Promise<OwnerRequestRecord> {
    assertReason(body.reason);
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId);
      if (decisionPhaseOf(dispute) !== 'SCHEDULED_EXECUTION' || dispute.executesAfter === null || now >= dispute.executesAfter) throw stale();
      const next = { ...dispute, resolution: null, resolvedAt: null, resolvedByAdminId: null, resolvedByPersonId: null, executesAfter: null };
      if (!(await repositories.ownerRequests.update(next, 'UNDER_REVIEW'))) throw stale();
      await auditArbiter(deps, repositories, actor, 'DISPUTE_EXECUTION_CANCELLED', disputeId, now);
      return { ...next, version: dispute.version + 1 };
    });
  }
}

/** Cierre sin efecto: `REJECT` con `moot_reason`; NO activa el cooldown y libera la reserva (`status = RESOLVED`). @implements REQ-CHP12-004, EDGE-012-064 */
export class CloseChipDisputeMootUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, body: { readonly mootReason: 'PET_GONE' | 'REQUESTER_NOT_ACTIVE' | 'TARGET_LEFT' | 'TARGET_NOT_ACTIVE' | 'TRIGGER_LOST' }): Promise<OwnerRequestRecord> {
    const { deps } = this;
    return runOwnershipTransaction(deps, async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId);
      const allowed = dispute.disputeReason === 'CHIP_APPROPRIATION' ? ['PET_GONE', 'REQUESTER_NOT_ACTIVE'] : ['TARGET_LEFT', 'TARGET_NOT_ACTIVE', 'REQUESTER_NOT_ACTIVE', 'TRIGGER_LOST', 'PET_GONE'];
      if (!allowed.includes(body.mootReason)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'Motivo de cierre no válido.', 'mootReason');
      const columns = await actorColumns(repositories, actor);
      const closed = await closeDispute(repositories, dispute, { status: 'RESOLVED', resolution: 'REJECT', mootReason: body.mootReason, resolvedByAdminId: columns.adminId, resolvedByPersonId: columns.personId }, now);
      await auditArbiter(deps, repositories, actor, 'DISPUTE_CLOSED_MOOT', disputeId, now);
      return closed;
    });
  }
}

const EXTENSION_OF: Readonly<Record<string, string>> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Lectura auditada de la evidencia: solo administradores no parte; cada lectura deja una fila en `admin_audit_entries` (quién, disputa; sin contenido). @implements REQ-CHP12-008, SC-012-082 */
export class ReadDisputeEvidenceUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string, evidenceId: string): Promise<{ readonly url: string; readonly expiresAt: string }> {
    const { deps } = this;
    const media = deps.media;
    if (media === undefined) throw new DomainErrorRoot('ERR-INTERNAL-UNEXPECTED', 'El almacenamiento de medios no está configurado.');
    const signed = await deps.uow.runInTransaction(async (repositories) => {
      const { dispute, now } = await loadForArbitration(deps, repositories, actor, disputeId, { requireUnderReview: false });
      const evidence = await repositories.disputeEvidence.findById(evidenceId);
      if (evidence === null || evidence.requestId !== dispute.id) throw new DisputeNotFoundError();
      await auditArbiter(deps, repositories, actor, 'DISPUTE_EVIDENCE_READ', disputeId, now);
      return evidence;
    });
    // URL firmada ≤ 5 minutos, descarga como adjunto (`attachment`) con tipo fijo y nombre neutro (X-Content-Type-Options: nosniff lo añade la ruta).
    return media.storage.createReadUrl({ key: signed.objectKey, contentType: signed.contentType, filename: `argos-evidencia.${EXTENSION_OF[signed.contentType]}`, ttlSeconds: 300, allowShortTtl: true, disposition: 'attachment' });
  }
}

/**
 * Temporizador de la ventana de 72 h: ejecuta SOLO las decisiones humanas ya registradas cuyo `executes_after` venció (nunca decide). Cada una en su transacción; una carrera o un tope lleno la deja para
 * el siguiente barrido. Devuelve cuántas ejecutó.
 */
export async function executeDueDisputeDecisions(deps: ApplicationDeps): Promise<number> {
  const now = deps.clock.nowIsoTimestamp();
  const due = await deps.uow.runInTransaction(async (r) => (await r.ownerRequests.listAll()).filter((d) => d.action === 'CHIP_DISPUTE' && decisionPhaseOf(d) === 'SCHEDULED_EXECUTION' && d.executesAfter !== null && d.executesAfter <= now).map((d) => d.id));
  let executed = 0;
  for (const id of due) {
    try {
      await runOwnershipTransaction(deps, async (repositories) => {
        const dispute = await repositories.ownerRequests.findById(id);
        if (dispute === null || decisionPhaseOf(dispute) !== 'SCHEDULED_EXECUTION' || dispute.executesAfter === null || dispute.executesAfter > now) return;
        await executeDecision(deps, repositories, dispute, { adminId: null, personId: null }, now);
        executed += 1;
      });
    } catch {
      // Se reintenta en el siguiente barrido (el estado no cambió: la transacción se descartó).
    }
  }
  return executed;
}
