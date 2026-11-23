/**
 * Repositorios PostgreSQL del portal de administración (feature 009, #19; migración 0015 = 0019 de SQLite): `admin_identities`, `admin_sessions`, `admin_oauth_flow_states` y
 * `admin_audit_entries`, con paridad con SQLite. SQL parametrizado `$n` sin interpolación; un solo uso y revocación con `UPDATE … WHERE … IS NULL` (compare-and-set atómico, sin candado
 * explícito). El correo, el `sub` y los tokens solo viajan en parámetros enlazados y nunca en un mensaje de error (NFR-009-004).
 *
 * @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, EDGE-009-047, NFR-009-004, INV-ARCH-005
 */
import type {
  AdminAuditRepositoryPort,
  AdminFlowStateRecord,
  AdminFlowStateRepositoryPort,
  AdminIdentityRecord,
  AdminIdentityRepositoryPort,
  AdminProvider,
  AdminSessionRepositoryPort,
} from '../../../application/ports/admin.port.ts';
import type { PoolClientLike } from './postgres-database.ts';

type Row = Record<string, unknown>;
const nullable = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const IDENTITY_COLUMNS = 'admin_id, provider, provider_subject, email, created_at';
const toIdentity = (row: Row): AdminIdentityRecord => ({
  adminId: String(row['admin_id']),
  provider: row['provider'] as AdminProvider,
  providerSubject: String(row['provider_subject']),
  email: String(row['email']),
  createdAt: String(row['created_at']),
});

export function adminIdentityRepository(client: PoolClientLike): AdminIdentityRepositoryPort {
  const one = async (where: string, values: unknown[]): Promise<AdminIdentityRecord | null> => {
    const { rows } = await client.query(`SELECT ${IDENTITY_COLUMNS} FROM admin_identities WHERE ${where}`, values);
    return rows[0] === undefined ? null : toIdentity(rows[0]);
  };
  return {
    findById: (adminId) => one('admin_id = $1', [adminId]),
    findBySubject: (provider, providerSubject) => one('provider = $1 AND provider_subject = $2', [provider, providerSubject]),
    findByEmail: (email) => one('email = $1', [email]),
    async insertIfAbsent(identity) {
      const result = await client.query(`INSERT INTO admin_identities (${IDENTITY_COLUMNS}) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [
        identity.adminId,
        identity.provider,
        identity.providerSubject,
        identity.email,
        identity.createdAt,
      ]);
      return (result.rowCount ?? 0) === 1;
    },
  };
}

const SESSION_COLUMNS = 'token_hash, admin_id, created_at, last_activity_at, revoked_at';

export function adminSessionRepository(client: PoolClientLike): AdminSessionRepositoryPort {
  return {
    async insert(r) {
      await client.query(`INSERT INTO admin_sessions (${SESSION_COLUMNS}) VALUES ($1, $2, $3, $4, $5)`, [r.tokenHash, r.adminId, r.createdAt, r.lastActivityAt, r.revokedAt]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await client.query(`SELECT ${SESSION_COLUMNS} FROM admin_sessions WHERE token_hash = $1`, [tokenHash]);
      const row = rows[0];
      return row === undefined
        ? null
        : { tokenHash: String(row['token_hash']), adminId: String(row['admin_id']), createdAt: String(row['created_at']), lastActivityAt: String(row['last_activity_at']), revokedAt: nullable(row['revoked_at']) };
    },
    async touch(tokenHash, lastActivityAt) {
      await client.query('UPDATE admin_sessions SET last_activity_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL', [lastActivityAt, tokenHash]);
    },
    async revoke(tokenHash, revokedAt) {
      const result = await client.query('UPDATE admin_sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL', [revokedAt, tokenHash]);
      return (result.rowCount ?? 0) === 1;
    },
    async purgeCreatedBefore(cutoff) {
      const result = await client.query('DELETE FROM admin_sessions WHERE created_at <= $1', [cutoff]);
      return result.rowCount ?? 0;
    },
  };
}

const FLOW_COLUMNS = 'token_hash, state, nonce, code_verifier, created_at, expires_at, consumed_at';
const toFlow = (row: Row): AdminFlowStateRecord => ({
  tokenHash: String(row['token_hash']),
  state: String(row['state']),
  nonce: String(row['nonce']),
  codeVerifier: String(row['code_verifier']),
  createdAt: String(row['created_at']),
  expiresAt: String(row['expires_at']),
  consumedAt: nullable(row['consumed_at']),
});

export function adminFlowRepository(client: PoolClientLike): AdminFlowStateRepositoryPort {
  return {
    async insert(r) {
      await client.query(`INSERT INTO admin_oauth_flow_states (${FLOW_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [r.tokenHash, r.state, r.nonce, r.codeVerifier, r.createdAt, r.expiresAt, r.consumedAt]);
    },
    async consume(tokenHash, nowIsoTimestamp) {
      const { rows } = await client.query(
        `UPDATE admin_oauth_flow_states SET consumed_at = $1 WHERE token_hash = $2 AND consumed_at IS NULL AND expires_at > $1 RETURNING ${FLOW_COLUMNS}`,
        [nowIsoTimestamp, tokenHash],
      );
      return rows[0] === undefined ? null : toFlow(rows[0]);
    },
    async purgeExpired(nowIsoTimestamp) {
      const result = await client.query('DELETE FROM admin_oauth_flow_states WHERE expires_at <= $1', [nowIsoTimestamp]);
      return result.rowCount ?? 0;
    },
  };
}

const AUDIT_COLUMNS = 'id, admin_id, action, object_ref, occurred_at';

export function adminAuditRepository(client: PoolClientLike): AdminAuditRepositoryPort {
  return {
    async insert(r) {
      await client.query(`INSERT INTO admin_audit_entries (${AUDIT_COLUMNS}) VALUES ($1, $2, $3, $4, $5)`, [r.id, r.adminId, r.action, r.objectRef, r.occurredAt]);
    },
    async listByAdmin(adminId) {
      const { rows } = await client.query(`SELECT ${AUDIT_COLUMNS} FROM admin_audit_entries WHERE admin_id = $1 ORDER BY occurred_at, id`, [adminId]);
      return rows.map((row) => ({ id: String(row['id']), adminId: String(row['admin_id']), action: String(row['action']), objectRef: nullable(row['object_ref']), occurredAt: String(row['occurred_at']) }));
    },
  };
}
