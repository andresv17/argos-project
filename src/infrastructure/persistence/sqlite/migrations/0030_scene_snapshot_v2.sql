-- Saneado del snapshot de entradas de la escena a v2, sin texto libre (Feature 011, Bloque C, #73; T1519/T1521; REQ-IA11-004, D11-08 = A, EDGE-011-018; Nivel 2: decision D-1 / Q1 / Q3 de Neo, Logos iter 222).
-- @implements REQ-IA11-004, EDGE-011-018
-- Migracion NUEVA y ADITIVA (no edita 0001..0029): NO cambia el esquema. El saneado de los datos (reescribir `home_scenes.image_inputs_snapshot` y `scene_attempts.inputs_snapshot` en v2, sin
-- `speciesOther` ni `breed`, y recalcular `home_scenes.image_fingerprint` y `scene_attempts.fingerprint` con el mismo SHA-256 canonico de la aplicacion) corre en el paso
-- `MIGRATION_STEPS['0030_scene_snapshot_v2.sql']` de `sqlite-database.ts`, dentro de la MISMA transaccion de esta migracion (SQLite no calcula SHA-256 en SQL).
-- Idempotente (un v2 limpio vuelve identico) y `schema_migrations` impide aplicarla dos veces. No borra escenas ni intentos; una fila ilegible no se toca.
SELECT 1;
