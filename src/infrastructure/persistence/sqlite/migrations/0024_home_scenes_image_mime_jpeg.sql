-- Feature 006, enmienda Nivel 2 de REQ-ESC6-035 (autorizada por Neo tras prueba en vivo): el generador (Vertex/Gemini) devuelve `image/jpeg`, asi que `home_scenes.image_mime` admite
-- ('image/png', 'image/webp', 'image/jpeg'). La 0013 ya esta aplicada en produccion y NO se edita. Equivale a la 0020 de Postgres.
-- @implements REQ-ESC6-035, INV-ESC6-005
-- SQLite no puede alterar un CHECK: se reconstruye `home_scenes` SIN perder filas. `scene_attempts` y `scene_image_sources` la referencian con ON DELETE CASCADE y las migraciones
-- corren con foreign_keys ON dentro de una transaccion (no se puede apagar), asi que DROP TABLE de la tabla madre BORRARIA a las hijas: se resguardan sus filas, se reconstruyen las
-- tres tablas (hijas primero) y se restauran. Mismo DDL que la 0013 (+ las columnas provider_model / provider_location de la 0023); solo cambia la lista de image_mime.
CREATE TABLE scene_attempts_keep AS SELECT * FROM scene_attempts;
CREATE TABLE scene_image_sources_keep AS SELECT * FROM scene_image_sources;
DROP TABLE scene_attempts;
DROP TABLE scene_image_sources;

ALTER TABLE home_scenes RENAME TO home_scenes_old;
CREATE TABLE home_scenes (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households (id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  run_state TEXT CHECK (run_state IN ('generating', 'failed')),
  current_attempt_id TEXT,
  lease_expires_at TEXT,
  image_id TEXT,
  image_mime TEXT CHECK (image_mime IN ('image/png', 'image/webp', 'image/jpeg')),
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
INSERT INTO home_scenes (id, household_id, owner_user_id, run_state, current_attempt_id, lease_expires_at, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, image_degraded, consumed_generations, quota_window, created_at, updated_at)
  SELECT id, household_id, owner_user_id, run_state, current_attempt_id, lease_expires_at, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, image_degraded, consumed_generations, quota_window, created_at, updated_at FROM home_scenes_old;
DROP TABLE home_scenes_old;
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
  finished_at TEXT,
  provider_model TEXT,
  provider_location TEXT
) STRICT;
INSERT INTO scene_attempts (id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, claimed_at, provider_call_started_at, quota_window, quota_max, outcome, error_code, degraded, idempotency_key_hash, idempotency_expires_at, started_at, finished_at, provider_model, provider_location)
  SELECT id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, claimed_at, provider_call_started_at, quota_window, quota_max, outcome, error_code, degraded, idempotency_key_hash, idempotency_expires_at, started_at, finished_at, provider_model, provider_location FROM scene_attempts_keep;
DROP TABLE scene_attempts_keep;
CREATE UNIQUE INDEX scene_attempts_idempotency ON scene_attempts (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
CREATE INDEX scene_attempts_scene_started ON scene_attempts (scene_id, started_at);
CREATE INDEX scene_attempts_actor_started ON scene_attempts (actor_user_id, started_at);

CREATE TABLE scene_image_sources (
  scene_id TEXT NOT NULL REFERENCES home_scenes (id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  PRIMARY KEY (scene_id, owner_user_id)
) STRICT;
INSERT INTO scene_image_sources (scene_id, owner_user_id) SELECT scene_id, owner_user_id FROM scene_image_sources_keep;
DROP TABLE scene_image_sources_keep;
