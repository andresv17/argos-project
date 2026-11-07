/**
 * Transactional storage repository port supporting atomic snapshot read/write and rollback.
 *
 * @implements INV-ARCH-004, INV-PET-003, INV-BACKUP-001, STATE-BACKUP-001, REQ-PET-001, REQ-PET-003, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, REQ-BACKUP-001, REQ-BACKUP-002
 */

import type {
  PetProfile,
  WeightRecord,
  BodyMeasurementRecord,
  VaccinationRecord,
  DewormingRecord,
  MedicalVisitRecord,
  CustomParameterRecord,
  BackupEnvelopeV2,
} from '../../generated/index.ts';

export interface DatabaseSnapshot {
  readonly pets: readonly PetProfile[];
  readonly records: BackupEnvelopeV2['records'];
}

export interface StorageRepositoryPort {
  listPets(): PetProfile[];
  getPetById(petId: string): PetProfile | null;
  savePet(pet: PetProfile): void;

  listWeightsByPet(petId: string): WeightRecord[];
  saveWeightRecord(record: WeightRecord): void;

  listBodyMeasurementsByPet(petId: string): BodyMeasurementRecord[];
  saveBodyMeasurementRecord(record: BodyMeasurementRecord): void;

  listVaccinationsByPet(petId: string): VaccinationRecord[];
  saveVaccinationRecord(record: VaccinationRecord): void;

  listDewormingsByPet(petId: string): DewormingRecord[];
  saveDewormingRecord(record: DewormingRecord): void;

  listMedicalVisitsByPet(petId: string): MedicalVisitRecord[];
  saveMedicalVisitRecord(record: MedicalVisitRecord): void;

  listCustomParametersByPet(petId: string): CustomParameterRecord[];
  saveCustomParameterRecord(record: CustomParameterRecord): void;

  /**
   * Captures a deep, immutable snapshot of the entire state prior to atomic operations [STATE-BACKUP-001].
   */
  createSnapshot(): DatabaseSnapshot;

  /**
   * Atomically replaces the entire persisted state with a verified snapshot, or throws on storage failure [INV-BACKUP-001].
   */
  replaceWithSnapshot(snapshot: DatabaseSnapshot): void;
}
