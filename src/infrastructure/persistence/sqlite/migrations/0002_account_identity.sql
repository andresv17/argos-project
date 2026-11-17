-- Cuenta e identidad de la Feature 002 (Rebanada 1, T214).
-- REQ-ACC-001: correo, idioma y zona horaria en `users`. Las cuentas de la 001 conservan su `password_hash` (SC-010).
--   T214 PENDIENTE: las filas existentes toman la zona 'America/Bogota' (valor por defecto de APP_TIMEZONE); una
--   APP_TIMEZONE distinta no se aplica a las cuentas previas.
-- INV-AUTH2-002: `sessions` guarda `created_at`, `last_activity_at` y `revoked_at`; EXPIRED y EXPIRED_IDLE se derivan.
--   El `data` de cada sesión se reescribe a la forma 3.0.0 (userId, createdAt, lastActivityAt, revokedAt).
-- REQ-ACC-002 (5): `backup_confirmation_tokens`, una fila por usuario, solo el SHA-256 del token.
-- ADR-002-12: `rate_limit_events`, ventana deslizante por ámbito y actor.
-- REQ-HOUSE2-001: `household_invitations`; `invitee_user_id` nulo es una invitación inerte (R3).
-- INV-AUTH-003: ninguna columna guarda contraseñas ni tokens en claro.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es', 'en', 'pt'));
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Bogota';

ALTER TABLE sessions ADD COLUMN created_at TEXT;
ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;
ALTER TABLE sessions ADD COLUMN revoked_at TEXT;
UPDATE sessions
  SET created_at = json_extract(data, '$.createdAt'),
      last_activity_at = json_extract(data, '$.createdAt'),
      revoked_at = json_extract(data, '$.revokedAt');
UPDATE sessions
  SET data = json_object('userId', user_id, 'createdAt', created_at, 'lastActivityAt', last_activity_at, 'revokedAt', revoked_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE backup_confirmation_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
) STRICT;

CREATE TABLE rate_limit_events (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('EXPORT', 'INVITE')),
  subject_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
) STRICT;
CREATE INDEX rate_limit_events_subject ON rate_limit_events (scope, subject_user_id, occurred_at);

CREATE TABLE household_invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  invitee_username TEXT NOT NULL,
  invitee_user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  invited_by_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_on_join TEXT NOT NULL CHECK (role_on_join IN ('ADMIN', 'CAREGIVER', 'READER')),
  status TEXT NOT NULL CHECK (status IN ('INVITED', 'DECLINED', 'CANCELLED', 'ACCEPTED')),
  created_at TEXT NOT NULL,
  responded_at TEXT
) STRICT;
CREATE INDEX household_invitations_household_id ON household_invitations (household_id);
CREATE INDEX household_invitations_invitee_user_id ON household_invitations (invitee_user_id);
CREATE UNIQUE INDEX household_invitations_one_open
  ON household_invitations (household_id, invitee_username)
  WHERE status = 'INVITED';
