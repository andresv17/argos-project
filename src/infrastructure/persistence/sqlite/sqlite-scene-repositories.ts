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
  const countFailed = db.prepare<[string, string], { n: number; oldest: string | null }>(
    "SELECT count(*) AS n, min(started_at) AS oldest FROM scene_attempts WHERE scene_id = ? AND outcome = 'FAILED' AND provider_call_started_at IS NOT NULL AND started_at >= ?",
  );
  const countClosedNoCall = db.prepare<[string, string], { n: number; oldest: string | null }>(
    'SELECT count(*) AS n, min(started_at) AS oldest FROM scene_attempts WHERE scene_id = ? AND outcome IS NOT NULL AND provider_call_started_at IS NULL AND started_at >= ?',
  );
  const staleOf = db.prepare<[string, string, string], { id: string; scene_id: string }>(
    'SELECT id, scene_id FROM scene_attempts WHERE (scene_id = ? OR actor_user_id = ?) AND outcome IS NULL AND provider_call_started_at IS NULL AND started_at <= ?',
  );
  const lastOutcome = db.prepare<[string], { o: string | null }>('SELECT outcome AS o FROM scene_attempts WHERE scene_id = ? ORDER BY started_at DESC, id DESC LIMIT 1');
  const lastStarted = db.prepare<[string], { m: string | null }>('SELECT max(started_at) AS m FROM scene_attempts WHERE scene_id = ?');
  const oldestActor = db.prepare<[string, string], { m: string | null }>('SELECT min(started_at) AS m FROM scene_attempts WHERE actor_user_id = ? AND started_at >= ?');
  const countActor = db.prepare<[string, string], { n: number }>(
    'SELECT count(*) AS n FROM scene_attempts WHERE actor_user_id = ? AND started_at >= ? AND (provider_call_started_at IS NOT NULL OR outcome IS NULL)',
  );
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
  const sourcesOf = db.prepare<[string], { owner_user_id: string }>('SELECT owner_user_id FROM scene_image_sources WHERE scene_id = ? ORDER BY owner_user_id');
  const clearSources = db.prepare('DELETE FROM scene_image_sources WHERE scene_id = ?');
  const addSource = db.prepare('INSERT OR IGNORE INTO scene_image_sources (scene_id, owner_user_id) VALUES (?, ?)');
  const imageOf = db.prepare<[string], { image_id: string | null }>('SELECT image_id FROM home_scenes WHERE id = ?');
  const retire = db.prepare(
    'UPDATE home_scenes SET image_id = NULL, image_mime = NULL, image_size_bytes = NULL, image_fingerprint = NULL, image_inputs_snapshot = NULL, image_created_at = NULL, image_degraded = 0, updated_at = ? WHERE id = ? AND image_id IS NOT NULL',
  );
  const inFlight = db.prepare<[string], { current_attempt_id: string; result_object_id: string }>(
    "SELECT s.current_attempt_id AS current_attempt_id, a.result_object_id AS result_object_id FROM home_scenes s JOIN scene_attempts a ON a.id = s.current_attempt_id WHERE s.id = ? AND s.run_state = 'generating'",
  );
  const cancelAttempt = db.prepare("UPDATE scene_attempts SET phase = 'DONE', outcome = 'CANCELLED', finished_at = ? WHERE id = ? AND outcome IS NULL");
  const idleScene = db.prepare('UPDATE home_scenes SET run_state = NULL, current_attempt_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?');
  const expiredOf = db.prepare<[string, string], { current_attempt_id: string; result_object_id: string }>(
    "SELECT s.current_attempt_id AS current_attempt_id, a.result_object_id AS result_object_id FROM home_scenes s JOIN scene_attempts a ON a.id = s.current_attempt_id WHERE s.id = ? AND s.run_state = 'generating' AND s.lease_expires_at <= ?",
  );
  const expireAttempt = db.prepare("UPDATE scene_attempts SET phase = 'DONE', outcome = 'FAILED', error_code = 'ERR-SCENE-LEASE-EXPIRED', finished_at = ? WHERE id = ? AND outcome IS NULL");
  const failScene = db.prepare("UPDATE home_scenes SET run_state = 'failed', lease_expires_at = NULL, updated_at = ? WHERE id = ?");
  const markCall = db.prepare('UPDATE scene_attempts SET provider_call_started_at = ?, provider_model = ?, provider_location = ? WHERE id = ?');
  const closeOne = db.prepare("UPDATE scene_attempts SET phase = 'DONE', outcome = ?, error_code = ?, degraded = ?, finished_at = ? WHERE id = ? AND scene_id = ? AND outcome IS NULL");
  const isCurrent = db.prepare<[string, string], { n: number }>('SELECT count(*) AS n FROM home_scenes WHERE id = ? AND current_attempt_id = ?');
  const publish = db.prepare(
    'UPDATE home_scenes SET image_id = ?, image_mime = ?, image_size_bytes = ?, image_fingerprint = ?, image_inputs_snapshot = ?, image_created_at = ?, image_degraded = ?, consumed_generations = ?, quota_window = ?, run_state = NULL, current_attempt_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?',
  );
  const succeed = db.prepare("UPDATE scene_attempts SET phase = 'DONE', outcome = 'SUCCEEDED', error_code = NULL, degraded = ?, finished_at = ? WHERE id = ?");
  const ownerScene = db.prepare<[string], { id: string }>('SELECT id FROM home_scenes WHERE owner_user_id = ?');
  const dropOtherOfHousehold = db.prepare('DELETE FROM home_scenes WHERE household_id = ? AND id <> ?');
  const adopt = db.prepare('UPDATE home_scenes SET household_id = ?, owner_user_id = NULL, updated_at = ? WHERE id = ?');
  const raise = db.prepare('UPDATE home_scenes SET consumed_generations = ? WHERE id = ? AND quota_window = ? AND consumed_generations < ?');
  const dropScene = db.prepare('DELETE FROM home_scenes WHERE id = ?');
  const dropPhoto = db.prepare('DELETE FROM household_photos WHERE household_id = ?');
  const pseudoSourcesDelete = db.prepare('DELETE FROM scene_image_sources WHERE owner_user_id = ?');
  const pseudoSources = db.prepare('UPDATE OR IGNORE scene_image_sources SET owner_user_id = ? WHERE owner_user_id = ?');
  const pseudoPhotos = db.prepare('UPDATE household_photos SET uploaded_by_user_id = ? WHERE uploaded_by_user_id = ?');
  const pseudoAttempts = db.prepare('UPDATE scene_attempts SET actor_user_id = ? WHERE actor_user_id = ?');
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
    async expireLease(sceneId, now) {
      const row = expiredOf.get(sceneId, now);
      if (row === undefined) return null;
      expireAttempt.run(now, row.current_attempt_id);
      failScene.run(now, sceneId);
      const closed = attemptById.get(row.current_attempt_id);
      return closed === undefined ? null : toAttemptRecord(closed);
    },
    async markProviderCall(attemptId, now, call) {
      markCall.run(now, call.model, call.location, attemptId);
    },
    async closeAttempt({ sceneId, attemptId, outcome, errorCode, degraded, now }) {
      if (closeOne.run(outcome, errorCode, degraded ? 1 : 0, now, attemptId, sceneId).changes !== 1) return false;
      if ((isCurrent.get(sceneId, attemptId)?.n ?? 0) === 1) (outcome === 'FAILED' ? failScene : idleScene).run(now, sceneId);
      return true;
    },
    async publishImage({ sceneId, attemptId, image, degraded, consumedGenerations, quotaWindow, ownerUserIds, now }) {
      const previous = imageOf.get(sceneId)?.image_id ?? null;
      publish.run(image.id, image.mime, image.sizeBytes, image.fingerprint, image.inputsSnapshot, image.createdAt, degraded ? 1 : 0, consumedGenerations, quotaWindow, now, sceneId);
      succeed.run(degraded ? 1 : 0, now, attemptId);
      clearSources.run(sceneId);
      for (const owner of new Set(ownerUserIds)) addSource.run(sceneId, owner);
      return previous;
    },
    async lastAttemptStartedAt(sceneId) {
      return lastStarted.get(sceneId)?.m ?? null;
    },
    async lastAttemptOutcome(sceneId) {
      return (lastOutcome.get(sceneId)?.o ?? null) as 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | null;
    },
    async oldestActorAttemptAt(actorUserId, since) {
      return oldestActor.get(actorUserId, since)?.m ?? null;
    },
    async countAttemptsByScene(sceneId, since) {
      return countScene.get(sceneId, since)?.n ?? 0;
    },
    async countFailedAttemptsByScene(sceneId, since) {
      const row = countFailed.get(sceneId, since);
      return { count: row?.n ?? 0, oldestAt: (row?.n ?? 0) === 0 ? null : (row?.oldest ?? null) };
    },
    async countAttemptsByActor(actorUserId, since) {
      return countActor.get(actorUserId, since)?.n ?? 0;
    },
    async countClosedWithoutCallByScene(sceneId, since) {
      const row = countClosedNoCall.get(sceneId, since);
      return { count: row?.n ?? 0, oldestAt: (row?.n ?? 0) === 0 ? null : (row?.oldest ?? null) };
    },
    async cancelStaleUnmarkedAttempts(sceneId, actorUserId, startedBefore, now) {
      const stale = staleOf.all(sceneId, actorUserId, startedBefore);
      for (const row of stale) {
        cancelAttempt.run(now, row.id);
        if ((isCurrent.get(row.scene_id, row.id)?.n ?? 0) === 1) idleScene.run(now, row.scene_id);
      }
      return stale.length;
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
    async findImageSources(sceneId) {
      return sourcesOf.all(sceneId).map((r) => r.owner_user_id);
    },
    async replaceImageSources(sceneId, ownerUserIds) {
      clearSources.run(sceneId);
      for (const owner of new Set(ownerUserIds)) addSource.run(sceneId, owner);
    },
    async retireImage(sceneId, now) {
      const id = imageOf.get(sceneId)?.image_id ?? null;
      clearSources.run(sceneId);
      if (id === null) return null;
      retire.run(now, sceneId);
      return id;
    },
    async cancelInFlight(sceneId, now) {
      const row = inFlight.get(sceneId);
      if (row === undefined) return null;
      cancelAttempt.run(now, row.current_attempt_id);
      idleScene.run(now, sceneId);
      return { attemptId: row.current_attempt_id, resultObjectId: row.result_object_id };
    },
    async adoptOwnerScene(ownerUserId, householdId, now) {
      const own = ownerScene.get(ownerUserId);
      if (own === undefined) return null;
      dropOtherOfHousehold.run(householdId, own.id);
      adopt.run(householdId, now, own.id);
      return own.id;
    },
    async raiseConsumed(sceneId, quotaWindow, consumed) {
      raise.run(consumed, sceneId, quotaWindow, consumed);
    },
    async deleteScene(sceneId) {
      dropScene.run(sceneId);
    },
    async deleteHouseholdPhoto(householdId) {
      dropPhoto.run(householdId);
    },
    async pseudonymizeUser(userId, pseudonym) {
      pseudoSources.run(pseudonym, userId);
      pseudoSourcesDelete.run(userId); // restos: filas que ya tenían el seudónimo en esa escena
      pseudoPhotos.run(pseudonym, userId);
      pseudoAttempts.run(pseudonym, userId);
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
