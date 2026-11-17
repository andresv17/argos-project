-- Microchip unico en todo el sistema (Feature 004, T553; REQ-PET4-001, INV-PET4-001).
-- @implements REQ-PET4-001, INV-PET4-001, EDGE-008
-- COMPROBACION PREVIA: sqlite-database.ts (`MIGRATION_PRECHECKS`) cuenta los microchips repetidos entre propietarios y ABORTA antes de ejecutar este
--   archivo si hay alguno; el mensaje solo trae el conteo de grupos (nunca un microchip ni un id) y exige la resolucion de Neo (SC-CAT-025). La
--   migracion corre en una transaccion: si algo falla la base queda intacta y schema_migrations no la anota.
-- El indice por propietario se reemplaza por uno global parcial: un duplicado, propio o ajeno, viola `pets_microchip_global`
--   (SQLite: «UNIQUE constraint failed: pets.microchip_id»). El CHECK de 15 digitos de la columna no cambia.
DROP INDEX pets_owner_microchip;
CREATE UNIQUE INDEX pets_microchip_global ON pets (microchip_id) WHERE microchip_id IS NOT NULL;
