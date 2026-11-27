/**
 * Vistas de lectura de la cola de disputas de `/admin` (Feature 012, Bloque B, #23, T1636; REQ-CHP12-004, REQ-CHP12-008, INV-CHP12-004, EDGE-012-043; contratos `admin-disputes.openapi.yaml` y
 * `admin-disputes.schema.json`). Solo lectura (la apertura del expediente deja una fila de auditoría de administración, sin contenido):
 * - `ListChipDisputesUseCase`: cola de `owner_requests` con `action = CHIP_DISPUTE` en `UNDER_REVIEW` y vigentes, orden estable `slaDueAt ASC, disputeId ASC`, cursor opaco ligado al administrador, filtros
 *   `kind`, `slaOverdue` y `decisionPhase`. Si el administrador es parte la fila lleva `iAmParty = true` (no abre expediente). Solo `chipLast4`, fechas y SLA: nunca correo ni identidad.
 * - `GetChipDisputeUseCase`: expediente seudonimizado (alias `Parte A`/`Parte B`, evidencia solo con metadatos y `readByMe`, actores por alias y rol; `actorIdentities` SOLO para `SUPER_ADMIN`).
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, INV-CHP12-004, EDGE-012-043
 */

import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV38 } from '../../generated/v38/index.ts';
import type { OwnerRequestRecord } from '../ports/co-ownership.port.ts';
import { resolveAdminAccess } from './admin-access.ts';
import { auditArbiter, DisputeNotFoundError, decisionPhaseOf, isParty, loadForArbitration, type ArbiterActor, type DecisionPhase } from './chip-dispute-admin-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

type DisputeKind = 'CHIP_APPROPRIATION' | 'CO_OWNER_ABSENT_OR_BLOCKING' | 'PRINCIPAL_ABSENT';
const KINDS: readonly string[] = ['CHIP_APPROPRIATION', 'CO_OWNER_ABSENT_OR_BLOCKING', 'PRINCIPAL_ABSENT'];
const PHASES: readonly string[] = ['NONE', 'AWAITING_CONFIRMATION', 'SCHEDULED_EXECUTION'];

export interface DisputeQueueQuery {
  readonly kind?: unknown;
  readonly slaOverdue?: unknown;
  readonly decisionPhase?: unknown;
  readonly limit?: unknown;
  readonly cursor?: unknown;
}

export interface AdminDisputeQueueItem {
  readonly disputeId: string;
  readonly kind: DisputeKind;
  readonly status: OwnerRequestRecord['status'];
  readonly chipLast4?: string;
  readonly createdAt: string;
  readonly frozenUntil?: string;
  readonly expiresAt: string;
  readonly slaDueAt: string;
  readonly slaOverdue: boolean;
  readonly decisionPhase: DecisionPhase;
  readonly iAmParty: boolean;
}

export interface AdminDisputeQueue {
  readonly items: AdminDisputeQueueItem[];
  readonly nextCursor?: string;
}

const invalid = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Parámetro no válido.', field);

/** Cursor opaco `slaDueAt|disputeId` ligado al administrador (otro administrador = 422 uniforme). */
const encodeCursor = (adminId: string, row: { readonly slaDueAt: string; readonly id: string }): string => Buffer.from(`${adminId}|${row.slaDueAt}|${row.id}`, 'utf8').toString('base64url');
function decodeCursor(adminId: string, cursor: string): { readonly slaDueAt: string; readonly id: string } {
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (parts.length !== 3 || parts[0] !== adminId) throw invalid('cursor');
  return { slaDueAt: parts[1]!, id: parts[2]! };
}

/** Booleano de consulta: solo `true` o `false` literales. */
function queryBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw invalid(field);
}

function requireOperator(actor: ArbiterActor): void {
  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'OPERATOR') throw new DomainErrorV38('ERR-ADM11-ROLE-NOT-AUTHORIZED');
}

/** @implements REQ-CHP12-004, EDGE-012-043 */
export class ListChipDisputesUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, query: DisputeQueueQuery = {}): Promise<AdminDisputeQueue> {
    requireOperator(actor);
    const { deps } = this;
    const kind = query.kind;
    if (kind !== undefined && !KINDS.includes(String(kind))) throw invalid('kind');
    const phase = query.decisionPhase;
    if (phase !== undefined && !PHASES.includes(String(phase))) throw invalid('decisionPhase');
    const overdue = queryBoolean(query.slaOverdue, 'slaOverdue');
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('limit');
    if (query.cursor !== undefined && (typeof query.cursor !== 'string' || query.cursor.length < 1 || query.cursor.length > 256)) throw invalid('cursor');
    const after = query.cursor === undefined ? null : decodeCursor(actor.adminId, query.cursor as string);
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const rows = (await repositories.ownerRequests.listOpenDisputes(now))
        .filter((r) => kind === undefined || r.disputeReason === kind)
        .filter((r) => phase === undefined || decisionPhaseOf(r) === phase)
        .filter((r) => overdue === undefined || (now > r.slaDueAt!) === overdue)
        .filter((r) => after === null || r.slaDueAt! > after.slaDueAt || (r.slaDueAt! === after.slaDueAt && r.id > after.id));
      const page = rows.slice(0, limit);
      const items: AdminDisputeQueueItem[] = [];
      for (const r of page) {
        items.push({
          disputeId: r.id,
          kind: r.disputeReason as DisputeKind,
          status: r.status,
          ...(r.disputeReason === 'CHIP_APPROPRIATION' && r.chipLast4 !== null ? { chipLast4: r.chipLast4 } : {}),
          createdAt: r.createdAt,
          ...(r.frozenUntil === null ? {} : { frozenUntil: r.frozenUntil }),
          expiresAt: r.expiresAt,
          slaDueAt: r.slaDueAt!,
          slaOverdue: now > r.slaDueAt!,
          decisionPhase: decisionPhaseOf(r),
          iAmParty: await isParty(repositories, actor, r),
        });
      }
      const last = page[page.length - 1];
      return { items, ...(rows.length > limit && last !== undefined ? { nextCursor: encodeCursor(actor.adminId, { slaDueAt: last.slaDueAt!, id: last.id }) } : {}) };
    });
  }
}

export interface AdminDisputeFile {
  readonly disputeId: string;
  readonly kind: DisputeKind;
  readonly status: OwnerRequestRecord['status'];
  readonly chipLast4?: string;
  readonly createdAt: string;
  readonly frozenUntil?: string;
  readonly freezeExtensionGranted: boolean;
  readonly expiresAt: string;
  readonly slaDueAt?: string;
  readonly slaOverdue: boolean;
  readonly decisionPhase: DecisionPhase;
  readonly resolution?: string;
  readonly mootReason?: string;
  readonly executesAfter?: string;
  readonly parties: Array<{ readonly alias: 'Parte A' | 'Parte B'; readonly role: 'CLAIMANT' | 'OWNER' | 'CO_OWNER' | 'TARGET' | 'REQUESTER' }>;
  readonly evidence: Array<{ readonly evidenceId: string; readonly contentType: string; readonly bytes: number; readonly readByMe: boolean }>;
  readonly actors: Array<{ readonly alias: 'Resolutor' | 'Segundo aprobador'; readonly role: 'SUPER_ADMIN' | 'OPERATOR' }>;
  readonly actorIdentities?: Array<{ readonly alias: 'Resolutor' | 'Segundo aprobador'; readonly adminId: string; readonly personId: string }>;
}

/**
 * Proyección del expediente. `viewerRole` decide si se incluyen los identificadores (SOLO `SUPER_ADMIN`); la forma de `OPERATOR` no lleva el campo `actorIdentities` (no es un valor oculto: no existe).
 * Exportada para que la respuesta de `resolve`, `confirm`, `cancel-execution`, `extend-freeze` y `close-moot` use la MISMA vista.
 */
export async function disputeFileView(deps: ApplicationDeps, viewer: ArbiterActor, row: OwnerRequestRecord, readEvidenceIds: ReadonlySet<string> | null = null): Promise<AdminDisputeFile> {
  const now = deps.clock.nowIsoTimestamp();
  return deps.uow.runInTransaction(async (repositories) => {
    const evidence = await repositories.disputeEvidence.listByRequest(row.id);
    let readByMe = readEvidenceIds;
    if (readByMe === null) {
      const read = (await repositories.adminAudit.listByAdmin(viewer.adminId)).some((e) => e.action === 'DISPUTE_EVIDENCE_READ' && e.objectRef === `dispute:${row.id}`);
      readByMe = read ? new Set(evidence.map((e) => e.id)) : new Set<string>();
    }
    const parties: AdminDisputeFile['parties'] = [{ alias: 'Parte A', role: row.disputeReason === 'CHIP_APPROPRIATION' ? 'CLAIMANT' : 'REQUESTER' }];
    if (row.disputeReason === 'CHIP_APPROPRIATION') parties.push({ alias: 'Parte B', role: 'OWNER' });
    else if (row.targetUserId !== null) parties.push({ alias: 'Parte B', role: 'TARGET' });
    const actors: Array<{ alias: 'Resolutor' | 'Segundo aprobador'; adminId: string; personId: string; role: 'SUPER_ADMIN' | 'OPERATOR' }> = [];
    const roleOf = async (adminId: string | null | undefined): Promise<'SUPER_ADMIN' | 'OPERATOR'> => {
      const access = adminId === null || adminId === undefined || deps.admin === undefined ? null : await resolveAdminAccess(repositories, deps.admin.allowedEmails, adminId);
      return access?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR';
    };
    if (row.resolvedByPersonId != null) actors.push({ alias: 'Resolutor', adminId: row.resolvedByAdminId ?? '', personId: row.resolvedByPersonId, role: await roleOf(row.resolvedByAdminId) });
    if (row.secondApproverPersonId != null) actors.push({ alias: 'Segundo aprobador', adminId: row.secondApproverAdminId ?? '', personId: row.secondApproverPersonId, role: await roleOf(row.secondApproverAdminId) });
    return {
      disputeId: row.id,
      kind: row.disputeReason as DisputeKind,
      status: row.status,
      ...(row.disputeReason === 'CHIP_APPROPRIATION' && row.chipLast4 !== null ? { chipLast4: row.chipLast4 } : {}),
      createdAt: row.createdAt,
      ...(row.frozenUntil === null ? {} : { frozenUntil: row.frozenUntil }),
      freezeExtensionGranted: row.freezeExtendedAt !== null,
      expiresAt: row.expiresAt,
      ...(row.slaDueAt === null ? {} : { slaDueAt: row.slaDueAt }),
      slaOverdue: row.slaDueAt !== null && now > row.slaDueAt,
      decisionPhase: decisionPhaseOf(row),
      ...(row.resolution === null ? {} : { resolution: row.resolution }),
      ...(row.mootReason === null ? {} : { mootReason: row.mootReason }),
      ...(row.executesAfter === null ? {} : { executesAfter: row.executesAfter }),
      parties,
      evidence: evidence.map((e) => ({ evidenceId: e.id, contentType: e.contentType, bytes: e.bytes, readByMe: readByMe!.has(e.id) })),
      actors: actors.map((a) => ({ alias: a.alias, role: a.role })),
      ...(viewer.role === 'SUPER_ADMIN' && actors.length > 0 ? { actorIdentities: actors.map((a) => ({ alias: a.alias, adminId: a.adminId, personId: a.personId })) } : {}),
    };
  });
}

/** Expediente seudonimizado: solo administradores NO parte (403 `ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`); la apertura se audita. @implements REQ-CHP12-004, REQ-CHP12-008, EDGE-012-043 */
export class GetChipDisputeUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actor: ArbiterActor, disputeId: string): Promise<AdminDisputeFile> {
    const { deps } = this;
    const dispute = await deps.uow.runInTransaction(async (repositories) => {
      const loaded = await loadForArbitration(deps, repositories, actor, disputeId, { requireUnderReview: false });
      await auditArbiter(deps, repositories, actor, 'DISPUTE_FILE_OPENED', disputeId, loaded.now);
      return loaded.dispute;
    });
    if (dispute === null) throw new DisputeNotFoundError();
    return disputeFileView(deps, actor, dispute);
  }
}
