-- Siembra del interruptor de la escena `scene.enabled` (Feature 009, Fase 5a, #20; T1263; Nivel 2 pre-autorizada por Neo; REQ-CFG9-001, REQ-CFG9-003, NFR-009-002; SC-009-017).
-- @implements REQ-CFG9-001, REQ-CFG9-003, NFR-009-002
-- Equivale a la 0021 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA: solo inserta UNA fila en `platform_parameters`; no crea ni altera tablas ni edita 0001..0016. `updated_by_user_id` es NULL (la siembra no tiene autor).
-- Sin claves nuevas desde la interfaz (el JSON del prompt es T1303, Fase 5b). ON CONFLICT DO NOTHING: una fila `scene.enabled` ya existente se respeta.
INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
VALUES ('scene.enabled', 'true', 'Interruptor de la creación de imágenes del hogar', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), NULL)
ON CONFLICT (key) DO NOTHING;
