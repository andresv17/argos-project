-- Modelo y region por intento de la escena (Feature 009, Fase 5b, #20; T1298; Nivel 2 pre-autorizada por Neo; D9-22 = A, EDGE-009-045; REQ-CFG9-002, REQ-CFG9-004, NFR-009-003; SC-009-022, SC-009-027, SC-009-051).
-- @implements REQ-CFG9-002, REQ-CFG9-004, NFR-009-003, NFR-009-002
-- Migracion NUEVA y ADITIVA: dos columnas TEXT NULABLES, SIN DEFAULT (una fila previa o un intento sin llamada queda en NULL; la migracion no simula ningun coste ni valor).
-- Solo modelo y region de la llamada; nunca valores de prompt ni inputs. Equivale a la 0019 de Postgres.
ALTER TABLE scene_attempts ADD COLUMN provider_model TEXT;
ALTER TABLE scene_attempts ADD COLUMN provider_location TEXT;
