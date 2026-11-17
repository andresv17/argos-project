-- Ambito MICROCHIP_DUPLICATE en `rate_limit_events` (Feature 004, T556/T557; REQ-PET4-002, ADR-004-04, SC-CAT-029).
-- @implements REQ-PET4-002, ERR-RATE-LIMITED
-- COMPROBACION PREVIA: sqlite-database.ts (`MIGRATION_PRECHECKS`) cuenta los eventos cuyo usuario ya no existe (la copia violaria la clave foranea)
--   y ABORTA antes de ejecutar este archivo si hay alguno; el mensaje solo trae el conteo (nunca un id) y la migracion corre en una transaccion:
--   si algo falla la base queda intacta y schema_migrations no la anota.
-- SQLite no admite ALTER de un CHECK: se reconstruye la tabla (crear, copiar, borrar, renombrar, recrear el indice). Numeracion 0010: la 0009
--   queda reservada a la migracion de medios (T574); el runner aplica por conjunto, sin dependencia entre ambas.
CREATE TABLE rate_limit_events_new (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE')),
  subject_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
) STRICT;
INSERT INTO rate_limit_events_new (id, scope, subject_user_id, occurred_at) SELECT id, scope, subject_user_id, occurred_at FROM rate_limit_events;
DROP TABLE rate_limit_events;
ALTER TABLE rate_limit_events_new RENAME TO rate_limit_events;
CREATE INDEX rate_limit_events_subject ON rate_limit_events (scope, subject_user_id, occurred_at);
