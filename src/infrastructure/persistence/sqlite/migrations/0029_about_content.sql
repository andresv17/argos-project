-- Seccion publica «Acerca de» (Feature 010, Bloque E, #33; T1429; Nivel 2 pre-autorizada por Neo; D10-07, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-011).
-- @implements REQ-ACE10-004, INV-ACE10-001, EDGE-010-011
-- Migracion NUEVA y ADITIVA (no edita 0001..0028): crea la tabla singleton `about_content` SIN filas (la ausencia de fila es el estado vacio, version 0; el primer guardado crea la version 1).
-- `id`: siempre 1 (singleton). `body_markdown`: texto sanitizado, tope de 20 000 caracteres (EDGE-010-011, APPROVED por Neo 2026-11-24; el servidor lo valida primero y este CHECK es la red de seguridad).
-- `photo_object_key`: clave del objeto de la foto (sin EXIF), NULL si no hay foto; NUNCA sale en respuestas publicas. `photo_alt`: texto alternativo (0..300).
-- `version`: compare-and-set (1..); subir o reemplazar la foto TAMBIEN la incrementa (EDGE-010-006). `updated_at`: instante del reloj inyectado. `updated_by`: id opaco del administrador, sin clave foranea
-- (sobrevive a la identidad, como admin_audit_entries). Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.

CREATE TABLE about_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body_markdown TEXT NOT NULL DEFAULT '' CHECK (length(body_markdown) <= 20000),
  photo_object_key TEXT CHECK (photo_object_key IS NULL OR (length(photo_object_key) >= 1 AND length(photo_object_key) <= 512)),
  photo_alt TEXT NOT NULL DEFAULT '' CHECK (length(photo_alt) <= 300),
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  updated_by TEXT NOT NULL CHECK (length(updated_by) = 36)
) STRICT;
