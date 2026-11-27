-- Metadatos opcionales del evento de auditoria de administracion (Feature 012, Bloque B, #23; H-01 opcion (a) aprobada por Neo, 2026-11-27; REQ-CHP12-004, NFR-012-006 N-E).
-- @implements REQ-CHP12-004, NFR-012-006
-- Equivale a la 0038 de SQLite. Migracion NUEVA y ADITIVA (no edita 0001..0033): un solo ADD COLUMN; las filas existentes quedan con NULL.
ALTER TABLE admin_audit_entries ADD COLUMN metadata TEXT CHECK (metadata IS NULL OR length(metadata) BETWEEN 2 AND 4096);
