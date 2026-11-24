-- Transicion limpia del modelo de imagen heredado a `gemini-3.1-flash-image-preview` + region `global` (Feature 009, fix de produccion; orden Nivel 2 de Neo; D9-27; INV-CFG9-001; SC-009-052).
-- @implements REQ-CFG9-001, INV-CFG9-001
-- Migracion NUEVA, ADITIVA e IDEMPOTENTE (no edita 0001..0024): solo escribe filas de `platform_parameters`; no crea ni altera tablas.
-- Solo actua si `scene.provider_model = 'gemini-3.1-flash-image'` (valor heredado de produccion, sin fila de region): entonces fija la region `global` (la crea o la sobrescribe) y cambia el modelo a
-- `gemini-3.1-flash-image-preview`. Con cualquier otro valor (u otra ausencia de fila) no toca nada. Una segunda ejecucion no encuentra el valor heredado y no cambia el estado.
-- Orden: primero la region (mientras el modelo sigue siendo el heredado), luego el modelo. Equivale a la 0021 de Postgres. Corre en la transaccion de runMigrations (INV-ARCH-005).
INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
SELECT 'scene.provider_location', 'global', 'Región del servicio de imagen', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
WHERE EXISTS (SELECT 1 FROM platform_parameters WHERE key = 'scene.provider_model' AND value = 'gemini-3.1-flash-image')
ON CONFLICT (key) DO UPDATE SET value = 'global', updated_at = excluded.updated_at, updated_by_user_id = NULL;

UPDATE platform_parameters
   SET value = 'gemini-3.1-flash-image-preview', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by_user_id = NULL
 WHERE key = 'scene.provider_model' AND value = 'gemini-3.1-flash-image';
