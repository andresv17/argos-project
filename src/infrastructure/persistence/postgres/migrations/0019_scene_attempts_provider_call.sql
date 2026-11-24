-- Modelo y region por intento de la escena (Feature 009, Fase 5b, #20; T1298; Nivel 2 pre-autorizada por Neo; D9-22 = A, EDGE-009-045; REQ-CFG9-002, REQ-CFG9-004, NFR-009-003; SC-009-022, SC-009-027, SC-009-051).
-- @implements REQ-CFG9-002, REQ-CFG9-004, NFR-009-003, NFR-009-002
-- Equivale a la 0023 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion.
-- Migracion ADITIVA: dos columnas TEXT NULABLES, SIN DEFAULT (fila previa o intento sin llamada = NULL). Solo modelo y region; nunca valores de prompt ni inputs.
ALTER TABLE scene_attempts ADD COLUMN IF NOT EXISTS provider_model TEXT;
ALTER TABLE scene_attempts ADD COLUMN IF NOT EXISTS provider_location TEXT;
