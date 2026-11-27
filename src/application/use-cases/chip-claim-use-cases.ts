/**
 * Reclamación de co-propiedad por chip y listado «mis solicitudes» (Feature 012, Bloque B, #23, T1635; REQ-CHP12-003, REQ-CHP12-005, REQ-CHP12-010, INV-CHP12-002, INV-CHP12-003, STATE-OWNREQ12-001).
 * - `CreateChipClaimUseCase`: el `POST` es SIN ORÁCULO: chip libre, chip propio, solicitud ya pendiente y chip ocupado con fila creada responden el MISMO `{ accepted: true }` (la ruta lo serializa como
 *   `ChipRequestAccepted`), sin `claimId`. Cuenta como intento ANTES de resolver (usuario, IP, global) y su 429 es uniforme. Solo un chip existente de otra cuenta crea la fila `PENDING`
 *   (`CLAIM_CO_OWNERSHIP`, `approver_set` = todos los propietarios `ACTIVE`, TTL `CHIP_CLAIM_TTL_DAYS`), anclada a `chip_hmac` y no a la mascota. Tras un `REJECTED` rige el enfriamiento
 *   `CHIP_CLAIM_COOLDOWN_DAYS` por `(solicitante, chip)`; la aprobación (en `owner-request-use-cases.ts`) crea la co-propiedad respetando el tope y revalidando la congelación.
 * - `ListMyChipRequestsUseCase`: solo filas reales y PROPIAS con `chipLast4`; nunca el chip completo ni datos del otro dueño; para una disputa terminal solo el desenlace cerrado (`outcome`).
 *
 * @implements REQ-CHP12-003, REQ-CHP12-005, REQ-CHP12-010, INV-CHP12-002, INV-CHP12-003, SC-012-016, SC-012-017, SC-012-018, SC-012-077, SC-012-079, SC-012-081
 */

import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { DomainError } from '../../generated/v38/index.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { sealApproverSet } from '../../domain/pet/co-ownership.ts';
import { CHIP_CLAIM_COOLDOWN_DAYS, CHIP_CLAIM_TTL_DAYS, CLAIM_MESSAGE_MAX_CHARS, DAY_MS } from '../../domain/platform/feature-012-limits.ts';
import type { OwnerRequestRecord } from '../ports/co-ownership.port.ts';
import { countChipAttempt, type ChipRequestContext } from './chip-ip-rate-limit.ts';
import { chipHmacOf, chipLast4, isChipFormat } from './chip-uniqueness.ts';
import { materializeExpiredInvitations, materializeExpiredRequests, ownersOf, recordOwnershipAudit, runOwnershipTransaction } from './co-ownership-support.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Cuerpo 2xx único de `createChipClaim` y `openChipDispute`: idéntico para toda clase de chip (la ruta lo serializa como `{ status: 'RECEIVED' }`). */
export interface ChipRequestAcceptedResult {
  readonly accepted: true;
}
export const CHIP_REQUEST_ACCEPTED: ChipRequestAcceptedResult = Object.freeze({ accepted: true as const });

/** Validación única del formato del chip (REQ-CHP12-002): inválido = 422 sin consultar el registro y SIN contar como intento. */
export function requireChipFormat(value: unknown): string {
  if (!isChipFormat(value)) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'El microchip debe tener exactamente 15 dígitos.', 'microchipId');
  return value;
}

/** Mensaje opcional: texto plano NFC, hasta `CLAIM_MESSAGE_MAX_CHARS` puntos de código. */
function requireMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', 'El mensaje debe ser texto.', 'message');
  const text = value.normalize('NFC').trim();
  if ([...text].length > CLAIM_MESSAGE_MAX_CHARS) throw new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', `El mensaje no puede superar ${CLAIM_MESSAGE_MAX_CHARS} caracteres.`, 'message');
  return text === '' ? null : text;
}

/** @implements REQ-CHP12-003, REQ-CHP12-005, INV-CHP12-002, INV-CHP12-003, SC-012-016, SC-012-018, SC-012-077, SC-012-079 */
export class CreateChipClaimUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, input: { readonly microchipId: unknown; readonly message?: unknown }, context: ChipRequestContext = {}): Promise<ChipRequestAcceptedResult> {
    const { deps } = this;
    const chip = requireChipFormat(input?.microchipId);
    const message = requireMessage(input.message);
    await countChipAttempt(deps, actorUserId, { microchipId: chip }, context); // cuenta antes de resolver; 429 uniforme
    const anchor = chipHmacOf(deps, chip);
    return runOwnershipTransaction(deps, async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const mine = await materializeExpiredRequests(repositories, (await repositories.ownerRequests.listByChipHmac(anchor)).filter((r) => r.requesterUserId === actorUserId), now);
      const cooldownStart = addMillis(now, -CHIP_CLAIM_COOLDOWN_DAYS * DAY_MS);
      // La ancla (chip_hmac, solicitante) sobrevive a la eliminación de la mascota (SC-012-079): el enfriamiento no depende de `pet_id`.
      if (mine.some((r) => r.action === 'CLAIM_CO_OWNERSHIP' && r.status === 'REJECTED' && r.decidedAt !== null && r.decidedAt > cooldownStart)) throw new DomainError('ERR-CHP12-CLAIM-COOLDOWN');
      const holder = await repositories.pets.findMicrochipHolder(chip);
      if (holder === null) return CHIP_REQUEST_ACCEPTED; // chip libre: 202 idéntico, SIN fila
      if (mine.some((r) => r.action === 'CLAIM_CO_OWNERSHIP' && r.status === 'PENDING')) return CHIP_REQUEST_ACCEPTED; // una sola PENDING por (chip, solicitante): idempotente
      const state = await repositories.pets.findOwnershipForUpdate(holder.petId);
      if (state === null) return CHIP_REQUEST_ACCEPTED;
      const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(holder.petId), now);
      const owners = ownersOf(state.ownerUserId, rows);
      if (owners.includes(actorUserId) || rows.some((r) => r.userId === actorUserId && r.status === 'INVITED')) return CHIP_REQUEST_ACCEPTED; // chip propio: 202 idéntico, SIN fila
      const request: OwnerRequestRecord = {
        id: deps.ids.nextId(),
        action: 'CLAIM_CO_OWNERSHIP',
        petId: holder.petId,
        petVersion: state.ownershipVersion,
        requesterUserId: actorUserId,
        requesterPseudonym: null,
        targetUserId: null,
        targetUsernameSealed: null,
        targetResponse: null,
        triggerRequestIds: null,
        status: 'PENDING',
        approverSet: sealApproverSet(actorUserId, owners),
        approvals: [],
        rejectedBy: null,
        rejectedByPseudonym: null,
        message,
        createdAt: now,
        expiresAt: addMillis(now, CHIP_CLAIM_TTL_DAYS * DAY_MS),
        decidedAt: null,
        staleReason: null,
        disputeReason: null,
        chipLast4: chipLast4(chip),
        chipHmac: anchor,
        frozenUntil: null,
        freezeExtendedAt: null,
        slaDueAt: null,
        escalatedAt: null,
        resolvedAt: null,
        resolution: null,
        mootReason: null,
        resolvedByUserId: null,
        secondApproverUserId: null,
        executesAfter: null,
        version: 1,
      };
      await repositories.ownerRequests.insert(request);
      await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_CREATED', holder.petId, null, { action: request.action, status: request.status });
      return CHIP_REQUEST_ACCEPTED;
    });
  }
}

/** Vista de una solicitud de chip PROPIA (`ChipRequestView`): sin chip completo, sin mascota, sin identidad de nadie. */
export interface ChipRequestItem {
  readonly id: string;
  readonly action: 'CLAIM_CO_OWNERSHIP' | 'CHIP_DISPUTE';
  readonly status: OwnerRequestRecord['status'];
  readonly chipLast4: string;
  readonly disputeReason: 'CHIP_APPROPRIATION' | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
  readonly resolution: 'REJECT' | 'ADD_CO_OWNER' | 'REQUEST_CHANGE_PRINCIPAL' | null;
  readonly mootReason: 'PET_GONE' | 'REQUESTER_NOT_ACTIVE' | null;
  readonly outcome: 'RESOLVED_APPROVED' | 'RESOLVED_REJECTED' | 'EXPIRED' | null;
  readonly resolvedAt: string | null;
}

/** Aviso de resolución al reclamante (F-09, N-C): solo el desenlace cerrado; sin motivo, sin árbitro, sin datos de los propietarios. */
export function chipRequestView(row: OwnerRequestRecord, now: string): ChipRequestItem {
  const isDispute = row.action === 'CHIP_DISPUTE';
  const lapsed = now >= row.expiresAt;
  const status = (row.status === 'PENDING' || row.status === 'UNDER_REVIEW') && lapsed ? 'EXPIRED' : row.status;
  const terminal = isDispute && (status === 'RESOLVED' || status === 'EXPIRED');
  const resolution = isDispute && status === 'RESOLVED' && row.resolution !== null && row.resolution !== 'END_CO_OWNERSHIP' ? row.resolution : null;
  const outcome = !terminal ? null : status === 'EXPIRED' ? 'EXPIRED' : resolution === 'REJECT' || resolution === null ? 'RESOLVED_REJECTED' : 'RESOLVED_APPROVED';
  const moot = isDispute && (row.mootReason === 'PET_GONE' || row.mootReason === 'REQUESTER_NOT_ACTIVE') ? row.mootReason : null;
  return {
    id: row.id,
    action: isDispute ? 'CHIP_DISPUTE' : 'CLAIM_CO_OWNERSHIP',
    status,
    chipLast4: row.chipLast4 ?? '',
    disputeReason: isDispute ? 'CHIP_APPROPRIATION' : null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    resolution,
    mootReason: moot,
    outcome,
    resolvedAt: terminal ? (row.resolvedAt ?? row.decidedAt ?? row.expiresAt) : null,
  };
}

/** «Mis solicitudes» de chip: solo filas reales y propias (chip libre o ya pedido no dejan fila, `lock R-11`). @implements REQ-CHP12-003, REQ-CHP12-010, SC-012-081 */
export class ListMyChipRequestsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string): Promise<ChipRequestItem[]> {
    const { deps } = this;
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const mine = (await repositories.ownerRequests.listByRequester(actorUserId)).filter((r) => r.chipLast4 !== null && (r.action === 'CLAIM_CO_OWNERSHIP' || (r.action === 'CHIP_DISPUTE' && r.disputeReason === 'CHIP_APPROPRIATION')));
      return mine.map((row) => chipRequestView(row, now));
    });
  }
}
