-- Ficha QR de emergencia (Feature 012, Bloque D, #32; T1673; REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010; data-model.md Bloque #32; contratos 0.3.0 APPROVED). Equivale a la 0041 de SQLite.
-- @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-003, SC-012-127
-- Migracion NUEVA: no muta ninguna migracion ya versionada. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version. Ver el encabezado de la 0041 de SQLite para el detalle de cada cambio.
-- COMPROBACION PREVIA: si hay eventos con un ambito fuera de los cinco vigentes, o si falta la restriccion rate_limit_events_scope_check o audit_log_mutation_type_check, la migracion ABORTA antes de tocar el esquema; el mensaje solo trae el conteo o el nombre.
DO $$
DECLARE
  unknown_scopes INTEGER;
BEGIN
  SELECT count(*) INTO unknown_scopes FROM rate_limit_events WHERE scope NOT IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST');
  IF unknown_scopes > 0 THEN
    RAISE EXCEPTION 'Migracion 0037 abortada: % evento(s) con un ambito desconocido en rate_limit_events; Neo debe resolverlos antes de migrar', unknown_scopes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'rate_limit_events'::regclass AND conname = 'rate_limit_events_scope_check' AND contype = 'c') THEN
    RAISE EXCEPTION 'Migracion 0037 abortada: falta la restriccion rate_limit_events_scope_check en rate_limit_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'audit_log'::regclass AND conname = 'audit_log_mutation_type_check' AND contype = 'c') THEN
    RAISE EXCEPTION 'Migracion 0037 abortada: falta la restriccion audit_log_mutation_type_check en audit_log';
  END IF;
END
$$;

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
);

CREATE TABLE pet_emergency_phone_consents (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consented_at TEXT NOT NULL,
  notice_version TEXT NOT NULL CHECK (length(notice_version) BETWEEN 5 AND 11),
  phone_hmac TEXT NOT NULL CHECK (length(phone_hmac) = 64),
  PRIMARY KEY (pet_id, user_id)
);
CREATE INDEX pet_emergency_phone_consents_user ON pet_emergency_phone_consents (user_id);

ALTER TABLE audit_log DROP CONSTRAINT audit_log_mutation_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_mutation_type_check CHECK (mutation_type IN
  ('CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE', 'CO_OWNER_INVITED', 'CO_OWNER_ACCEPTED', 'CO_OWNER_DECLINED', 'CO_OWNER_CANCELLED', 'CO_OWNER_LEFT', 'CO_OWNER_ENDED', 'PRINCIPAL_AUTO_PROMOTED', 'PRINCIPAL_SUCCESSOR_DESIGNATED', 'PRINCIPAL_CHANGED_BY_DISPUTE', 'OWNER_REQUEST_CREATED', 'OWNER_REQUEST_APPROVED', 'OWNER_REQUEST_REJECTED', 'OWNER_REQUEST_EXPIRED', 'OWNER_REQUEST_STALE', 'OWNER_REQUEST_CANCELLED', 'ABSENCE_DISPUTE_OPENED', 'ABSENCE_DISPUTE_TARGET_RESPONDED', 'PET_CRITICAL_ALLERGIES_UPDATED', 'EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED', 'EMERGENCY_CARD_AUTO_DEACTIVATED', 'EMERGENCY_PHONE_CONSENT_CHANGED'));

ALTER TABLE rate_limit_events DROP CONSTRAINT rate_limit_events_scope_check;
ALTER TABLE rate_limit_events ADD CONSTRAINT rate_limit_events_scope_check CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST', 'QR_CARD_MUTATION', 'QR_PRIVATE_WRITE'));
