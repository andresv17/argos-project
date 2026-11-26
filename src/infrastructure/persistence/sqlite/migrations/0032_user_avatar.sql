-- Foto de perfil de la cuenta (Feature 011, Bloque I, #78; T1556; Nivel 2; D11-13 = C; MIF-011-02, MIF-011-10 = NO; REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001).
-- @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001
-- Migracion NUEVA y ADITIVA (no edita 0001..0031): sin tabla ni puerto nuevo. Las filas existentes quedan con `avatar_version = 0` y sin foto.
-- `avatar_version` solo crece y NUNCA se reinicia al quitar la foto; `avatar_object_id` nulo = sin foto. La clave del objeto se deriva (`users/{userId}/avatar/{avatarObjectId}`) y no se persiste.
-- El estado NO vive en `users.data` (un reescrito del JSON de perfil no puede revertirlo; mismo criterio que `pets`). Corre en la transaccion de runMigrations (INV-ARCH-005).

ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0 CHECK (avatar_version >= 0);
ALTER TABLE users ADD COLUMN avatar_object_id TEXT CHECK (avatar_object_id IS NULL OR length(avatar_object_id) = 36);
