-- Declaracion de mayoria de edad (Feature 010, Bloque D, #75; T1423; Nivel 2 pre-autorizada por Neo; D10-05, REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003).
-- @implements REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003
-- Migracion NUEVA y ADITIVA (no edita 0001..0027): ambas columnas son anulables SIN DEFAULT, asi que toda cuenta previa queda con NULL y NULL (cuentas anteriores intactas, REQ-MEN10-002);
--   el codigo escribe las dos al crear una cuenta nueva (T1424). Sin fecha de nacimiento ni documento (REQ-MEN10-003, D10-05).
-- `adult_declared_at`: instante (texto ISO, reloj inyectado) en que se acepto la declaracion «Soy mayor de edad (18+)».
-- `adult_notice_version`: version del texto legal que se acepto (texto SemVer N.N.N).
-- Los CHECK son de columna (SQLite no admite ADD CONSTRAINT): ambas nulas (cuenta anterior) o ambas presentes; Postgres (0024) los agrega NOT VALID + VALIDATE con el mismo texto.
-- Corre en la transaccion de runMigrations (INV-ARCH-005); schema_migrations impide aplicarla dos veces.

ALTER TABLE users ADD COLUMN adult_declared_at TEXT CHECK (adult_declared_at IS NULL OR length(adult_declared_at) BETWEEN 20 AND 40);
ALTER TABLE users ADD COLUMN adult_notice_version TEXT CHECK ((adult_notice_version IS NULL AND adult_declared_at IS NULL) OR (adult_notice_version IS NOT NULL AND adult_declared_at IS NOT NULL AND length(adult_notice_version) BETWEEN 1 AND 32));
