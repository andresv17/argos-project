-- Estado de vida de la mascota y version de la ficha (Feature 007, T1017; REQ-FAL7-001, REQ-FAL7-002, EDGE-007-009).
-- @implements REQ-FAL7-001, REQ-FAL7-002, REQ-FAL7-011
-- Equivale a la 0014 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (expand): un DEFAULT constante no reescribe la tabla; las filas existentes quedan ALIVE, sin fecha y en version 1.
-- Los CHECK se agregan NOT VALID y se validan despues (sin bloqueo largo); el texto de cada CHECK es el mismo que el de columna de SQLite.
ALTER TABLE pets ADD COLUMN life_status TEXT NOT NULL DEFAULT 'ALIVE';
ALTER TABLE pets ADD COLUMN deceased_at TEXT;
ALTER TABLE pets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pets ADD CONSTRAINT pets_life_status_check CHECK (life_status IN ('ALIVE', 'DECEASED')) NOT VALID;
ALTER TABLE pets ADD CONSTRAINT pets_deceased_at_check CHECK ((life_status = 'DECEASED') = (deceased_at IS NOT NULL)) NOT VALID;
ALTER TABLE pets ADD CONSTRAINT pets_version_check CHECK (version >= 1) NOT VALID;
ALTER TABLE pets VALIDATE CONSTRAINT pets_life_status_check;
ALTER TABLE pets VALIDATE CONSTRAINT pets_deceased_at_check;
ALTER TABLE pets VALIDATE CONSTRAINT pets_version_check;
