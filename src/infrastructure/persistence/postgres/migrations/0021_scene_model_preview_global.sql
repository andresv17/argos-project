-- Transicion limpia del modelo de imagen heredado a `gemini-3.1-flash-image-preview` + region `global` (Feature 009, fix de produccion; orden Nivel 2 de Neo; D9-27; INV-CFG9-001; SC-009-052).
-- @implements REQ-CFG9-001, INV-CFG9-001
-- Equivale a la 0025 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version.
-- Migracion ADITIVA e IDEMPOTENTE (no edita 0001..0020): solo escribe filas de `platform_parameters`. Solo actua si `scene.provider_model = 'gemini-3.1-flash-image'`; con otro valor no toca nada.
-- Orden: primero la region (mientras el modelo sigue siendo el heredado), luego el modelo.
INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
SELECT 'scene.provider_location', 'global', 'Región del servicio de imagen', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), NULL
WHERE EXISTS (SELECT 1 FROM platform_parameters WHERE key = 'scene.provider_model' AND value = 'gemini-3.1-flash-image')
ON CONFLICT (key) DO UPDATE SET value = 'global', updated_at = EXCLUDED.updated_at, updated_by_user_id = NULL;

UPDATE platform_parameters
   SET value = 'gemini-3.1-flash-image-preview', updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), updated_by_user_id = NULL
 WHERE key = 'scene.provider_model' AND value = 'gemini-3.1-flash-image';
