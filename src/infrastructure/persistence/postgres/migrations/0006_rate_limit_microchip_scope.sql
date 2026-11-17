-- Ambito MICROCHIP_DUPLICATE en `rate_limit_events` (Feature 004, T556/T557; REQ-PET4-002, ADR-004-04, SC-CAT-029).
-- @implements REQ-PET4-002, ERR-RATE-LIMITED
-- Equivale a la 0010 de SQLite. Sin BEGIN/COMMIT: el migrador (T429) corre cada migracion en una transaccion y registra la version.
-- COMPROBACION PREVIA: si hay eventos con un ambito fuera de los tres permitidos, o si falta la restriccion `rate_limit_events_scope_check`, la
--   migracion ABORTA antes de tocar el esquema; el mensaje solo trae el conteo o el nombre de la restriccion (nunca un id ni un dato).
-- Numeracion 0006: la 0005 queda reservada a la migracion de medios (T574).
DO $$
DECLARE
  unknown_scopes INTEGER;
BEGIN
  SELECT count(*) INTO unknown_scopes FROM rate_limit_events WHERE scope NOT IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE');
  IF unknown_scopes > 0 THEN
    RAISE EXCEPTION 'Migracion 0006 abortada: % evento(s) con un ambito desconocido en rate_limit_events; Neo debe resolverlos antes de migrar', unknown_scopes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'rate_limit_events'::regclass AND conname = 'rate_limit_events_scope_check' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Migracion 0006 abortada: falta la restriccion rate_limit_events_scope_check en rate_limit_events';
  END IF;
END
$$;

ALTER TABLE rate_limit_events DROP CONSTRAINT rate_limit_events_scope_check;
ALTER TABLE rate_limit_events ADD CONSTRAINT rate_limit_events_scope_check CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE'));
