-- Modelo de mascota y especies de la Feature 002 (Rebanada 2, T230). @implements REQ-MIG-001, INV-PET-005, INV-ARCH-005 Parte de especies de REQ-MIG-001; se aplica entera
-- en una transaccion (runMigrations): si una sentencia falla, no queda nada a medias (INV-ARCH-005).
-- REQ-MIG-001: DOG pasa a CANINE y CAT a FELINE; los campos nuevos de la mascota toman sus neutros (speciesOther nulo,
--   birthDateIsEstimate falso, neutered y microchipId nulos). Una especie desconocida hace fallar el CHECK de `species`
--   y, con el, toda la migracion (falla en voz alta, no se adivina).
-- INV-PET2-001: species solo admite las 8 aprobadas y species_other es no nulo exactamente cuando species es OTHER.
-- REQ-PET2-001: microchip_id de 15 digitos, unico por propietario (indice parcial) y no entre cuentas.
-- ADR-002-09 / INV-REC2-002: weights.weight_grams entero (gramos), 1 a 150000; el objeto `data` conserva weightKg.
--   La tabla se reconstruye para que la columna sea NOT NULL; `weights` no tiene tablas hijas, asi que no hay cascada.
--   `pets` NO se reconstruye (sus hijas la referencian con ON DELETE CASCADE): se le anaden columnas.
--   T230 PENDIENTE: la fila de auditoria MIGRATION (REQ-AUD-001) llega con la rebanada de auditoria (T265);
--   `schema_migrations` registra esta migracion con el nombre del archivo, como las anteriores.

ALTER TABLE pets ADD COLUMN species TEXT NOT NULL DEFAULT 'CANINE'
  CHECK (species IN ('CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'));
ALTER TABLE pets ADD COLUMN species_other TEXT
  CHECK ((species = 'OTHER') = (species_other IS NOT NULL));
ALTER TABLE pets ADD COLUMN neutered INTEGER CHECK (neutered IN (0, 1));
ALTER TABLE pets ADD COLUMN microchip_id TEXT
  CHECK (microchip_id IS NULL OR (length(microchip_id) = 15 AND microchip_id NOT GLOB '*[^0-9]*'));
ALTER TABLE pets ADD COLUMN birth_date_is_estimate INTEGER NOT NULL DEFAULT 0 CHECK (birth_date_is_estimate IN (0, 1));

UPDATE pets
  SET species = CASE json_extract(data, '$.species') WHEN 'DOG' THEN 'CANINE' WHEN 'CAT' THEN 'FELINE' ELSE json_extract(data, '$.species') END;

UPDATE pets SET data = json_set(data, '$.species', species);
UPDATE pets SET data = json_set(data, '$.speciesOther', json('null')) WHERE json_type(data, '$.speciesOther') IS NULL;
UPDATE pets SET data = json_set(data, '$.birthDateIsEstimate', json('false')) WHERE json_type(data, '$.birthDateIsEstimate') IS NULL;
UPDATE pets SET data = json_set(data, '$.neutered', json('null')) WHERE json_type(data, '$.neutered') IS NULL;
UPDATE pets SET data = json_set(data, '$.microchipId', json('null')) WHERE json_type(data, '$.microchipId') IS NULL;

CREATE UNIQUE INDEX pets_owner_microchip ON pets (owner_user_id, microchip_id) WHERE microchip_id IS NOT NULL;

CREATE TABLE weights_v3 (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  weight_grams INTEGER NOT NULL CHECK (weight_grams BETWEEN 1 AND 150000)
) STRICT;
INSERT INTO weights_v3 (id, pet_id, data, weight_grams)
  SELECT id, pet_id, data, CAST(ROUND(json_extract(data, '$.weightKg') * 1000) AS INTEGER) FROM weights;
DROP TABLE weights;
ALTER TABLE weights_v3 RENAME TO weights;
CREATE INDEX weights_pet_id ON weights (pet_id);
