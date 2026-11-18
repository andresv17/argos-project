-- Medios de la mascota (Feature 004, T574; REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, data-model.md §2).
-- @implements REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, INV-AVA-001, INV-GCS-002
-- Migracion ADITIVA: no borra ni reescribe filas existentes (las mascotas quedan con avatar_version = 0 y sin avatar).
-- `pet_media` solo guarda metadatos: la clave del objeto se DERIVA de pet_id, kind e id (INV-ARC-003); sin sha256, sin autoria y sin binarios.
-- `media_deletion_queue` no tiene clave foranea: debe sobrevivir a la fila de pet_media y de pets eliminadas por cascada (sin tope de intentos).
-- Numeracion 0009: la 0010 (limite de microchip, T556) ya estaba aplicada en el orden de trabajo; el runner aplica por conjunto, sin dependencia entre ambas.
ALTER TABLE pets ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pets ADD COLUMN avatar_object_id TEXT;

CREATE TABLE pet_media (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('FILE', 'PHOTO')),
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX pet_media_pet_created ON pet_media (pet_id, kind, created_at DESC, id DESC);

CREATE TABLE media_deletion_queue (
  object_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('INTENT', 'DELETE')),
  enqueued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
) STRICT;

-- Auditoria de medios (REQ-AUD-001, T577): el contrato 3.1.0 anade `PET_MEDIA` a AuditEntityType, pero el CHECK de `audit_log.entity_type` (0005) no lo admite.
-- SQLite no admite ALTER de un CHECK: se reconstruye la tabla (crear, copiar, borrar, renombrar, recrear los 3 indices). Las filas existentes se conservan
--   byte a byte (audit_log no tiene claves foraneas ni dependientes). DESVIACION DECLARADA: el data-model.md §2 no lista este cambio.
CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  executor_user_id TEXT NOT NULL CHECK (length(executor_user_id) > 0),
  mutation_type TEXT NOT NULL CHECK (mutation_type IN
    ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE')),
  entity_type TEXT NOT NULL CHECK (entity_type IN
    ('USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD',
     'CUSTOM_PARAMETER', 'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'PET_MEDIA', 'SYSTEM')),
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
