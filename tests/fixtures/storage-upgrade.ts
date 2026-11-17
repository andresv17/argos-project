import type { BackupEnvelopeV3, PetProfile } from '../../src/generated/index.ts';
import type { PetRecordCollections } from '../../src/domain/pet/pet-invariants.ts';

/**
 * Adaptador de datos de la 001 al esquema 3.0.0 solo para poder sembrar SQLite y la suite de repositorios (T214): las
 * especies DOG y CAT pasan a CANINE y FELINE y los campos nuevos de mascotas y registros toman valores neutros. No decide
 * reglas de negocio. T226 ya usa `upgradePet` de forma permanente en el estado canónico de las pruebas (especies y campos de
 * mascota); T255 (registros) sustituirá `upgradeRecords` por los fixtures de la 002. Las pruebas en memoria siguen usando los datos de la 001 tal cual.
 */
const SPECIES_001_TO_002: Record<string, string> = { DOG: 'CANINE', CAT: 'FELINE' };

export function upgradePet(pet: PetProfile): PetProfile {
  const raw = pet as unknown as Record<string, unknown>;
  return {
    speciesOther: null,
    birthDateIsEstimate: false,
    neutered: null,
    microchipId: null,
    ...raw,
    species: SPECIES_001_TO_002[raw['species'] as string] ?? raw['species'],
  } as unknown as PetProfile;
}

export function upgradeRecords(records: PetRecordCollections): PetRecordCollections {
  return {
    ...records,
    vaccinations: records.vaccinations.map((r) => ({ category: 'VACCINE', veterinarianName: null, veterinarianLicense: null, ...(r as object) })),
    dewormings: records.dewormings.map((r) => ({ category: 'DEWORMING', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, ...(r as object) })),
  } as unknown as PetRecordCollections;
}

export function upgradeEnvelope(envelope: BackupEnvelopeV3): BackupEnvelopeV3 {
  return { ...envelope, pets: envelope.pets.map((p) => upgradePet(p as unknown as PetProfile)) as unknown as BackupEnvelopeV3['pets'], records: upgradeRecords(envelope.records as unknown as PetRecordCollections) as unknown as BackupEnvelopeV3['records'] };
}

/**
 * Mascotas del sobre de la 001 con su `ownerUserId` (el tipo del sobre 3.0.0 no lo declara: la exportación 3.0.0 solo
 * lleva mascotas propias y el dueño se infiere). Los fixtures 001 sí lo traen y los repositorios lo exigen.
 */
export function envelopePets(envelope: BackupEnvelopeV3): PetProfile[] {
  return envelope.pets as unknown as PetProfile[];
}
