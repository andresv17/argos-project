/**
 * Autoridad sobre el alcance de un enlace veterinario (feature 005, D5-10, D5-19, REQ-VET-001, REQ-VET-002, REQ-VET-011): comparten los casos de uso de
 * creación, listado, revocación, vista previa y la resolución pública.
 * - `PET`: el permiso `CREATE_SHARE_LINK` se decide con el ROL EFECTIVO sobre la mascota (propietario legal o ADMIN; 404 antes que 403).
 * - `HOUSEHOLD`: se decide con el rol del usuario EN ese hogar (propietario del hogar o `ADMIN` ACTIVE), nunca con el rol efectivo por mascota (B3 de
 *   /merovingian); el conjunto servido son las mascotas asignadas AHORA al hogar Y de propiedad legal del creador (D5-19), calculado en cada petición.
 * @implements REQ-VET-001, REQ-VET-002, REQ-VET-011, INV-005-001, INV-005-006, INV-ACC2-001
 */
import { isOwnerRow, type LegacyHouseholdMember } from '../../domain/households/household-policies.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { ShareScope } from '../../domain/sharing/share-link.ts';
import { DomainError } from '../../generated/index.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { requirePetAction } from '../use-cases/use-case-support.ts';

export type ShareScopeRef = { readonly scope: 'PET'; readonly petId: string } | { readonly scope: 'HOUSEHOLD'; readonly householdId: string };

export const scopeIdOf = (ref: ShareScopeRef): string => (ref.scope === 'PET' ? ref.petId : ref.householdId);

/** Propietario o ADMIN ACTIVE del hogar según las membresías ya leídas. */
export function isHouseholdManager(memberships: readonly LegacyHouseholdMember[], householdId: string): boolean {
  return memberships.some((m) => m.householdId === householdId && m.status === 'ACTIVE' && (isOwnerRow(m) || m.role === 'ADMIN'));
}

/** Mascotas asignadas ahora al hogar que el usuario posee legalmente. */
export async function ownedAssignedPets(repositories: RepositorySet, householdId: string, userId: string): Promise<PetProfile[]> {
  const assigned = new Set((await repositories.assignments.listByHousehold(householdId)).map((a) => a.petId));
  return (await repositories.pets.listByOwners([userId])).filter((pet) => assigned.has(pet.id));
}

export interface ShareAuthority {
  /** Mascotas que el alcance sirve ahora mismo (PET: la elegida; HOUSEHOLD: las propias asignadas). */
  readonly pets: PetProfile[];
  /** `pets.owner_user_id` vigente (alcance PET), para `pet_owner_user_id_at_creation`; nulo en HOUSEHOLD. */
  readonly petOwnerUserId: string | null;
}

/**
 * Exige `CREATE_SHARE_LINK` sobre el alcance. Mascota u hogar ajenos o inexistentes: 404 (ERR-PET-NOT-FOUND / ERR-HOUSE-NOT-FOUND); visible sin permiso:
 * ERR-ACC-FORBIDDEN. `requireServedPets` exige además un conjunto no vacío (HOUSEHOLD sin mascotas propias: ERR-ACC-FORBIDDEN, D5-19).
 */
export async function requireShareAuthority(repositories: RepositorySet, userId: string, ref: ShareScopeRef, requireServedPets: boolean): Promise<ShareAuthority> {
  if (ref.scope === 'PET') {
    const { pet } = await requirePetAction(repositories, userId, ref.petId, 'CREATE_SHARE_LINK');
    return { pets: [pet], petOwnerUserId: pet.ownerUserId };
  }
  const memberships = await repositories.households.listMembershipsOfUsers([userId]);
  const active = memberships.find((m) => m.householdId === ref.householdId && m.status === 'ACTIVE');
  if (active === undefined) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
  if (!isHouseholdManager(memberships, ref.householdId)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  const pets = await ownedAssignedPets(repositories, ref.householdId, userId);
  if (requireServedPets && pets.length === 0) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  return { pets, petOwnerUserId: null };
}

export type { ShareScope };
