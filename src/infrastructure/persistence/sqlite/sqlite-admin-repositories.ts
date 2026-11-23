/**
 * Repositorios SQLite del portal de administración (feature 009, #19; migración 0019): `admin_identities`, `admin_sessions`, `admin_oauth_flow_states` y `admin_audit_entries`.
 * Sentencias preparadas con parámetros enlazados (el correo, el `sub` y los hashes nunca se interpolan ni salen en un mensaje de error). Un solo uso del estado del flujo y la revocación
 * son compare-and-set (`UPDATE … WHERE … IS NULL`). Paridad con Postgres: `postgres-admin-repositories.ts`.
 *
 * @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, EDGE-009-047, NFR-009-004, INV-ARCH-005
 */

import type {
  AdminAuditRecord,
  AdminAuditRepositoryPort,
  AdminFlowStateRecord,
  AdminFlowStateRepositoryPort,
  AdminIdentityRecord,
  AdminIdentityRepositoryPort,
  AdminProvider,
  AdminSessionRecord,
  AdminSessionRepositoryPort,
} from '../../../application/ports/admin.port.ts';
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
  const insert = db.prepare(`INSERT INTO admin_identities (${columns}) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`);
  const toIdentity = (row: IdentityRow): AdminIdentityRecord => ({ adminId: row.admin_id, provider: row.provider, providerSubject: row.provider_subject, email: row.email, createdAt: row.created_at });
  return {
    async findById(adminId) {
      const row = byId.get(adminId);
      return row === undefined ? null : toIdentity(row);
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
