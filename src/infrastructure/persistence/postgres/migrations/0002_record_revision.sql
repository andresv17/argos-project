-- Revision de los registros clinicos para el control de edicion concurrente (Feature 004, T540; D-16 A).
-- @implements REQ-BOR-005, INV-REG-003, REQ-BOR-004
-- Equivale a la 0006 de SQLite (expand, REQ-CICD-005): `revision INTEGER NOT NULL DEFAULT 0` en las 6 tablas de registros. Las filas
--   existentes quedan en 0 (en PostgreSQL 11 o posterior un DEFAULT constante no reescribe la tabla). El incremento por edicion
--   efectiva lo hace T614, no esta migracion.
-- D-11 A / REQ-BOR-004 (retencion cero): NO hay `deleted_at`, `deleted_by_user_id` ni indice de borrado logico; el borrado es fisico.
-- Sin BEGIN/COMMIT: el migrador (T429) corre cada migracion en una transaccion y registra la version en schema_migrations.

ALTER TABLE weights ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE body_measurements ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vaccinations ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dewormings ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medical_visits ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_parameters ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
