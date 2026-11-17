-- Medios de la mascota (Feature 004, T574; REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, data-model.md §2).
-- @implements REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, INV-AVA-001, INV-GCS-002
-- Migracion ADITIVA: no borra ni reescribe filas existentes (las mascotas quedan con avatar_version = 0 y sin avatar).
-- `pet_media` solo guarda metadatos: la clave del objeto se DERIVA de pet_id, kind e id (INV-ARC-003); sin sha256, sin autoria y sin binarios.
-- `media_deletion_queue` no tiene clave foranea: debe sobrevivir a la fila de pet_media y de pets eliminadas por cascada (sin tope de intentos).
-- Numeracion 0009: la 0010 (limite de microchip, T556) ya estaba aplicada en el orden de trabajo; el runner aplica por conjunto, sin dependencia entre ambas.
ALTER TABLE pets ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pets ADD COLUMN avatar_object_id TEXT;

CREATE TABLE pet_media (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('FILE', 'PHOTO')),
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX pet_media_pet_created ON pet_media (pet_id, kind, created_at DESC, id DESC);

CREATE TABLE media_deletion_queue (
  object_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('INTENT', 'DELETE')),
  enqueued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
) STRICT;
