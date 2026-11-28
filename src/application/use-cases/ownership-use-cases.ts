/**
 * Transferencia inmediata de la Propiedad Legal de una mascota (REQ-OWN-001, SC-016).
 * Orden: acceso a la mascota (404 si no la ve, 403 si no es el Propietario Legal), luego el cuerpo (422 de esquema) y
 * luego el dominio (`transferPetOwnership`: destino ACTIVE en un hogar con la mascota o ERR-OWN-TRANSFER-INVALID-TARGET).
 * En una sola transacción: cambia `ownerUserId` (INV-OWN2-001), reasigna `assignedByUserId` en las asignaciones que
 * sobreviven y borra las podadas. Escribe 1 fila OWNERSHIP_TRANSFER (PET) y 1 fila UNASSIGN por cada asignación podada
 * (REQ-AUD-001, T262), en la misma transacción. Transferir el hogar (T246) no toca asignaciones ni mascotas.
 * En esa misma transacción revoca los enlaces veterinarios PET ACTIVOS de la mascota (`revoked_at = now` y una auditoría REVOKED por enlace, actor = quien transfiere),
 * bajo el candado de la mascota; los vencidos, los revocados y los HOUSEHOLD no se tocan (EDGE-005-20-bis, SC-005-052: así A -> B -> A no resucita enlaces).
 *
 * @implements REQ-VET-011, REQ-VET-005, STATE-SHARE-001, SC-005-052, EDGE-005-20-bis, REQ-AUD-001, REQ-OWN-001, INV-OWN2-001, INV-HOUSE-004, SC-016, ERR-OWN-TRANSFER-INVALID-TARGET, ERR-ACC-FORBIDDEN, ERR-PET-NOT-FOUND, INV-ARCH-001
 */

import { validateTransferPetOwnershipInput, type TransferPetOwnershipInput, type TransferPetOwnershipResult } from '../../generated/index.ts';
import { DomainError as DomainErrorV38 } from '../../generated/v38/index.ts';
import { deriveStatus, retentionCutoffs } from '../../domain/sharing/share-link.ts';
import { PetsLinkRevocation } from '../sharing/pets-link-revocation.ts';
import { transferPetOwnership } from '../../domain/pet/ownership-transfer.ts';
import { auditPetView, recordAssignmentRemoved, recordAudit } from './audit-support.ts';
import { assertMatchesSchema, requirePetAction, type ApplicationDeps } from './use-case-support.ts';

/** @implements REQ-OWN-001, INV-OWN2-001, SC-016, ERR-OWN-TRANSFER-INVALID-TARGET, REQ-VET-011, SC-005-052, EDGE-005-20-bis */
export class TransferPetOwnershipUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(actorUserId: string, petId: string, input: unknown): Promise<TransferPetOwnershipResult> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      await repositories.shareLinks.lockScope('PET', petId);
      const { pet } = await requirePetAction(repositories, actorUserId, petId, 'TRANSFER_PET_OWNERSHIP');
      // 012 (REQ-OWN12-004 (j)): con más de un propietario ACTIVE el cambio de principal exige aprobación conjunta (`owner_requests`), nunca esta ruta directa.
      if ((await repositories.coOwners.listByPet(petId)).some((row) => row.status === 'ACTIVE')) throw new DomainErrorV38('ERR-OWN12-APPROVAL-PENDING');
      const { targetUserId } = assertMatchesSchema<TransferPetOwnershipInput>('TransferPetOwnershipInput', validateTransferPetOwnershipInput, input);
      const before = await repositories.assignments.listByPet(petId);
      const out = transferPetOwnership({
        pet: { id: pet.id, ownerUserId: pet.ownerUserId },
        actorUserId,
        newOwnerUserId: targetUserId,
        memberships: await repositories.households.listMembershipsOfUsers([targetUserId]),
        assignments: before,
      });
      // 006 (T866, REQ-ESC6-024/025/030, SC-ESC6-088): ANTES de mutar, la escena retira las imágenes cuyas fuentes incluyan al propietario anterior; el consentimiento efectivo pasa al nuevo Propietario Legal.
      await this.deps.sceneHooks?.onPetOwnershipTransferred(repositories, { petId, previousOwnerUserId: pet.ownerUserId, newOwnerUserId: targetUserId, now: this.deps.clock.nowIsoTimestamp() });
      const kept = new Set(out.assignments.map((a) => a.householdId));
      const pruned = before.filter((a) => !kept.has(a.householdId)).map((a) => a.householdId);
      for (const householdId of pruned) {
        await repositories.assignments.remove(petId, householdId);
        await PetsLinkRevocation.revokeForPetLeftHousehold(this.deps, repositories, { petId, householdId, actorUserId, now: this.deps.clock.nowIsoTimestamp() }); // ENM-005-E §5.1 fila 1
      }
      for (const assignment of before.filter((a) => kept.has(a.householdId))) {
        await repositories.assignments.save({ ...assignment, assignedByUserId: out.pet.ownerUserId });
      }
      const transferred = { ...pet, ownerUserId: out.pet.ownerUserId, updatedAt: this.deps.clock.nowIsoTimestamp() };
      await repositories.pets.save(transferred);
      // EDGE-005-20-bis / SC-005-052: los enlaces PET ACTIVOS no sobreviven a la transferencia (ni a un regreso A -> B -> A).
      const now = this.deps.clock.nowIsoTimestamp();
      for (const link of await repositories.shareLinks.listByScope('PET', petId, retentionCutoffs(now).links)) {
        if (deriveStatus(link, now) === 'ACTIVE' && (await repositories.shareLinks.revoke(link.id, now))) {
          await repositories.shareAudit.insert({ id: this.deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'REVOKED', occurredAt: now, actorUserId, ipHmac: null, failCount: 1 });
        }
      }
      // ENM-005-E §5.1 fila 2: el creador que ya no es titular de la mascota pierde sus `PETS` (no se borra ninguna fila).
      await PetsLinkRevocation.revokeForCreatorLostPetAuthority(this.deps, repositories, { petId, actorUserId, now });
      // REQ-AUD-001: 1 fila OWNERSHIP_TRANSFER sobre la mascota y 1 fila UNASSIGN por cada asignación podada.
      await recordAudit(this.deps, repositories, { executorUserId: actorUserId, mutationType: 'OWNERSHIP_TRANSFER', entityType: 'PET', entityId: petId, previous: auditPetView(pet), next: auditPetView(transferred) });
      for (const assignment of before.filter((a) => !kept.has(a.householdId))) await recordAssignmentRemoved(this.deps, repositories, actorUserId, assignment);
      // La respuesta lleva `avatarVersion` (REQ-AVA-001); la transferencia no toca el avatar (`pets.save` no lo modifica).
      const avatarVersion = (await repositories.pets.findAvatarVersions([petId])).get(petId) ?? null;
      return { pet: { ...transferred, avatarVersion }, prunedAssignments: pruned };
    });
  }
}
