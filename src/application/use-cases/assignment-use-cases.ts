/**
 * Asignación de mascotas a hogares (REQ-HOUSE2-003, SC-017). Solo el Propietario Legal asigna, desasigna y lista
 * (ASSIGN_PET_TO_HOUSEHOLDS = OWNER); quien ve la mascota sin serlo recibe 403 y quien no la ve, 404 (acceso antes que
 * cualquier otra comprobación). El dueño debe ser miembro ACTIVE del hogar destino (INV-HOUSE-004): si nunca lo fue, salió
 * o fue expulsado, 403 ERR-ACC-FORBIDDEN y no se escribe nada. Asignar es idempotente (sin cambio, sin fila). Cada alta o
 * baja efectiva escribe una fila ASSIGN/UNASSIGN con entityId = HMAC de "<petId>:<householdId>" (REQ-AUD-001, T262).
 *
 * @implements REQ-HOUSE2-003, INV-HOUSE-004, INV-OWN2-001, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-001
 */

import { DomainError, type PetAssignment } from '../../generated/index.ts';
import type { PetAssignmentRecord, RepositorySet } from '../ports/repositories.port.ts';
import { assignmentAuditId, recordAudit } from './audit-support.ts';
import { requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/**
 * Proyección al contrato de 002 (`assignedByUserId` es texto): tras la supresión de la cuenta de quien asignó (FK `ON DELETE SET NULL`, REQ-OWN12-007, NFR-012-009)
 * la asignación pasa a ser del principal actual, el ancla de compatibilidad.
 */
export const toPetAssignment = (record: PetAssignmentRecord, principalUserId: string): PetAssignment => ({ ...record, assignedByUserId: record.assignedByUserId ?? principalUserId });

/** @implements REQ-HOUSE2-003, INV-OWN2-001, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class ListPetAssignmentsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<PetAssignment[]> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      return (await repositories.assignments.listByPet(petId)).map((a) => toPetAssignment(a, pet.ownerUserId));
    });
  }
}

/** @implements REQ-HOUSE2-003, INV-HOUSE-004, SC-017, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class AssignPetToHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, householdId: string): Promise<PetAssignment> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      return toPetAssignment(await assignOwnedPetToHousehold(this.deps, repositories, userId, pet, householdId), pet.ownerUserId);
    });
  }
}

/**
 * Regla única de alta de asignación (REQ-HOUSE2-003, INV-HOUSE-004): el dueño debe ser miembro ACTIVE del hogar, si no
 * ERR-ACC-FORBIDDEN. Idempotente. La usan la asignación directa y el alta con `baseHouseholdId`, dentro de la misma transacción.
 *
 * @implements REQ-HOUSE2-003, INV-HOUSE-004, ERR-ACC-FORBIDDEN, REQ-AUD-001
 */
export async function assignOwnedPetToHousehold(
  deps: ApplicationDeps,
  repositories: RepositorySet,
  executorUserId: string,
  pet: { readonly id: string; readonly ownerUserId: string },
  householdId: string,
): Promise<PetAssignmentRecord> {
  const petId = pet.id;
  // REQ-OWN12-007: cada propietario asigna SOLO a hogares donde es miembro ACTIVE; la asignación queda a su nombre (`assigned_by_user_id`).
  const ownerIsActive = (await repositories.households.listMembershipsOfUsers([executorUserId])).some(
    (m) => m.householdId === householdId && m.status === 'ACTIVE',
  );
  if (!ownerIsActive) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  const existing = (await repositories.assignments.listByPet(petId)).find((a) => a.householdId === householdId);
  if (existing !== undefined) return existing;
  const created: PetAssignmentRecord = { petId, householdId, assignedByUserId: executorUserId, assignedAt: deps.clock.nowIsoTimestamp() };
  await repositories.assignments.save(created);
  await recordAudit(deps, repositories, { executorUserId, mutationType: 'ASSIGN', entityType: 'PET_ASSIGNMENT', entityId: assignmentAuditId(deps, petId, householdId), previous: null, next: created });
  return created;
}

/** @implements REQ-HOUSE2-003, SC-017, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND */
export class UnassignPetFromHouseholdUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string, householdId: string): Promise<204> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, userId, petId, 'ASSIGN_PET_TO_HOUSEHOLDS');
      const existing = (await repositories.assignments.listByPet(petId)).find((a) => a.householdId === householdId);
      // REQ-OWN12-007: cada propietario solo desasigna las asignaciones que hizo; las huérfanas (asignador suprimido) son del principal.
      if (existing !== undefined && (existing.assignedByUserId ?? pet.ownerUserId) !== userId) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
      if (existing !== undefined) {
        // 006 (T863, REQ-ESC6-030, D6-17): la desasignación retira y purga la imagen vigente y cancela el intento en vuelo, ANTES de quitar la asignación y en la misma transacción.
        await this.deps.sceneHooks?.onPetUnassigned(repositories, { petId, householdId, now: this.deps.clock.nowIsoTimestamp() });
      }
      await repositories.assignments.remove(petId, householdId);
      if (existing !== undefined) {
        await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UNASSIGN', entityType: 'PET_ASSIGNMENT', entityId: assignmentAuditId(this.deps, petId, householdId), previous: existing, next: null });
      }
      return 204 as const;
    });
  }
}
