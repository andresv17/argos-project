-- Biografia de la mascota (Feature 008, #21, bloque I; REQ-BIO8-001, REQ-BIO8-004, EDGE-008-043).
-- @implements REQ-BIO8-001, REQ-BIO8-004
-- Equivale a la 0016 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (expand): columna anulable sin DEFAULT no reescribe la tabla; las filas existentes quedan en NULL. El CHECK se agrega NOT VALID y se valida despues;
-- su texto es el mismo que el de columna de SQLite.
ALTER TABLE pets ADD COLUMN biography TEXT;
ALTER TABLE pets ADD CONSTRAINT pets_biography_check CHECK (biography IS NULL OR length(biography) <= 280) NOT VALID;
ALTER TABLE pets VALIDATE CONSTRAINT pets_biography_check;
