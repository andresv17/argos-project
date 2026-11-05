/**
 * Pure domain invariants and quota state machine for Pet Profiles.
 * Enforces max 4 pets total: max 2 DOG and max 2 CAT.
 *
 * @implements REQ-PET-001, INV-PET-001, INV-PET-002, INV-PET-004, INV-REC-006, STATE-PET-QUOTA-001, ERR-PET-QUOTA-EXCEEDED, ERR-PET-FUTURE-BIRTHDATE, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001, INV-ARCH-004
 */

import {
  DomainError,
  validatePetProfileSchema,
  type PetProfile,
  type PetQuotaStatus,
  type Species,
} from '../../generated/index.ts';
import { validateBirthDateNotFuture } from '../shared/date-utils.ts';

export const MAX_TOTAL_PETS = 4;
export const MAX_DOGS_COUNT = 2;
export const MAX_CATS_COUNT = 2;

/**
 * Evaluates the current state of the Pet Quota state machine (STATE-PET-QUOTA-001).
 *
 * @implements STATE-PET-QUOTA-001, INV-PET-001
 */
export function evaluatePetQuotaState(existingPets: readonly PetProfile[]): PetQuotaStatus {
  let dogsCount = 0;
  let catsCount = 0;

  for (const pet of existingPets) {
    if (pet.species === 'DOG') {
      dogsCount += 1;
    } else if (pet.species === 'CAT') {
      catsCount += 1;
    }
  }

  const totalPets = dogsCount + catsCount;
  const canAddDog = totalPets < MAX_TOTAL_PETS && dogsCount < MAX_DOGS_COUNT;
  const canAddCat = totalPets < MAX_TOTAL_PETS && catsCount < MAX_CATS_COUNT;

  if (dogsCount === 0 && catsCount === 0) {
    return {
      state: 'EMPTY',
      totalPets: 0,
      dogsCount: 0,
      catsCount: 0,
      canAddDog: true,
      canAddCat: true,
    };
  }

  if (dogsCount === MAX_DOGS_COUNT && catsCount === MAX_CATS_COUNT) {
    return {
      state: 'FULL_QUOTA',
      totalPets,
      dogsCount,
      catsCount,
      canAddDog: false,
      canAddCat: false,
    };
  }

  return {
    state: 'PARTIAL',
    totalPets,
    dogsCount,
    catsCount,
    canAddDog,
    canAddCat,
  };
}

/**
 * Validates that adding a new pet of the target species does not exceed the global quota
 * (max 4 pets total, max 2 DOG, max 2 CAT).
 *
 * @implements INV-PET-001, STATE-PET-QUOTA-001, ERR-PET-QUOTA-EXCEEDED
 */
export function assertCanRegisterPetSpecies(
  existingPets: readonly PetProfile[],
  newSpecies: Species
): void {
  const quota = evaluatePetQuotaState(existingPets);

  if (quota.totalPets >= MAX_TOTAL_PETS) {
    throw new DomainError(
      'ERR-PET-QUOTA-EXCEEDED',
      `Cupo máximo total de ${MAX_TOTAL_PETS} mascotas alcanzado (2 perros y 2 gatos).`,
      'species'
    );
  }

  if (newSpecies === 'DOG' && !quota.canAddDog) {
    throw new DomainError(
      'ERR-PET-QUOTA-EXCEEDED',
      `Cupo máximo de ${MAX_DOGS_COUNT} perros (DOG) alcanzado.`,
      'species'
    );
  }

  if (newSpecies === 'CAT' && !quota.canAddCat) {
    throw new DomainError(
      'ERR-PET-QUOTA-EXCEEDED',
      `Cupo máximo de ${MAX_CATS_COUNT} gatos (CAT) alcanzado.`,
      'species'
    );
  }
}

/**
 * Validates that updating an existing pet's species does not exceed the target species quota.
 *
 * @implements INV-PET-004, INV-PET-001, STATE-PET-QUOTA-001, ERR-PET-QUOTA-EXCEEDED
 */
export function assertCanUpdatePetSpecies(
  existingPets: readonly PetProfile[],
  petIdToUpdate: string,
  targetSpecies: Species
): void {
  const otherPets = existingPets.filter((p) => p.id !== petIdToUpdate);
  assertCanRegisterPetSpecies(otherPets, targetSpecies);
}

/**
 * Validates that an entire collection of pets satisfies INV-PET-001 (<= 4 total, <= 2 DOG, <= 2 CAT)
 * and INV-PET-002 (birthDate <= currentDate).
 *
 * @implements REQ-PET-001, INV-PET-001, INV-PET-002, ERR-PET-QUOTA-EXCEEDED, ERR-PET-FUTURE-BIRTHDATE
 */
export function validatePetCollectionInvariants(
  pets: readonly PetProfile[],
  currentDate: string
): void {
  let dogsCount = 0;
  let catsCount = 0;

  for (const pet of pets) {
    validatePetProfileSchema(pet);
    validateBirthDateNotFuture(pet.birthDate, currentDate);
    if (pet.species === 'DOG') {
      dogsCount += 1;
    } else {
      catsCount += 1;
    }
  }

  if (pets.length > MAX_TOTAL_PETS || dogsCount > MAX_DOGS_COUNT || catsCount > MAX_CATS_COUNT) {
    throw new DomainError(
      'ERR-PET-QUOTA-EXCEEDED',
      `La colección de mascotas viola el cupo permitido (Total: ${pets.length}/4, Perros: ${dogsCount}/2, Gatos: ${catsCount}/2).`,
      'pets'
    );
  }
}
