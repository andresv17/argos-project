-- Feature 006, enmienda Nivel 2 de REQ-ESC6-035 (autorizada por Neo tras prueba en vivo): `home_scenes.image_mime` admite ('image/png', 'image/webp', 'image/jpeg').
-- Equivale a la 0024 de SQLite. La 0009 ya esta aplicada y NO se edita. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion.
-- @implements REQ-ESC6-035, INV-ESC6-005
-- Aditiva y sin perdida de datos: el CHECK de columna se llama home_scenes_image_mime_check; se retira y se agrega el ampliado (toda fila existente, PNG o WebP, lo cumple).
ALTER TABLE home_scenes DROP CONSTRAINT home_scenes_image_mime_check;
ALTER TABLE home_scenes ADD CONSTRAINT home_scenes_image_mime_check CHECK (image_mime IN ('image/png', 'image/webp', 'image/jpeg'));
