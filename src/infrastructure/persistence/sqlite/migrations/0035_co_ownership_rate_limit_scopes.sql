-- Ambitos propios de limite de frecuencia de la co-propiedad en `rate_limit_events` (Feature 012, Bloque B, #22; B-4; H-02 y H-10 de trinity T1612; REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004).
-- @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004, ERR-RATE-LIMITED
-- Ambitos nuevos: CO_OWNER_INVITE (todo intento de invitar, antes de resolver el username) y OWNER_REQUEST (crear, aprobar o rechazar una solicitud). Dejan de compartir el ambito INVITE de los hogares.
-- COMPROBACION PREVIA: sqlite-database.ts (`MIGRATION_PRECHECKS`) cuenta los eventos cuyo usuario ya no existe (la copia violaria la clave foranea) y ABORTA antes de ejecutar este archivo si hay alguno;
--   el mensaje solo trae el conteo (nunca un id) y la migracion corre en una transaccion: si algo falla la base queda intacta y schema_migrations no la anota. Mismo patron que la 0010; sin perdida de datos.
-- SQLite no admite ALTER de un CHECK: se reconstruye la tabla (crear, copiar, borrar, renombrar, recrear el indice).
CREATE TABLE rate_limit_events_new (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST')),
  subject_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
) STRICT;
INSERT INTO rate_limit_events_new (id, scope, subject_user_id, occurred_at) SELECT id, scope, subject_user_id, occurred_at FROM rate_limit_events;
DROP TABLE rate_limit_events;
ALTER TABLE rate_limit_events_new RENAME TO rate_limit_events;
CREATE INDEX rate_limit_events_subject ON rate_limit_events (scope, subject_user_id, occurred_at);
