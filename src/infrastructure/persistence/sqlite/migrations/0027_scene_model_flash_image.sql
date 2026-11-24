-- Retiro del modelo `gemini-3.1-flash-image-preview` (404 en Vertex global, verificado en produccion; orden Nivel 2 de Neo; D9-27, D9-32; INV-CFG9-001).
-- @implements REQ-CFG9-001, INV-CFG9-001
-- Equivale a la 0023 de Postgres. Migracion ADITIVA e IDEMPOTENTE (no edita 0001..0026): solo escribe filas de `platform_parameters`. Convierte `scene.provider_model = 'gemini-3.1-flash-image-preview'`
-- en `gemini-3.1-flash-image`; con cualquier otro valor (u otra ausencia de fila) no toca nada. Una segunda ejecucion no cambia el estado. La region es derivada del modelo (D9-29): no se escribe.
UPDATE platform_parameters
   SET value = 'gemini-3.1-flash-image', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by_user_id = NULL
 WHERE key = 'scene.provider_model' AND value = 'gemini-3.1-flash-image-preview';
