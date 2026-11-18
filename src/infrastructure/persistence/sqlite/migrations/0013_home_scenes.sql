-- Escena del hogar en pixel art (Feature 006). Pieza M-3 de la enmienda MINOR N2-06 (a) (T810; REQ-ESC6-021, INV-ESC6-016, data-model.md §8 y §6 M-3).
-- @implements REQ-ESC6-021, INV-ESC6-016, REQ-AUD-001
-- Esta migracion contiene por ahora SOLO la reconstruccion del CHECK de `audit_log.entity_type` (HOME_SCENE, SCENE_CONSENT, HOUSEHOLD_PHOTO).
-- T832 (Fase 4) anade en este mismo archivo las 6 tablas de la escena (M-1) y sus indices; esta pieza no depende de ellas.
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
