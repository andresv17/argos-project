-- Metadatos opcionales del evento de auditoria de administracion (Feature 012, Bloque B, #23; H-01 opcion (a) aprobada por Neo, 2026-11-27; REQ-CHP12-004, NFR-012-006 N-E).
-- @implements REQ-CHP12-004, NFR-012-006
-- Migracion NUEVA y ADITIVA (no edita 0001..0037): un solo ADD COLUMN simple, sin reconstruir la tabla; las filas existentes quedan con NULL y se siguen leyendo igual.
-- `metadata`: JSON de texto con el motivo de decision del arbitraje (<= 500 caracteres ya validado en el caso de uso); se purga con la auditoria (1095 dias). Tope duro de 4096 caracteres del JSON serializado.
ALTER TABLE admin_audit_entries ADD COLUMN metadata TEXT CHECK (metadata IS NULL OR length(metadata) BETWEEN 2 AND 4096);
