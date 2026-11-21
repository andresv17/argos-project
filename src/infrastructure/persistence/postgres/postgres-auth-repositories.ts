/**
 * Repositorios PostgreSQL del acceso con Google (feature 008, [GH:#16]): `auth_identities` y `oauth_flow_states`, con paridad con SQLite (migración 0013 = 0017).
 * SQL parametrizado `$n` sin interpolación. «Inserta o recupera» con `ON CONFLICT DO NOTHING`; un solo uso con `UPDATE … RETURNING` (compare-and-set atómico, sin candado
 * explícito). El correo, el `sub` y los tokens solo viajan en parámetros enlazados y nunca en un mensaje de error (NFR-008-004).
 *
 * @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, EDGE-008-002, EDGE-008-007, NFR-008-004
 */
import type {
  AuthIdentityRecord,
  AuthIdentityRepositoryPort,
  AuthProvider,
  OAuthFlowIntent,
  OAuthFlowPhase,
  OAuthFlowStateRecord,
  OAuthFlowStateRepositoryPort,
} from '../../../application/ports/auth-identity.port.ts';
import type { PoolClientLike } from './postgres-database.ts';

type Row = Record<string, unknown>;

const nullable = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const IDENTITY_COLUMNS = 'provider, provider_subject, user_id, created_at';

const toIdentity = (row: Row): AuthIdentityRecord => ({
  provider: row['provider'] as AuthProvider,
  providerSubject: String(row['provider_subject']),
  userId: String(row['user_id']),
  createdAt: String(row['created_at']),
});

export function authIdentityRepository(client: PoolClientLike): AuthIdentityRepositoryPort {
  return {
    async findBySubject(provider, providerSubject) {
      const { rows } = await client.query(`SELECT ${IDENTITY_COLUMNS} FROM auth_identities WHERE provider = $1 AND provider_subject = $2`, [provider, providerSubject]);
      return rows[0] === undefined ? null : toIdentity(rows[0]);
    },
    async listByUser(userId) {
      const { rows } = await client.query(`SELECT ${IDENTITY_COLUMNS} FROM auth_identities WHERE user_id = $1 ORDER BY created_at, provider, provider_subject`, [userId]);
      return rows.map(toIdentity);
    },
    async insertIfAbsent(identity) {
      const result = await client.query(
        `INSERT INTO auth_identities (${IDENTITY_COLUMNS}) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, provider_subject) DO NOTHING`,
        [identity.provider, identity.providerSubject, identity.userId, identity.createdAt],
      );
      return result.rowCount === 1;
    },
  };
}

const FLOW_COLUMNS = 'token_hash, phase, intent, state, nonce, code_verifier, user_id, pending_subject, pending_email, created_at, expires_at, consumed_at';

const toFlow = (row: Row): OAuthFlowStateRecord => ({
  tokenHash: String(row['token_hash']),
  phase: row['phase'] as OAuthFlowPhase,
  intent: row['intent'] as OAuthFlowIntent,
  state: nullable(row['state']),
  nonce: nullable(row['nonce']),
  codeVerifier: nullable(row['code_verifier']),
  userId: nullable(row['user_id']),
  pendingSubject: nullable(row['pending_subject']),
  pendingEmail: nullable(row['pending_email']),
  createdAt: String(row['created_at']),
  expiresAt: String(row['expires_at']),
  consumedAt: nullable(row['consumed_at']),
});

export function oauthFlowRepository(client: PoolClientLike): OAuthFlowStateRepositoryPort {
  return {
    async insert(r) {
      await client.query(`INSERT INTO oauth_flow_states (${FLOW_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
        r.tokenHash,
        r.phase,
        r.intent,
        r.state,
        r.nonce,
        r.codeVerifier,
        r.userId,
        r.pendingSubject,
        r.pendingEmail,
        r.createdAt,
        r.expiresAt,
        r.consumedAt,
      ]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await client.query(`SELECT ${FLOW_COLUMNS} FROM oauth_flow_states WHERE token_hash = $1`, [tokenHash]);
      return rows[0] === undefined ? null : toFlow(rows[0]);
    },
    async consume(tokenHash, nowIsoTimestamp, expectedPhase) {
      const { rows } = await client.query(
        `UPDATE oauth_flow_states SET consumed_at = $1 WHERE token_hash = $2 AND phase = $3 AND consumed_at IS NULL AND expires_at > $1 RETURNING ${FLOW_COLUMNS}`,
        [nowIsoTimestamp, tokenHash, expectedPhase],
      );
      return rows[0] === undefined ? null : toFlow(rows[0]);
    },
    async purgeExpired(nowIsoTimestamp) {
      const result = await client.query('DELETE FROM oauth_flow_states WHERE expires_at <= $1', [nowIsoTimestamp]);
      return result.rowCount ?? 0;
    },
  };
}
