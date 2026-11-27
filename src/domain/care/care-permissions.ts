/**
 * Acceso de cuidado de un usuario sobre una mascota (Feature 012, Bloque C). Función pura (`now` por parámetro).
 * Titulares (principal y co-propietarios ACTIVE): todo. CAREGIVER ACTIVE de un hogar con la mascota asignada: `VIEW_ONLY` por defecto o el nivel concedido
 * (la fila solo vale mientras se cumpla eso, T-C2; `careUntil` inclusivo hasta las 23:59:59 de Bogotá). ADMIN, MEMBER y READER: sin acceso.
 * Los permisos clínicos del rol CAREGIVER no cambian con el nivel (D12-10 = A).
 *
 * @implements REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-007, SC-012-030, SC-012-036, SC-012-077
 */
import { isOwnerOfPet, type CoOwnerStatusRef } from '../access/pet-ownership.ts';
import type { PetHouseholdAssignment, RoleMembership } from '../access/effective-role.ts';
import { bogotaInstantMs } from './care-time.ts';

export type CareLevel = 'BASIC_LOG' | 'VIEW_ONLY';

export interface CaregiverAccessRow {
  readonly petId: string;
  readonly userId: string;
  readonly level: CareLevel;
  readonly careUntil: string | null;
}

export interface MyCareAccess {
  readonly caregiver: boolean;
  readonly level: CareLevel | null;
  readonly defaultedToViewOnly: boolean;
  readonly careUntil: string | null;
  readonly canViewRoutines: boolean;
  readonly canLogCare: boolean;
  readonly canManageRoutines: boolean;
  readonly clinicalPermissionsUnchanged: true;
}

const NONE: MyCareAccess = { caregiver: false, level: null, defaultedToViewOnly: false, careUntil: null, canViewRoutines: false, canLogCare: false, canManageRoutines: false, clinicalPermissionsUnchanged: true };

export function computeMyCareAccess(input: {
  userId: string;
  pet: { id: string; ownerUserId: string; coOwners: readonly CoOwnerStatusRef[] };
  households: { memberships: readonly RoleMembership[]; assignments: readonly PetHouseholdAssignment[] };
  accessRows: readonly CaregiverAccessRow[];
  now: string;
}): MyCareAccess {
  const { userId, pet, households } = input;
  if (isOwnerOfPet(userId, pet)) return { ...NONE, canViewRoutines: true, canLogCare: true, canManageRoutines: true };
  const isCaregiver = households.memberships.some(
    (m) => m.userId === userId && m.role === 'CAREGIVER' && m.status === 'ACTIVE' && households.assignments.some((a) => a.petId === pet.id && a.householdId === m.householdId),
  );
  if (!isCaregiver) return NONE;
  const row = input.accessRows.find((r) => r.petId === pet.id && r.userId === userId) ?? null;
  const expired = row !== null && row.careUntil !== null && Date.parse(input.now) >= bogotaInstantMs(row.careUntil, '00:00') + 86_400_000;
  const level: CareLevel = row !== null && !expired ? row.level : 'VIEW_ONLY';
  return {
    caregiver: true,
    level,
    defaultedToViewOnly: row === null || expired,
    careUntil: row?.careUntil ?? null,
    canViewRoutines: true,
    canLogCare: level === 'BASIC_LOG',
    canManageRoutines: false,
    clinicalPermissionsUnchanged: true,
  };
}
