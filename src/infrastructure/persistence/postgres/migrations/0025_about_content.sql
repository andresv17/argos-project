-- Seccion publica «Acerca de» (Feature 010, Bloque E, #33; T1429; Nivel 2 pre-autorizada por Neo; D10-07, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-011).
-- @implements REQ-ACE10-004, INV-ACE10-001, EDGE-010-011
-- Equivale a la 0029 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA (no edita 0001..0024): tabla singleton nueva, sin filas (la ausencia de fila es el estado vacio, version 0). Mismos tipos y CHECK que SQLite
-- (columnas TEXT, como admin_audit_entries); `id` BIGINT/INTEGER fijo en 1; `version` entero >= 1 para el compare-and-set; `updated_by` sin clave foranea.
CREATE TABLE about_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body_markdown TEXT NOT NULL DEFAULT '' CHECK (length(body_markdown) <= 20000),
  photo_object_key TEXT CHECK (photo_object_key IS NULL OR (length(photo_object_key) >= 1 AND length(photo_object_key) <= 512)),
  photo_alt TEXT NOT NULL DEFAULT '' CHECK (length(photo_alt) <= 300),
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  updated_by TEXT NOT NULL CHECK (length(updated_by) = 36)
);
