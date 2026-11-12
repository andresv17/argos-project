/**
 * Transferencia inmediata de la Propiedad Legal de una mascota (REQ-OWN-001, SC-016).
 * Orden: acceso a la mascota (404 si no la ve, 403 si no es el Propietario Legal), luego el cuerpo (422 de esquema) y
 * luego el dominio (`transferPetOwnership`: destino ACTIVE en un hogar con la mascota o ERR-OWN-TRANSFER-INVALID-TARGET).
 * En una sola transacción: cambia `ownerUserId` (INV-OWN2-001), reasigna `assignedByUserId` en las asignaciones que
 * sobreviven y borra las podadas. Escribe 1 fila OWNERSHIP_TRANSFER (PET) y 1 fila UNASSIGN por cada asignación podada
 * (REQ-AUD-001, T262), en la misma transacción. Transferir el hogar (T246) no toca asignaciones ni mascotas.
 *
 * @implements REQ-AUD-001, REQ-OWN-001, INV-OWN2-001, INV-HOUSE-004, SC-016, ERR-OWN-TRANSFER-INVALID-TARGET, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-001
 */

import { validateTransferPetOwnershipInput, type TransferPetOwnershipInput, type TransferPetOwnershipResult } from '../../generated/index.ts';
import { transferPetOwnership } from '../../domain/pet/ownership-transfer.ts';
import { recordAssignmentRemoved, recordAudit } from './audit-support.ts';
import { assertMatchesSchema, requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/** @implements REQ-OWN-001, INV-OWN2-001, SC-016, ERR-OWN-TRANSFER-INVALID-TARGET */
export class TransferPetOwnershipUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<TransferPetOwnershipResult> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, actorUserId, petId, 'TRANSFER_PET_OWNERSHIP');
      const { targetUserId } = assertMatchesSchema<TransferPetOwnershipInput>('TransferPetOwnershipInput', validateTransferPetOwnershipInput, input);
      const before = await repositories.assignments.listByPet(petId);
      const out = transferPetOwnership({
        pet: { id: pet.id, ownerUserId: pet.ownerUserId },
        actorUserId,
        newOwnerUserId: targetUserId,
        memberships: await repositories.households.listMembershipsOfUsers([targetUserId]),
        assignments: before,
      });
      const kept = new Set(out.assignments.map((a) => a.householdId));
      const pruned = before.filter((a) => !kept.has(a.householdId)).map((a) => a.householdId);
      for (const householdId of pruned) await repositories.assignments.remove(petId, householdId);
      for (const assignment of before.filter((a) => kept.has(a.householdId))) {
        await repositories.assignments.save({ ...assignment, assignedByUserId: out.pet.ownerUserId });
      }
      const transferred = { ...pet, ownerUserId: out.pet.ownerUserId, updatedAt: this.deps.clock.nowIsoTimestamp() };
      await repositories.pets.save(transferred);
      // REQ-AUD-001: 1 fila OWNERSHIP_TRANSFER sobre la mascota y 1 fila UNASSIGN por cada asignación podada.
      await recordAudit(this.deps, repositories, { executorUserId: actorUserId, mutationType: 'OWNERSHIP_TRANSFER', entityType: 'PET', entityId: petId, previous: pet, next: transferred });
      for (const assignment of before.filter((a) => !kept.has(a.householdId))) await recordAssignmentRemoved(this.deps, repositories, actorUserId, assignment);
      return { pet: transferred, prunedAssignments: pruned };
    });
  }
}
