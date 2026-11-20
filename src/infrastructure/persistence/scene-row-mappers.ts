/**
 * Filas de la escena <-> registros del puerto (feature 006, T834): columnas y conversiones comunes a SQLite y PostgreSQL (mismo esquema, 0013 = 0009).
 * Sin E/S. Los indicadores 0/1 se leen con `Number` (SQLite entero, PostgreSQL `INTEGER`).
 *
 * @implements REQ-ESC6-012, INV-ESC6-009
 */
import type { HouseholdPhotoRecord, SceneAttemptRecord, SceneConsentRecord, SceneRecord } from '../../application/ports/scene-repositories.port.ts';

type Row = Record<string, unknown>;

export const SCENE_COLUMN_LIST =
  'id, household_id, owner_user_id, run_state, current_attempt_id, lease_expires_at, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, image_degraded, consumed_generations, quota_window, created_at, updated_at';
export const ATTEMPT_COLUMN_LIST =
  'id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, claimed_at, provider_call_started_at, quota_window, quota_max, outcome, error_code, degraded, idempotency_key_hash, idempotency_expires_at, started_at, finished_at';
export const CONSENT_COLUMN_LIST = 'id, user_id, scope, provider_id, notice_version, granted_at, revoked_at';

const nullable = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export const toSceneRecord = (row: Row): SceneRecord => ({
  id: String(row['id']),
  householdId: nullable(row['household_id']),
  ownerUserId: nullable(row['owner_user_id']),
  runState: nullable(row['run_state']) as SceneRecord['runState'],
  currentAttemptId: nullable(row['current_attempt_id']),
  leaseExpiresAt: nullable(row['lease_expires_at']),
  image:
    row['image_id'] === null || row['image_id'] === undefined
      ? null
      : {
          id: String(row['image_id']),
          mime: String(row['image_mime']) as 'image/png' | 'image/webp',
          sizeBytes: Number(row['image_size_bytes']),
          fingerprint: String(row['image_fingerprint']),
          inputsSnapshot: String(row['image_inputs_snapshot']),
          createdAt: String(row['image_created_at']),
        },
  imageDegraded: Number(row['image_degraded']) === 1,
  consumedGenerations: Number(row['consumed_generations']),
  quotaWindow: String(row['quota_window']),
  createdAt: String(row['created_at']),
  updatedAt: String(row['updated_at']),
});

export const sceneValues = (scene: SceneRecord): unknown[] => [
  scene.id,
  scene.householdId,
  scene.ownerUserId,
  scene.runState,
  scene.currentAttemptId,
  scene.leaseExpiresAt,
  scene.image?.id ?? null,
  scene.image?.mime ?? null,
  scene.image?.sizeBytes ?? null,
  scene.image?.fingerprint ?? null,
  scene.image?.inputsSnapshot ?? null,
  scene.image?.createdAt ?? null,
  scene.imageDegraded ? 1 : 0,
  scene.consumedGenerations,
  scene.quotaWindow,
  scene.createdAt,
  scene.updatedAt,
];

export const toAttemptRecord = (row: Row): SceneAttemptRecord => ({
  id: String(row['id']),
  sceneId: String(row['scene_id']),
  actorUserId: String(row['actor_user_id']),
  action: String(row['action']) as SceneAttemptRecord['action'],
  mode: String(row['mode']) as SceneAttemptRecord['mode'],
  fingerprint: String(row['fingerprint']),
  inputsSnapshot: String(row['inputs_snapshot']),
  resultObjectId: String(row['result_object_id']),
  phase: String(row['phase']) as SceneAttemptRecord['phase'],
  claimedAt: nullable(row['claimed_at']),
  providerCallStartedAt: nullable(row['provider_call_started_at']),
  quotaWindow: String(row['quota_window']),
  quotaMax: Number(row['quota_max']),
  outcome: nullable(row['outcome']) as SceneAttemptRecord['outcome'],
  errorCode: nullable(row['error_code']),
  degraded: Number(row['degraded']) === 1,
  idempotencyKeyHash: nullable(row['idempotency_key_hash']),
  idempotencyExpiresAt: nullable(row['idempotency_expires_at']),
  startedAt: String(row['started_at']),
  finishedAt: nullable(row['finished_at']),
});

export const attemptValues = (a: SceneAttemptRecord): unknown[] => [
  a.id,
  a.sceneId,
  a.actorUserId,
  a.action,
  a.mode,
  a.fingerprint,
  a.inputsSnapshot,
  a.resultObjectId,
  a.phase,
  a.claimedAt,
  a.providerCallStartedAt,
  a.quotaWindow,
  a.quotaMax,
  a.outcome,
  a.errorCode,
  a.degraded ? 1 : 0,
  a.idempotencyKeyHash,
  a.idempotencyExpiresAt,
  a.startedAt,
  a.finishedAt,
];

export const toConsentRecord = (row: Row): SceneConsentRecord => ({
  id: String(row['id']),
  userId: String(row['user_id']),
  scope: String(row['scope']) as SceneConsentRecord['scope'],
  providerId: String(row['provider_id']),
  noticeVersion: String(row['notice_version']),
  grantedAt: String(row['granted_at']),
  revokedAt: nullable(row['revoked_at']),
});

export const consentValues = (c: SceneConsentRecord): unknown[] => [c.id, c.userId, c.scope, c.providerId, c.noticeVersion, c.grantedAt, c.revokedAt];


export const HOUSEHOLD_PHOTO_COLUMN_LIST = 'household_id, object_id, mime, size_bytes, uploaded_by_user_id, created_at';

export const toHouseholdPhotoRecord = (row: Row): HouseholdPhotoRecord => ({
  householdId: String(row['household_id']),
  objectId: String(row['object_id']),
  mime: String(row['mime']) as HouseholdPhotoRecord['mime'],
  sizeBytes: Number(row['size_bytes']),
  uploadedByUserId: String(row['uploaded_by_user_id']),
  createdAt: String(row['created_at']),
});

export const householdPhotoValues = (p: HouseholdPhotoRecord): unknown[] => [p.householdId, p.objectId, p.mime, p.sizeBytes, p.uploadedByUserId, p.createdAt];
