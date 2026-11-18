-- Microchip unico en todo el sistema (Feature 004, T553; REQ-PET4-001, INV-PET4-001).
-- @implements REQ-PET4-001, INV-PET4-001, EDGE-008
-- Equivale a la 0008 de SQLite. Sin BEGIN/COMMIT: el migrador (T429) corre cada migracion en una transaccion y registra la version.
-- COMPROBACION PREVIA: si hay microchips repetidos entre propietarios la migracion ABORTA antes de tocar el esquema; el mensaje solo trae el
--   conteo de grupos (nunca un microchip ni un id) y exige la resolucion de Neo (SC-CAT-025).
DO $$
DECLARE
  clashes INTEGER;
BEGIN
  SELECT count(*) INTO clashes FROM (SELECT microchip_id FROM pets WHERE microchip_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) g;
  IF clashes > 0 THEN
    RAISE EXCEPTION 'Migracion 0004 abortada: % grupo(s) de mascotas con el mismo microchip entre propietarios; Neo debe resolverlos antes de migrar', clashes;
  END IF;
END
$$;

DROP INDEX pets_owner_microchip;
CREATE UNIQUE INDEX pets_microchip_global ON pets (microchip_id) WHERE microchip_id IS NOT NULL;
