-- Portal de administracion aislado (Feature 009, Fase 3, #19; T1232; Nivel 2 pre-autorizada por Neo; Enmienda constitucional 009-A; REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006).
-- @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, INV-ADM9-001, INV-ADM9-002, EDGE-009-047, NFR-009-004
-- Migracion NUEVA y ADITIVA: cuatro tablas; NO toca `users` ni el CHECK de `audit_log.entity_type` (`AuditEntityType` intacto) ni ninguna migracion desplegada (0001..0018).
-- Ninguna tabla tiene clave foranea hacia `users`: el administrador puede no tener cuenta de usuario y es una identidad distinta (INV-ADM9-002).
-- `admin_identities`: el `admin_id` (UUID v4 de IdGeneratorPort, creado en el primer acceso verificado, nunca derivado del correo ni del `sub`) se ancla a `(provider, provider_subject)`; el correo
--   (minusculas) del acceso que ancla la identidad solo sirve para revalidar la lista cerrada de configuracion en cada peticion (EDGE-009-047) y garantiza un solo administrador por correo.
-- `admin_sessions`: solo el SHA-256 (64) del identificador opaco de `argos_admin_session`; 30 min absolutos y 10 min de inactividad (D9-19) los aplica el codigo; se borra con su identidad.
-- `admin_oauth_flow_states`: estado del flujo OIDC de administracion (state, nonce, verificador PKCE S256; 900 s; un solo uso por compare-and-set), propio y distinto de `oauth_flow_states` (D9-20).
-- `admin_audit_entries`: auditoria propia (quien, que, cuando; sin PII ni valores de prompt); sin clave foranea para que sobreviva a la identidad.

CREATE TABLE admin_identities (
  admin_id TEXT PRIMARY KEY CHECK (length(admin_id) = 36),
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE')),
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) >= 1),
  email TEXT NOT NULL CHECK (length(email) >= 3 AND email = lower(email)),
  created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX admin_identities_subject ON admin_identities (provider, provider_subject);
CREATE UNIQUE INDEX admin_identities_email ON admin_identities (email);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  admin_id TEXT NOT NULL REFERENCES admin_identities (admin_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (last_activity_at >= created_at)
) STRICT;
CREATE INDEX admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_created ON admin_sessions (created_at);

CREATE TABLE admin_oauth_flow_states (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  state TEXT NOT NULL CHECK (length(state) >= 1),
  nonce TEXT NOT NULL CHECK (length(nonce) >= 1),
  code_verifier TEXT NOT NULL CHECK (length(code_verifier) >= 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX admin_oauth_flow_states_expires ON admin_oauth_flow_states (expires_at);

CREATE TABLE admin_audit_entries (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  admin_id TEXT NOT NULL CHECK (length(admin_id) = 36),
  action TEXT NOT NULL CHECK (length(action) >= 1 AND length(action) <= 64),
  object_ref TEXT CHECK (object_ref IS NULL OR (length(object_ref) >= 1 AND length(object_ref) <= 128)),
  occurred_at TEXT NOT NULL
) STRICT;
CREATE INDEX admin_audit_entries_admin_occurred ON admin_audit_entries (admin_id, occurred_at);
