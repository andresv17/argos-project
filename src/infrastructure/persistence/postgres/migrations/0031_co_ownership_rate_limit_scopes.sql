-- Ambitos propios de limite de frecuencia de la co-propiedad en `rate_limit_events` (Feature 012, Bloque B, #22; B-4; H-02 y H-10 de trinity T1612; REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004).
-- @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004, ERR-RATE-LIMITED
-- Equivale a la 0035 de SQLite. Sin BEGIN/COMMIT: el migrador corre cada migracion en una transaccion y registra la version. Mismo patron que la 0006; sin perdida de datos.
-- COMPROBACION PREVIA: si hay eventos con un ambito fuera de los tres vigentes, o si falta la restriccion `rate_limit_events_scope_check`, la migracion ABORTA antes de tocar el esquema; el mensaje solo trae el conteo o el nombre de la restriccion.
DO $$
DECLARE
  unknown_scopes INTEGER;
BEGIN
  SELECT count(*) INTO unknown_scopes FROM rate_limit_events WHERE scope NOT IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE');
  IF unknown_scopes > 0 THEN
    RAISE EXCEPTION 'Migracion 0031 abortada: % evento(s) con un ambito desconocido en rate_limit_events; Neo debe resolverlos antes de migrar', unknown_scopes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'rate_limit_events'::regclass AND conname = 'rate_limit_events_scope_check' AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Migracion 0031 abortada: falta la restriccion rate_limit_events_scope_check en rate_limit_events';
  END IF;
END
$$;

ALTER TABLE rate_limit_events DROP CONSTRAINT rate_limit_events_scope_check;
ALTER TABLE rate_limit_events ADD CONSTRAINT rate_limit_events_scope_check CHECK (scope IN ('EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST'));
