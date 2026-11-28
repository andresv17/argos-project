-- Alcance PETS del enlace para el veterinario (Feature 012, Bloque E, #81; T1692; REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, INV-VET12-001; ENM-005-E 0.2.2 APPROVED, annex §2).
-- @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, INV-VET12-001, SC-012-060, SC-012-061
-- Equivale a la 0042 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion NUEVA y aditiva (expand): ninguna fila se reescribe. Los CHECK se agregan NOT VALID y se validan despues (VALIDATE solo toma un bloqueo ligero).
-- 1) share_links.scope admite PETS; el CHECK combinado gana la rama PETS. El CHECK combinado de la 0008 es de tabla y sin nombre: PostgreSQL lo nombra share_links_check o share_links_check1 segun el orden,
--    asi que el bloque DO lo localiza por su definicion (menciona pet_owner_user_id_at_creation y HOUSEHOLD) y lo retira; falla si no lo encuentra o si hay mas de uno (nunca deja el esquema a medias).
-- 2) share_link_pets: SIN columna position; PK (share_link_id, pet_id); cascada con el enlace y con la mascota. Fuera del respaldo exportable. share_link_audit.event_type NO cambia.
DO $$
DECLARE
  shape_name TEXT;
  shape_count INTEGER;
BEGIN
  SELECT count(*), min(conname) INTO shape_count, shape_name FROM pg_constraint
    WHERE conrelid = 'share_links'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%pet_owner_user_id_at_creation%' AND pg_get_constraintdef(oid) LIKE '%HOUSEHOLD%';
  IF shape_count <> 1 THEN
    RAISE EXCEPTION 'Migracion 0038 abortada: se esperaba 1 CHECK de forma de alcance en share_links y hay %', shape_count;
  END IF;
  EXECUTE format('ALTER TABLE share_links DROP CONSTRAINT %I', shape_name);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'share_links'::regclass AND conname = 'share_links_scope_check' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Migracion 0038 abortada: falta la restriccion share_links_scope_check en share_links';
  END IF;
END
$$;

ALTER TABLE share_links DROP CONSTRAINT share_links_scope_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_scope_check CHECK (scope IN ('PET', 'HOUSEHOLD', 'PETS')) NOT VALID;
ALTER TABLE share_links ADD CONSTRAINT share_links_scope_shape_check CHECK ((scope = 'PET' AND pet_id IS NOT NULL AND household_id IS NULL AND pet_owner_user_id_at_creation IS NOT NULL) OR (scope = 'HOUSEHOLD' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL) OR (scope = 'PETS' AND household_id IS NOT NULL AND pet_id IS NULL AND pet_owner_user_id_at_creation IS NULL)) NOT VALID;
ALTER TABLE share_links VALIDATE CONSTRAINT share_links_scope_check;
ALTER TABLE share_links VALIDATE CONSTRAINT share_links_scope_shape_check;

CREATE TABLE share_link_pets (
  share_link_id TEXT NOT NULL REFERENCES share_links (id) ON DELETE CASCADE,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  PRIMARY KEY (share_link_id, pet_id)
);
CREATE INDEX share_link_pets_pet ON share_link_pets (pet_id);
