/**
 * Repositorios SQLite del portal de administración (feature 009, #19; migración 0019): `admin_identities`, `admin_sessions`, `admin_oauth_flow_states` y `admin_audit_entries`.
 * Sentencias preparadas con parámetros enlazados (el correo, el `sub` y los hashes nunca se interpolan ni salen en un mensaje de error). Un solo uso del estado del flujo y la revocación
 * son compare-and-set (`UPDATE … WHERE … IS NULL`). Paridad con Postgres: `postgres-admin-repositories.ts`.
 *
 * `registrationRepository` (T1247): lista, contador y decisión atómica de cuentas `PENDING` sobre `users` (migración 0020).
 *
 * @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, REQ-APR9-003, REQ-APR9-005, EDGE-009-002, EDGE-009-039, EDGE-009-047, NFR-009-004, INV-ARCH-005
 */

import type { AboutContentRecord, AboutContentRepositoryPort } from '../../../application/ports/about.port.ts';
import type {
  AdminAuditRecord,
  AdminDelegateRecord,
  AdminDelegateRepositoryPort,
  AdminAuditRepositoryPort,
  AdminFlowStateRecord,
  AdminFlowStateRepositoryPort,
  AdminIdentityRecord,
  AdminIdentityRepositoryPort,
  AdminProvider,
  AdminParameterRepositoryPort,
  AdminSessionRecord,
  AdminSessionRepositoryPort,
  ParameterRowRecord,
  PendingRegistrationRecord,
  RegistrationDecisionRepositoryPort,
  RegistrationMethod,
} from '../../../application/ports/admin.port.ts';
import { NO_PASSWORD_SENTINEL } from '../../../domain/auth/password-sentinel.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

interface IdentityRow {
  readonly admin_id: string;
  readonly provider: AdminProvider;
  readonly provider_subject: string;
  readonly email: string;
  readonly created_at: string;
}

export function adminIdentityRepository(db: SqliteDatabase): AdminIdentityRepositoryPort {
  const columns = 'admin_id, provider, provider_subject, email, created_at';
  const byId = db.prepare<[string], IdentityRow>(`SELECT ${columns} FROM admin_identities WHERE admin_id = ?`);
  const bySubject = db.prepare<[string, string], IdentityRow>(`SELECT ${columns} FROM admin_identities WHERE provider = ? AND provider_subject = ?`);
  const byEmail = db.prepare<[string], IdentityRow>(`SELECT ${columns} FROM admin_identities WHERE email = ?`);
  const personById = db.prepare<[string], { person_id: string | null }>('SELECT person_id FROM admin_identities WHERE admin_id = ?');
  const insert = db.prepare(`INSERT INTO admin_identities (${columns}) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`);
  const remove = db.prepare('DELETE FROM admin_identities WHERE admin_id = ?');
  const toIdentity = (row: IdentityRow): AdminIdentityRecord => ({ adminId: row.admin_id, provider: row.provider, providerSubject: row.provider_subject, email: row.email, createdAt: row.created_at });
  return {
    async findById(adminId) {
      const row = byId.get(adminId);
      return row === undefined ? null : toIdentity(row);
    },
    async findPersonId(adminId) {
      return personById.get(adminId)?.person_id ?? null;
    },
    async findBySubject(provider, providerSubject) {
      const row = bySubject.get(provider, providerSubject);
      return row === undefined ? null : toIdentity(row);
    },
    async findByEmail(email) {
      const row = byEmail.get(email);
      return row === undefined ? null : toIdentity(row);
    },
    async insertIfAbsent(identity) {
      return insert.run(identity.adminId, identity.provider, identity.providerSubject, identity.email, identity.createdAt).changes === 1;
    },
    async deleteById(adminId) {
      // `admin_sessions.admin_id` tiene ON DELETE CASCADE: las sesiones de la identidad retirada se borran con ella.
      return remove.run(adminId).changes === 1;
    },
  };
}

interface SessionRow {
  readonly token_hash: string;
  readonly admin_id: string;
  readonly created_at: string;
  readonly last_activity_at: string;
  readonly revoked_at: string | null;
}

export function adminSessionRepository(db: SqliteDatabase): AdminSessionRepositoryPort {
  const columns = 'token_hash, admin_id, created_at, last_activity_at, revoked_at';
  const insert = db.prepare(`INSERT INTO admin_sessions (${columns}) VALUES (?, ?, ?, ?, ?)`);
  const byHash = db.prepare<[string], SessionRow>(`SELECT ${columns} FROM admin_sessions WHERE token_hash = ?`);
  const touch = db.prepare('UPDATE admin_sessions SET last_activity_at = ? WHERE token_hash = ? AND revoked_at IS NULL');
  const revoke = db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL');
  const purge = db.prepare('DELETE FROM admin_sessions WHERE created_at <= ?');
  const removeByAdmin = db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?');
  return {
    async insert(record: AdminSessionRecord) {
      insert.run(record.tokenHash, record.adminId, record.createdAt, record.lastActivityAt, record.revokedAt);
    },
    async findByTokenHash(tokenHash) {
      const row = byHash.get(tokenHash);
      return row === undefined ? null : { tokenHash: row.token_hash, adminId: row.admin_id, createdAt: row.created_at, lastActivityAt: row.last_activity_at, revokedAt: row.revoked_at };
    },
    async touch(tokenHash, lastActivityAt) {
      touch.run(lastActivityAt, tokenHash);
    },
    async revoke(tokenHash, revokedAt) {
      return revoke.run(revokedAt, tokenHash).changes === 1;
    },
    async purgeCreatedBefore(cutoff) {
      return purge.run(cutoff).changes;
    },
    async deleteByAdminId(adminId) {
      return removeByAdmin.run(adminId).changes;
    },
  };
}

interface FlowRow {
  readonly token_hash: string;
  readonly state: string;
  readonly nonce: string;
  readonly code_verifier: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly consumed_at: string | null;
}

export function adminFlowRepository(db: SqliteDatabase): AdminFlowStateRepositoryPort {
  const columns = 'token_hash, state, nonce, code_verifier, created_at, expires_at, consumed_at';
  const insert = db.prepare(`INSERT INTO admin_oauth_flow_states (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const byHash = db.prepare<[string], FlowRow>(`SELECT ${columns} FROM admin_oauth_flow_states WHERE token_hash = ?`);
  const consume = db.prepare('UPDATE admin_oauth_flow_states SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?');
  const purge = db.prepare('DELETE FROM admin_oauth_flow_states WHERE expires_at <= ?');
  const toFlow = (row: FlowRow): AdminFlowStateRecord => ({
    tokenHash: row.token_hash,
    state: row.state,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  });
  return {
    async insert(r) {
      insert.run(r.tokenHash, r.state, r.nonce, r.codeVerifier, r.createdAt, r.expiresAt, r.consumedAt);
    },
    async consume(tokenHash, nowIsoTimestamp) {
      if (consume.run(nowIsoTimestamp, tokenHash, nowIsoTimestamp).changes !== 1) return null;
      return toFlow(byHash.get(tokenHash)!);
    },
    async purgeExpired(nowIsoTimestamp) {
      return purge.run(nowIsoTimestamp).changes;
    },
  };
}

interface AuditRow {
  readonly id: string;
  readonly admin_id: string;
  readonly action: string;
  readonly object_ref: string | null;
  readonly occurred_at: string;
}

export function adminAuditRepository(db: SqliteDatabase): AdminAuditRepositoryPort {
  const columns = 'id, admin_id, action, object_ref, occurred_at';
  const insert = db.prepare(`INSERT INTO admin_audit_entries (${columns}) VALUES (?, ?, ?, ?, ?)`);
  const byAdmin = db.prepare<[string], AuditRow>(`SELECT ${columns} FROM admin_audit_entries WHERE admin_id = ? ORDER BY occurred_at, id`);
  return {
    async insert(r: AdminAuditRecord) {
      insert.run(r.id, r.adminId, r.action, r.objectRef, r.occurredAt);
    },
    async listByAdmin(adminId) {
      return byAdmin.all(adminId).map((row) => ({ id: row.id, adminId: row.admin_id, action: row.action, objectRef: row.object_ref, occurredAt: row.occurred_at }));
    },
  };
}

interface RegistrationRow {
  readonly id: string;
  readonly username: string;
  readonly requested_at: string;
  readonly method: RegistrationMethod;
}

/**
 * Decisión de aprobación (T1247). `decide` es UN `UPDATE … WHERE account_status = 'PENDING'` y se mira `changes === 1`: no hay lectura previa que decida, de modo que dos
 * administradores a la vez (o una decisión contra la purga) no pueden ganar los dos (EDGE-009-002, EDGE-009-003). La fecha de creación sale de `data.createdAt` (como la purga de T1248).
 */
export function registrationRepository(db: SqliteDatabase): RegistrationDecisionRepositoryPort {
  const created = "json_extract(data, '$.createdAt')";
  const columns = `id, username, ${created} AS requested_at, CASE WHEN password_hash = ? THEN 'GOOGLE' ELSE 'PASSWORD' END AS method`;
  const recent = `account_status = 'PENDING' AND ${created} > ?`;
  const count = db.prepare<[string], { n: number }>(`SELECT COUNT(*) AS n FROM users WHERE ${recent}`);
  const first = db.prepare<[string, string, number], RegistrationRow>(`SELECT ${columns} FROM users WHERE ${recent} ORDER BY ${created}, id LIMIT ?`);
  const next = db.prepare<[string, string, string, string, string, number], RegistrationRow>(
    `SELECT ${columns} FROM users WHERE ${recent} AND (${created} > ? OR (${created} = ? AND id > ?)) ORDER BY ${created}, id LIMIT ?`,
  );
  const decide = db.prepare(`UPDATE users SET account_status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND ${recent}`);
  const toRecord = (row: RegistrationRow): PendingRegistrationRecord => ({ registrationId: row.id, username: row.username, requestedAt: row.requested_at, method: row.method });
  return {
    async countPending(createdAfter) {
      return count.get(createdAfter)!.n;
    },
    async listPending(createdAfter, limit, after) {
      const rows = after === null ? first.all(NO_PASSWORD_SENTINEL, createdAfter, limit) : next.all(NO_PASSWORD_SENTINEL, createdAfter, after.requestedAt, after.requestedAt, after.registrationId, limit);
      return rows.map(toRecord);
    },
    async decide(registrationId, to, decidedBy, decidedAt, createdAfter) {
      return decide.run(to, decidedAt, decidedBy, registrationId, createdAfter).changes === 1;
    },
  };
}

/**
 * Edicion de parametros (T1264). `compareAndSet` es UN `INSERT ... ON CONFLICT DO NOTHING` (fila ausente) o UN `UPDATE ... WHERE key = ? AND value = ? AND updated_at = ?` con `changes === 1`
 * como veredicto: sin lectura previa que decida. `updated_by_user_id` no se enlaza: queda `NULL` (el autor vive en `admin_audit_entries`, MER-09).
 */
export function adminParameterRepository(db: SqliteDatabase): AdminParameterRepositoryPort {
  const find = db.prepare<[string], { value: string; updated_at: string }>('SELECT value, updated_at FROM platform_parameters WHERE key = ?');
  const insert = db.prepare('INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, NULL) ON CONFLICT (key) DO NOTHING');
  const update = db.prepare('UPDATE platform_parameters SET value = ?, updated_at = ?, updated_by_user_id = NULL WHERE key = ? AND value = ? AND updated_at = ?');
  const editor = db.prepare<[string, string], { admin_id: string }>('SELECT admin_id FROM admin_audit_entries WHERE action = ? AND object_ref = ? ORDER BY occurred_at DESC, rowid DESC LIMIT 1');
  const accounts = db.prepare<[string, string], { id: string }>(
    `SELECT id FROM users WHERE id IN (SELECT user_id FROM auth_identities WHERE provider = 'GOOGLE' AND provider_subject IN (SELECT value FROM json_each(?)))
       OR (email_verified_at IS NOT NULL AND lower(email) IN (SELECT value FROM json_each(?)))`,
  );
  const scenesOf = db.prepare<[string], { id: string; consumed_generations: number }>('SELECT id, consumed_generations FROM home_scenes WHERE owner_user_id = ? AND consumed_generations > 0');
  const zeroScene = db.prepare('UPDATE home_scenes SET consumed_generations = 0 WHERE id = ? AND consumed_generations = ?');
  const carryOf = db.prepare<[string], { quota_window: string; consumed_generations: number }>('SELECT quota_window, consumed_generations FROM scene_quota_carry WHERE owner_user_id = ? AND consumed_generations > 0');
  const dropCarry = db.prepare('DELETE FROM scene_quota_carry WHERE owner_user_id = ? AND quota_window = ? AND consumed_generations = ?');
  // D9-28: escenas de los hogares donde la cuenta es propietaria legal (`households.owner_user_id`) y desbloqueo del limite de fallos.
  const householdScenesOf = db.prepare<[string], { id: string; consumed_generations: number }>(
    'SELECT s.id AS id, s.consumed_generations AS consumed_generations FROM home_scenes s WHERE s.household_id IN (SELECT id FROM households WHERE owner_user_id = ?) AND s.consumed_generations > 0',
  );
  const allScenesOf = db.prepare<[string, string], { id: string }>('SELECT s.id AS id FROM home_scenes s WHERE s.owner_user_id = ? OR s.household_id IN (SELECT id FROM households WHERE owner_user_id = ?)');
  // D9-31: marca de reinicio de la escena y del actor; scene_attempts NO se reescribe.
  const markScene = db.prepare('UPDATE home_scenes SET limits_reset_at = ? WHERE id = ?');
  const markActor = db.prepare('INSERT INTO scene_actor_limit_marks (user_id, limits_reset_at) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET limits_reset_at = excluded.limits_reset_at');
  const clearFailedScene = db.prepare("UPDATE home_scenes SET run_state = NULL, current_attempt_id = NULL, lease_expires_at = NULL WHERE id = ? AND run_state = 'failed'");
  const spendOf = db.prepare<[string], { provider_model: string | null; provider_location: string | null; provider_call_started_at: string | null }>('SELECT provider_model, provider_location, provider_call_started_at FROM scene_attempts WHERE quota_window = ?');
  return {
    async find(key): Promise<ParameterRowRecord | null> {
      const row = find.get(key);
      return row === undefined ? null : { value: row.value, updatedAt: row.updated_at };
    },
    async compareAndSet(key, description, next, expected) {
      if (expected === null) return insert.run(key, next.value, description, next.updatedAt).changes === 1;
      return update.run(next.value, next.updatedAt, key, expected.value, expected.updatedAt).changes === 1;
    },
    async lastEditor(action, key) {
      return editor.get(action, key)?.admin_id ?? null;
    },
    async listSceneSpendAttempts(window) {
      return spendOf.all(window).map((r) => ({ providerModel: r.provider_model, providerLocation: r.provider_location, providerCallStartedAt: r.provider_call_started_at }));
    },
    async listAdminAccountUserIds(subjects, emails) {
      return accounts.all(JSON.stringify(subjects), JSON.stringify(emails.map((e) => e.toLowerCase()))).map((r) => r.id);
    },
    async resetAdminAccountsSceneQuota(subjects, emails, resetAt) {
      const ids = accounts.all(JSON.stringify(subjects), JSON.stringify(emails.map((e) => e.toLowerCase()))).map((r) => r.id);
      for (const id of ids) {
        for (const scene of scenesOf.all(id)) if (zeroScene.run(scene.id, scene.consumed_generations).changes !== 1) return null;
        for (const scene of householdScenesOf.all(id)) if (zeroScene.run(scene.id, scene.consumed_generations).changes !== 1) return null;
        for (const row of carryOf.all(id)) if (dropCarry.run(id, row.quota_window, row.consumed_generations).changes !== 1) return null;
        markActor.run(id, resetAt);
        for (const scene of allScenesOf.all(id, id)) {
          markScene.run(resetAt, scene.id);
          clearFailedScene.run(scene.id);
        }
      }
      return { accountsReset: ids.length };
    },
  };
}

interface AboutRow {
  readonly body_markdown: string;
  readonly photo_object_key: string | null;
  readonly photo_alt: string;
  readonly version: number;
  readonly updated_at: string;
  readonly updated_by: string;
}

/**
 * `about_content` (feature 010, T1430; migración 0029): singleton `id = 1`. `replace` es UN `INSERT ... ON CONFLICT DO NOTHING` (sin fila, `expectedVersion = 0`) o UN
 * `UPDATE ... WHERE id = 1 AND version = ?` con `changes === 1` como veredicto: sin lectura previa que decida (REQ-ACE10-003, EDGE-010-006).
 */
export function aboutContentRepository(db: SqliteDatabase): AboutContentRepositoryPort {
  const columns = 'body_markdown, photo_object_key, photo_alt, version, updated_at, updated_by';
  const find = db.prepare<[], AboutRow>(`SELECT ${columns} FROM about_content WHERE id = 1`);
  const insert = db.prepare('INSERT INTO about_content (id, body_markdown, photo_object_key, photo_alt, version, updated_at, updated_by) VALUES (1, ?, ?, ?, 1, ?, ?) ON CONFLICT (id) DO NOTHING');
  const update = db.prepare('UPDATE about_content SET body_markdown = ?, photo_object_key = ?, photo_alt = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = 1 AND version = ?');
  const toRecord = (row: AboutRow): AboutContentRecord => ({
    bodyMarkdown: row.body_markdown,
    photoObjectKey: row.photo_object_key,
    photoAlt: row.photo_alt,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });
  return {
    async get() {
      const row = find.get();
      return row === undefined ? null : toRecord(row);
    },
    async replace(next, expectedVersion) {
      const written =
        expectedVersion === 0
          ? insert.run(next.bodyMarkdown, next.photoObjectKey, next.photoAlt, next.updatedAt, next.updatedBy).changes === 1
          : update.run(next.bodyMarkdown, next.photoObjectKey, next.photoAlt, next.updatedAt, next.updatedBy, expectedVersion).changes === 1;
      if (!written) return null;
      const row = find.get();
      return row === undefined ? null : toRecord(row);
    },
  };
}

interface DelegateRow {
  readonly admin_id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly provider: AdminProvider | null;
  readonly provider_subject: string | null;
  readonly invited_at: string | null;
  readonly invited_expires_at: string | null;
  readonly anchored_at: string | null;
  readonly disabled_at: string | null;
  readonly created_by_admin_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * `admin_delegates` (feature 011, T1527; migración 0031). Sentencias preparadas con parámetros enlazados (el correo y el `sub` nunca se interpolan ni salen en un mensaje de error). Cada escritura es un
 * compare-and-set (`changes === 1` como veredicto); la unidad de trabajo ya sostiene `BEGIN IMMEDIATE`, que serializa la guarda del último SUPER_ADMIN y los topes (H-2a), de modo que `lockForGuard`
 * no añade nada. Un índice único parcial rechaza una segunda fila viva con el mismo correo (ORA-1 b): `insert` y `replace` devuelven `false` ante esa violación. Paridad con Postgres.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-005, REQ-ADM11-006, STATE-ADM11-001, EDGE-011-009, EDGE-011-010, EDGE-011-019
 */
export function adminDelegateRepository(db: SqliteDatabase): AdminDelegateRepositoryPort {
  const columns = 'admin_id, email, role, status, provider, provider_subject, invited_at, invited_expires_at, anchored_at, disabled_at, created_by_admin_id, created_at, updated_at';
  const byId = db.prepare<[string], DelegateRow>(`SELECT ${columns} FROM admin_delegates WHERE admin_id = ?`);
  const liveByEmail = db.prepare<[string], DelegateRow>(`SELECT ${columns} FROM admin_delegates WHERE email = ? AND status IN ('ACTIVE', 'INVITED')`);
  const page = db.prepare<[number], DelegateRow>(`SELECT ${columns} FROM admin_delegates ORDER BY created_at, admin_id LIMIT ?`);
  const rows = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM admin_delegates');
  const occupied = db.prepare<[string, string], { n: number }>(
    "SELECT COUNT(*) AS n FROM admin_delegates WHERE admin_id <> ? AND (status = 'ACTIVE' OR (status = 'INVITED' AND invited_expires_at >= ?))",
  );
  const superAdmins = db.prepare<[string, string], { n: number }>(
    "SELECT COUNT(*) AS n FROM admin_delegates WHERE admin_id <> ? AND status = 'ACTIVE' AND role = 'SUPER_ADMIN' AND email NOT IN (SELECT value FROM json_each(?))",
  );
  const insert = db.prepare(`INSERT INTO admin_delegates (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const update = db.prepare(
    `UPDATE admin_delegates SET role = ?, status = ?, provider = ?, provider_subject = ?, invited_at = ?, invited_expires_at = ?, anchored_at = ?, disabled_at = ?, updated_at = ?
     WHERE admin_id = ? AND status = ? AND role = ? AND updated_at = ? AND provider_subject IS ?`,
  );
  const anchor = db.prepare(
    `UPDATE admin_delegates SET status = 'ACTIVE', provider = ?, provider_subject = ?, anchored_at = ?, invited_expires_at = NULL, updated_at = ?
     WHERE admin_id = ? AND status = 'INVITED' AND provider_subject IS NULL AND invited_expires_at >= ?`,
  );
  // Purga y anonimización de la retención (DEUDA-011-PURGA-DELEGADOS): solo parámetros enlazados; el marcador de correo se deriva del `admin_id` en SQL.
  const purgeInvitations = db.prepare("DELETE FROM admin_delegates WHERE status = 'INVITED' AND invited_at IS NOT NULL AND invited_at < ?");
  const pendingAnonymization = db.prepare<[string], { admin_id: string }>(
    "SELECT admin_id FROM admin_delegates WHERE status = 'DISABLED' AND disabled_at < ? AND (provider_subject IS NOT NULL OR email <> 'anon-' || admin_id || '@anonimizado.invalid') ORDER BY admin_id",
  );
  const anonymize = db.prepare("UPDATE admin_delegates SET email = 'anon-' || admin_id || '@anonimizado.invalid', provider = NULL, provider_subject = NULL WHERE admin_id = ? AND status = 'DISABLED'");
  const toRecord = (row: DelegateRow): AdminDelegateRecord => ({
    adminId: row.admin_id,
    email: row.email,
    role: row.role,
    status: row.status,
    provider: row.provider,
    providerSubject: row.provider_subject,
    invitedAt: row.invited_at,
    invitedExpiresAt: row.invited_expires_at,
    anchoredAt: row.anchored_at,
    disabledAt: row.disabled_at,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  /** `true` si la sentencia violó un índice único o un CHECK (el llamador lo traduce a «no escribió»); cualquier otro error se propaga. */
  const isConstraintViolation = (error: unknown): boolean => String((error as { code?: unknown }).code ?? '').startsWith('SQLITE_CONSTRAINT');
  return {
    async lockForGuard() {},
    async findById(adminId) {
      const row = byId.get(adminId);
      return row === undefined ? null : toRecord(row);
    },
    async findLiveByEmail(email) {
      const row = liveByEmail.get(email);
      return row === undefined ? null : toRecord(row);
    },
    async list(limit) {
      return page.all(limit).map(toRecord);
    },
    async countRows() {
      return rows.get()!.n;
    },
    async countOccupied(now, excludeAdminId) {
      return occupied.get(excludeAdminId ?? '', now)!.n;
    },
    async countActiveSuperAdmins(excludeEmails, excludeAdminId) {
      return superAdmins.get(excludeAdminId ?? '', JSON.stringify(excludeEmails))!.n;
    },
    async insert(r) {
      try {
        return insert.run(r.adminId, r.email, r.role, r.status, r.provider, r.providerSubject, r.invitedAt, r.invitedExpiresAt, r.anchoredAt, r.disabledAt, r.createdByAdminId, r.createdAt, r.updatedAt).changes === 1;
      } catch (error) {
        if (isConstraintViolation(error)) return false;
        throw error;
      }
    },
    async replace(next, expected) {
      try {
        return (
          update.run(next.role, next.status, next.provider, next.providerSubject, next.invitedAt, next.invitedExpiresAt, next.anchoredAt, next.disabledAt, next.updatedAt, expected.adminId, expected.status, expected.role, expected.updatedAt, expected.providerSubject)
            .changes === 1
        );
      } catch (error) {
        if (isConstraintViolation(error)) return false;
        throw error;
      }
    },
    async anchor(adminId, provider, providerSubject, now) {
      try {
        return anchor.run(provider, providerSubject, now, now, adminId, now).changes === 1;
      } catch (error) {
        if (isConstraintViolation(error)) return false;
        throw error;
      }
    },
    async purgeExpiredInvitations(invitedBefore) {
      return purgeInvitations.run(invitedBefore).changes;
    },
    async anonymizeDisabledBefore(disabledBefore) {
      const ids = pendingAnonymization.all(disabledBefore).map((row) => row.admin_id);
      for (const id of ids) anonymize.run(id);
      return ids;
    },
  };
}
