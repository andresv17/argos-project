-- Cuidador (Feature 012, T1658; decision de Neo Nivel 2, 2026-11-27, opcion (a)): retiro de `IU` del catalogo de dose_unit; REQ-CAR12-001.
-- @implements REQ-CAR12-001
-- SUPERA a la 0039_care_mode.sql en este unico CHECK (su cabecera dice "IU incluida"; las migraciones versionadas no se mutan).
-- SQLite no permite alterar un CHECK sin reconstruir la tabla, y reconstruir care_routines dispararia cascadas sobre care_log_entries: se usan triggers ADITIVOS que abortan con el mismo mensaje de CHECK.
-- Equivale a la 0036 de PostgreSQL.
CREATE TRIGGER care_routines_dose_unit_sin_iu_insert
BEFORE INSERT ON care_routines
WHEN NEW.dose_unit = 'IU'
BEGIN
  SELECT RAISE(ABORT, 'CHECK constraint failed: dose_unit');
END;

CREATE TRIGGER care_routines_dose_unit_sin_iu_update
BEFORE UPDATE OF dose_unit ON care_routines
WHEN NEW.dose_unit = 'IU'
BEGIN
  SELECT RAISE(ABORT, 'CHECK constraint failed: dose_unit');
END;
