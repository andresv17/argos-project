-- Opt-in del creador para publicar la fecha de fallecimiento en el enlace veterinario (Feature 007, T1026; REQ-FAL7-008, SC-007-016).
-- @implements REQ-FAL7-008
-- Equivale a la 0015 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (expand): un DEFAULT constante no reescribe la tabla; los enlaces existentes quedan en 0. Inmutable tras crear (sin UPDATE).
-- El CHECK se agrega NOT VALID y se valida despues; su texto es el mismo que el de columna de SQLite.
ALTER TABLE share_links ADD COLUMN include_deceased_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE share_links ADD CONSTRAINT share_links_include_deceased_at_check CHECK (include_deceased_at IN (0, 1)) NOT VALID;
ALTER TABLE share_links VALIDATE CONSTRAINT share_links_include_deceased_at_check;
