-- Alcance PETS del enlace para el veterinario (Feature 012, Bloque E, #81; T1692; REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, INV-VET12-001; ENM-005-E 0.2.2 APPROVED, annex §2).
-- @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, INV-VET12-001, SC-012-060, SC-012-061
-- Migracion NUEVA: no muta ninguna migracion ya versionada. Equivale a la 0038 de PostgreSQL.
-- 1) share_links.scope admite PETS y el CHECK combinado gana la rama (scope = 'PETS' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL).
--    SQLite no admite ALTER de un CHECK: share_links se reconstruye (crear, copiar, borrar, renombrar, recrear indices), precedentes 0034, 0035 y 0041. Las filas, los tokens (hash) y los
--    identificadores se copian byte a byte; ninguna tabla tiene clave foranea hacia share_links antes de esta migracion (share_link_audit no tiene FK), asi que el DROP no arrastra datos.
-- 2) share_link_pets (enlace PETS -> mascotas del subconjunto estatico): SIN columna position (el orden es el de REQ-PET-005); PK (share_link_id, pet_id); cascada con el enlace y con la mascota.
--    Fuera del respaldo exportable (como share_links). La cardinalidad 1..20 de un PETS activo y 0 para PET/HOUSEHOLD es invariante de dominio (annex §2), no del motor (paridad entre motores).
-- 3) share_link_audit.event_type NO cambia (annex §2): los eventos de PETS son CREATED y REVOKED.
-- Migracion 0042 de SQLite (STRICT).
CREATE TABLE share_links_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  scope TEXT NOT NULL CHECK (scope IN ('PET', 'HOUSEHOLD', 'PETS')),
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
  include_deceased_at INTEGER NOT NULL DEFAULT 0 CHECK (include_deceased_at IN (0, 1)),
  CHECK ((scope = 'PET' AND pet_id IS NOT NULL AND household_id IS NULL AND pet_owner_user_id_at_creation IS NOT NULL) OR (scope = 'HOUSEHOLD' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL) OR (scope = 'PETS' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL)),
  CHECK (expires_at > created_at),
  UNIQUE (created_by_user_id, idempotency_key)
) STRICT;
INSERT INTO share_links_new (id, token_hash, scope, pet_id, household_id, created_by_user_id, created_at, expires_in_days, expires_at, revoked_at, include_microchip, include_clinical_files, idempotency_key, pet_owner_user_id_at_creation, include_deceased_at)
  SELECT id, token_hash, scope, pet_id, household_id, created_by_user_id, created_at, expires_in_days, expires_at, revoked_at, include_microchip, include_clinical_files, idempotency_key, pet_owner_user_id_at_creation, include_deceased_at FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_new RENAME TO share_links;
CREATE INDEX share_links_pet_active ON share_links (pet_id, revoked_at, expires_at);
CREATE INDEX share_links_household_active ON share_links (household_id, revoked_at, expires_at);
CREATE INDEX share_links_created_by ON share_links (created_by_user_id, created_at DESC);
CREATE INDEX share_links_expires ON share_links (expires_at);
CREATE INDEX share_links_revoked ON share_links (revoked_at);

CREATE TABLE share_link_pets (
  share_link_id TEXT NOT NULL REFERENCES share_links (id) ON DELETE CASCADE,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  PRIMARY KEY (share_link_id, pet_id)
) STRICT;
CREATE INDEX share_link_pets_pet ON share_link_pets (pet_id);
