/**
 * Guardas puras de la eliminación de cuenta (STATE-ACCOUNT-DELETE-001, REQ-ACC-002).
 * - Frase literal `ELIMINAR MI CUENTA` y forma del token de confirmación (ConfirmationToken: 43 caracteres base64url).
 * - Plan de hogares (N-5): un hogar cuyo propietario es la persona y que tiene otro miembro ACTIVE bloquea la
 *   eliminación (ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD); si la persona es su único miembro ACTIVE, el hogar se elimina en
 *   cascada con sus membresías e invitaciones. Solo cuentan los miembros ACTIVE.
 * - Plan de mascotas (B5): una mascota del usuario asignada a un hogar con otro miembro ACTIVE (distinto del usuario)
 *   bloquea (ERR-ACCOUNT-OWNS-SHARED-PETS); la asignación a un hogar donde el usuario es el único ACTIVE no bloquea.
 * - Aserción B6: en los hogares en cascada toda asignación debe ser de una mascota del usuario.
 *
 * @implements REQ-ACC-002, STATE-ACCOUNT-DELETE-001, ERR-ACCOUNT-CONFIRMATION-MISMATCH, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS, INV-ARCH-004
 */

import { STATE_ACCOUNT_DELETE_001 } from '../../generated/index.ts';
import { isOwnerRow, type LegacyHouseholdMember } from '../households/household-policies.ts';

export const CONFIRMATION_PHRASE: string = STATE_ACCOUNT_DELETE_001.constants.CONFIRMATION_PHRASE;
export const CONFIRMATION_TOKEN_TTL_MINUTES: number = STATE_ACCOUNT_DELETE_001.constants.CONFIRMATION_TOKEN_TTL_MINUTES;

const CONFIRMATION_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** true si el valor es una cadena con la forma de ConfirmationToken. @implements REQ-ACC-002, ERR-ACCOUNT-CONFIRMATION-MISMATCH */
export function isConfirmationTokenShape(value: unknown): value is string {
  return typeof value === 'string' && CONFIRMATION_TOKEN_SHAPE.test(value);
}

export interface HouseholdDeletionPlan {
  /** Hogares de los que la persona es propietaria y que tienen otro miembro ACTIVE. */
  readonly blockingHouseholdIds: string[];
  /** Hogares donde la persona es el único miembro ACTIVE: se eliminan en cascada. */
  readonly cascadeHouseholdIds: string[];
}

/**
 * Clasifica los hogares de la persona a partir de las membresías de esos hogares (todas las filas de cada hogar).
 * @implements REQ-ACC-002, STATE-ACCOUNT-DELETE-001, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD
 */
export function planHouseholdsForDeletion(userId: string, memberships: readonly LegacyHouseholdMember[]): HouseholdDeletionPlan {
  const blocking: string[] = [];
  const cascade: string[] = [];
  const householdIds = [...new Set(memberships.filter((m) => m.userId === userId && m.status === 'ACTIVE' && isOwnerRow(m)).map((m) => m.householdId))];
  for (const householdId of householdIds) {
    const othersActive = memberships.some((m) => m.householdId === householdId && m.status === 'ACTIVE' && m.userId !== userId);
    (othersActive ? blocking : cascade).push(householdId);
  }
  return { blockingHouseholdIds: blocking, cascadeHouseholdIds: cascade };
}

/** Forma mínima de una asignación mascota-hogar que necesita la guarda (compatible con PetAssignmentRecord). */
export interface AssignmentRef {
  readonly petId: string;
  readonly householdId: string;
}

export interface PetDeletionPlan<A extends AssignmentRef = AssignmentRef> {
  /** Asignaciones de mascotas del usuario a hogares con otro miembro ACTIVE: bloquean (B5). */
  readonly blockingAssignments: A[];
  /** Asignaciones de otras mascotas dentro de hogares en cascada: violan la aserción B6. */
  readonly foreignAssignmentsInCascade: A[];
}

/**
 * Clasifica las asignaciones para la eliminación de cuenta.
 * @param ownedPetIds mascotas de las que el usuario es Propietario Legal
 * @param assignments todas las asignaciones de esas mascotas y de los hogares en cascada
 * @param memberships todas las membresías de los hogares implicados
 * @param cascadeHouseholdIds hogares que se eliminan con la cuenta (el usuario es su único ACTIVE)
 * @implements REQ-ACC-002, STATE-ACCOUNT-DELETE-001, ERR-ACCOUNT-OWNS-SHARED-PETS
 */
export function planPetAssignmentsForDeletion<A extends AssignmentRef>(
  userId: string,
  ownedPetIds: readonly string[],
  assignments: readonly A[],
  memberships: readonly LegacyHouseholdMember[],
  cascadeHouseholdIds: readonly string[],
): PetDeletionPlan<A> {
  const owned = new Set(ownedPetIds);
  const blocking = assignments.filter(
    (a) => owned.has(a.petId) && memberships.some((m) => m.householdId === a.householdId && m.status === 'ACTIVE' && m.userId !== userId),
  );
  const foreign = assignments.filter((a) => cascadeHouseholdIds.includes(a.householdId) && !owned.has(a.petId));
  return { blockingAssignments: blocking, foreignAssignmentsInCascade: foreign };
}
