/**
 * Transactional Repository Implementations (InMemory & LocalStorage) with Runtime Schema Validation
 * and Atomic Rollback Snapshots.
 *
 * @implements INV-ARCH-003, INV-ARCH-004, REQ-BACKUP-001, REQ-BACKUP-002, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-ATOMIC-ROLLBACK, ERR-SCHEMA-VALIDATION-FAILED
 */

import type {
  DatabaseSnapshot,
  StorageRepositoryPort,
} from '../../application/ports/storage-repository.port.ts';
import {
  DomainError,
  validateBodyMeasurementRecordSchema,
  validateCustomParameterRecordSchema,
  validateDewormingRecordSchema,
  validateMedicalVisitRecordSchema,
  validatePetProfileSchema,
  validateVaccinationRecordSchema,
  validateWeightRecordSchema,
  type BodyMeasurementRecord,
  type CustomParameterRecord,
  type DewormingRecord,
  type MedicalVisitRecord,
  type PetProfile,
  type VaccinationRecord,
  type WeightRecord,
} from '../../generated/index.ts';

function cloneSnapshot(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DatabaseSnapshot;
}

/**
 * In-memory transactional repository enforcing runtime schema validation on every boundary read/write.
 *
 * @implements INV-ARCH-004, INV-BACKUP-001, STATE-BACKUP-001
 */
export class InMemoryTransactionalRepository implements StorageRepositoryPort {
  private pets: Map<string, PetProfile> = new Map();
  private weights: Map<string, WeightRecord> = new Map();
  private bodyMeasurements: Map<string, BodyMeasurementRecord> = new Map();
  private vaccinations: Map<string, VaccinationRecord> = new Map();
  private dewormings: Map<string, DewormingRecord> = new Map();
  private medicalVisits: Map<string, MedicalVisitRecord> = new Map();
  private customParameters: Map<string, CustomParameterRecord> = new Map();

  public listPets(): PetProfile[] {
    return Array.from(this.pets.values()).map((p) => validatePetProfileSchema(p));
  }

  public getPetById(petId: string): PetProfile | null {
    const found = this.pets.get(petId);
    return found ? validatePetProfileSchema(found) : null;
  }

  public savePet(pet: PetProfile): void {
    const validated = validatePetProfileSchema(pet);
    this.pets.set(validated.id, validated);
  }

  public listWeightsByPet(petId: string): WeightRecord[] {
    return Array.from(this.weights.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateWeightRecordSchema(r));
  }

  public saveWeightRecord(record: WeightRecord): void {
    const validated = validateWeightRecordSchema(record);
    this.weights.set(validated.id, validated);
  }

  public listBodyMeasurementsByPet(petId: string): BodyMeasurementRecord[] {
    return Array.from(this.bodyMeasurements.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateBodyMeasurementRecordSchema(r));
  }

  public saveBodyMeasurementRecord(record: BodyMeasurementRecord): void {
    const validated = validateBodyMeasurementRecordSchema(record);
    this.bodyMeasurements.set(validated.id, validated);
  }

  public listVaccinationsByPet(petId: string): VaccinationRecord[] {
    return Array.from(this.vaccinations.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateVaccinationRecordSchema(r));
  }

  public saveVaccinationRecord(record: VaccinationRecord): void {
    const validated = validateVaccinationRecordSchema(record);
    this.vaccinations.set(validated.id, validated);
  }

  public listDewormingsByPet(petId: string): DewormingRecord[] {
    return Array.from(this.dewormings.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateDewormingRecordSchema(r));
  }

  public saveDewormingRecord(record: DewormingRecord): void {
    const validated = validateDewormingRecordSchema(record);
    this.dewormings.set(validated.id, validated);
  }

  public listMedicalVisitsByPet(petId: string): MedicalVisitRecord[] {
    return Array.from(this.medicalVisits.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateMedicalVisitRecordSchema(r));
  }

  public saveMedicalVisitRecord(record: MedicalVisitRecord): void {
    const validated = validateMedicalVisitRecordSchema(record);
    this.medicalVisits.set(validated.id, validated);
  }

  public listCustomParametersByPet(petId: string): CustomParameterRecord[] {
    return Array.from(this.customParameters.values())
      .filter((r) => r.petId === petId)
      .map((r) => validateCustomParameterRecordSchema(r));
  }

  public saveCustomParameterRecord(record: CustomParameterRecord): void {
    const validated = validateCustomParameterRecordSchema(record);
    this.customParameters.set(validated.id, validated);
  }

  public createSnapshot(): DatabaseSnapshot {
    return cloneSnapshot({
      pets: Array.from(this.pets.values()),
      records: {
        weights: Array.from(this.weights.values()),
        bodyMeasurements: Array.from(this.bodyMeasurements.values()),
        vaccinations: Array.from(this.vaccinations.values()),
        dewormings: Array.from(this.dewormings.values()),
        medicalVisits: Array.from(this.medicalVisits.values()),
        customParameters: Array.from(this.customParameters.values()),
      },
    });
  }

  public replaceWithSnapshot(snapshot: DatabaseSnapshot): void {
    const cloned = cloneSnapshot(snapshot);
    const nextPets = new Map<string, PetProfile>();
    const nextWeights = new Map<string, WeightRecord>();
    const nextMeasurements = new Map<string, BodyMeasurementRecord>();
    const nextVaccinations = new Map<string, VaccinationRecord>();
    const nextDewormings = new Map<string, DewormingRecord>();
    const nextVisits = new Map<string, MedicalVisitRecord>();
    const nextCustom = new Map<string, CustomParameterRecord>();

    for (const p of cloned.pets) {
      const val = validatePetProfileSchema(p);
      nextPets.set(val.id, val);
    }
    for (const w of cloned.records.weights) {
      const val = validateWeightRecordSchema(w);
      nextWeights.set(val.id, val);
    }
    for (const m of cloned.records.bodyMeasurements) {
      const val = validateBodyMeasurementRecordSchema(m);
      nextMeasurements.set(val.id, val);
    }
    for (const v of cloned.records.vaccinations) {
      const val = validateVaccinationRecordSchema(v);
      nextVaccinations.set(val.id, val);
    }
    for (const d of cloned.records.dewormings) {
      const val = validateDewormingRecordSchema(d);
      nextDewormings.set(val.id, val);
    }
    for (const mv of cloned.records.medicalVisits) {
      const val = validateMedicalVisitRecordSchema(mv);
      nextVisits.set(val.id, val);
    }
    for (const c of cloned.records.customParameters) {
      const val = validateCustomParameterRecordSchema(c);
      nextCustom.set(val.id, val);
    }

    this.pets = nextPets;
    this.weights = nextWeights;
    this.bodyMeasurements = nextMeasurements;
    this.vaccinations = nextVaccinations;
    this.dewormings = nextDewormings;
    this.medicalVisits = nextVisits;
    this.customParameters = nextCustom;
  }
}

export interface KeyValueStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * LocalStorage-backed transactional repository with in-memory rollback protection.
 *
 * @implements INV-ARCH-004, INV-BACKUP-001, STATE-BACKUP-001, ERR-BACKUP-ATOMIC-ROLLBACK
 */
export class LocalStorageTransactionalRepository implements StorageRepositoryPort {
  private readonly storageKey: string;
  private readonly backend: KeyValueStorageBackend;
  private readonly memoryDelegate: InMemoryTransactionalRepository;

  constructor(backend: KeyValueStorageBackend, storageKey = 'argos_pet_health_db_v1') {
    this.backend = backend;
    this.storageKey = storageKey;
    this.memoryDelegate = new InMemoryTransactionalRepository();
    this.hydrateFromBackend();
  }

  private hydrateFromBackend(): void {
    const raw = this.backend.getItem(this.storageKey);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as DatabaseSnapshot;
    this.memoryDelegate.replaceWithSnapshot(parsed);
  }

  private flushToBackend(): void {
    try {
      const snapshot = this.memoryDelegate.createSnapshot();
      this.backend.setItem(this.storageKey, JSON.stringify(snapshot));
    } catch {
      throw new DomainError(
        'ERR-BACKUP-ATOMIC-ROLLBACK',
        'Fallo al persistir en almacenamiento local; se ejecutó rollback al snapshot previo.'
      );
    }
  }

  public listPets(): PetProfile[] {
    return this.memoryDelegate.listPets();
  }

  public getPetById(petId: string): PetProfile | null {
    return this.memoryDelegate.getPetById(petId);
  }

  public savePet(pet: PetProfile): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.savePet(pet);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listWeightsByPet(petId: string): WeightRecord[] {
    return this.memoryDelegate.listWeightsByPet(petId);
  }

  public saveWeightRecord(record: WeightRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveWeightRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listBodyMeasurementsByPet(petId: string): BodyMeasurementRecord[] {
    return this.memoryDelegate.listBodyMeasurementsByPet(petId);
  }

  public saveBodyMeasurementRecord(record: BodyMeasurementRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveBodyMeasurementRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listVaccinationsByPet(petId: string): VaccinationRecord[] {
    return this.memoryDelegate.listVaccinationsByPet(petId);
  }

  public saveVaccinationRecord(record: VaccinationRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveVaccinationRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listDewormingsByPet(petId: string): DewormingRecord[] {
    return this.memoryDelegate.listDewormingsByPet(petId);
  }

  public saveDewormingRecord(record: DewormingRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveDewormingRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listMedicalVisitsByPet(petId: string): MedicalVisitRecord[] {
    return this.memoryDelegate.listMedicalVisitsByPet(petId);
  }

  public saveMedicalVisitRecord(record: MedicalVisitRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveMedicalVisitRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public listCustomParametersByPet(petId: string): CustomParameterRecord[] {
    return this.memoryDelegate.listCustomParametersByPet(petId);
  }

  public saveCustomParameterRecord(record: CustomParameterRecord): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.saveCustomParameterRecord(record);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }

  public createSnapshot(): DatabaseSnapshot {
    return this.memoryDelegate.createSnapshot();
  }

  public replaceWithSnapshot(snapshot: DatabaseSnapshot): void {
    const previous = this.memoryDelegate.createSnapshot();
    try {
      this.memoryDelegate.replaceWithSnapshot(snapshot);
      this.flushToBackend();
    } catch (err) {
      this.memoryDelegate.replaceWithSnapshot(previous);
      throw err;
    }
  }
}
