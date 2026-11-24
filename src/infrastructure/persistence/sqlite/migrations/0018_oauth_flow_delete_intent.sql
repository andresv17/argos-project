-- Feature 009 (T1219, deuda #17, D9-17 = A, Nivel 2): intención `DELETE` de `oauth_flow_states` (reautenticación reciente con Google para eliminar una cuenta sin contraseña,
-- REQ-DEL9-001, INV-DEL9-001, ADR-009-04). La 0017 (008) ya está aplicada en producción, así que NO se edita en sitio: SQLite no puede alterar un CHECK, por lo que la tabla se
-- reconstruye (renombrar, crear la nueva, copiar, eliminar la vieja, recrear índices) sin perder filas. Ninguna otra tabla referencia `oauth_flow_states`.
-- Cambios de forma (solo los que exige la intención DELETE; el resto es idéntico a la 0017):
--   · `intent` admite 'DELETE'.
--   · DELETE lleva, como LINK, el usuario de la sesión (`user_id`) y el hash de la sesión de origen (`origin_session_hash`, ligada a ESA sesión).
--   · `pending_subject` (hasta ahora siempre NULL en AUTHORIZATION) solo puede llevar valor en DELETE: es la MARCA de prueba de titularidad = `sub` verificado por Google tras
--     el retorno (la fila ya consumida con `pending_subject` no nulo es la prueba; sin marca, un retorno fallido o a medias no acredita nada). `pending_email` sigue NULL.
--   · La prueba es de un solo uso: el borrado la consume eliminando la fila (DELETE condicional), y la cascada por cuenta también la elimina.

ALTER TABLE oauth_flow_states RENAME TO oauth_flow_states_old;

CREATE TABLE oauth_flow_states (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  phase TEXT NOT NULL CHECK (phase IN ('AUTHORIZATION', 'USERNAME')),
  intent TEXT NOT NULL CHECK (intent IN ('LOGIN', 'LINK', 'DELETE')),
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
  CHECK ((phase = 'AUTHORIZATION' AND state IS NOT NULL AND nonce IS NOT NULL AND code_verifier IS NOT NULL AND (pending_subject IS NULL OR intent = 'DELETE') AND pending_email IS NULL) OR (phase = 'USERNAME' AND intent = 'LOGIN' AND state IS NULL AND nonce IS NULL AND code_verifier IS NULL AND pending_subject IS NOT NULL AND pending_email IS NOT NULL)),
  CHECK ((intent IN ('LINK', 'DELETE')) = (user_id IS NOT NULL)),
  CHECK ((intent IN ('LINK', 'DELETE')) = (origin_session_hash IS NOT NULL)),
  CHECK (origin_session_hash IS NULL OR length(origin_session_hash) = 64)
) STRICT;

INSERT INTO oauth_flow_states (token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, pending_subject, pending_email, created_at, expires_at, consumed_at)
  SELECT token_hash, phase, intent, state, nonce, code_verifier, user_id, origin_session_hash, pending_subject, pending_email, created_at, expires_at, consumed_at FROM oauth_flow_states_old;

DROP TABLE oauth_flow_states_old;

CREATE INDEX oauth_flow_states_expires ON oauth_flow_states (expires_at);
CREATE INDEX oauth_flow_states_user_id ON oauth_flow_states (user_id);
