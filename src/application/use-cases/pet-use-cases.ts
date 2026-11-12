/**
 * Casos de uso de mascotas. Orden de comprobación: acceso (INV-ACC-001/002, 404 antes que 403), luego
 * esquema y dominio dentro de las funciones de pet-invariants.
 * - UpdatePetUseCase aplica INV-PET-006 con las fechas de todos los registros de la mascota.
 * - DeletePetUseCase borra la mascota y sus 6 colecciones en una sola transacción (REQ-PET-004).
 * - RegisterPet y UpdatePet comprueban que el microchip sea único entre las mascotas del mismo propietario (REQ-PET2-001).
 * - ListMyPetsUseCase devuelve las mascotas propias y las visibles por asignación a hogares, sin cupo, con el filtro
 *   (REQ-PET2-002) y el orden de REQ-PET-005; fuera de un hogar el colorToken del dueño es null (EDGE-030).
 * - GetPetDashboardUseCase aplica INV-ACC2-001 y devuelve myRole y permissions de la matriz REQ-RBAC-001 (reemplazan canEdit).
 *
 * @implements REQ-PET2-001, REQ-PET2-002, REQ-PET-001, REQ-PET-002, REQ-PET-003, REQ-PET-004, REQ-PET-005, INV-ACC-001, INV-ACC-002, INV-PET-003, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN, INV-ARCH-001, INV-ARCH-002
 */

import type { components, PetProfile, Species } from '../../generated/index.ts';
import { petPermissionsFor } from '../../domain/access/rbac.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import { ownerTag } from '../../domain/households/household-policies.ts';
import { assertMicrochipUniqueForOwner, collectRecordEventDates, createPetProfile, updatePetProfile } from '../../domain/pet/pet-invariants.ts';
import { computeWeightEvolutionSeries } from '../../domain/records/record-invariants.ts';
import { calculatePetAge } from '../../domain/shared/date-utils.ts';
import { matchesPetListFilter, sortHistoricalRecords, sortPetsForListing, type PetListFilter } from '../../domain/sorting/deterministic-sorter.ts';
import {
  buildPetCard,
  listVisiblePets,
  publicProfilesById,
  requirePetAction,
  requireReadablePet,
  type ApplicationDeps,
  type PetCardView,
} from './use-case-support.ts';

/**
 * PetDashboardView del OpenAPI con `profile` tipado como PetProfile: el tipo generado de `profile`
 * ($ref al archivo pet.schema.json completo) incluye una propiedad `$defs` obligatoria (H-108-3).
 */
export type PetDashboardView = Omit<components['schemas']['PetDashboardView'], 'profile'> & { profile: PetProfile };

/** Filtro del listado de REQ-PET2-002 (parámetro `filter` del OpenAPI). */
export type PetListGroup = 'ALL' | 'CANINE' | 'FELINE' | 'OTHERS' | 'WITH_ALERTS';

export interface PetListQuery {
  readonly q?: string;
  /**
   * Alias heredado de la 001 (especie exacta). T228 PENDIENTE: el contrato 002 solo declara `filter`; `species` se
   * conserva porque el cliente web y las rutas de hogar lo envían hasta T284 y T238.
   */
  readonly species?: Species;
  readonly filter?: PetListGroup;
}

/** Parte del filtro que decide el dominio por mascota (nombre, especie y grupo); WITH_ALERTS necesita la tarjeta. */
export function petListFilterOf(query: PetListQuery): PetListFilter {
  const group = query.filter === undefined || query.filter === 'WITH_ALERTS' ? undefined : query.filter;
  return {
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.species === undefined ? {} : { species: query.species }),
    ...(group === undefined ? {} : { group }),
  };
}

/** WITH_ALERTS: solo las tarjetas con alertas sanitarias activas (REQ-PET2-002). */
export function keepsCard(query: PetListQuery, card: Pick<PetCardView, 'alertsSummary'>): boolean {
  return query.filter !== 'WITH_ALERTS' || card.alertsSummary.totalActiveAlerts > 0;
}

/** @implements REQ-PET2-001, ERR-PET-MICROCHIP-DUPLICATE, INV-ARCH-001, INV-ARCH-002 */
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
      assertMicrochipUniqueForOwner(await repositories.pets.listByOwners([userId]), pet.microchipId, pet.id);
      await repositories.pets.save(pet);
      return pet;
    });
  }
}

/** @implements REQ-PET2-001, INV-ACC-002, ERR-ACC-FORBIDDEN, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-NOT-FOUND */
export class UpdatePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, input: unknown): Promise<PetProfile> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, 'EDIT_PET_BASICS');
      const records = await repositories.records.listForPet(petId);
      const updated = updatePetProfile({
        pet,
        input,
        today: this.deps.clock.todayIsoDate(),
        nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
        recordEventDates: collectRecordEventDates(petId, records),
      });
      assertMicrochipUniqueForOwner(await repositories.pets.listByOwners([pet.ownerUserId]), updated.microchipId, updated.id);
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
      await requirePetAction(repositories, userId, petId, 'DELETE_PET');
      await repositories.records.deleteForPet(petId);
      await repositories.pets.delete(petId);
      return 204 as const;
    });
  }
}

/** @implements REQ-PET2-002, REQ-PET-005, REQ-PET-002 */
export class ListMyPetsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, query: PetListQuery = {}): Promise<PetCardView[]> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const filter = petListFilterOf(query);
      const visible = await listVisiblePets(repositories, userId);
      const roleOf = new Map(visible.map((v) => [v.pet.id, v.role]));
      const owners = await publicProfilesById(repositories, visible.map((v) => v.pet.ownerUserId));
      const pets = sortPetsForListing(visible.map((v) => v.pet).filter((pet) => matchesPetListFilter(pet, filter)));
      const cards: PetCardView[] = [];
      for (const pet of pets) {
        const card = buildPetCard(pet, ownerTag(owners.get(pet.ownerUserId)!, null), roleOf.get(pet.id)!, await repositories.records.listForPet(pet.id), today);
        if (keepsCard(query, card)) cards.push(card);
      }
      return cards;
    });
  }
}

/** @implements REQ-PET2-003, REQ-PET-003, REQ-PET-002, REQ-RBAC-001, INV-ACC2-001, INV-ACC-001, INV-ACC-002, ERR-PET-NOT-FOUND */
export class GetPetDashboardUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<PetDashboardView> {
    const today = this.deps.clock.todayIsoDate();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet, role } = await requireReadablePet(repositories, userId, petId);
      const owner = (await publicProfilesById(repositories, [pet.ownerUserId])).get(pet.ownerUserId)!;
      const records = await repositories.records.listForPet(petId);
      const vaccinations = evaluateVaccinationAlerts(records.vaccinations, today);
      const dewormings = evaluateDewormingAlerts(records.dewormings, today);
      return {
        profile: pet,
        owner: ownerTag(owner, null),
        myRole: role,
        permissions: petPermissionsFor(role),
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
