-- Auditoria de la co-propiedad (Feature 012, Bloque A, #22; T1616; REQ-AUD-001, REQ-OWN12-006, REQ-OWN12-004; data-model.md §Auditoria).
-- @implements REQ-AUD-001, REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-003
-- PROPUESTA DE NIVEL 2 (pendiente de confirmacion de Neo): el data-model.md aprobado lista los tipos de auditoria de la 012 (CO_OWNER_*, PRINCIPAL_AUTO_PROMOTED, PRINCIPAL_SUCCESSOR_DESIGNATED,
--   OWNER_REQUEST_*, ABSENCE_DISPUTE_*) pero la 0033 (T1613) no ensancho el CHECK de `audit_log.mutation_type`; sin esto la fila de auditoria de la sucesion se rechaza. Reversible: revertir este commit.
-- SQLite no admite ALTER de un CHECK: se reconstruye la tabla (crear, copiar, borrar, renombrar, recrear los 3 indices), precedente 0009_pet_media.sql y 0013_home_scenes.sql. Las filas existentes se
--   conservan byte a byte (audit_log no tiene claves foraneas ni dependientes). El CHECK de `entity_type` se conserva tal cual (los eventos de la 012 usan la entidad PET).
CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  executor_user_id TEXT NOT NULL CHECK (length(executor_user_id) > 0),
  mutation_type TEXT NOT NULL CHECK (mutation_type IN
    ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE', 'CO_OWNER_INVITED', 'CO_OWNER_ACCEPTED', 'CO_OWNER_DECLINED', 'CO_OWNER_CANCELLED', 'CO_OWNER_LEFT', 'CO_OWNER_ENDED', 'PRINCIPAL_AUTO_PROMOTED', 'PRINCIPAL_SUCCESSOR_DESIGNATED', 'PRINCIPAL_CHANGED_BY_DISPUTE', 'OWNER_REQUEST_CREATED', 'OWNER_REQUEST_APPROVED', 'OWNER_REQUEST_REJECTED', 'OWNER_REQUEST_EXPIRED', 'OWNER_REQUEST_STALE', 'OWNER_REQUEST_CANCELLED', 'ABSENCE_DISPUTE_OPENED', 'ABSENCE_DISPUTE_TARGET_RESPONDED')),
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
