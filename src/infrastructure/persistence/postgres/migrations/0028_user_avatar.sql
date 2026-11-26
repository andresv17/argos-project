-- Foto de perfil de la cuenta (Feature 011, Bloque I, #78; T1556; Nivel 2; D11-13 = C; MIF-011-02, MIF-011-10 = NO; REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001).
-- @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001
-- Equivale a la 0032 de SQLite. Migracion NUEVA y ADITIVA (no edita 0001..0027): sin tabla ni puerto nuevo. Las filas existentes quedan con `avatar_version = 0` y sin foto.
-- `avatar_version` solo crece y NUNCA se reinicia al quitar la foto; `avatar_object_id` nulo = sin foto. La clave del objeto se deriva y no se persiste.

-- Convencion del repositorio (0016, 0024): la columna se agrega sin CHECK y los CHECK van como restricciones NOT VALID + VALIDATE (mismo texto que SQLite; el analizador de paridad los compara).
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_object_id TEXT;
ALTER TABLE users ADD CONSTRAINT users_avatar_version_check CHECK (avatar_version >= 0) NOT VALID;
ALTER TABLE users ADD CONSTRAINT users_avatar_object_id_check CHECK (avatar_object_id IS NULL OR length(avatar_object_id) = 36) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_avatar_version_check;
ALTER TABLE users VALIDATE CONSTRAINT users_avatar_object_id_check;
