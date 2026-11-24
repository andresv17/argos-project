-- Reinicio real de los cuatro limites del administrador (Feature 009, Fase 5d, #20; T1315; D9-31, Neo Nivel 2; REQ-CFG9-006, REQ-LIM9-001..004; SC-009-059, SC-009-060).
-- @implements REQ-CFG9-006, REQ-LIM9-001, REQ-LIM9-002, REQ-LIM9-004, INV-LIM9-001
-- Migracion NUEVA y ADITIVA, equivale a la 0022 de Postgres. Sin relleno retroactivo: NULL = nunca reiniciada (la ventana de 24 h rige sola).
-- (1) home_scenes.limits_reset_at: marca de la escena para FAILED_LIMIT y los intentos cerrados sin llamada.
ALTER TABLE home_scenes ADD COLUMN limits_reset_at TEXT;
-- (2) Tabla minima de marcas por usuario (el actor): ACTOR_LIMIT cuenta intentos en TODAS las escenas, asi que su marca no puede vivir en una escena. Se elige tabla y no columna
--     de `users` para no tocar la tabla de identidad; el borrado de la cuenta la elimina en cascada. Reversible sin perdida: DROP TABLE y la columna nueva no alteran scene_attempts.
CREATE TABLE scene_actor_limit_marks (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  limits_reset_at TEXT NOT NULL
);
