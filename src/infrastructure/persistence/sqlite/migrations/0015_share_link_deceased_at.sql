-- Opt-in del creador para publicar la fecha de fallecimiento en el enlace veterinario (Feature 007, T1026; REQ-FAL7-008, SC-007-016).
-- @implements REQ-FAL7-008
-- Migracion ADITIVA y retrocompatible: los enlaces existentes quedan en 0 (sin fecha de fallecimiento), como en la 1.0.0 del contrato.
-- La opcion es inmutable tras crear el enlace (como include_microchip): no existe UPDATE sobre la columna.
ALTER TABLE share_links ADD COLUMN include_deceased_at INTEGER NOT NULL DEFAULT 0 CHECK (include_deceased_at IN (0, 1));
