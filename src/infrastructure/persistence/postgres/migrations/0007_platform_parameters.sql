-- Parametros de plataforma (Feature 005, T710; REQ-PRM-001, REQ-PRM-003, SC-005-004; data-model.md §2 de la 005).
-- @implements REQ-PRM-001, REQ-PRM-003
-- Equivale a la 0011 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA: solo crea una tabla y siembra una fila; no toca ninguna tabla existente.
-- `updated_by_user_id` es NULL y SIN clave foranea: el perfil de administrador de plataforma aun no existe (REQ-PRM-003).
CREATE TABLE platform_parameters (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
);

INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
VALUES ('album.max_photos_per_pet', '10', 'Máximo de fotos de álbum por mascota', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), NULL);
