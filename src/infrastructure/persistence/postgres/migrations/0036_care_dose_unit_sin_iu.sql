-- Cuidador (Feature 012, T1658; decision de Neo Nivel 2, 2026-11-27, opcion (a)): retiro de `IU` del catalogo de dose_unit; REQ-CAR12-001.
-- @implements REQ-CAR12-001
-- SUPERA a la 0035_care_mode.sql en este unico CHECK: su cabecera dice "IU incluida", pero las migraciones versionadas no se mutan; esta migracion NUEVA lo reemplaza.
-- El CHECK de columna de la 0035 recibe el nombre automatico de PostgreSQL `care_routines_dose_unit_check`. Si existiera una fila con 'IU', el ADD CONSTRAINT falla (la feature 012 no esta en produccion).
-- Equivale a la 0040 de SQLite (triggers aditivos). Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion.
ALTER TABLE care_routines DROP CONSTRAINT care_routines_dose_unit_check;
ALTER TABLE care_routines ADD CONSTRAINT care_routines_dose_unit_check CHECK (dose_unit IS NULL OR dose_unit IN ('MG', 'MCG', 'ML', 'TABLET', 'DROP'));
