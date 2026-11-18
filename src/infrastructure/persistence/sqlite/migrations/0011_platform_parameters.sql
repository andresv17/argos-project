-- Parametros de plataforma (Feature 005, T710; REQ-PRM-001, REQ-PRM-003, SC-005-004; data-model.md §2 de la 005).
-- @implements REQ-PRM-001, REQ-PRM-003
-- Migracion ADITIVA: solo crea una tabla y siembra una fila; no toca ninguna tabla existente.
-- MIF-005-07: sin value_type, min_value ni max_value; el tipo, el defecto y el rango (1..50) viven en el catalogo del codigo (src/domain/platform).
-- `updated_by_user_id` es NULL y SIN clave foranea: el perfil de administrador de plataforma aun no existe (REQ-PRM-003).
-- Fuera del respaldo exportable (RAMA-005-008).
CREATE TABLE platform_parameters (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT
) STRICT;

INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
VALUES ('album.max_photos_per_pet', '10', 'Máximo de fotos de álbum por mascota', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);
