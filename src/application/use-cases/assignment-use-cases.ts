/**
 * Asignación de mascotas a hogares (REQ-HOUSE2-003, SC-017). Solo el Propietario Legal asigna, desasigna y lista
 * (ASSIGN_PET_TO_HOUSEHOLDS = OWNER); quien ve la mascota sin serlo recibe 403 y quien no la ve, 404 (acceso antes que
 * cualquier otra comprobación). El dueño debe ser miembro ACTIVE del hogar destino (INV-HOUSE-004): si nunca lo fue, salió
 * o fue expulsado, 403 ERR-ACC-FORBIDDEN y no se escribe nada. Asignar es idempotente; la fila ASSIGN/UNASSIGN de
 * auditoría espera al puerto de auditoría de la rebanada 4 (T264/T265).
 *
 * @implements REQ-HOUSE2-003, INV-HOUSE-004, INV-OWN2-001, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-001
 */

import { DomainError, type PetAssignment } from '../../generated/index.ts';
import type { PetAssignmentRecord } from '../ports/repositories.port.ts';
import { requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/** @implements REQ-HOUSE2-003, INV-OWN2-001, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class ListPetAssignmentsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<PetAssignment[]> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      return repositories.assignments.listByPet(petId);
    });
  }
}

/** @implements REQ-HOUSE2-003, INV-HOUSE-004, SC-017, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class AssignPetToHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, householdId: string): Promise<PetAssignment> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      const ownerIsActive = (await repositories.households.listMembershipsOfUsers([pet.ownerUserId])).some(
        (m) => m.householdId === householdId && m.status === 'ACTIVE',
      );
      if (!ownerIsActive) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
      const existing = (await repositories.assignments.listByPet(petId)).find((a) => a.householdId === householdId);
      if (existing !== undefined) return existing;
      const created: PetAssignmentRecord = { petId, householdId, assignedByUserId: pet.ownerUserId, assignedAt: this.deps.clock.nowIsoTimestamp() };
      await repositories.assignments.save(created);
      return created;
    });
  }
}

/** @implements REQ-HOUSE2-003, SC-017, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class UnassignPetFromHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, householdId: string): Promise<204> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      await repositories.assignments.remove(petId, householdId);
      return 204 as const;
    });
  }
}
