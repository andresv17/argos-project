-- Biografia de la mascota (Feature 008, #21, bloque I; REQ-BIO8-001, REQ-BIO8-004, EDGE-008-043).
-- @implements REQ-BIO8-001, REQ-BIO8-004
-- Migracion ADITIVA y retrocompatible: columna anulable; las filas existentes quedan en NULL y no se reescribe `data`. Texto plano de 0 a 280 caracteres: vacio se guarda como NULL.
-- El CHECK es de columna (SQLite no admite ADD CONSTRAINT); Postgres (0012) lo agrega como restriccion de tabla NOT VALID + VALIDATE con el mismo texto.
-- La biografia NO entra en la escena ni en el resumen veterinario (D8-12 = A). Corre en la transaccion de runMigrations (INV-ARCH-005).

ALTER TABLE pets ADD COLUMN biography TEXT CHECK (biography IS NULL OR length(biography) <= 280);
