-- Enlace de solo lectura para el veterinario (Feature 005, T766; REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-010, REQ-VET-013; data-model.md §3 y §4 de la 005).
-- @implements REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-010, REQ-VET-011, REQ-VET-012, REQ-VET-013, INV-005-005
-- Migracion ADITIVA: solo crea dos tablas y sus indices; no toca ninguna tabla existente. Fuera del respaldo exportable (RAMA-005-008).
-- `share_links` guarda solo el SHA-256 del token (nunca el token), sin columna de estado (se deriva de revoked_at y expires_at con el reloj inyectado) y sin IP.
-- Cascada por mascota, hogar y cuenta del creador (REQ-VET-010). `pet_owner_user_id_at_creation` no tiene clave foranea (no bloquea el borrado de cuentas) y no sale por la API (PN-08).
-- `share_link_audit` no tiene claves foraneas: sobrevive a la purga de la fila del enlace dentro de sus 90 dias; la IP solo existe como HMAC (30 dias) y la clave HMAC no rota en 005 (PN-06).
CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  scope TEXT NOT NULL CHECK (scope IN ('PET', 'HOUSEHOLD')),
  pet_id TEXT REFERENCES pets (id) ON DELETE CASCADE,
  household_id TEXT REFERENCES households (id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_in_days INTEGER NOT NULL CHECK (expires_in_days IN (1, 7, 30)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  include_microchip INTEGER NOT NULL DEFAULT 0 CHECK (include_microchip IN (0, 1)),
  include_clinical_files INTEGER NOT NULL DEFAULT 0 CHECK (include_clinical_files IN (0, 1)),
  idempotency_key TEXT NOT NULL,
  pet_owner_user_id_at_creation TEXT,
  CHECK ((scope = 'PET' AND pet_id IS NOT NULL AND household_id IS NULL AND pet_owner_user_id_at_creation IS NOT NULL) OR (scope = 'HOUSEHOLD' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL)),
  CHECK (expires_at > created_at),
  UNIQUE (created_by_user_id, idempotency_key)
) STRICT;
CREATE INDEX share_links_pet_active ON share_links (pet_id, revoked_at, expires_at);
CREATE INDEX share_links_household_active ON share_links (household_id, revoked_at, expires_at);
CREATE INDEX share_links_created_by ON share_links (created_by_user_id, created_at DESC);
CREATE INDEX share_links_expires ON share_links (expires_at);
CREATE INDEX share_links_revoked ON share_links (revoked_at);

CREATE TABLE share_link_audit (
  id TEXT PRIMARY KEY,
  share_link_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'REVOKED', 'ACCESS_OK', 'ACCESS_FAILED')),
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT,
  ip_hmac TEXT CHECK (ip_hmac IS NULL OR length(ip_hmac) = 64),
  fail_count INTEGER NOT NULL DEFAULT 1 CHECK (fail_count >= 1)
) STRICT;
CREATE INDEX share_link_audit_occurred ON share_link_audit (occurred_at);
CREATE INDEX share_link_audit_actor ON share_link_audit (actor_user_id);
CREATE UNIQUE INDEX share_link_audit_failure_window ON share_link_audit (ip_hmac, occurred_at) WHERE event_type = 'ACCESS_FAILED';
