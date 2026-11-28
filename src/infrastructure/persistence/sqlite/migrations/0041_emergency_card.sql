-- Ficha QR de emergencia (Feature 012, Bloque D, #32; T1673; REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010; data-model.md Bloque #32; contratos 0.3.0 APPROVED).
-- @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-003, SC-012-127
-- Migracion NUEVA: no muta ninguna migracion ya versionada. Equivale a la 0037 de PostgreSQL.
-- 1) users.phone: TEXT NULL SIN CHECK regex; la validacion E.164 es de DOMINIO e identica en los tres motores (paridad: el motor no valida el formato).
-- 2) pets.critical_allergies: arreglo JSON (0-5 textos de 1-60 puntos de codigo) como TEXT; el CHECK solo acota forma y longitud, igual en ambos motores; NFC, trim, dedupe y TEXT_POLICY los aplica el dominio.
-- 3) pet_emergency_phone_consents: consentimiento de telefono POR MASCOTA ligado a phone_hmac (HMAC-SHA-256 con clave propia, 64 hex); la fila se borra por cascada con la mascota o la cuenta y por logica de dominio al pasar a OFF.
-- 4) pet_emergency_cards: una ficha por mascota; ON exige token_hash (SHA-256 hex, 64) y OFF no lo guarda; status_reason solo con OFF; consented_by_user_id y last_scanned_at solo con ON; FK SET NULL al borrar la cuenta.
-- 5) audit_log.mutation_type admite PET_CRITICAL_ALLERGIES_UPDATED y EMERGENCY_* (los eventos usan la entidad PET).
-- 6) rate_limit_events.scope admite QR_CARD_MUTATION (20 por hora y usuario) y QR_PRIVATE_WRITE (60 por hora y usuario); las filas se borran con la cuenta (FK CASCADE existente).
-- COMPROBACION PREVIA (sqlite-database.ts, MIGRATION_PRECHECKS): eventos de limite sin usuario abortan antes de reconstruir rate_limit_events (la copia violaria la clave foranea); el mensaje solo trae el conteo.
-- SQLite no admite ALTER de un CHECK: audit_log y rate_limit_events se reconstruyen (crear, copiar, borrar, renombrar, recrear indices), precedentes 0034 y 0035; las filas se conservan byte a byte.
-- Migracion 0041 de SQLite (STRICT).
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE pets ADD COLUMN critical_allergies TEXT NOT NULL DEFAULT '[]' CHECK (critical_allergies LIKE '[%]' AND length(critical_allergies) BETWEEN 2 AND 4000);

CREATE TABLE pet_emergency_cards (
  pet_id TEXT PRIMARY KEY REFERENCES pets (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OFF' CHECK (status IN ('OFF', 'ON')),
  status_reason TEXT CHECK (status_reason IS NULL OR status_reason IN ('USER_DEACTIVATED', 'AUTO_GUARD_LOST', 'AUTO_PET_DECEASED', 'AUTO_NOTICE_CHANGED')),
  status_changed_at TEXT,
  token_hash TEXT UNIQUE CHECK (token_hash IS NULL OR length(token_hash) = 64),
  token_rotated_at TEXT,
  consent_notice_version TEXT CHECK (consent_notice_version IS NULL OR length(consent_notice_version) BETWEEN 5 AND 11),
  consented_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  activated_at TEXT,
  last_scanned_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((status = 'ON') = (token_hash IS NOT NULL)),
  CHECK (status = 'OFF' OR status_reason IS NULL),
  CHECK (status = 'ON' OR (consented_by_user_id IS NULL AND last_scanned_at IS NULL))
) STRICT;

CREATE TABLE pet_emergency_phone_consents (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consented_at TEXT NOT NULL,
  notice_version TEXT NOT NULL CHECK (length(notice_version) BETWEEN 5 AND 11),
  phone_hmac TEXT NOT NULL CHECK (length(phone_hmac) = 64),
  PRIMARY KEY (pet_id, user_id)
) STRICT;
CREATE INDEX pet_emergency_phone_consents_user ON pet_emergency_phone_consents (user_id);

CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  executor_user_id TEXT NOT NULL CHECK (length(executor_user_id) > 0),
  mutation_type TEXT NOT NULL CHECK (mutation_type IN
    ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE', 'CO_OWNER_INVITED', 'CO_OWNER_ACCEPTED', 'CO_OWNER_DECLINED', 'CO_OWNER_CANCELLED', 'CO_OWNER_LEFT', 'CO_OWNER_ENDED', 'PRINCIPAL_AUTO_PROMOTED', 'PRINCIPAL_SUCCESSOR_DESIGNATED', 'PRINCIPAL_CHANGED_BY_DISPUTE', 'OWNER_REQUEST_CREATED', 'OWNER_REQUEST_APPROVED', 'OWNER_REQUEST_REJECTED', 'OWNER_REQUEST_EXPIRED', 'OWNER_REQUEST_STALE', 'OWNER_REQUEST_CANCELLED', 'ABSENCE_DISPUTE_OPENED', 'ABSENCE_DISPUTE_TARGET_RESPONDED', 'PET_CRITICAL_ALLERGIES_UPDATED', 'EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED', 'EMERGENCY_CARD_AUTO_DEACTIVATED', 'EMERGENCY_PHONE_CONSENT_CHANGED')),
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

CREATE TABLE rate_limit_events_new (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST', 'QR_CARD_MUTATION', 'QR_PRIVATE_WRITE')),
  subject_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
) STRICT;
INSERT INTO rate_limit_events_new (id, scope, subject_user_id, occurred_at) SELECT id, scope, subject_user_id, occurred_at FROM rate_limit_events;
DROP TABLE rate_limit_events;
ALTER TABLE rate_limit_events_new RENAME TO rate_limit_events;
CREATE INDEX rate_limit_events_subject ON rate_limit_events (scope, subject_user_id, occurred_at);
