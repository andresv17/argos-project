-- Reinicio real de los cuatro limites del administrador (Feature 009, Fase 5d, #20; T1315; D9-31, Neo Nivel 2; REQ-CFG9-006, REQ-LIM9-001..004; SC-009-059, SC-009-060).
-- @implements REQ-CFG9-006, REQ-LIM9-001, REQ-LIM9-002, REQ-LIM9-004, INV-LIM9-001
-- Equivale a la 0026 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion. ADITIVA e idempotente; NULL = nunca reiniciada (sin relleno retroactivo).
ALTER TABLE home_scenes ADD COLUMN IF NOT EXISTS limits_reset_at TEXT;
-- Tabla minima de marcas por usuario (el actor): ACTOR_LIMIT cuenta en todas las escenas. Borrado de cuenta en cascada; reversible sin perdida (DROP TABLE; scene_attempts intacta).
CREATE TABLE IF NOT EXISTS scene_actor_limit_marks (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  limits_reset_at TEXT NOT NULL
);
