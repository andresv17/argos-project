/**
 * Repositorios SQLite del Bloque B de la 012 (#23): `ip_rate_events` (T1640) y `dispute_evidence` (T1641). Mismo contrato que PostgreSQL y memoria.
 *
 * @implements REQ-CHP12-005, REQ-CHP12-008, NFR-012-006
 */

import type { DisputeEvidenceRecord, DisputeEvidenceRepositoryPort } from '../../../application/ports/dispute-evidence.port.ts';
import type { IpRateEventRecord, IpRateEventRepositoryPort } from '../../../application/ports/ip-rate-events.port.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

type Row = Record<string, unknown>;

const toEvent = (r: Row): IpRateEventRecord => ({ id: String(r['id']), scope: r['scope'] as IpRateEventRecord['scope'], ipHmac: String(r['ip_hmac']), occurredAt: String(r['occurred_at']) });
const toEvidence = (r: Row): DisputeEvidenceRecord => ({
  id: String(r['id']),
  requestId: String(r['request_id']),
  objectKey: String(r['object_key']),
  contentType: r['content_type'] as DisputeEvidenceRecord['contentType'],
  bytes: Number(r['bytes']),
  createdAt: String(r['created_at']),
  deleteAfter: r['delete_after'] === null || r['delete_after'] === undefined ? null : String(r['delete_after']),
});

export function sqliteIpRateEventRepository(db: SqliteDatabase): IpRateEventRepositoryPort {
  const insert = db.prepare('INSERT INTO ip_rate_events (id, scope, ip_hmac, occurred_at) VALUES (?, ?, ?, ?)');
  const count = db.prepare<[string, string, string], { n: number }>('SELECT COUNT(*) AS n FROM ip_rate_events WHERE scope = ? AND ip_hmac = ? AND occurred_at > ?');
  const purge = db.prepare('DELETE FROM ip_rate_events WHERE occurred_at < ?');
  const all = db.prepare<[], Row>('SELECT id, scope, ip_hmac, occurred_at FROM ip_rate_events ORDER BY occurred_at, id');
  return {
    async insert(row) {
      insert.run(row.id, row.scope, row.ipHmac, row.occurredAt);
    },
    async countSince(scope, key, sinceExclusive) {
      return count.get(scope, key, sinceExclusive)!.n;
    },
    async purgeBefore(cutoffExclusive) {
      return purge.run(cutoffExclusive).changes;
    },
    async listAll() {
      return all.all().map(toEvent);
    },
  };
}

export function sqliteDisputeEvidenceRepository(db: SqliteDatabase): DisputeEvidenceRepositoryPort {
  const columns = 'id, request_id, object_key, content_type, bytes, created_at, delete_after';
  const insert = db.prepare(`INSERT INTO dispute_evidence (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const ofRequest = db.prepare<[string], Row>(`SELECT ${columns} FROM dispute_evidence WHERE request_id = ? ORDER BY created_at, id`);
  const byId = db.prepare<[string], Row>(`SELECT ${columns} FROM dispute_evidence WHERE id = ?`);
  const setAfter = db.prepare('UPDATE dispute_evidence SET delete_after = ? WHERE request_id = ?');
  const due = db.prepare<[string], Row>(`SELECT ${columns} FROM dispute_evidence WHERE delete_after IS NOT NULL AND delete_after <= ? ORDER BY delete_after, id`);
  const del = db.prepare('DELETE FROM dispute_evidence WHERE id = ?');
  return {
    async insert(row) {
      insert.run(row.id, row.requestId, row.objectKey, row.contentType, row.bytes, row.createdAt, row.deleteAfter);
    },
    async listByRequest(requestId) {
      return ofRequest.all(requestId).map(toEvidence);
    },
    async findById(id) {
      const row = byId.get(id);
      return row === undefined ? null : toEvidence(row);
    },
    async setDeleteAfter(requestId, deleteAfter) {
      return setAfter.run(deleteAfter, requestId).changes;
    },
    async listDue(nowInclusive) {
      return due.all(nowInclusive).map(toEvidence);
    },
    async deleteByIds(ids) {
      let removed = 0;
      for (const id of ids) removed += del.run(id).changes;
      return removed;
    },
  };
}
