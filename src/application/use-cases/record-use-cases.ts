/**
 * Application Use Cases for the 6 Clinical & Biometric Historical Record Modules.
 * Strictly isolated per petId and free of direct clock or random entropy [INV-ARCH-001, INV-ARCH-002, INV-PET-003].
 *
 * @implements REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006, INV-PET-003, INV-REC-001, INV-REC-002, INV-REC-003, INV-REC-004, INV-REC-005, INV-REC-006, STATE-ALERT-001, ERR-PET-NOT-FOUND, ERR-REC-DATE-BEFORE-BIRTH, ERR-REC-FUTURE-EVENT-DATE, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE, ERR-REC-INVALID-BOOSTER-DATE, ERR-REC-INVALID-NEXT-DOSE-DATE, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004
 */

import {
  DomainError,
  type BodyMeasurementRecord,
  type CreateBodyMeasurementInput,
  type CreateCustomParameterInput,
  type CreateDewormingInput,
  type CreateMedicalVisitInput,
  type CreateVaccinationInput,
  type CreateWeightRecordInput,
  type CustomParameterRecord,
  type DewormingEntryView,
  type DewormingRecord,
  type MedicalVisitRecord,
  type PetProfile,
  type VaccinationEntryView,
  type VaccinationRecord,
  type WeightEntryView,
  type WeightRecord,
} from '../../generated/index.ts';
import {
  evaluateDewormingAlerts,
  evaluateVaccinationAlerts,
} from '../../domain/alerts/sanitary-alert-evaluator.ts';
import {
  computeWeightEvolutionSeries,
  validateBodyMeasurementRecordDomain,
  validateCustomParameterRecordDomain,
  validateDewormingRecordDomain,
  validateMedicalVisitRecordDomain,
  validateVaccinationRecordDomain,
  validateWeightRecordDomain,
} from '../../domain/records/record-invariants.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { IdGeneratorPort } from '../ports/id-generator.port.ts';
import type { StorageRepositoryPort } from '../ports/storage-repository.port.ts';

function requireExistingPet(repository: StorageRepositoryPort, petId: string): PetProfile {
  const pet = repository.getPetById(petId);
  if (!pet) {
    throw new DomainError(
      'ERR-PET-NOT-FOUND',
      `No existe ninguna mascota registrada con id ${petId}.`,
      'petId'
    );
  }
  return pet;
}

/**
 * Use Case 1: Control de Peso (Weight Record) [REQ-REC-001, INV-REC-001, INV-REC-002, INV-PET-003].
 *
 * @implements REQ-REC-001, INV-PET-003, INV-REC-001, INV-REC-002, ERR-PET-NOT-FOUND, ERR-REC-WEIGHT-OUT-OF-RANGE, INV-ARCH-001, INV-ARCH-002
 */
export class AddWeightRecordUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateWeightRecordInput): WeightEntryView {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: WeightRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      recordedAt: input.recordedAt,
      weightKg: input.weightKg,
      notes: input.notes ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateWeightRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveWeightRecord(validated);

    const allWeights = this.repository.listWeightsByPet(pet.id);
    const series = computeWeightEvolutionSeries(allWeights);
    const createdEntry = series.find((entry) => entry.id === validated.id);

    return (
      createdEntry ?? {
        ...validated,
        deltaKg: null,
      }
    );
  }
}

/**
 * Use Case 2: Medidas Corporales (Body Measurements: neckCm, chestCm, backLengthCm, waistCm)
 * [REQ-REC-002, INV-REC-001, INV-REC-003, INV-PET-003].
 *
 * @implements REQ-REC-002, INV-PET-003, INV-REC-001, INV-REC-003, ERR-PET-NOT-FOUND, ERR-REC-MEASUREMENT-OUT-OF-RANGE, INV-ARCH-001, INV-ARCH-002
 */
export class AddBodyMeasurementUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateBodyMeasurementInput): BodyMeasurementRecord {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: BodyMeasurementRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      recordedAt: input.recordedAt,
      neckCm: input.neckCm,
      chestCm: input.chestCm,
      backLengthCm: input.backLengthCm,
      waistCm: input.waistCm,
      notes: input.notes ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateBodyMeasurementRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveBodyMeasurementRecord(validated);
    return validated;
  }
}

/**
 * Use Case 3: Vacunación (Vaccination Record + STATE-ALERT-001 evaluation)
 * [REQ-REC-003, INV-REC-001, INV-REC-004, INV-REC-006, STATE-ALERT-001].
 *
 * @implements REQ-REC-003, INV-PET-003, INV-REC-001, INV-REC-004, INV-REC-006, STATE-ALERT-001, ERR-PET-NOT-FOUND, ERR-REC-INVALID-BOOSTER-DATE, INV-ARCH-001, INV-ARCH-002
 */
export class AddVaccinationUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateVaccinationInput): VaccinationEntryView {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: VaccinationRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      vaccineName: input.vaccineName,
      appliedAt: input.appliedAt,
      nextBoosterAt: input.nextBoosterAt,
      batchOrClinic: input.batchOrClinic ?? null,
      notes: input.notes ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateVaccinationRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveVaccinationRecord(validated);

    const evaluated = evaluateVaccinationAlerts(
      this.repository.listVaccinationsByPet(pet.id),
      today
    );
    return evaluated.find((v) => v.id === validated.id)!;
  }
}

/**
 * Use Case 4: Desparasitación (Deworming Record + STATE-ALERT-001 evaluation)
 * [REQ-REC-004, INV-REC-001, INV-REC-005, INV-REC-006, STATE-ALERT-001].
 *
 * @implements REQ-REC-004, INV-PET-003, INV-REC-001, INV-REC-005, INV-REC-006, STATE-ALERT-001, ERR-PET-NOT-FOUND, ERR-REC-INVALID-NEXT-DOSE-DATE, INV-ARCH-001, INV-ARCH-002
 */
export class AddDewormingUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateDewormingInput): DewormingEntryView {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: DewormingRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      productBrand: input.productBrand,
      dewormingType: input.dewormingType,
      appliedAt: input.appliedAt,
      nextSuggestedDoseAt: input.nextSuggestedDoseAt,
      notes: input.notes ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateDewormingRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveDewormingRecord(validated);

    const evaluated = evaluateDewormingAlerts(
      this.repository.listDewormingsByPet(pet.id),
      today
    );
    return evaluated.find((d) => d.id === validated.id)!;
  }
}

/**
 * Use Case 5: Citas y Controles Médicos (Medical Visit Record)
 * [REQ-REC-005, INV-REC-001, INV-REC-006, INV-PET-003].
 *
 * @implements REQ-REC-005, INV-PET-003, INV-REC-001, INV-REC-006, ERR-PET-NOT-FOUND, INV-ARCH-001, INV-ARCH-002
 */
export class AddMedicalVisitUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateMedicalVisitInput): MedicalVisitRecord {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: MedicalVisitRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      visitDate: input.visitDate,
      reason: input.reason,
      diagnosis: input.diagnosis,
      treatment: input.treatment,
      clinicOrVet: input.clinicOrVet,
      observations: input.observations ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateMedicalVisitRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveMedicalVisitRecord(validated);
    return validated;
  }
}

/**
 * Use Case 6: Parámetros Adicionales (Custom Parameter Record)
 * [REQ-REC-006, INV-REC-001, INV-REC-006, INV-PET-003].
 *
 * @implements REQ-REC-006, INV-PET-003, INV-REC-001, INV-REC-006, ERR-PET-NOT-FOUND, INV-ARCH-001, INV-ARCH-002
 */
export class AddCustomParameterUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;
  private readonly idGenerator: IdGeneratorPort;

  constructor(
    repository: StorageRepositoryPort,
    clock: ClockPort,
    idGenerator: IdGeneratorPort
  ) {
    this.repository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  public execute(input: CreateCustomParameterInput): CustomParameterRecord {
    const pet = requireExistingPet(this.repository, input.petId);
    const today = this.clock.todayIsoDate();

    const candidate: CustomParameterRecord = {
      id: this.idGenerator.nextId(),
      petId: pet.id,
      recordedAt: input.recordedAt,
      category: input.category,
      title: input.title,
      description: input.description,
      notes: input.notes ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validateCustomParameterRecordDomain(candidate, pet.birthDate, today);
    this.repository.saveCustomParameterRecord(validated);
    return validated;
  }
}
