/**
 * Application Use Cases for Pet Profile Management and Individual Pet Dashboard.
 * Strictly depends only on Domain and Generated Contracts via injected Ports [INV-ARCH-001, INV-ARCH-002, INV-ARCH-004].
 *
 * @implements REQ-PET-001, REQ-PET-002, REQ-PET-003, INV-PET-001, INV-PET-002, INV-PET-003, INV-PET-004, INV-REC-006, INV-SORT-001, STATE-PET-QUOTA-001, STATE-ALERT-001, ERR-PET-QUOTA-EXCEEDED, ERR-PET-NOT-FOUND, ERR-PET-FUTURE-BIRTHDATE, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001, INV-ARCH-002, INV-ARCH-004
 */

import {
  DomainError,
  validatePetProfileSchema,
  type CreatePetInput,
  type PetDashboardView,
  type PetListOverview,
  type PetProfile,
  type PetSummaryCardView,
  type UpdatePetInput,
} from '../../generated/index.ts';
import {
  evaluateDewormingAlerts,
  evaluateVaccinationAlerts,
  summarizeSanitaryAlerts,
} from '../../domain/alerts/sanitary-alert-evaluator.ts';
import {
  assertCanRegisterPetSpecies,
  assertCanUpdatePetSpecies,
  evaluatePetQuotaState,
} from '../../domain/pet/pet-invariants.ts';
import {
  computeWeightEvolutionSeries,
  validateNonEmptyTrimmedField,
} from '../../domain/records/record-invariants.ts';
import {
  calculatePetAge,
  validateBirthDateNotFuture,
} from '../../domain/shared/date-utils.ts';
import { sortHistoricalRecords } from '../../domain/sorting/deterministic-sorter.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { IdGeneratorPort } from '../ports/id-generator.port.ts';
import type { StorageRepositoryPort } from '../ports/storage-repository.port.ts';

/**
 * Registers a new pet enforcing the 4-pet total quota (max 2 DOG, max 2 CAT) and non-future birthDate.
 *
 * @implements REQ-PET-001, INV-PET-001, INV-PET-002, INV-REC-006, STATE-PET-QUOTA-001, ERR-PET-QUOTA-EXCEEDED, ERR-PET-FUTURE-BIRTHDATE, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001, INV-ARCH-002
 */
export class RegisterPetUseCase {
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

  public execute(input: CreatePetInput): PetProfile {
    const existingPets = this.repository.listPets();
    assertCanRegisterPetSpecies(existingPets, input.species);

    const name = validateNonEmptyTrimmedField(input.name, 'name', 50);
    const breed = validateNonEmptyTrimmedField(input.breed, 'breed', 60);
    const today = this.clock.todayIsoDate();
    validateBirthDateNotFuture(input.birthDate, today);

    const candidate: PetProfile = {
      id: this.idGenerator.nextId(),
      name,
      species: input.species,
      breed,
      birthDate: input.birthDate,
      sex: input.sex,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: this.clock.nowIsoTimestamp(),
    };

    const validated = validatePetProfileSchema(candidate);
    this.repository.savePet(validated);
    return validated;
  }
}

/**
 * Updates an existing pet profile enforcing species quota (INV-PET-004) and birthDate consistency.
 *
 * @implements REQ-PET-001, INV-PET-001, INV-PET-002, INV-PET-003, INV-PET-004, INV-REC-006, ERR-PET-NOT-FOUND, ERR-PET-QUOTA-EXCEEDED, ERR-PET-FUTURE-BIRTHDATE, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001
 */
export class UpdatePetUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;

  constructor(repository: StorageRepositoryPort, clock: ClockPort) {
    this.repository = repository;
    this.clock = clock;
  }

  public execute(input: UpdatePetInput): PetProfile {
    const existing = this.repository.getPetById(input.petId);
    if (!existing) {
      throw new DomainError(
        'ERR-PET-NOT-FOUND',
        `No existe ninguna mascota con id ${input.petId}.`,
        'petId'
      );
    }

    const targetSpecies = input.species ?? existing.species;
    if (targetSpecies !== existing.species) {
      const allPets = this.repository.listPets();
      assertCanUpdatePetSpecies(allPets, existing.id, targetSpecies);
    }

    const targetName =
      input.name !== undefined
        ? validateNonEmptyTrimmedField(input.name, 'name', 50)
        : existing.name;
    const targetBreed =
      input.breed !== undefined
        ? validateNonEmptyTrimmedField(input.breed, 'breed', 60)
        : existing.breed;
    const targetBirthDate = input.birthDate ?? existing.birthDate;
    validateBirthDateNotFuture(targetBirthDate, this.clock.todayIsoDate());

    const updatedCandidate: PetProfile = {
      id: existing.id,
      name: targetName,
      species: targetSpecies,
      breed: targetBreed,
      birthDate: targetBirthDate,
      sex: input.sex ?? existing.sex,
      avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : existing.avatarUrl,
      createdAt: existing.createdAt,
    };

    const validated = validatePetProfileSchema(updatedCandidate);
    this.repository.savePet(validated);
    return validated;
  }
}

/**
 * Retrieves the complete isolated technical dashboard for a single pet, including computed age,
 * active sanitary alerts summary, and the 6 deterministically sorted historical record collections.
 *
 * @implements REQ-PET-002, REQ-PET-003, INV-PET-003, INV-SORT-001, STATE-ALERT-001, ERR-PET-NOT-FOUND, INV-ARCH-001
 */
export class GetPetDashboardUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;

  constructor(repository: StorageRepositoryPort, clock: ClockPort) {
    this.repository = repository;
    this.clock = clock;
  }

  public execute(petId: string): PetDashboardView {
    const profile = this.repository.getPetById(petId);
    if (!profile) {
      throw new DomainError(
        'ERR-PET-NOT-FOUND',
        `No existe ninguna mascota con id ${petId}.`,
        'petId'
      );
    }

    const today = this.clock.todayIsoDate();
    const computedAge = calculatePetAge(profile.birthDate, today);

    const rawWeights = this.repository.listWeightsByPet(petId);
    const weights = computeWeightEvolutionSeries(rawWeights);

    const bodyMeasurements = sortHistoricalRecords(
      this.repository.listBodyMeasurementsByPet(petId)
    );

    const vaccinations = evaluateVaccinationAlerts(
      this.repository.listVaccinationsByPet(petId),
      today
    );

    const dewormings = evaluateDewormingAlerts(
      this.repository.listDewormingsByPet(petId),
      today
    );

    const medicalVisits = sortHistoricalRecords(
      this.repository.listMedicalVisitsByPet(petId)
    );

    const customParameters = sortHistoricalRecords(
      this.repository.listCustomParametersByPet(petId)
    );

    const alertsSummary = summarizeSanitaryAlerts(vaccinations, dewormings);

    return {
      profile,
      computedAge,
      alertsSummary,
      weights,
      bodyMeasurements,
      vaccinations,
      dewormings,
      medicalVisits,
      customParameters,
    };
  }
}

/**
 * Lists all registered pets (up to 4) along with global quota state, computed age, and alert counters
 * for the PetSelectorBar UI.
 *
 * @implements REQ-PET-002, REQ-PET-003, REQ-UI-001, STATE-PET-QUOTA-001, STATE-ALERT-001, INV-ARCH-001
 */
export class ListPetsOverviewUseCase {
  private readonly repository: StorageRepositoryPort;
  private readonly clock: ClockPort;

  constructor(repository: StorageRepositoryPort, clock: ClockPort) {
    this.repository = repository;
    this.clock = clock;
  }

  public execute(): PetListOverview {
    const allPets = this.repository.listPets();
    const quota = evaluatePetQuotaState(allPets);
    const today = this.clock.todayIsoDate();

    const summaries: PetSummaryCardView[] = allPets.map((profile) => {
      const computedAge = calculatePetAge(profile.birthDate, today);
      const vaccinations = evaluateVaccinationAlerts(
        this.repository.listVaccinationsByPet(profile.id),
        today
      );
      const dewormings = evaluateDewormingAlerts(
        this.repository.listDewormingsByPet(profile.id),
        today
      );
      const alertsSummary = summarizeSanitaryAlerts(vaccinations, dewormings);
      const weights = computeWeightEvolutionSeries(
        this.repository.listWeightsByPet(profile.id)
      );

      return {
        profile,
        computedAge,
        alertsSummary,
        latestWeightKg: weights[0]?.weightKg ?? null,
      };
    });

    return {
      quota,
      pets: summaries,
    };
  }
}
