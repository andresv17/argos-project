-- Auditoria de mutaciones y columnas clinicas de la Feature 002 (Rebanada 4, T258).
-- @implements REQ-AUD-001, INV-AUD-001, REQ-REC2-002, REQ-MIG-001, INV-ARCH-005
-- audit_log (data-model §2.12): SIN clave foranea ni ON DELETE hacia ninguna tabla (R1: la fila sobrevive a la cuenta
--   eliminada y se seudonimiza por HMAC); sin columnas de secretos (INV-AUD-001); mutation_type y entity_type con los
--   valores cerrados de REQ-AUD-001; hashes nulos o SHA-256 hexadecimal (64 caracteres). Una fila MIGRATION es siempre
--   {executor SYSTEM, entidad SYSTEM, hashes nulos}.
-- Indices: timestamp (purga de 24 meses), executor_user_id y entity_id (seudonimizacion).
-- Columnas clinicas (REQ-REC2-002): vacunas y desparasitaciones exponen lote, veterinario, colegiado y proxima fecha como
--   columnas VIRTUAL anulables derivadas de `data` (fuente unica: no hay copia que sincronizar). Sin proxima fecha = NULL.
-- REQ-MIG-001: esta migracion inserta exactamente 1 fila MIGRATION (sin filas por entidad); schema_migrations impide
--   aplicarla dos veces, de modo que es repetible sin duplicar. Corre en la transaccion de runMigrations (INV-ARCH-005).
-- PRAGMA secure_delete = ON: se fija aqui y tambien al abrir cada conexion (openSqliteDatabase); es un ajuste de conexion.

PRAGMA secure_delete = ON;

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  executor_user_id TEXT NOT NULL CHECK (length(executor_user_id) > 0),
  mutation_type TEXT NOT NULL CHECK (mutation_type IN
    ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE')),
  entity_type TEXT NOT NULL CHECK (entity_type IN
    ('USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD',
     'CUSTOM_PARAMETER', 'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'SYSTEM')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
  previous_state_hash TEXT CHECK (previous_state_hash IS NULL OR length(previous_state_hash) = 64),
  new_state_hash TEXT CHECK (new_state_hash IS NULL OR length(new_state_hash) = 64),
  CHECK (mutation_type <> 'MIGRATION' OR
    (entity_type = 'SYSTEM' AND executor_user_id = 'SYSTEM' AND previous_state_hash IS NULL AND new_state_hash IS NULL))
) STRICT;
CREATE INDEX audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX audit_log_executor_user_id ON audit_log (executor_user_id);
CREATE INDEX audit_log_entity_id ON audit_log (entity_id);

ALTER TABLE vaccinations ADD COLUMN batch_or_clinic TEXT GENERATED ALWAYS AS (json_extract(data, '$.batchOrClinic')) VIRTUAL;
ALTER TABLE vaccinations ADD COLUMN veterinarian_name TEXT GENERATED ALWAYS AS (json_extract(data, '$.veterinarianName')) VIRTUAL;
ALTER TABLE vaccinations ADD COLUMN veterinarian_license TEXT GENERATED ALWAYS AS (json_extract(data, '$.veterinarianLicense')) VIRTUAL;
ALTER TABLE vaccinations ADD COLUMN next_booster_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.nextBoosterAt')) VIRTUAL;

ALTER TABLE dewormings ADD COLUMN batch_or_clinic TEXT GENERATED ALWAYS AS (json_extract(data, '$.batchOrClinic')) VIRTUAL;
ALTER TABLE dewormings ADD COLUMN veterinarian_name TEXT GENERATED ALWAYS AS (json_extract(data, '$.veterinarianName')) VIRTUAL;
ALTER TABLE dewormings ADD COLUMN veterinarian_license TEXT GENERATED ALWAYS AS (json_extract(data, '$.veterinarianLicense')) VIRTUAL;
ALTER TABLE dewormings ADD COLUMN next_suggested_dose_at TEXT GENERATED ALWAYS AS (json_extract(data, '$.nextSuggestedDoseAt')) VIRTUAL;

-- Fila MIGRATION unica (REQ-MIG-001): UUID v4 generado en SQL, sin identificadores de usuario ni de mascota.
INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash)
  SELECT lower(substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(h, 18, 3) || '-' || substr(h, 21, 12)),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'SYSTEM', 'MIGRATION', 'SYSTEM', 'MIG-0005_audit_log_and_clinical_columns', NULL, NULL
  FROM (SELECT hex(randomblob(16)) AS h);
