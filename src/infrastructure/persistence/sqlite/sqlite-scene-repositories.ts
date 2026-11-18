/**
 * Repositorios SQLite de la escena (feature 006, T834; migración 0013): `home_scenes`, `scene_attempts`, `scene_quota_carry` y `scene_consents`. Todo se ejecuta
 * dentro del `BEGIN IMMEDIATE` de la unidad de trabajo (un solo escritor: es el candado de la escena, INV-ESC6-003). SQL parametrizado, sin interpolación.
 * Nunca se escribe la clave de idempotencia ni el nombre del archivo: solo el hash (C8, INV-ESC6-009).
 *
 * @implements INV-ESC6-003, INV-ESC6-004, INV-ESC6-012, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036, EDGE-ESC6-016, EDGE-ESC6-033, INV-ARCH-005
 */
import type { SceneConsentRepository, SceneRepository } from '../../../application/ports/scene-repositories.port.ts';
import {
  ATTEMPT_COLUMN_LIST,
  CONSENT_COLUMN_LIST,
  HOUSEHOLD_PHOTO_COLUMN_LIST,
  SCENE_COLUMN_LIST,
  attemptValues,
  consentValues,
  householdPhotoValues,
  sceneValues,
  toAttemptRecord,
  toConsentRecord,
  toHouseholdPhotoRecord,
  toSceneRecord,
} from '../scene-row-mappers.ts';
import type { SqliteDatabase } from './sqlite-database.ts';

type Row = Record<string, unknown>;

const SCENE_COLUMNS = SCENE_COLUMN_LIST;
const ATTEMPT_COLUMNS = ATTEMPT_COLUMN_LIST;
const CONSENT_COLUMNS = CONSENT_COLUMN_LIST;

export function sqliteSceneRepository(db: SqliteDatabase): SceneRepository {
  const byId = db.prepare<[string], Row>(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE id = ?`);
  const byHousehold = db.prepare<[string], Row>(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE household_id = ?`);
  const byOwner = db.prepare<[string], Row>(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE owner_user_id = ?`);
  const insert = db.prepare(`INSERT INTO home_scenes (${SCENE_COLUMNS}) VALUES (${SCENE_COLUMNS.split(', ').map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`);
  const begin = db.prepare(
    "UPDATE home_scenes SET run_state = 'generating', current_attempt_id = ?, lease_expires_at = ?, updated_at = ? WHERE id = ? AND (run_state IS NULL OR run_state = 'failed' OR (run_state = 'generating' AND lease_expires_at <= ?))",
  );
  const clearHashes = db.prepare('UPDATE scene_attempts SET idempotency_key_hash = NULL, idempotency_expires_at = NULL WHERE scene_id = ? AND idempotency_key_hash IS NOT NULL');
  const insertAttempt = db.prepare(`INSERT INTO scene_attempts (${ATTEMPT_COLUMNS}) VALUES (${ATTEMPT_COLUMNS.split(', ').map(() => '?').join(', ')})`);
  const claim = db.prepare("UPDATE scene_attempts SET phase = 'RUNNING', claimed_at = ? WHERE id = ? AND scene_id = ? AND phase = 'PENDING'");
  const lease = db.prepare("UPDATE home_scenes SET lease_expires_at = ? WHERE id = ? AND current_attempt_id = ? AND run_state = 'generating'");
  const attemptById = db.prepare<[string], Row>(`SELECT ${ATTEMPT_COLUMNS} FROM scene_attempts WHERE id = ?`);
  const attemptByHash = db.prepare<[string], Row>(`SELECT ${ATTEMPT_COLUMNS} FROM scene_attempts WHERE idempotency_key_hash = ?`);
  const countScene = db.prepare<[string, string], { n: number }>('SELECT count(*) AS n FROM scene_attempts WHERE scene_id = ? AND started_at >= ?');
  const countActor = db.prepare<[string, string], { n: number }>('SELECT count(*) AS n FROM scene_attempts WHERE actor_user_id = ? AND started_at >= ?');
  const carry = db.prepare(
    'INSERT INTO scene_quota_carry (owner_user_id, quota_window, consumed_generations) VALUES (?, ?, ?) ON CONFLICT (owner_user_id, quota_window) DO UPDATE SET consumed_generations = max(consumed_generations, excluded.consumed_generations)',
  );
  const carryOf = db.prepare<[string, string], { consumed_generations: number }>('SELECT consumed_generations FROM scene_quota_carry WHERE owner_user_id = ? AND quota_window = ?');
  const purgeAttempts = db.prepare(
    'DELETE FROM scene_attempts WHERE outcome IS NOT NULL AND finished_at < ? AND id NOT IN (SELECT current_attempt_id FROM home_scenes WHERE current_attempt_id IS NOT NULL)',
  );
  const clearExpired = db.prepare('UPDATE scene_attempts SET idempotency_key_hash = NULL, idempotency_expires_at = NULL WHERE idempotency_key_hash IS NOT NULL AND idempotency_expires_at <= ?');
  const purgeCarry = db.prepare('DELETE FROM scene_quota_carry WHERE quota_window < ?');
  const photoOf = db.prepare<[string], Row>(`SELECT ${HOUSEHOLD_PHOTO_COLUMN_LIST} FROM household_photos WHERE household_id = ?`);
  const putPhoto = db.prepare(
    `INSERT INTO household_photos (${HOUSEHOLD_PHOTO_COLUMN_LIST}) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (household_id) DO UPDATE SET object_id = excluded.object_id, mime = excluded.mime, size_bytes = excluded.size_bytes, uploaded_by_user_id = excluded.uploaded_by_user_id, created_at = excluded.created_at`,
  );
  return {
    async findById(sceneId) {
      const row = byId.get(sceneId);
      return row === undefined ? null : toSceneRecord(row);
    },
    async findByHouseholdId(householdId) {
      const row = byHousehold.get(householdId);
      return row === undefined ? null : toSceneRecord(row);
    },
    async findByOwnerUserId(ownerUserId) {
      const row = byOwner.get(ownerUserId);
      return row === undefined ? null : toSceneRecord(row);
    },
    async insert(scene) {
      return insert.run(...sceneValues(scene)).changes === 1;
    },
    async lockScene() {
      // BEGIN IMMEDIATE de la unidad de trabajo: un solo escritor a la vez.
    },
    async beginGeneration({ sceneId, attempt, now, leaseExpiresAt }) {
      if (begin.run(attempt.id, leaseExpiresAt, now, sceneId, now).changes !== 1) return false;
      clearHashes.run(sceneId);
      insertAttempt.run(...attemptValues(attempt));
      return true;
    },
    async claimAttempt({ sceneId, attemptId, now, leaseExpiresAt }) {
      if (claim.run(now, attemptId, sceneId).changes !== 1) return false;
      lease.run(leaseExpiresAt, sceneId, attemptId);
      return true;
    },
    async findAttemptById(attemptId) {
      const row = attemptById.get(attemptId);
      return row === undefined ? null : toAttemptRecord(row);
    },
    async findAttemptByIdempotencyKeyHash(hash) {
      const row = attemptByHash.get(hash);
      return row === undefined ? null : toAttemptRecord(row);
    },
    async countAttemptsByScene(sceneId, since) {
      return countScene.get(sceneId, since)?.n ?? 0;
    },
    async countAttemptsByActor(actorUserId, since) {
      return countActor.get(actorUserId, since)?.n ?? 0;
    },
    async upsertQuotaCarry(ownerUserId, quotaWindow, consumedGenerations) {
      carry.run(ownerUserId, quotaWindow, consumedGenerations);
    },
    async findQuotaCarry(ownerUserId, quotaWindow) {
      return carryOf.get(ownerUserId, quotaWindow)?.consumed_generations ?? null;
    },
    async purgeTerminalAttempts(finishedBefore) {
      return purgeAttempts.run(finishedBefore).changes;
    },
    async clearExpiredIdempotencyHashes(now) {
      return clearExpired.run(now).changes;
    },
    async purgeQuotaCarryBefore(quotaWindow) {
      return purgeCarry.run(quotaWindow).changes;
    },
    async findHouseholdPhoto(householdId) {
      const row = photoOf.get(householdId);
      return row === undefined ? null : toHouseholdPhotoRecord(row);
    },
    async putHouseholdPhoto(photo) {
      putPhoto.run(...householdPhotoValues(photo));
    },
  };
}

export function sqliteSceneConsentRepository(db: SqliteDatabase): SceneConsentRepository {
  const latest = db.prepare<[string], Row>(`SELECT ${CONSENT_COLUMNS} FROM scene_consents WHERE user_id = ? ORDER BY granted_at DESC, id DESC LIMIT 1`);
  const active = db.prepare<[string, string, string, string], Row>(
    `SELECT ${CONSENT_COLUMNS} FROM scene_consents WHERE user_id = ? AND scope = ? AND provider_id = ? AND notice_version = ? AND revoked_at IS NULL`,
  );
  const grant = db.prepare(`INSERT INTO scene_consents (${CONSENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, scope, provider_id, notice_version) WHERE revoked_at IS NULL DO NOTHING`);
  const revoke = db.prepare('UPDATE scene_consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
  return {
    async findByUserId(userId) {
      const row = latest.get(userId);
      return row === undefined ? null : toConsentRecord(row);
    },
    async findActive(userId, scope, providerId, noticeVersion) {
      const row = active.get(userId, scope, providerId, noticeVersion);
      return row === undefined ? null : toConsentRecord(row);
    },
    async grant(consent) {
      return grant.run(...consentValues(consent)).changes === 1;
    },
    async revoke(consentId, revokedAt) {
      return revoke.run(revokedAt, consentId).changes === 1;
    },
  };
}
