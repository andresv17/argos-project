-- Medios de la mascota (Feature 004, T574; REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, data-model.md §2).
-- @implements REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, INV-AVA-001, INV-GCS-002
-- Equivale a la 0009 de SQLite. Sin BEGIN/COMMIT: el migrador (T429) corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA: no borra ni reescribe filas existentes (las mascotas quedan con avatar_version = 0 y sin avatar).
-- `media_deletion_queue` no tiene clave foranea: debe sobrevivir a la fila de pet_media y de pets eliminadas por cascada (sin tope de intentos).
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
);
CREATE INDEX pet_media_pet_created ON pet_media (pet_id, kind, created_at DESC, id DESC);

CREATE TABLE media_deletion_queue (
  object_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('INTENT', 'DELETE')),
  enqueued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

-- Auditoria de medios (REQ-AUD-001, T577): el contrato 3.1.0 anade `PET_MEDIA` a AuditEntityType, pero el CHECK de `audit_log.entity_type` (0001) no lo admite.
-- Equivale a la reconstruccion de tabla de la 0009 de SQLite. Las filas existentes cumplen la restriccion ampliada. DESVIACION DECLARADA: el data-model.md §2 no lista este cambio.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN
  ('USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD',
   'CUSTOM_PARAMETER', 'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'PET_MEDIA', 'SYSTEM'));
