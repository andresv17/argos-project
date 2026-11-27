-- Columnas de administrador y persona de la cola de disputas de /admin (Feature 012, Bloque B, #23; T1648; Nivel 2 pre-autorizada por Neo, 2026-11-27; REQ-CHP12-004, REQ-CHP12-009, INV-CHP12-006; data-model.md v0.9; admin-disputes.schema.json `AdminActorColumns`).
-- Equivale a la 0037 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- @implements REQ-CHP12-004, REQ-CHP12-009, INV-CHP12-006, NFR-012-006
-- Migracion NUEVA y ADITIVA: solo ADD COLUMN y un indice; las filas existentes quedan con NULL. No se eliminan `resolved_by_user_id` ni `second_approver_user_id` de la 0029 (quedan en desuso).
-- `admin_identities.person_id`: opaco, NULL = sin asignar, UNIQUE parcial. `owner_requests.*_admin_id`: FK a `admin_identities` RESTRICT. `*_person_id`: copia seudonima sin FK. `resolved_at` y `executes_after` ya existen (0029).
ALTER TABLE admin_identities ADD COLUMN person_id TEXT CHECK (person_id IS NULL OR (length(person_id) BETWEEN 8 AND 64 AND person_id ~ '^[A-Za-z0-9_-]+$'));
CREATE UNIQUE INDEX admin_identities_person_id ON admin_identities (person_id) WHERE person_id IS NOT NULL;

ALTER TABLE owner_requests ADD COLUMN resolved_by_admin_id TEXT REFERENCES admin_identities (admin_id) ON DELETE RESTRICT;
ALTER TABLE owner_requests ADD COLUMN second_approver_admin_id TEXT REFERENCES admin_identities (admin_id) ON DELETE RESTRICT;
ALTER TABLE owner_requests ADD COLUMN resolved_by_person_id TEXT CHECK (resolved_by_person_id IS NULL OR length(resolved_by_person_id) BETWEEN 8 AND 64);
ALTER TABLE owner_requests ADD COLUMN second_approver_person_id TEXT CHECK (second_approver_person_id IS NULL OR length(second_approver_person_id) BETWEEN 8 AND 64);
ALTER TABLE owner_requests ADD COLUMN second_approved_at TEXT;
