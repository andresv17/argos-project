-- Estado de vida de la mascota y version de la ficha (Feature 007, T1017; REQ-FAL7-001, REQ-FAL7-002, EDGE-007-009).
-- @implements REQ-FAL7-001, REQ-FAL7-002, REQ-FAL7-011
-- Migracion ADITIVA y retrocompatible: las filas existentes quedan ALIVE, sin fecha de fallecimiento y en version 1; no se reescribe `data`.
-- Los CHECK son de columna (SQLite no admite ADD CONSTRAINT): el cruzado `DECEASED <=> deceased_at` se evalua contra las filas existentes al
--   agregar la columna. Postgres (0010) los agrega como restricciones de tabla NOT VALID + VALIDATE; el texto de cada CHECK es el mismo.
-- La version es la autoridad del control optimista (`If-Match` de PATCH /pets/{petId}): `data` no la repite (como `revision` de los registros).
-- Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.

ALTER TABLE pets ADD COLUMN life_status TEXT NOT NULL DEFAULT 'ALIVE' CHECK (life_status IN ('ALIVE', 'DECEASED'));
ALTER TABLE pets ADD COLUMN deceased_at TEXT CHECK ((life_status = 'DECEASED') = (deceased_at IS NOT NULL));
ALTER TABLE pets ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
