-- Declaracion de mayoria de edad (Feature 010, Bloque D, #75; T1423; Nivel 2 pre-autorizada por Neo; D10-05, REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003).
-- @implements REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003
-- Equivale a la 0028 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (expand, no edita 0001..0023): columnas anulables sin DEFAULT (no reescriben la tabla); toda cuenta previa queda con NULL y NULL (REQ-MEN10-002).
-- Los CHECK se agregan NOT VALID y se validan despues (sin bloqueo largo); el texto de cada CHECK es el mismo que el de columna de SQLite.
ALTER TABLE users ADD COLUMN adult_declared_at TEXT;
ALTER TABLE users ADD COLUMN adult_notice_version TEXT;
ALTER TABLE users ADD CONSTRAINT users_adult_declared_at_check CHECK (adult_declared_at IS NULL OR length(adult_declared_at) BETWEEN 20 AND 40) NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_adult_notice_version_check CHECK ((adult_notice_version IS NULL AND adult_declared_at IS NULL) OR (adult_notice_version IS NOT NULL AND adult_declared_at IS NOT NULL AND length(adult_notice_version) BETWEEN 1 AND 32)) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_adult_declared_at_check;
ALTER TABLE users VALIDATE CONSTRAINT users_adult_notice_version_check;
