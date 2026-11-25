/**
 * Repositorios PostgreSQL del portal de administración (feature 009, #19; migración 0015 = 0019 de SQLite): `admin_identities`, `admin_sessions`, `admin_oauth_flow_states` y
 * `admin_audit_entries`, con paridad con SQLite. SQL parametrizado `$n` sin interpolación; un solo uso y revocación con `UPDATE … WHERE … IS NULL` (compare-and-set atómico, sin candado
 * explícito). El correo, el `sub` y los tokens solo viajan en parámetros enlazados y nunca en un mensaje de error (NFR-009-004).
 *
 * `registrationRepository` (T1247): lista, contador y decision atomica de cuentas `PENDING` sobre `users` (migracion 0016), con paridad con SQLite.
 *
 * @implements REQ-APR9-003, REQ-APR9-005, EDGE-009-002, EDGE-009-039, REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, EDGE-009-047, NFR-009-004, INV-ARCH-005
 */
import type { AboutContentRecord, AboutContentRepositoryPort } from '../../../application/ports/about.port.ts';
import type {
  AdminAuditRepositoryPort,
  AdminFlowStateRecord,
  AdminFlowStateRepositoryPort,
  AdminIdentityRecord,
  AdminIdentityRepositoryPort,
  AdminParameterRepositoryPort,
  AdminProvider,
  AdminSessionRepositoryPort,
  ParameterRowRecord,
  PendingRegistrationRecord,
  RegistrationDecisionRepositoryPort,
  RegistrationMethod,
} from '../../../application/ports/admin.port.ts';
import { NO_PASSWORD_SENTINEL } from '../../../domain/auth/password-sentinel.ts';
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

/**
 * Decisión de aprobación (T1247). `decide` es UN `UPDATE ... WHERE account_status = 'PENDING'` y se mira `rowCount === 1`: sin lectura previa ni candado explícito, Postgres serializa las
 * dos escrituras sobre la misma fila y la perdedora relee `account_status` ya decidido y no afecta ninguna fila (EDGE-009-002, EDGE-009-003). Fecha de creación: `data->>'createdAt'`.
 */
export function registrationRepository(client: PoolClientLike): RegistrationDecisionRepositoryPort {
  const created = "(data->>'createdAt')::timestamptz";
  const recent = (n: number): string => `account_status = 'PENDING' AND ${created} > $${n}::timestamptz`;
  const toRecord = (row: Row): PendingRegistrationRecord => ({
    registrationId: String(row['id']),
    username: String(row['username']),
    requestedAt: String(row['requested_at']),
    method: row['method'] as RegistrationMethod,
  });
  const select = `SELECT id, username, data->>'createdAt' AS requested_at, CASE WHEN password_hash = $1 THEN 'GOOGLE' ELSE 'PASSWORD' END AS method FROM users`;
  return {
    async countPending(createdAfter) {
      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM users WHERE ${recent(1)}`, [createdAfter]);
      return Number(rows[0]!['n']);
    },
    async listPending(createdAfter, limit, after) {
      if (after === null) {
        const { rows } = await client.query(`${select} WHERE ${recent(2)} ORDER BY ${created}, id LIMIT $3`, [NO_PASSWORD_SENTINEL, createdAfter, limit]);
        return rows.map(toRecord);
      }
      const { rows } = await client.query(
        `${select} WHERE ${recent(2)} AND (${created} > $3::timestamptz OR (${created} = $3::timestamptz AND id > $4)) ORDER BY ${created}, id LIMIT $5`,
        [NO_PASSWORD_SENTINEL, createdAfter, after.requestedAt, after.registrationId, limit],
      );
      return rows.map(toRecord);
    },
    async decide(registrationId, to, decidedBy, decidedAt, createdAfter) {
      const result = await client.query(`UPDATE users SET account_status = $1, decided_at = $2, decided_by = $3 WHERE id = $4 AND ${recent(5)}`, [to, decidedAt, decidedBy, registrationId, createdAfter]);
      return result.rowCount === 1;
    },
  };
}

/**
 * Edicion de parametros (T1264). Compare-and-set por UNA sentencia (`INSERT ... ON CONFLICT DO NOTHING` o `UPDATE ... WHERE key, value, updated_at`) con `rowCount === 1` como veredicto:
 * en READ COMMITTED la escritura perdedora reevalua la fila ya cambiada y no afecta ninguna. `updated_by_user_id` queda `NULL`.
 */
export function adminParameterRepository(client: PoolClientLike): AdminParameterRepositoryPort {
  return {
    async find(key): Promise<ParameterRowRecord | null> {
      const { rows } = await client.query('SELECT value, updated_at FROM platform_parameters WHERE key = $1', [key]);
      return rows[0] === undefined ? null : { value: String(rows[0]['value']), updatedAt: String(rows[0]['updated_at']) };
    },
    async compareAndSet(key, description, next, expected) {
      if (expected === null) {
        const result = await client.query('INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ($1, $2, $3, $4, NULL) ON CONFLICT (key) DO NOTHING', [key, next.value, description, next.updatedAt]);
        return result.rowCount === 1;
      }
      const result = await client.query('UPDATE platform_parameters SET value = $1, updated_at = $2, updated_by_user_id = NULL WHERE key = $3 AND value = $4 AND updated_at = $5', [next.value, next.updatedAt, key, expected.value, expected.updatedAt]);
      return result.rowCount === 1;
    },
    async lastEditor(action, key) {
      const { rows } = await client.query('SELECT admin_id FROM admin_audit_entries WHERE action = $1 AND object_ref = $2 ORDER BY occurred_at DESC, id DESC LIMIT 1', [action, key]);
      return rows[0] === undefined ? null : String(rows[0]['admin_id']);
    },
    async listSceneSpendAttempts(window) {
      const { rows } = await client.query('SELECT provider_model, provider_location, provider_call_started_at FROM scene_attempts WHERE quota_window = $1', [window]);
      return rows.map((r) => ({
        providerModel: r['provider_model'] === null ? null : String(r['provider_model']),
        providerLocation: r['provider_location'] === null ? null : String(r['provider_location']),
        providerCallStartedAt: r['provider_call_started_at'] === null ? null : r['provider_call_started_at'] instanceof Date ? r['provider_call_started_at'].toISOString() : String(r['provider_call_started_at']),
      }));
    },
    async listAdminAccountUserIds(subjects, emails) {
      const { rows } = await client.query(
        `SELECT id FROM users WHERE id IN (SELECT user_id FROM auth_identities WHERE provider = 'GOOGLE' AND provider_subject = ANY($1::text[]))
           OR (email_verified_at IS NOT NULL AND lower(email) = ANY($2::text[]))`,
        [[...subjects], emails.map((e) => e.toLowerCase())],
      );
      return rows.map((r) => String(r['id']));
    },
    async resetAdminAccountsSceneQuota(subjects, emails, resetAt) {
      const { rows: accounts } = await client.query(
        `SELECT id FROM users WHERE id IN (SELECT user_id FROM auth_identities WHERE provider = 'GOOGLE' AND provider_subject = ANY($1::text[]))
           OR (email_verified_at IS NOT NULL AND lower(email) = ANY($2::text[]))`,
        [[...subjects], emails.map((e) => e.toLowerCase())],
      );
      for (const account of accounts) {
        const id = String(account['id']);
        const { rows: scenes } = await client.query('SELECT id, consumed_generations FROM home_scenes WHERE owner_user_id = $1 AND consumed_generations > 0', [id]);
        for (const scene of scenes) {
          const done = await client.query('UPDATE home_scenes SET consumed_generations = 0 WHERE id = $1 AND consumed_generations = $2', [scene['id'], scene['consumed_generations']]);
          if (done.rowCount !== 1) return null;
        }
        const { rows: householdScenes } = await client.query(
          'SELECT s.id AS id, s.consumed_generations AS consumed_generations FROM home_scenes s WHERE s.household_id IN (SELECT id FROM households WHERE owner_user_id = $1) AND s.consumed_generations > 0',
          [id],
        );
        for (const scene of householdScenes) {
          const done = await client.query('UPDATE home_scenes SET consumed_generations = 0 WHERE id = $1 AND consumed_generations = $2', [scene['id'], scene['consumed_generations']]);
          if (done.rowCount !== 1) return null;
        }
        const { rows: carry } = await client.query('SELECT quota_window, consumed_generations FROM scene_quota_carry WHERE owner_user_id = $1 AND consumed_generations > 0', [id]);
        for (const row of carry) {
          const done = await client.query('DELETE FROM scene_quota_carry WHERE owner_user_id = $1 AND quota_window = $2 AND consumed_generations = $3', [id, row['quota_window'], row['consumed_generations']]);
          if (done.rowCount !== 1) return null;
        }
        // D9-31: marcas de reinicio (escena y actor); scene_attempts NO se reescribe. D9-28: se limpia run_state = 'failed' (una escena con intento activo no se toca).
        await client.query('INSERT INTO scene_actor_limit_marks (user_id, limits_reset_at) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET limits_reset_at = EXCLUDED.limits_reset_at', [id, resetAt]);
        const { rows: allScenes } = await client.query('SELECT id FROM home_scenes WHERE owner_user_id = $1 OR household_id IN (SELECT id FROM households WHERE owner_user_id = $1)', [id]);
        for (const scene of allScenes) {
          await client.query('UPDATE home_scenes SET limits_reset_at = $1 WHERE id = $2', [resetAt, scene['id']]);
          await client.query("UPDATE home_scenes SET run_state = NULL, current_attempt_id = NULL, lease_expires_at = NULL WHERE id = $1 AND run_state = 'failed'", [scene['id']]);
        }
      }
      return { accountsReset: accounts.length };
    },
  };
}

/**
 * `about_content` (feature 010, T1430; migración 0025): singleton `id = 1`. `replace` es UN `INSERT ... ON CONFLICT DO NOTHING` (sin fila, `expectedVersion = 0`) o UN
 * `UPDATE ... WHERE id = 1 AND version = $n` con `rowCount === 1` como veredicto: Postgres serializa las dos escrituras sobre la misma fila y la perdedora relee la versión ya
 * subida y no afecta ninguna fila (REQ-ACE10-003, EDGE-010-006). `RETURNING` entrega el registro escrito sin una lectura aparte.
 */
export function aboutContentRepository(client: PoolClientLike): AboutContentRepositoryPort {
  const columns = 'body_markdown, photo_object_key, photo_alt, version, updated_at, updated_by';
  const toRecord = (row: Row): AboutContentRecord => ({
    bodyMarkdown: String(row['body_markdown']),
    photoObjectKey: nullable(row['photo_object_key']),
    photoAlt: String(row['photo_alt']),
    version: Number(row['version']),
    updatedAt: String(row['updated_at']),
    updatedBy: String(row['updated_by']),
  });
  return {
    async get() {
      const { rows } = await client.query(`SELECT ${columns} FROM about_content WHERE id = 1`);
      return rows[0] === undefined ? null : toRecord(rows[0]);
    },
    async replace(next, expectedVersion) {
      const { rows } =
        expectedVersion === 0
          ? await client.query(`INSERT INTO about_content (id, ${columns}) VALUES (1, $1, $2, $3, 1, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`, [next.bodyMarkdown, next.photoObjectKey, next.photoAlt, next.updatedAt, next.updatedBy])
          : await client.query(`UPDATE about_content SET body_markdown = $1, photo_object_key = $2, photo_alt = $3, version = version + 1, updated_at = $4, updated_by = $5 WHERE id = 1 AND version = $6 RETURNING ${columns}`, [next.bodyMarkdown, next.photoObjectKey, next.photoAlt, next.updatedAt, next.updatedBy, expectedVersion]);
      return rows[0] === undefined ? null : toRecord(rows[0]);
    },
  };
}
