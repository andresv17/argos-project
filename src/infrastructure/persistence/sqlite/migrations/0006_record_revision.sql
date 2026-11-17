-- Revision de los registros clinicos para el control de edicion concurrente (Feature 004, T540; D-16 A).
-- @implements REQ-BOR-005, INV-REG-003, REQ-BOR-004
-- Cada una de las 6 tablas de registros gana `revision INTEGER NOT NULL DEFAULT 0`: las filas existentes quedan en 0 y el
--   incremento por edicion efectiva (comparacion bajo el candado de mascota) lo hace T614, no esta migracion.
-- D-11 A / REQ-BOR-004 (retencion cero): NO hay `deleted_at`, `deleted_by_user_id` ni indice de borrado logico; el borrado es fisico.
-- Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.

ALTER TABLE weights ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE body_measurements ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vaccinations ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dewormings ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medical_visits ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_parameters ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
