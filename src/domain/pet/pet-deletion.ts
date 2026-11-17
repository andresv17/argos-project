/**
 * Eliminación de mascota con cascada (función pura).
 * REQ-PET-004 / INV-PET-005: quitar la mascota quita, en el mismo paso, todos sus registros de las 6 colecciones.
 * La función no modifica la entrada: devuelve un estado nuevo o lanza un error sin efectos, así que
 * un fallo no elimina nada. La transacción de persistencia corresponde a la aplicación y la infraestructura.
 *
 * @implements REQ-PET-004, INV-PET-005, INV-ARCH-004
 */

import { DomainError, type PetProfile } from '../../generated/index.ts';
import type { PetRecordCollections } from './pet-invariants.ts';

export interface PetAggregateState {
  readonly pets: readonly PetProfile[];
  readonly records: PetRecordCollections;
}

export type RemovedRecordCounts = { readonly [K in keyof PetRecordCollections]: number };

export interface PetDeletionResult {
  readonly state: PetAggregateState;
  readonly removedPet: PetProfile;
  readonly removedRecords: RemovedRecordCounts;
}

function withoutPet<T extends { readonly petId: string }>(
  collection: readonly T[],
  petId: string,
): { kept: T[]; removed: number } {
  const kept = collection.filter((record) => record.petId !== petId);
  return { kept, removed: collection.length - kept.length };
}

/**
 * Devuelve el estado sin la mascota ni ninguno de sus registros. Lanza ERR-PET-NOT-FOUND si no existe.
 * @implements REQ-PET-004, INV-PET-005
 */
export function deletePetCascade(state: PetAggregateState, petId: string): PetDeletionResult {
  const removedPet = state.pets.find((pet) => pet.id === petId);
  if (removedPet === undefined) {
    throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  }
  const weights = withoutPet(state.records.weights, petId);
  const bodyMeasurements = withoutPet(state.records.bodyMeasurements, petId);
  const vaccinations = withoutPet(state.records.vaccinations, petId);
  const dewormings = withoutPet(state.records.dewormings, petId);
  const medicalVisits = withoutPet(state.records.medicalVisits, petId);
  const customParameters = withoutPet(state.records.customParameters, petId);
  return {
    state: {
      pets: state.pets.filter((pet) => pet.id !== petId),
      records: {
        weights: weights.kept,
        bodyMeasurements: bodyMeasurements.kept,
        vaccinations: vaccinations.kept,
        dewormings: dewormings.kept,
        medicalVisits: medicalVisits.kept,
        customParameters: customParameters.kept,
      },
    },
    removedPet,
    removedRecords: {
      weights: weights.removed,
      bodyMeasurements: bodyMeasurements.removed,
      vaccinations: vaccinations.removed,
      dewormings: dewormings.removed,
      medicalVisits: medicalVisits.removed,
      customParameters: customParameters.removed,
    },
  };
}
