/**
 * Repositorios PostgreSQL del Bloque B de la 012 (#23): `ip_rate_events` (T1640) y `dispute_evidence` (T1641). SQL siempre parametrizado con `$n`.
 *
 * @implements REQ-CHP12-005, REQ-CHP12-008, NFR-012-006
 */

import type { DisputeEvidenceRecord, DisputeEvidenceRepositoryPort } from '../../../application/ports/dispute-evidence.port.ts';
import type { IpRateEventRecord, IpRateEventRepositoryPort } from '../../../application/ports/ip-rate-events.port.ts';
import type { PoolClientLike } from './postgres-database.ts';

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

export function postgresIpRateEventRepository(client: PoolClientLike): IpRateEventRepositoryPort {
  return {
    async insert(row) {
      await client.query('INSERT INTO ip_rate_events (id, scope, ip_hmac, occurred_at) VALUES ($1, $2, $3, $4)', [row.id, row.scope, row.ipHmac, row.occurredAt]);
    },
    async countSince(scope, key, sinceExclusive) {
      const { rows } = await client.query('SELECT COUNT(*) AS n FROM ip_rate_events WHERE scope = $1 AND ip_hmac = $2 AND occurred_at > $3', [scope, key, sinceExclusive]);
      return Number(rows[0]!['n']);
    },
    async purgeBefore(cutoffExclusive) {
      const result = await client.query('DELETE FROM ip_rate_events WHERE occurred_at < $1', [cutoffExclusive]);
      return result.rowCount ?? 0;
    },
    async listAll() {
      const { rows } = await client.query('SELECT id, scope, ip_hmac, occurred_at FROM ip_rate_events ORDER BY occurred_at, id');
      return rows.map(toEvent);
    },
  };
}

export function postgresDisputeEvidenceRepository(client: PoolClientLike): DisputeEvidenceRepositoryPort {
  const columns = 'id, request_id, object_key, content_type, bytes, created_at, delete_after';
  return {
    async insert(row) {
      await client.query(`INSERT INTO dispute_evidence (${columns}) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [row.id, row.requestId, row.objectKey, row.contentType, row.bytes, row.createdAt, row.deleteAfter]);
    },
    async listByRequest(requestId) {
      const { rows } = await client.query(`SELECT ${columns} FROM dispute_evidence WHERE request_id = $1 ORDER BY created_at, id`, [requestId]);
      return rows.map(toEvidence);
    },
    async findById(id) {
      const { rows } = await client.query(`SELECT ${columns} FROM dispute_evidence WHERE id = $1`, [id]);
      return rows[0] === undefined ? null : toEvidence(rows[0]);
    },
    async setDeleteAfter(requestId, deleteAfter) {
      const result = await client.query('UPDATE dispute_evidence SET delete_after = $1 WHERE request_id = $2', [deleteAfter, requestId]);
      return result.rowCount ?? 0;
    },
    async listDue(nowInclusive) {
      const { rows } = await client.query(`SELECT ${columns} FROM dispute_evidence WHERE delete_after IS NOT NULL AND delete_after <= $1 ORDER BY delete_after, id`, [nowInclusive]);
      return rows.map(toEvidence);
    },
    async deleteByIds(ids) {
      if (ids.length === 0) return 0;
      const result = await client.query('DELETE FROM dispute_evidence WHERE id = ANY($1::text[])', [[...ids]]);
      return result.rowCount ?? 0;
    },
  };
}
