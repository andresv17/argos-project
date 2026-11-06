/**
 * Política de acceso a mascotas (funciones puras).
 * - Lectura (INV-ACC-001): el dueño, o un usuario con membresía ACTIVE en un hogar donde el dueño también es ACTIVE.
 * - Escritura (INV-ACC-002): solo el dueño. Quien puede leer pero no es dueño recibe ERR-ACC-FORBIDDEN;
 *   quien no puede leer recibe ERR-PET-NOT-FOUND, igual que si la mascota no existiera.
 *
 * @implements INV-ACC-001, INV-ACC-002, ERR-ACC-FORBIDDEN, INV-ARCH-004
 */

import { DomainError, type HouseholdMember, type PetProfile } from '../../generated/index.ts';

/** Usuario autenticado que pide el acceso. */
export interface AccessSubject {
  readonly id: string;
}

/** Datos de la mascota que necesita la política. */
export type AccessTarget = Pick<PetProfile, 'id' | 'ownerUserId'>;

/** Datos de la membresía que necesita la política. */
export type AccessMembership = Pick<HouseholdMember, 'householdId' | 'userId' | 'status'>;

function activeHouseholdsOf(userId: string, memberships: readonly AccessMembership[]): Set<string> {
  const households = new Set<string>();
  for (const membership of memberships) {
    if (membership.userId === userId && membership.status === 'ACTIVE') {
      households.add(membership.householdId);
    }
  }
  return households;
}

/**
 * Indica si el usuario puede leer la mascota.
 * @implements INV-ACC-001
 */
export function canRead(
  user: AccessSubject,
  pet: AccessTarget,
  memberships: readonly AccessMembership[],
): boolean {
  if (pet.ownerUserId === user.id) {
    return true;
  }
  const ownerHouseholds = activeHouseholdsOf(pet.ownerUserId, memberships);
  for (const householdId of activeHouseholdsOf(user.id, memberships)) {
    if (ownerHouseholds.has(householdId)) {
      return true;
    }
  }
  return false;
}

/**
 * Indica si el usuario puede crear, editar o eliminar la mascota o sus registros.
 * @implements INV-ACC-002
 */
export function canWrite(user: AccessSubject, pet: AccessTarget): boolean {
  return pet.ownerUserId === user.id;
}

/**
 * Devuelve la mascota si el usuario puede leerla; si no existe o no es visible, lanza ERR-PET-NOT-FOUND.
 * @implements INV-ACC-001
 */
export function assertCanRead<T extends AccessTarget>(
  user: AccessSubject,
  pet: T | null | undefined,
  memberships: readonly AccessMembership[],
): T {
  if (pet === null || pet === undefined || !canRead(user, pet, memberships)) {
    throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');
  }
  return pet;
}

/**
 * Devuelve la mascota si el usuario es su dueño.
 * Si no puede leerla lanza ERR-PET-NOT-FOUND; si puede leerla pero no es dueño, ERR-ACC-FORBIDDEN.
 * @implements INV-ACC-002, ERR-ACC-FORBIDDEN
 */
export function assertCanWrite<T extends AccessTarget>(
  user: AccessSubject,
  pet: T | null | undefined,
  memberships: readonly AccessMembership[],
): T {
  const readable = assertCanRead(user, pet, memberships);
  if (!canWrite(user, readable)) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'petId');
  }
  return readable;
}
