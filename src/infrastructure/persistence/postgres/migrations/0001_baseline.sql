-- Baseline único de Argos en PostgreSQL (Feature 003, T419; D-20, resuelta por Neo).
-- @implements REQ-PG-001, REQ-PG-003, REQ-MIG-001, INV-PET2-001, REQ-HOUSE2-003
-- Postgres nace sobre una base vacía: este archivo crea el ESQUEMA FINAL que SQLite alcanza tras sus migraciones 0001..0005
-- (data-model.md §2 de la 003). Las migraciones futuras se numeran 0002_* en adelante y siguen expand/contract (REQ-CICD-005).
-- Traducciones (data-model.md §1): data JSON -> JSONB; indicadores 0/1 -> SMALLINT con el mismo CHECK; sin STRICT (tipos y CHECK
--   explícitos); GLOB -> expresión regular; columnas VIRTUAL de SQLite -> GENERATED ... STORED; marcas de tiempo TEXT ISO-8601 UTC.
-- Sin BEGIN/COMMIT: el ejecutor (T429) corre cada migración en una transacción (INV-ARCH-005).
-- Las filas de datos de este archivo son exactamente dos: schema_migrations (una sola fila, '0001_baseline') y audit_log (una sola
--   fila MIGRATION, REQ-MIG-001). Ambas son idempotentes (ON CONFLICT DO NOTHING) por si el ejecutor registra la versión.
-- INV-AUTH-003: ninguna columna guarda contraseñas ni tokens en claro.

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  data JSONB NOT NULL,
  email TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es', 'en', 'pt')),
  timezone TEXT NOT NULL DEFAULT 'America/Bogota'
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TEXT,
  last_activity_at TEXT,
  revoked_at TEXT
);
CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE login_attempts (
  username TEXT PRIMARY KEY,
  failures TEXT NOT NULL
);

CREATE TABLE backup_confirmation_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE rate_limit_events (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('EXPORT', 'INVITE')),
  subject_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
);
CREATE INDEX rate_limit_events_subject ON rate_limit_events (scope, subject_user_id, occurred_at);

-- INV-PET2-001: 8 especies; species_other no nulo exactamente cuando species es OTHER. REQ-PET2-001: microchip de 15 dígitos.
CREATE TABLE pets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  species TEXT NOT NULL DEFAULT 'CANINE'
    CHECK (species IN ('CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER')),
  species_other TEXT,
  neutered SMALLINT CHECK (neutered IN (0, 1)),
  microchip_id TEXT
    CHECK (microchip_id IS NULL OR microchip_id ~ '^[0-9]{15}$'),
  birth_date_is_estimate SMALLINT NOT NULL DEFAULT 0 CHECK (birth_date_is_estimate IN (0, 1)),
  CHECK ((species = 'OTHER') = (species_other IS NOT NULL))
);
CREATE INDEX pets_owner_user_id ON pets (owner_user_id);
CREATE UNIQUE INDEX pets_owner_microchip ON pets (owner_user_id, microchip_id) WHERE microchip_id IS NOT NULL;

-- INV-PET-005: los registros se borran en cascada con su mascota.
CREATE TABLE weights (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  weight_grams INTEGER NOT NULL CHECK (weight_grams BETWEEN 1 AND 150000)
);
CREATE INDEX weights_pet_id ON weights (pet_id);

CREATE TABLE body_measurements (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE INDEX body_measurements_pet_id ON body_measurements (pet_id);

CREATE TABLE vaccinations (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  batch_or_clinic TEXT GENERATED ALWAYS AS (data ->> 'batchOrClinic') STORED,
  veterinarian_name TEXT GENERATED ALWAYS AS (data ->> 'veterinarianName') STORED,
  veterinarian_license TEXT GENERATED ALWAYS AS (data ->> 'veterinarianLicense') STORED,
  next_booster_at TEXT GENERATED ALWAYS AS (data ->> 'nextBoosterAt') STORED
);
CREATE INDEX vaccinations_pet_id ON vaccinations (pet_id);

CREATE TABLE dewormings (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  batch_or_clinic TEXT GENERATED ALWAYS AS (data ->> 'batchOrClinic') STORED,
  veterinarian_name TEXT GENERATED ALWAYS AS (data ->> 'veterinarianName') STORED,
  veterinarian_license TEXT GENERATED ALWAYS AS (data ->> 'veterinarianLicense') STORED,
  next_suggested_dose_at TEXT GENERATED ALWAYS AS (data ->> 'nextSuggestedDoseAt') STORED
);
CREATE INDEX dewormings_pet_id ON dewormings (pet_id);

CREATE TABLE medical_visits (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE INDEX medical_visits_pet_id ON medical_visits (pet_id);

CREATE TABLE custom_parameters (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE INDEX custom_parameters_pet_id ON custom_parameters (pet_id);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  data JSONB NOT NULL
);

-- C5: las membresías se borran en cascada con su hogar. INV-HOUSE2-001: a lo sumo un propietario ACTIVE por hogar.
CREATE TABLE household_members (
  membership_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  first_joined_at TEXT,
  data JSONB NOT NULL,
  role TEXT NOT NULL DEFAULT 'READER' CHECK (role IN ('ADMIN', 'CAREGIVER', 'READER')),
  is_household_owner SMALLINT NOT NULL DEFAULT 0 CHECK (is_household_owner IN (0, 1) AND (is_household_owner = 0 OR role = 'ADMIN'))
);
CREATE INDEX household_members_household_id ON household_members (household_id);
CREATE INDEX household_members_user_id ON household_members (user_id);
CREATE UNIQUE INDEX household_members_one_open_per_user ON household_members (household_id, user_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX household_members_one_owner ON household_members (household_id) WHERE is_household_owner = 1 AND status = 'ACTIVE';

-- invitee_user_id nulo es una invitación inerte (R3); invited_by_user_id admite nulo (datos de la 001 sin invitador).
CREATE TABLE household_invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  invitee_username TEXT NOT NULL,
  invitee_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  invited_by_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  role_on_join TEXT NOT NULL CHECK (role_on_join IN ('ADMIN', 'CAREGIVER', 'READER')),
  status TEXT NOT NULL CHECK (status IN ('INVITED', 'DECLINED', 'CANCELLED', 'ACCEPTED')),
  created_at TEXT NOT NULL,
  responded_at TEXT
);
CREATE INDEX household_invitations_household_id ON household_invitations (household_id);
CREATE INDEX household_invitations_invitee_user_id ON household_invitations (invitee_user_id);
CREATE UNIQUE INDEX household_invitations_one_open ON household_invitations (household_id, invitee_username) WHERE status = 'INVITED';

-- REQ-HOUSE2-003: assigned_by_user_id sin clave foránea.
CREATE TABLE pet_assignments (
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  assigned_by_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (pet_id, household_id)
);
CREATE INDEX pet_assignments_household_id ON pet_assignments (household_id);

-- REQ-AUD-001: SIN claves foráneas (la fila sobrevive a la cuenta eliminada). INV-AUD-001: sin columnas de secretos.
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
);
CREATE INDEX audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX audit_log_executor_user_id ON audit_log (executor_user_id);
CREATE INDEX audit_log_entity_id ON audit_log (entity_id);

-- Fila MIGRATION única (REQ-MIG-001): UUID v4 (gen_random_uuid), sin identificadores de usuario ni de mascota.
INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash)
  VALUES (gen_random_uuid()::text, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'SYSTEM', 'MIGRATION', 'SYSTEM',
          'MIG-0001_baseline', NULL, NULL)
  ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0001_baseline') ON CONFLICT DO NOTHING;
