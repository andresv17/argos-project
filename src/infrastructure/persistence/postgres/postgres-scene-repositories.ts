/**
 * Repositorios PostgreSQL de la escena (feature 006, T834; migración 0009), con paridad con SQLite (0013). SQL parametrizado `$n` sin interpolación.
 * `lockScene` toma `SELECT ... FOR UPDATE` de la fila de la escena, el último candado del orden propietario -> mascota -> hogar -> escena (ADR-006-07,
 * INV-ESC6-003). El compare-and-set de T1 y el claim son `UPDATE` condicionados cuyo `rowCount` decide; con 0 filas no se escribe nada más.
 *
 * @implements INV-ESC6-003, INV-ESC6-004, INV-ESC6-012, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036, EDGE-ESC6-016, EDGE-ESC6-033, REQ-PG-002, INV-ARCH-005
 */
import type { SceneConsentRepository, SceneRepository } from '../../../application/ports/scene-repositories.port.ts';
import {
  ATTEMPT_COLUMN_LIST as ATTEMPT_COLUMNS,
  CONSENT_COLUMN_LIST as CONSENT_COLUMNS,
  HOUSEHOLD_PHOTO_COLUMN_LIST as PHOTO_COLUMNS,
  SCENE_COLUMN_LIST as SCENE_COLUMNS,
  attemptValues,
  consentValues,
  householdPhotoValues,
  sceneValues,
  toAttemptRecord,
  toConsentRecord,
  toHouseholdPhotoRecord,
  toSceneRecord,
} from '../scene-row-mappers.ts';
import type { PoolClientLike } from './postgres-database.ts';

const placeholders = (columns: string): string => columns.split(', ').map((_c, i) => `$${i + 1}`).join(', ');

export function postgresSceneRepository(client: PoolClientLike): SceneRepository {
  return {
    async findById(sceneId) {
      const { rows } = await client.query(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE id = $1`, [sceneId]);
      return rows[0] === undefined ? null : toSceneRecord(rows[0]);
    },
    async findByHouseholdId(householdId) {
      const { rows } = await client.query(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE household_id = $1`, [householdId]);
      return rows[0] === undefined ? null : toSceneRecord(rows[0]);
    },
    async findByOwnerUserId(ownerUserId) {
      const { rows } = await client.query(`SELECT ${SCENE_COLUMNS} FROM home_scenes WHERE owner_user_id = $1`, [ownerUserId]);
      return rows[0] === undefined ? null : toSceneRecord(rows[0]);
    },
    async insert(scene) {
      const result = await client.query(`INSERT INTO home_scenes (${SCENE_COLUMNS}) VALUES (${placeholders(SCENE_COLUMNS)}) ON CONFLICT DO NOTHING`, sceneValues(scene));
      return result.rowCount === 1;
    },
    async lockScene(sceneId) {
      await client.query('SELECT id FROM home_scenes WHERE id = $1 FOR UPDATE', [sceneId]);
    },
    async beginGeneration({ sceneId, attempt, now, leaseExpiresAt }) {
      const result = await client.query(
        "UPDATE home_scenes SET run_state = 'generating', current_attempt_id = $1, lease_expires_at = $2, updated_at = $3 WHERE id = $4 AND (run_state IS NULL OR run_state = 'failed' OR (run_state = 'generating' AND lease_expires_at <= $3))",
        [attempt.id, leaseExpiresAt, now, sceneId],
      );
      if (result.rowCount !== 1) return false;
      await client.query('UPDATE scene_attempts SET idempotency_key_hash = NULL, idempotency_expires_at = NULL WHERE scene_id = $1 AND idempotency_key_hash IS NOT NULL', [sceneId]);
      await client.query(`INSERT INTO scene_attempts (${ATTEMPT_COLUMNS}) VALUES (${placeholders(ATTEMPT_COLUMNS)})`, attemptValues(attempt));
      return true;
    },
    async claimAttempt({ sceneId, attemptId, now, leaseExpiresAt }) {
      const result = await client.query("UPDATE scene_attempts SET phase = 'RUNNING', claimed_at = $1 WHERE id = $2 AND scene_id = $3 AND phase = 'PENDING'", [now, attemptId, sceneId]);
      if (result.rowCount !== 1) return false;
      await client.query("UPDATE home_scenes SET lease_expires_at = $1 WHERE id = $2 AND current_attempt_id = $3 AND run_state = 'generating'", [leaseExpiresAt, sceneId, attemptId]);
      return true;
    },
    async findAttemptById(attemptId) {
      const { rows } = await client.query(`SELECT ${ATTEMPT_COLUMNS} FROM scene_attempts WHERE id = $1`, [attemptId]);
      return rows[0] === undefined ? null : toAttemptRecord(rows[0]);
    },
    async findAttemptByIdempotencyKeyHash(hash) {
      const { rows } = await client.query(`SELECT ${ATTEMPT_COLUMNS} FROM scene_attempts WHERE idempotency_key_hash = $1`, [hash]);
      return rows[0] === undefined ? null : toAttemptRecord(rows[0]);
    },
    async countAttemptsByScene(sceneId, since) {
      const { rows } = await client.query('SELECT count(*) AS n FROM scene_attempts WHERE scene_id = $1 AND started_at >= $2', [sceneId, since]);
      return Number(rows[0]?.['n'] ?? 0);
    },
    async countAttemptsByActor(actorUserId, since) {
      const { rows } = await client.query('SELECT count(*) AS n FROM scene_attempts WHERE actor_user_id = $1 AND started_at >= $2', [actorUserId, since]);
      return Number(rows[0]?.['n'] ?? 0);
    },
    async upsertQuotaCarry(ownerUserId, quotaWindow, consumedGenerations) {
      await client.query(
        'INSERT INTO scene_quota_carry (owner_user_id, quota_window, consumed_generations) VALUES ($1, $2, $3) ON CONFLICT (owner_user_id, quota_window) DO UPDATE SET consumed_generations = GREATEST(scene_quota_carry.consumed_generations, EXCLUDED.consumed_generations)',
        [ownerUserId, quotaWindow, consumedGenerations],
      );
    },
    async findQuotaCarry(ownerUserId, quotaWindow) {
      const { rows } = await client.query('SELECT consumed_generations FROM scene_quota_carry WHERE owner_user_id = $1 AND quota_window = $2', [ownerUserId, quotaWindow]);
      return rows[0] === undefined ? null : Number(rows[0]['consumed_generations']);
    },
    async purgeTerminalAttempts(finishedBefore) {
      const result = await client.query(
        'DELETE FROM scene_attempts WHERE outcome IS NOT NULL AND finished_at < $1 AND id NOT IN (SELECT current_attempt_id FROM home_scenes WHERE current_attempt_id IS NOT NULL)',
        [finishedBefore],
      );
      return result.rowCount ?? 0;
    },
    async clearExpiredIdempotencyHashes(now) {
      const result = await client.query('UPDATE scene_attempts SET idempotency_key_hash = NULL, idempotency_expires_at = NULL WHERE idempotency_key_hash IS NOT NULL AND idempotency_expires_at <= $1', [now]);
      return result.rowCount ?? 0;
    },
    async purgeQuotaCarryBefore(quotaWindow) {
      const result = await client.query('DELETE FROM scene_quota_carry WHERE quota_window < $1', [quotaWindow]);
      return result.rowCount ?? 0;
    },
    async findHouseholdPhoto(householdId) {
      const { rows } = await client.query(`SELECT ${PHOTO_COLUMNS} FROM household_photos WHERE household_id = $1`, [householdId]);
      return rows[0] === undefined ? null : toHouseholdPhotoRecord(rows[0]);
    },
    async putHouseholdPhoto(photo) {
      await client.query(
        `INSERT INTO household_photos (${PHOTO_COLUMNS}) VALUES (${placeholders(PHOTO_COLUMNS)}) ON CONFLICT (household_id) DO UPDATE SET object_id = EXCLUDED.object_id, mime = EXCLUDED.mime, size_bytes = EXCLUDED.size_bytes, uploaded_by_user_id = EXCLUDED.uploaded_by_user_id, created_at = EXCLUDED.created_at`,
        householdPhotoValues(photo),
      );
    },
  };
}

export function postgresSceneConsentRepository(client: PoolClientLike): SceneConsentRepository {
  return {
    async findByUserId(userId) {
      const { rows } = await client.query(`SELECT ${CONSENT_COLUMNS} FROM scene_consents WHERE user_id = $1 ORDER BY granted_at DESC, id DESC LIMIT 1`, [userId]);
      return rows[0] === undefined ? null : toConsentRecord(rows[0]);
    },
    async findActive(userId, scope, providerId, noticeVersion) {
      const { rows } = await client.query(
        `SELECT ${CONSENT_COLUMNS} FROM scene_consents WHERE user_id = $1 AND scope = $2 AND provider_id = $3 AND notice_version = $4 AND revoked_at IS NULL`,
        [userId, scope, providerId, noticeVersion],
      );
      return rows[0] === undefined ? null : toConsentRecord(rows[0]);
    },
    async grant(consent) {
      const result = await client.query(
        `INSERT INTO scene_consents (${CONSENT_COLUMNS}) VALUES (${placeholders(CONSENT_COLUMNS)}) ON CONFLICT (user_id, scope, provider_id, notice_version) WHERE revoked_at IS NULL DO NOTHING`,
        consentValues(consent),
      );
      return result.rowCount === 1;
    },
    async revoke(consentId, revokedAt) {
      const result = await client.query('UPDATE scene_consents SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL', [revokedAt, consentId]);
      return result.rowCount === 1;
    },
  };
}
