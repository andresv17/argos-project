-- Esquema inicial de Argos en SQLite (plan §4, TASK-110).
-- Cada tabla guarda en `data` el objeto del contrato en JSON (validado contra src/generated/ al escribir y al leer)
-- y en columnas propias las claves, referencias y campos de búsqueda o de unicidad.
-- INV-PET-005: los 6 módulos de registros se borran en cascada con su mascota.
-- C5: las membresías se borran en cascada con su hogar.
-- INV-HOUSE-003: a lo sumo una membresía INVITED o ACTIVE por (household_id, user_id).
-- INV-AUTH-003: la contraseña solo como hash (password_hash); el token de sesión solo como SHA-256 (token_hash).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  data TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE login_attempts (
  username TEXT PRIMARY KEY,
  failures TEXT NOT NULL
) STRICT;

CREATE TABLE pets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX pets_owner_user_id ON pets (owner_user_id);

CREATE TABLE weights (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX weights_pet_id ON weights (pet_id);

CREATE TABLE body_measurements (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX body_measurements_pet_id ON body_measurements (pet_id);

CREATE TABLE vaccinations (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX vaccinations_pet_id ON vaccinations (pet_id);

CREATE TABLE dewormings (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX dewormings_pet_id ON dewormings (pet_id);

CREATE TABLE medical_visits (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX medical_visits_pet_id ON medical_visits (pet_id);

CREATE TABLE custom_parameters (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX custom_parameters_pet_id ON custom_parameters (pet_id);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  data TEXT NOT NULL
) STRICT;

CREATE TABLE household_members (
  membership_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  first_joined_at TEXT,
  data TEXT NOT NULL
) STRICT;
CREATE INDEX household_members_household_id ON household_members (household_id);
CREATE INDEX household_members_user_id ON household_members (user_id);
CREATE UNIQUE INDEX household_members_one_open_per_user
  ON household_members (household_id, user_id)
  WHERE status IN ('INVITED', 'ACTIVE');
