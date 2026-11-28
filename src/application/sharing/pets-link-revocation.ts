/**
 * `PetsLinkRevocation` (ENM-005-E 0.2.2, annex §5.1, `PN-08` aplicado a `PETS`, decisión `E-1`, `D-1 = (a)`): UNA sola rutina de aplicación que revoca el enlace `PETS` ENTERO (`revoked_at` y auditoría `REVOKED` en la
 * misma transacción que el cambio que lo causa; sin tombstones ni mutación silenciosa del subconjunto). La invocan TODOS los caminos que escriben asignaciones, membresías de hogar, co-propiedad y borrado de mascotas.
 * - Fila 1 (`revokeForPetLeftHousehold`): la mascota deja de estar asignada a H: todo `PETS` ACTIVO de H que la contiene, sea quien sea su creador; además borra la fila `(enlace, P)` en el acto (`R2-04 = (B)`).
 * - Fila 2 (`revokeForCreatorLostPetAuthority`): el creador deja de ser propietario principal y co-propietario `ACTIVE` de P: todo `PETS` ACTIVO que la contiene y cuyo creador ya no es titular; no se borra ninguna fila.
 * - Fila 3 (`revokeForCreatorLostHouseholdRole`): el creador deja de ser propietario o `ADMIN` `ACTIVE` de H: todo `PETS` ACTIVO de H creado por él; toma el candado del hogar y NO pide bloqueos de mascota (§6).
 * Un enlace ya `REVOKED` o vencido no se vuelve a tocar (sin auditoría duplicada). El actor de la auditoría es quien provocó el cambio (o `null` si fue un proceso de sistema); el motivo no se persiste.
 *
 * @implements REQ-VET12-007, INV-VET12-003, PN-08, EDGE-012-070, EDGE-012-072, EDGE-012-075, EDGE-012-077, R2-04
 */
import { isOwnerOfPet } from '../../domain/access/pet-ownership.ts';
import { deriveStatus, retentionCutoffs, type ShareLinkRecord } from '../../domain/sharing/share-link.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { ApplicationDeps } from '../use-cases/use-case-support.ts';
import { isHouseholdManager } from './share-access.ts';

type Revocation = Pick<ApplicationDeps, 'auditIds'>;

/** Revoca el enlace (si sigue activo) y deja UN `REVOKED`. Devuelve true si cambió una fila. */
export async function revokeLinkNow(deps: Revocation, repositories: RepositorySet, link: ShareLinkRecord, actorUserId: string | null, now: string): Promise<boolean> {
  if (deriveStatus(link, now) !== 'ACTIVE') return false;
  if (!(await repositories.shareLinks.revoke(link.id, now))) return false;
  await repositories.shareAudit.insert({ id: deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'REVOKED', occurredAt: now, actorUserId, ipHmac: null, failCount: 1 });
  return true;
}

export const PetsLinkRevocation = {
  /** Fila 1 de §5.1. Bajo el bloqueo de la mascota que ya tiene el disparador. */
  async revokeForPetLeftHousehold(deps: Revocation, repositories: RepositorySet, input: { readonly petId: string; readonly householdId: string; readonly actorUserId: string | null; readonly now: string }): Promise<void> {
    const { petId, householdId, actorUserId, now } = input;
    for (const linkId of await repositories.shareLinkPets.listLinkIdsByPet(petId)) {
      const link = await repositories.shareLinks.findById(linkId);
      if (link === null || link.scope !== 'PETS' || link.householdId !== householdId) continue;
      await revokeLinkNow(deps, repositories, link, actorUserId, now);
      await repositories.shareLinkPets.deleteRow(link.id, petId); // R2-04 = (B): la fila de la mascota que salió se borra en el acto
    }
  },

  /** Fila 2 de §5.1. Bajo el bloqueo de la mascota que ya tiene el disparador. */
  async revokeForCreatorLostPetAuthority(deps: Revocation, repositories: RepositorySet, input: { readonly petId: string; readonly actorUserId: string | null; readonly now: string }): Promise<void> {
    const { petId, actorUserId, now } = input;
    const state = await repositories.pets.findOwnership(petId);
    if (state === null) return;
    const coOwners = await repositories.coOwners.listByPet(petId);
    for (const linkId of await repositories.shareLinkPets.listLinkIdsByPet(petId)) {
      const link = await repositories.shareLinks.findById(linkId);
      if (link === null || link.scope !== 'PETS' || deriveStatus(link, now) !== 'ACTIVE') continue;
      if (isOwnerOfPet(link.createdByUserId, { ownerUserId: state.ownerUserId, coOwners })) continue;
      await revokeLinkNow(deps, repositories, link, actorUserId, now);
    }
  },

  /** Fila 3 de §5.1: toma el candado del hogar (paso 2 del orden de §6) y revoca los `PETS` activos de H cuyo creador ya no es propietario ni `ADMIN` `ACTIVE`. */
  async revokeForCreatorsWithoutHouseholdRole(deps: Revocation, repositories: RepositorySet, input: { readonly householdId: string; readonly actorUserId: string | null; readonly now: string }): Promise<void> {
    const { householdId, actorUserId, now } = input;
    await repositories.shareLinks.lockScope('PETS', householdId);
    for (const link of await repositories.shareLinks.listPetsByHousehold(householdId, retentionCutoffs(now).links)) {
      if (deriveStatus(link, now) !== 'ACTIVE') continue;
      const memberships = await repositories.households.listMembershipsOfUsers([link.createdByUserId]);
      if (!isHouseholdManager(memberships, householdId)) await revokeLinkNow(deps, repositories, link, actorUserId, now);
    }
  },

  /** Borrado de una mascota o del hogar: revoca los `PETS` activos que la contienen ANTES de la cascada (nunca queda un `PETS` activo con cero filas). */
  async revokeForPetDeleted(deps: Revocation, repositories: RepositorySet, input: { readonly petId: string; readonly actorUserId: string | null; readonly now: string }): Promise<void> {
    const { petId, actorUserId, now } = input;
    for (const linkId of await repositories.shareLinkPets.listLinkIdsByPet(petId)) {
      const link = await repositories.shareLinks.findById(linkId);
      if (link !== null && link.scope === 'PETS') await revokeLinkNow(deps, repositories, link, actorUserId, now);
    }
  },
};
