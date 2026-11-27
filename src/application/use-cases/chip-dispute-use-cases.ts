/**
 * Apertura de una disputa de chip por apropiación (Feature 012, Bloque B, #23, T1635/T1646; REQ-CHP12-004, REQ-CHP12-008, INV-CHP12-005, INV-CHP12-009, STATE-OWNREQ12-001).
 * `OpenChipDisputeUseCase` recibe la evidencia YA saneada y analizada (`prepareDisputeEvidence`, chip-evidence.ts: tipo por firma, reencodificación, límite de píxeles, PDF sin contenido activo,
 * antimalware); aquí solo se valida la forma (1..`DISPUTE_EVIDENCE_MAX_FILES` archivos de tipo cerrado y tamaño ≤ el tope de 004) ANTES de resolver el chip: un archivo inválido da 422 igual para
 * chip libre u ocupado, sin consultar el registro y sin contarse.
 * - Orden: forma (422) -> contador de intentos (429 uniforme, antes de resolver) -> INTENT de las claves y subida al almacén FUERA de toda transacción -> transacción con bloqueo por mascota.
 * - Precondiciones (trinity C-2, B-3): el solicitante no es propietario principal ni co-propietario `INVITED`/`ACTIVE` del chip; chip sin mascota ni reserva, o cualquier otra precondición
 *   fallida => el MISMO `{ accepted: true }` SIN fila (los objetos subidos se descartan), contado en REQ-CHP12-005. `ERR-CHP12-DISPUTE-LIMIT` y `ERR-CHP12-DISPUTE-COOLDOWN` solo tras superarlas.
 * - La fila nace `UNDER_REVIEW` con congelación `DISPUTE_FREEZE_MAX_DAYS` (30), vencimiento `DISPUTE_MAX_OPEN_DAYS` (60) y SLA de 15 días hábiles; la RESERVA del chip vive mientras la fila siga
 *   `UNDER_REVIEW` y no venza (sobrevive a la caducidad de la congelación y a la eliminación de la mascota) y se libera al cerrarse por `RESOLVED` o `EXPIRED`.
 * - Los archivos se registran en `dispute_evidence` en la MISMA transacción que la fila (una sola unidad); los huérfanos se encolan para borrado.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-004, INV-CHP12-005, INV-CHP12-009, SC-012-019, SC-012-097, SC-012-098, SC-012-100, SC-012-111
 */

import { DomainError as DomainErrorRoot } from '../../generated/index.ts';
import { DomainError } from '../../generated/v38/index.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { disputeEvidenceObjectKey } from '../../domain/media/media-keys.ts';
import { addBusinessDays } from '../../domain/pet/absence-trigger.ts';
import { DAY_MS, DISPUTE_EVIDENCE_MAX_FILES, DISPUTE_FREEZE_MAX_DAYS, DISPUTE_MAX_OPEN_DAYS, DISPUTE_REJECTED_COOLDOWN_DAYS, DISPUTE_SLA_BUSINESS_DAYS, MAX_OPEN_DISPUTES_PER_USER } from '../../domain/platform/feature-012-limits.ts';
import type { OwnerRequestRecord } from '../ports/co-ownership.port.ts';
import type { EvidenceContentType } from '../ports/dispute-evidence.port.ts';
import { CHIP_REQUEST_ACCEPTED, requireChipFormat, type ChipRequestAcceptedResult } from './chip-claim-use-cases.ts';
import { countChipAttempt, type ChipRequestContext } from './chip-ip-rate-limit.ts';
import { chipHmacOf, chipLast4 } from './chip-uniqueness.ts';
import { materializeExpiredInvitations, ownersOf, recordOwnershipAudit, runOwnershipTransaction } from './co-ownership-support.ts';
import { mapStorageError, purgeObjects, requireMedia } from './media-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export const EVIDENCE_CONTENT_TYPES: readonly EvidenceContentType[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Un archivo de evidencia ya saneado y analizado. */
export interface DisputeEvidenceFile {
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface OpenChipDisputeInput {
  readonly microchipId: unknown;
  readonly evidence: readonly DisputeEvidenceFile[];
}

const invalid = (message: string): DomainErrorRoot => new DomainErrorRoot('ERR-SCHEMA-VALIDATION-FAILED', message, 'evidence');

/** Forma de la evidencia: 1..5 archivos de tipo cerrado, no vacíos y dentro del tope por archivo de 004. */
export function assertEvidenceShape(evidence: unknown, maxBytes: number): asserts evidence is readonly DisputeEvidenceFile[] {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > DISPUTE_EVIDENCE_MAX_FILES) throw invalid(`La evidencia debe tener entre 1 y ${DISPUTE_EVIDENCE_MAX_FILES} archivos.`);
  for (const file of evidence as readonly Partial<DisputeEvidenceFile>[]) {
    if (!EVIDENCE_CONTENT_TYPES.includes(file.contentType as EvidenceContentType)) throw invalid('Tipo de evidencia no permitido.');
    if (!(file.bytes instanceof Uint8Array) || file.bytes.length === 0 || file.bytes.length > maxBytes) throw invalid('Tamaño de evidencia no válido.');
  }
}

/** Disputas `CHIP_DISPUTE` `UNDER_REVIEW` y vigentes del solicitante (todas las clases: por chip y por ausencia). */
const openOnes = (mine: readonly OwnerRequestRecord[], now: string): OwnerRequestRecord[] => mine.filter((r) => r.action === 'CHIP_DISPUTE' && r.status === 'UNDER_REVIEW' && r.expiresAt > now);

/** @implements REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, INV-CHP12-005, INV-CHP12-009, SC-012-097, SC-012-098, SC-012-100, SC-012-111 */
export class OpenChipDisputeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, input: OpenChipDisputeInput, context: ChipRequestContext = {}): Promise<ChipRequestAcceptedResult> {
    const { deps } = this;
    const media = requireMedia(deps);
    const chip = requireChipFormat(input?.microchipId);
    assertEvidenceShape(input.evidence, media.limits.maxBytes); // forma ANTES de resolver el chip: 422 uniforme, sin contar
    await countChipAttempt(deps, actorUserId, { microchipId: chip }, context); // el POST de apertura también cuenta (REQ-CHP12-005)
    const anchor = chipHmacOf(deps, chip);
    const requestId = deps.ids.nextId();
    const staged = input.evidence.map((file) => ({ id: deps.ids.nextId(), key: disputeEvidenceObjectKey(requestId, deps.ids.nextId()), file }));

    // 1. INTENT de las claves (conciliable si el proceso muere) y subida fuera de toda transacción.
    await deps.uow.runInTransaction(async (r) => {
      for (const item of staged) await r.mediaQueue.enqueue(item.key, 'INTENT', deps.clock.nowIsoTimestamp());
    });
    try {
      for (const item of staged) await media.storage.put(item.key, item.file.bytes, item.file.contentType);
    } catch (error) {
      await this.discard(staged.map((s) => s.key));
      throw mapStorageError(error);
    }

    // 2. Transacción única: precondiciones, límites, fila y evidencia.
    let created = false;
    try {
      created = await runOwnershipTransaction(deps, async (repositories) => {
        const now = deps.clock.nowIsoTimestamp();
        const holder = await repositories.pets.findMicrochipHolder(chip);
        const reserved = await repositories.ownerRequests.hasOpenChipReservation(anchor, now);
        if (holder === null && !reserved) return false; // chip sin mascota ni reserva: 202 idéntico, SIN fila
        let petVersion = 1;
        if (holder !== null) {
          const state = await repositories.pets.findOwnershipForUpdate(holder.petId);
          if (state === null) return false;
          petVersion = state.ownershipVersion;
          const rows = await materializeExpiredInvitations(repositories, await repositories.coOwners.listByPet(holder.petId), now);
          if (ownersOf(state.ownerUserId, rows).includes(actorUserId) || rows.some((r) => r.userId === actorUserId && r.status === 'INVITED')) return false; // nadie congela su propia mascota
        }
        const mine = await repositories.ownerRequests.listByRequester(actorUserId);
        const open = openOnes(mine, now);
        if (open.some((r) => r.chipHmac === anchor) || open.length >= MAX_OPEN_DISPUTES_PER_USER) throw new DomainError('ERR-CHP12-DISPUTE-LIMIT');
        const cooldownStart = addMillis(now, -DISPUTE_REJECTED_COOLDOWN_DAYS * DAY_MS);
        if (mine.some((r) => r.action === 'CHIP_DISPUTE' && r.chipHmac === anchor && r.resolution === 'REJECT' && r.mootReason === null && r.resolvedAt !== null && r.resolvedAt > cooldownStart)) {
          throw new DomainError('ERR-CHP12-DISPUTE-COOLDOWN'); // solo tras REJECT de /admin; EXPIRED y el cierre sin efecto no lo activan (P-1)
        }
        const dispute: OwnerRequestRecord = {
          id: requestId,
          action: 'CHIP_DISPUTE',
          petId: holder?.petId ?? null,
          petVersion,
          requesterUserId: actorUserId,
          requesterPseudonym: null,
          targetUserId: null,
          targetUsernameSealed: null,
          targetResponse: null,
          triggerRequestIds: null,
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
          disputeReason: 'CHIP_APPROPRIATION',
          chipLast4: chipLast4(chip),
          chipHmac: anchor,
          frozenUntil: addMillis(now, DISPUTE_FREEZE_MAX_DAYS * DAY_MS),
          freezeExtendedAt: null,
          slaDueAt: addBusinessDays(now, DISPUTE_SLA_BUSINESS_DAYS),
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
        for (const item of staged) {
          await repositories.disputeEvidence.insert({ id: item.id, requestId, objectKey: item.key, contentType: item.file.contentType as EvidenceContentType, bytes: item.file.bytes.length, createdAt: now, deleteAfter: null });
          await repositories.mediaQueue.remove(item.key); // los objetos ya tienen fila: dejan de ser huérfanos
        }
        if (holder !== null) await recordOwnershipAudit(deps, repositories, actorUserId, 'OWNER_REQUEST_CREATED', holder.petId, null, { action: 'CHIP_DISPUTE', status: 'UNDER_REVIEW' });
        return true;
      });
    } catch (error) {
      await this.discard(staged.map((s) => s.key));
      throw error;
    }
    if (!created) await this.discard(staged.map((s) => s.key)); // 202 sin fila: ningún archivo queda asociado
    return CHIP_REQUEST_ACCEPTED;
  }

  /** Los objetos subidos sin fila pasan a `DELETE` y se borran; si algo falla queda en la cola (REQ-GCS-004) y el barrido de huérfanos lo recoge. */
  private async discard(keys: readonly string[]): Promise<void> {
    try {
      await this.deps.uow.runInTransaction(async (r) => {
        for (const key of keys) await r.mediaQueue.enqueue(key, 'DELETE', this.deps.clock.nowIsoTimestamp());
      });
    } catch {
      return; // la fila INTENT sigue; el mantenimiento la convierte en DELETE
    }
    await purgeObjects(this.deps, keys);
  }
}
