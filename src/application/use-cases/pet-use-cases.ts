/**
 * Casos de uso de mascotas. Orden de comprobación: acceso (INV-ACC-001/002, 404 antes que 403), luego
 * esquema y dominio dentro de las funciones de pet-invariants.
 * - UpdatePetUseCase aplica INV-PET-006 con las fechas de todos los registros de la mascota.
 * - DeletePetUseCase borra la mascota y sus 6 colecciones en una sola transacción (REQ-PET-004).
 * - RegisterPet y UpdatePet NO consultan antes por propietario: el microchip es único en todo el sistema y lo impone la restricción
 *   `pets_microchip_global` al guardar; `mapMicrochipViolation` mapea solo esa violación al mismo ERR-PET-MICROCHIP-DUPLICATE para un
 *   duplicado propio o ajeno (REQ-PET4-001, INV-PET4-001).
 * - ListMyPetsUseCase devuelve las mascotas propias y las visibles por asignación a hogares, sin cupo, con el filtro
 *   (REQ-PET2-002) y el orden de REQ-PET-005; fuera de un hogar el colorToken del dueño es null (EDGE-030).
 * - GetPetDashboardUseCase aplica INV-ACC2-001 y devuelve myRole y permissions de la matriz REQ-RBAC-001 (reemplazan canEdit).
 *
 * - UpdatePetUseCase (007): toma `lockPet` como PRIMERA operación (REQ-FAL7-011, EDGE-007-010), exige `If-Match` con la `version` de la ficha (412
 *   ERR-PET-VERSION-CONFLICT si no coincide, sin cambios ni auditoría; EDGE-007-009) y valida `lifeStatus`/`deceasedAt` sobre el estado resultante.
 * - Una mascota `DECEASED` no genera alertas ni cuenta en `alertsSummary`/`globalAlertStatus` y su edad llega hasta `deceasedAt` (REQ-FAL7-004, REQ-FAL7-007).
 *
 * REQ-BIO8-001/002 (008, #21): `UpdatePetUseCase` ya cubre la biografía (acción `EDIT_PET_BASICS`, `If-Match`, recorte y 0..280 en el dominio); la auditoría guarda solo la huella (REQ-AUD-001).
 *
 * @implements REQ-BIO8-001, REQ-BIO8-002, REQ-BIO8-003, REQ-FAL7-001, REQ-FAL7-002, REQ-FAL7-004, REQ-FAL7-007, REQ-FAL7-008, REQ-FAL7-011, ERR-PET-VERSION-CONFLICT, EDGE-007-009, EDGE-007-010, REQ-PET4-001, INV-PET4-001, REQ-PET2-001, REQ-PET2-002, REQ-PET-001, REQ-PET-002, REQ-PET-003, REQ-PET-004, REQ-PET-005, INV-ACC-001, INV-ACC-002, INV-PET-003, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN, INV-ARCH-001, INV-ARCH-002
 */

import { normalizePetProfile } from '../../domain/pet/pet-invariants.ts';
import { DomainError, type components, type Species } from '../../generated/index.ts';
import { petPermissionsFor } from '../../domain/access/rbac.ts';
import { evaluateDewormingAlerts, evaluateVaccinationAlerts, summarizeSanitaryAlerts } from '../../domain/alerts/sanitary-alert-evaluator.ts';
import { ownerTag } from '../../domain/households/household-policies.ts';
import { collectRecordEventDates, computedAgeOf, createPetProfile, updatePetProfile } from '../../domain/pet/pet-invariants.ts';
import { mapMicrochipViolation } from './microchip-violation.ts';
import { assertMicrochipWithinLimit, withDuplicateRecording } from './microchip-rate-limit.ts';
import { computeWeightEvolutionSeries, withSymptomFields } from '../../domain/records/record-invariants.ts';
import { matchesPetListFilter, sortHistoricalRecords, sortPetsForListing, type PetListFilter } from '../../domain/sorting/deterministic-sorter.ts';
import { assignOwnedPetToHousehold } from './assignment-use-cases.ts';
import { auditPetView, recordAudit } from './audit-support.ts';
import { purgeObjects, reinforcePrefix } from './media-use-cases.ts';
import {
  buildPetCard,
  silenceAlertsOfDeceased,
  listVisiblePets,
  lockPet,
  publicProfilesById,
  requirePetAction,
  requireReadablePet,
  type ApplicationDeps,
  type PetCardView,
  type PetProfileView,
} from './use-case-support.ts';

/**
 * PetDashboardView del OpenAPI con `profile` tipado como PetProfile: el tipo generado de `profile`
 * ($ref al archivo pet.schema.json completo) incluye una propiedad `$defs` obligatoria (H-108-3).
 */
export type PetDashboardView = Omit<components['schemas']['PetDashboardView'], 'profile'> & { profile: PetProfileView };

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

/** Hogar base opcional del alta (REQ-HOUSE2-003): ya validado por createPetProfile; aquí solo se lee. */
function baseHouseholdIdOf(input: unknown): string | undefined {
  const value = (input as { readonly baseHouseholdId?: unknown }).baseHouseholdId;
  return typeof value === 'string' ? value : undefined;
}

/** @implements REQ-PET2-001, ERR-PET-MICROCHIP-DUPLICATE, INV-ARCH-001, INV-ARCH-002 */
export class RegisterPetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, input: unknown): Promise<PetProfileView> {
    return withDuplicateRecording(this.deps, userId, () =>
      this.deps.uow.runInTransaction(async (repositories) => {
        const pet = createPetProfile({
          id: this.deps.ids.nextId(),
          ownerUserId: userId,
          input,
          today: this.deps.clock.todayIsoDate(),
          nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
        });
        // REQ-PET4-002: chequeo previo del límite de duplicados (429 sin guardar), tras validar la entrada y antes de guardar.
        await assertMicrochipWithinLimit(this.deps, repositories, userId, pet.microchipId !== null);
        await mapMicrochipViolation(() => repositories.pets.save(pet));
        await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'CREATE', entityType: 'PET', entityId: pet.id, previous: null, next: auditPetView(pet) });
        const baseHouseholdId = baseHouseholdIdOf(input);
        if (baseHouseholdId !== undefined) await assignOwnedPetToHousehold(this.deps, repositories, userId, pet, baseHouseholdId);
        return { ...pet, avatarVersion: null }; // una mascota nueva no tiene avatar
      }),
    );
  }
}

/** @implements REQ-PET2-001, INV-ACC-002, ERR-ACC-FORBIDDEN, ERR-PET-MICROCHIP-DUPLICATE, ERR-PET-NOT-FOUND */
export class UpdatePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /**
   * @param ifMatch `version` de la ficha leída por el cliente (cabecera `If-Match`); `null` si la petición no la trajo (EDGE-007-009).
   * Orden: candado de mascota, acceso (404 antes que 403), `If-Match` presente, comparación de la versión BAJO EL CANDADO (distinta: 412 sin cambios ni
   * auditoría), esquema y dominio sobre el estado resultante.
   */
  async execute(userId: string, petId: string, input: unknown, ifMatch: number | null): Promise<PetProfileView> {
    return withDuplicateRecording(this.deps, userId, () =>
      this.deps.uow.runInTransaction(async (repositories) => {
        await lockPet(repositories, petId); // REQ-FAL7-011, EDGE-007-010: candado de mascota antes de leer la mascota y los registros
        const { pet } = await requirePetAction(repositories, userId, petId, 'EDIT_PET_BASICS');
        if (ifMatch === null) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Falta la cabecera If-Match con la versión de la ficha.', 'If-Match');
        if ((pet.version ?? 1) !== ifMatch) throw new DomainError('ERR-PET-VERSION-CONFLICT');
        const records = await repositories.records.listForPet(petId);
        const updated = updatePetProfile({
          pet,
          input,
          today: this.deps.clock.todayIsoDate(),
          nowIsoTimestamp: this.deps.clock.nowIsoTimestamp(),
          recordEventDates: collectRecordEventDates(petId, records),
          records,
        });
        // REQ-PET4-002: solo si cambia el microchip (repetir el propio valor no puede violar `pets_microchip_global`).
        await assertMicrochipWithinLimit(this.deps, repositories, userId, updated.microchipId !== null && updated.microchipId !== pet.microchipId);
        await mapMicrochipViolation(() => repositories.pets.save(updated));
        await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'PET', entityId: petId, previous: auditPetView(pet), next: auditPetView(updated) });
        // `pets.save` no toca el avatar (INV-AVA-001); la respuesta lo refleja leyendo su versión actual.
        return { ...updated, biography: updated.biography ?? null, avatarVersion: (await repositories.pets.findAvatarVersions([petId])).get(petId) ?? null };
      }),
    );
  }
}

/** @implements REQ-PET-004, INV-ACC-002, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-005 */
export class DeletePetUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<204> {
    const objectKeys = await this.deps.uow.runInTransaction(async (repositories) => {
      await lockPet(repositories, petId); // REQ-BOR-005: candado de mascota antes de cualquier otra lectura
      const { pet } = await requirePetAction(repositories, userId, petId, 'DELETE_PET');
      // 006 (T862, REQ-ESC6-029/030): ANTES de borrar, la escena retira su imagen vigente si la mascota consta en ella (misma transacción; si lanza, la baja se revierte).
      await this.deps.sceneHooks?.onPetRemoved(repositories, { petId, cause: 'PET_DELETED', now: this.deps.clock.nowIsoTimestamp() });
      // REQ-GCS-004: los medios y el avatar vigentes entran en la cola en la MISMA transacción; GCS no participa de ella.
      const keys = await repositories.mediaQueue.enqueueObjectsOfPet(petId, this.deps.clock.nowIsoTimestamp());
      await repositories.records.deleteForPet(petId);
      await repositories.pets.delete(petId);
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'DELETE', entityType: 'PET', entityId: petId, previous: auditPetView(pet), next: null });
      return keys;
    });
    // Tras el COMMIT: borrado inmediato e idempotente de cada objeto, refuerzo por `list` del prefijo; lo que falle lo reintenta el mantenimiento.
    await purgeObjects(this.deps, objectKeys);
    await reinforcePrefix(this.deps, [petId]);
    return 204;
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
      const avatars = await repositories.pets.findAvatarVersions(pets.map((pet) => pet.id)); // una sola lectura (sin N+1)
      const cards: PetCardView[] = [];
      for (const pet of pets) {
        const card = buildPetCard(pet, ownerTag(owners.get(pet.ownerUserId)!, null), roleOf.get(pet.id)!, await repositories.records.listForPet(pet.id), today, avatars.get(pet.id) ?? null);
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
      const avatarVersion = (await repositories.pets.findAvatarVersions([petId])).get(petId) ?? null;
      const deceased = pet.lifeStatus === 'DECEASED';
      const vaccinations = silenceAlertsOfDeceased(deceased, evaluateVaccinationAlerts(records.vaccinations, today));
      const dewormings = silenceAlertsOfDeceased(deceased, evaluateDewormingAlerts(records.dewormings, today));
      return {
        // REQ-BIO8-002: la ficha expone la biografía (null si no hay); la tarjeta del listado, el resumen veterinario y la escena no la llevan.
        profile: { ...normalizePetProfile(pet), biography: pet.biography ?? null, avatarVersion },
        owner: ownerTag(owner, null),
        myRole: role,
        permissions: petPermissionsFor(role),
        computedAge: computedAgeOf(pet, today), // REQ-FAL7-007: hasta deceasedAt si falleció
        alertsSummary: summarizeSanitaryAlerts(vaccinations, dewormings),
        weights: computeWeightEvolutionSeries(records.weights),
        bodyMeasurements: sortHistoricalRecords(records.bodyMeasurements),
        // T255 PENDIENTE: separación vigentes/reemplazados según REQ-REC2-002.
        vaccinations: vaccinations.filter((v) => v.alert?.status !== 'SUPERSEDED'),
        supersededVaccinations: vaccinations.filter((v) => v.alert?.status === 'SUPERSEDED'),
        dewormings: dewormings.filter((d) => d.alert?.status !== 'SUPERSEDED'),
        supersededDewormings: dewormings.filter((d) => d.alert?.status === 'SUPERSEDED'),
        medicalVisits: sortHistoricalRecords(records.medicalVisits),
        customParameters: sortHistoricalRecords(records.customParameters).map(withSymptomFields),
      };
    });
  }
}
