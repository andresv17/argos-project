/**
 * Repositorios en memoria del Bloque B de la 012 (#23): `ip_rate_events` (T1640) y `dispute_evidence` (T1641). Mismas reglas observables que SQLite y PostgreSQL.
 *
 * @implements REQ-CHP12-005, REQ-CHP12-008, NFR-012-006
 */

import type { DisputeEvidenceRecord, DisputeEvidenceRepositoryPort } from '../../../application/ports/dispute-evidence.port.ts';
import type { IpRateEventRecord, IpRateEventRepositoryPort } from '../../../application/ports/ip-rate-events.port.ts';

/** Parte del estado de memoria del Bloque B (opcional: ausente = vacía). */
export interface ChipMemoryState {
  ipRateEvents?: IpRateEventRecord[] | undefined;
  disputeEvidence?: DisputeEvidenceRecord[] | undefined;
  /** `owner_requests.id` existentes: la FK RESTRICT de `dispute_evidence` se comprueba contra ellas. */
  ownerRequests?: ReadonlyArray<{ readonly id: string }> | undefined;
}

const copy = <T>(value: T): T => structuredClone(value);

export function memoryIpRateEventRepository(state: ChipMemoryState): IpRateEventRepositoryPort {
  const rows = (): IpRateEventRecord[] => (state.ipRateEvents ??= []);
  return {
    async insert(row) {
      rows().push(copy(row));
    },
    async countSince(scope, key, sinceExclusive) {
      return rows().filter((r) => r.scope === scope && r.ipHmac === key && r.occurredAt > sinceExclusive).length;
    },
    async purgeBefore(cutoffExclusive) {
      const before = rows().length;
      state.ipRateEvents = rows().filter((r) => r.occurredAt >= cutoffExclusive);
      return before - state.ipRateEvents.length;
    },
    async listAll() {
      return copy([...rows()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)));
    },
  };
}

export function memoryDisputeEvidenceRepository(state: ChipMemoryState): DisputeEvidenceRepositoryPort {
  const rows = (): DisputeEvidenceRecord[] => (state.disputeEvidence ??= []);
  return {
    async insert(row) {
      if (rows().some((r) => r.id === row.id || r.objectKey === row.objectKey)) throw Object.assign(new Error('UNIQUE constraint failed: dispute_evidence.object_key'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
      if (state.ownerRequests !== undefined && !state.ownerRequests.some((r) => r.id === row.requestId)) throw new Error('FOREIGN KEY constraint failed: dispute_evidence');
      rows().push(copy(row));
    },
    async listByRequest(requestId) {
      return copy(rows().filter((r) => r.requestId === requestId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
    },
    async findById(id) {
      const found = rows().find((r) => r.id === id);
      return found === undefined ? null : copy(found);
    },
    async setDeleteAfter(requestId, deleteAfter) {
      let changed = 0;
      state.disputeEvidence = rows().map((r) => {
        if (r.requestId !== requestId) return r;
        changed += 1;
        return { ...r, deleteAfter };
      });
      return changed;
    },
    async listDue(nowInclusive) {
      return copy(rows().filter((r) => r.deleteAfter !== null && r.deleteAfter <= nowInclusive).sort((a, b) => (a.deleteAfter ?? '').localeCompare(b.deleteAfter ?? '') || a.id.localeCompare(b.id)));
    },
    async deleteByIds(ids) {
      const wanted = new Set(ids);
      const before = rows().length;
      state.disputeEvidence = rows().filter((r) => !wanted.has(r.id));
      return before - state.disputeEvidence.length;
    },
  };
}
