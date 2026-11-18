-- Escena del hogar en pixel art (Feature 006). Pieza M-3 de la enmienda MINOR N2-06 (a) (T810; REQ-ESC6-021, INV-ESC6-016, data-model.md §8 y §6 M-3).
-- @implements REQ-ESC6-021, INV-ESC6-016, REQ-AUD-001
-- Esta migracion contiene la reconstruccion del CHECK de `audit_log.entity_type` (M-3: HOME_SCENE, SCENE_CONSENT, HOUSEHOLD_PHOTO) y, a continuacion, las 6 tablas de la escena (M-1, T832) con sus indices.
-- SQLite no admite ALTER de un CHECK: se reconstruye la tabla (crear, copiar, borrar, renombrar, recrear los 3 indices), precedente 0009_pet_media.sql.
--   Las filas existentes se conservan byte a byte (audit_log no tiene claves foraneas ni dependientes). AuditMutationType no cambia.
CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  executor_user_id TEXT NOT NULL CHECK (length(executor_user_id) > 0),
  mutation_type TEXT NOT NULL CHECK (mutation_type IN
    ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE')),
  entity_type TEXT NOT NULL CHECK (entity_type IN
    ('USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD',
     'CUSTOM_PARAMETER', 'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'PET_MEDIA',
     'HOME_SCENE', 'SCENE_CONSENT', 'HOUSEHOLD_PHOTO', 'SYSTEM')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
  previous_state_hash TEXT CHECK (previous_state_hash IS NULL OR length(previous_state_hash) = 64),
  new_state_hash TEXT CHECK (new_state_hash IS NULL OR length(new_state_hash) = 64),
  CHECK (mutation_type <> 'MIGRATION' OR
    (entity_type = 'SYSTEM' AND executor_user_id = 'SYSTEM' AND previous_state_hash IS NULL AND new_state_hash IS NULL))
) STRICT;
INSERT INTO audit_log_new (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash)
  SELECT id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX audit_log_executor_user_id ON audit_log (executor_user_id);
CREATE INDEX audit_log_entity_id ON audit_log (entity_id);

-- M-1 (T832; data-model.md §2.1..§2.8): las 6 tablas de la escena, en este orden y sin ciclos de claves foraneas
-- (home_scenes.current_attempt_id NO declara FK: lo garantizan la transaccion y la prueba de paridad).
-- Sin datos: las escenas se crean de forma perezosa. Nunca se guarda el nombre original de la foto (INV-ESC6-009).
-- @implements REQ-ESC6-011, REQ-ESC6-012, REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-032, REQ-ESC6-018, REQ-ESC6-035, INV-ESC6-003, INV-ESC6-004, INV-ESC6-005
CREATE TABLE home_scenes (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households (id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  run_state TEXT CHECK (run_state IN ('generating', 'failed')),
  current_attempt_id TEXT,
  lease_expires_at TEXT,
  image_id TEXT,
  image_mime TEXT CHECK (image_mime IN ('image/png', 'image/webp')),
  image_size_bytes INTEGER CHECK (image_size_bytes > 0),
  image_fingerprint TEXT CHECK (image_fingerprint IS NULL OR length(image_fingerprint) = 64),
  image_inputs_snapshot TEXT CHECK (image_inputs_snapshot IS NULL OR length(image_inputs_snapshot) BETWEEN 1 AND 16384),
  image_created_at TEXT,
  image_degraded INTEGER NOT NULL DEFAULT 0 CHECK (image_degraded IN (0, 1)),
  consumed_generations INTEGER NOT NULL DEFAULT 0 CHECK (consumed_generations >= 0),
  quota_window TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((household_id IS NULL) <> (owner_user_id IS NULL)),
  CHECK (run_state IS NOT NULL OR current_attempt_id IS NULL),
  CHECK ((run_state = 'generating' AND lease_expires_at IS NOT NULL) OR (COALESCE(run_state, '') <> 'generating' AND lease_expires_at IS NULL)),
  CHECK ((image_id IS NULL AND image_mime IS NULL AND image_size_bytes IS NULL AND image_fingerprint IS NULL AND image_inputs_snapshot IS NULL AND image_created_at IS NULL)
    OR (image_id IS NOT NULL AND image_mime IS NOT NULL AND image_size_bytes IS NOT NULL AND image_fingerprint IS NOT NULL AND image_inputs_snapshot IS NOT NULL AND image_created_at IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX home_scenes_household ON home_scenes (household_id) WHERE household_id IS NOT NULL;
CREATE UNIQUE INDEX home_scenes_owner ON home_scenes (owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE scene_attempts (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES home_scenes (id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('UPDATE', 'REGENERATE')),
  mode TEXT NOT NULL CHECK (mode IN ('FROM_SCRATCH', 'INCREMENTAL_ADD', 'INCREMENTAL_REMOVE', 'INCREMENTAL_REPLACE', 'INCREMENTAL_MIXED', 'REGENERATE')),
  fingerprint TEXT NOT NULL,
  inputs_snapshot TEXT NOT NULL,
  result_object_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('PENDING', 'RUNNING', 'DONE')),
  claimed_at TEXT,
  provider_call_started_at TEXT,
  quota_window TEXT NOT NULL,
  quota_max INTEGER NOT NULL,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('SUCCEEDED', 'FAILED', 'CANCELLED')),
  error_code TEXT,
  degraded INTEGER NOT NULL DEFAULT 0 CHECK (degraded IN (0, 1)),
  idempotency_key_hash TEXT CHECK (idempotency_key_hash IS NULL OR length(idempotency_key_hash) = 64),
  idempotency_expires_at TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
) STRICT;
CREATE UNIQUE INDEX scene_attempts_idempotency ON scene_attempts (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
CREATE INDEX scene_attempts_scene_started ON scene_attempts (scene_id, started_at);
CREATE INDEX scene_attempts_actor_started ON scene_attempts (actor_user_id, started_at);

CREATE TABLE scene_image_sources (
  scene_id TEXT NOT NULL REFERENCES home_scenes (id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  PRIMARY KEY (scene_id, owner_user_id)
) STRICT;

CREATE TABLE household_photos (
  household_id TEXT PRIMARY KEY REFERENCES households (id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE scene_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('HOUSEHOLD_PHOTO', 'PET_PHOTOS')),
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 64),
  notice_version TEXT NOT NULL CHECK (length(notice_version) BETWEEN 1 AND 32),
  granted_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE UNIQUE INDEX scene_consents_active ON scene_consents (user_id, scope, provider_id, notice_version) WHERE revoked_at IS NULL;

CREATE TABLE scene_quota_carry (
  owner_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quota_window TEXT NOT NULL,
  consumed_generations INTEGER NOT NULL CHECK (consumed_generations >= 0),
  PRIMARY KEY (owner_user_id, quota_window)
) STRICT;
