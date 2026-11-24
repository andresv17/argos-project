-- Siembra del interruptor de la escena `scene.enabled` (Feature 009, Fase 5a, #20; T1263; Nivel 2 pre-autorizada por Neo; REQ-CFG9-001, REQ-CFG9-003, NFR-009-002; SC-009-017).
-- @implements REQ-CFG9-001, REQ-CFG9-003, NFR-009-002
-- Migracion NUEVA y ADITIVA (no edita 0001..0020; 0011 sigue sembrando solo `album.max_photos_per_pet`): inserta UNA fila en `platform_parameters` y no crea ni altera ninguna tabla.
-- `scene.enabled = 'true'` (booleano en texto canonico minusculas; el tipo y el defecto viven en el catalogo del codigo, MIF-005-07). `updated_by_user_id` es NULL: la siembra no tiene autor.
-- Sin claves nuevas desde la interfaz: `scene.global_quota_max`, modelo, region y `scene.prompt.blocks` NO se siembran aqui (el JSON del prompt es T1303, Fase 5b; las demas siguen por entorno).
-- ON CONFLICT DO NOTHING: una fila `scene.enabled` ya existente (p. ej. puesta a mano antes del despliegue) se respeta y no se pisa.
-- Equivale a la 0017 de Postgres. Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.
INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id)
VALUES ('scene.enabled', 'true', 'Interruptor de la creación de imágenes del hogar', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL)
ON CONFLICT (key) DO NOTHING;
