-- Acceso con Google (Feature 008, #16, bloque A; T1116; REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-VIN8-003, EDGE-008-023, EDGE-008-036, NFR-008-004).
-- @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-VIN8-003, EDGE-008-023, EDGE-008-036, INV-VIN8-005
-- Equivale a la 0017 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA: una columna anulable y dos tablas; no reescribe `users`. TODA cuenta previa queda con `email_verified_at = NULL`: el correo heredado nunca se verifico (EDGE-008-036).
-- `users.email_verified_at`: instante en que Google verifico el correo (solo las cuentas nacidas con Google lo traen). El indice unico parcial `users_email_verified_unique` hace que un correo
--   VERIFICADO tenga un solo titular (REQ-VIN8-003: si ya es titular verificado de otra cuenta, el flujo no crea ni vincula nada); los correos sin verificar siguen sin ser unicos (002).
-- «Liberar» el correo (D8-14, EDGE-008-023): el repositorio de usuarios pone `users.email = NULL` en las cuentas con ese correo y `email_verified_at IS NULL`; la cuenta conserva usuario y contrasena.
-- `auth_identities`: la identidad de Google se ancla en `sub`, nunca en el correo (EDGE-008-002); unicidad (provider, provider_subject). La cascada por cuenta elimina las identidades (H-8-04; Postgres con ON DELETE CASCADE).
-- `oauth_flow_states.origin_session_hash` (H-A21-2, Opcion A, aprobada por Neo; migracion editada EN SITIO porque ninguna se aplico en un entorno compartido): SHA-256 hex (64) del token de la sesion que
--   inicio la vinculacion, el MISMO valor de `sessions.token_hash`. Solo la intencion LINK lo lleva (obligatorio); sin clave foranea: si la sesion desaparece, el retorno la trata como inexistente.
-- `oauth_flow_states`: estado del flujo en servidor, identificado por el SHA-256 del identificador opaco de la cookie `argos_oauth` (REQ-SSO8-004, ADR-008-03). Fase AUTHORIZATION = state, nonce y
--   verificador PKCE (intencion LOGIN o LINK; LINK lleva el usuario de la sesion que inicia la vinculacion); fase USERNAME = identidad verificada por Google que espera la eleccion de username (solo LOGIN).
--   Vence a los 900 s (`expires_at`) y se consume una sola vez por compare-and-set sobre `consumed_at`. Fuera del respaldo exportable; la cascada por cuenta tambien lo elimina.

ALTER TABLE users ADD COLUMN email_verified_at TEXT;
CREATE UNIQUE INDEX users_email_verified_unique ON users (lower(email)) WHERE email_verified_at IS NOT NULL;

CREATE TABLE auth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('GOOGLE')),
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) >= 1),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);
CREATE INDEX auth_identities_user_id ON auth_identities (user_id);

CREATE TABLE oauth_flow_states (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  phase TEXT NOT NULL CHECK (phase IN ('AUTHORIZATION', 'USERNAME')),
  intent TEXT NOT NULL CHECK (intent IN ('LOGIN', 'LINK')),
  state TEXT,
  nonce TEXT,
  code_verifier TEXT,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  origin_session_hash TEXT,
  pending_subject TEXT,
  pending_email TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at),
  CHECK ((phase = 'AUTHORIZATION' AND state IS NOT NULL AND nonce IS NOT NULL AND code_verifier IS NOT NULL AND pending_subject IS NULL AND pending_email IS NULL) OR (phase = 'USERNAME' AND intent = 'LOGIN' AND state IS NULL AND nonce IS NULL AND code_verifier IS NULL AND pending_subject IS NOT NULL AND pending_email IS NOT NULL)),
  CHECK ((intent = 'LINK') = (user_id IS NOT NULL)),
  CHECK ((intent = 'LINK') = (origin_session_hash IS NOT NULL)),
  CHECK (origin_session_hash IS NULL OR length(origin_session_hash) = 64)
);
CREATE INDEX oauth_flow_states_expires ON oauth_flow_states (expires_at);
CREATE INDEX oauth_flow_states_user_id ON oauth_flow_states (user_id);
