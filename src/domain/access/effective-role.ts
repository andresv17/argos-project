/**
 * Rol efectivo de un usuario sobre una mascota (función pura).
 * - Propietario Legal (`pet.ownerUserId`): OWNER, sin mirar membresías ni asignaciones (el dueño manda).
 * - Resto: el mayor rol de las membresías ACTIVE del usuario en los hogares donde la mascota está asignada,
 *   con el orden ADMIN > CAREGIVER > READER. Sin ninguna, null: la mascota no es visible (INV-ACC2-001).
 * - Solo cuentan las membresías en estado ACTIVE; INVITED, DECLINED, CANCELLED, LEFT y REMOVED no otorgan rol.
 *
 * @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002
 */

import type { RbacRole } from './rbac.ts';

/** Membresía con rol (`role` nunca es OWNER: el Propietario Legal se decide por la mascota, no por la membresía). */
export interface RoleMembership {
  readonly userId: string;
  readonly householdId: string;
  readonly status: string;
  readonly role: Exclude<RbacRole, 'OWNER'>;
}

/** Asignación mascota-hogar (REQ-HOUSE2-003). */
export interface PetHouseholdAssignment {
  readonly petId: string;
  readonly householdId: string;
}

/** Usuario que pide el acceso. */
export interface EffectiveRoleSubject {
  readonly id: string;
}

/** Mascota sobre la que se calcula el rol. */
export interface EffectiveRolePet {
  readonly id: string;
  readonly ownerUserId: string;
}

/** Orden de precedencia entre roles de membresía (el mayor gana). */
const MEMBER_RANK: Readonly<Record<Exclude<RbacRole, 'OWNER'>, number>> = { READER: 1, CAREGIVER: 2, ADMIN: 3 };

/**
 * Devuelve el rol efectivo del usuario sobre la mascota, o null si no tiene acceso alguno.
 * No depende del orden de las listas.
 * @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002
 */
export function effectiveRole(
  user: EffectiveRoleSubject,
  pet: EffectiveRolePet,
  memberships: readonly RoleMembership[],
  assignments: readonly PetHouseholdAssignment[],
): RbacRole | null {
  if (pet.ownerUserId === user.id) {
    return 'OWNER';
  }
  const assignedHouseholds = new Set(
    assignments.filter((assignment) => assignment.petId === pet.id).map((assignment) => assignment.householdId),
  );
  let best: Exclude<RbacRole, 'OWNER'> | null = null;
  for (const membership of memberships) {
    if (membership.userId !== user.id || membership.status !== 'ACTIVE') continue;
    if (!assignedHouseholds.has(membership.householdId)) continue;
    if (best === null || MEMBER_RANK[membership.role] > MEMBER_RANK[best]) {
      best = membership.role;
    }
  }
  return best;
}
