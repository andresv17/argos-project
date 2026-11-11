/**
 * Casos de uso de mascotas. Orden de comprobación: acceso (INV-ACC-001/002, 404 antes que 403), luego
 * esquema y dominio dentro de las funciones de pet-invariants.
 * - UpdatePetUseCase aplica INV-PET-006 con las fechas de todos los registros de la mascota.
 * - DeletePetUseCase borra la mascota y sus 6 colecciones en una sola transacción (REQ-PET-004).
 * - ListMyPetsUseCase devuelve solo las mascotas propias, sin cupo, con el filtro y el orden de REQ-PET-005;
 *   fuera de un hogar el colorToken del dueño es null (EDGE-030).
 * - GetPetDashboardUseCase aplica INV-ACC-001 y devuelve canEdit según INV-ACC-002.
 *
 * @implements REQ-PET-001, REQ-PET-002, REQ-PET-003, REQ-PET-004, REQ-PET-005, INV-ACC-001, INV-ACC-002, INV-PET-003, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN, INV-ARCH-001, INV-ARCH-002
 */

import type { components, PetProfile, Species } from '../../generated/index.ts';
import { canWrite } from '../../domain/access/access-policy.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import { ownerTag } from '../../domain/households/household-policies.ts';
import { collectRecordEventDates, createPetProfile, updatePetProfile } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import { matchesPetListFilter, sortHistoricalRecords, sortPetsForListing } from '../../domain/sorting/deterministic-sorter.ts';
import {
  buildPetCard,
  legacyRoleAndPermissions,
  publicProfilesById,
  requireReadablePet,
  requireWritablePet,
  type ApplicationDeps,
  type PetCardView,
} from './use-case-support.ts';

/**
 * PetDashboardView del OpenAPI con `profile` tipado como PetProfile: el tipo generado de `profile`
 * ($ref al archivo pet.schema.json completo) incluye una propiedad `$defs` obligatoria (H-108-3).
 */
export type PetDashboardView = Omit<components['schemas']['PetDashboardView'], 'profile'> & { profile: PetProfile };

export interface PetListQuery {
  readonly q?: string;
  readonly species?: Species;
}

/** @implements REQ-PET-001, INV-ARCH-001, INV-ARCH-002 */
export class RegisterPetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, input: unknown): Promise<PetProfile> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const pet = createPetProfile({
        id: this.deps.ids.nextId(),
        ownerUserId: userId,
        input,
        today: this.deps.clock.todayIsoDate(),
        nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
      });
      await repositories.pets.save(pet);
      return pet;
    });
  }
}

/** @implements REQ-PET-001, INV-ACC-002, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class UpdatePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, input: unknown): Promise<PetProfile> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requireWritablePet(repositories, userId, petId);
      const records = await repositories.records.listForPet(petId);
      const updated = updatePetProfile({
        pet,
        input,
        today: this.deps.clock.todayIsoDate(),
        nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
        recordEventDates: collectRecordEventDates(petId, records),
      });
      await repositories.pets.save(updated);
      return updated;
    });
  }
}

/** @implements REQ-PET-004, INV-ACC-002, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-005 */
export class DeletePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<204> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await requireWritablePet(repositories, userId, petId);
      await repositories.records.deleteForPet(petId);
      await repositories.pets.delete(petId);
      return 204 as const;
    });
  }
}

/** @implements REQ-PET-005, REQ-PET-002 */
export class ListMyPetsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, query: PetListQuery = {}): Promise<PetCardView[]> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const owner = (await publicProfilesById(repositories, [userId])).get(userId)!;
      const pets = sortPetsForListing((await repositories.pets.listByOwners([userId])).filter((pet) => matchesPetListFilter(pet, query)));
      const cards: PetCardView[] = [];
      for (const pet of pets) {
        cards.push(buildPetCard(pet, ownerTag(owner, null), true, await repositories.records.listForPet(pet.id), today));
      }
      return cards;
    });
  }
}

/** @implements REQ-PET-003, REQ-PET-002, INV-ACC-001, INV-ACC-002, ERR-PET-NOT-FOUND */
export class GetPetDashboardUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<PetDashboardView> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requireReadablePet(repositories, userId, petId);
      const owner = (await publicProfilesById(repositories, [pet.ownerUserId])).get(pet.ownerUserId)!;
      const records = await repositories.records.listForPet(petId);
      const vaccinations = evaluateVaccinationAlerts(records.vaccinations, today);
      const dewormings = evaluateDewormingAlerts(records.dewormings, today);
      return {
        profile: pet,
        owner: ownerTag(owner, null),
        ...legacyRoleAndPermissions(canWrite({ id: userId }, pet)),
        computedAge: calculatePetAge(pet.birthDate, today),
        alertsSummary: summarizeSanitaryAlerts(vaccinations, dewormings),
        weights: computeWeightEvolutionSeries(records.weights),
        bodyMeasurements: sortHistoricalRecords(records.bodyMeasurements),
        // T255 PENDIENTE: separación vigentes/reemplazados según REQ-REC2-002.
        vaccinations: vaccinations.filter((v) => v.alert?.status !== 'SUPERSEDED'),
        supersededVaccinations: vaccinations.filter((v) => v.alert?.status === 'SUPERSEDED'),
        dewormings: dewormings.filter((d) => d.alert?.status !== 'SUPERSEDED'),
        supersededDewormings: dewormings.filter((d) => d.alert?.status === 'SUPERSEDED'),
        medicalVisits: sortHistoricalRecords(records.medicalVisits),
        customParameters: sortHistoricalRecords(records.customParameters),
      };
    });
  }
}
