/**
 * `canActOnPet(user, pet, action, households)`: la ÚNICA función de autoridad sobre una mascota (REQ-OWN12-010, INV-ACC2-002 enmendado por `ENM-002-MINOR-012`).
 * - El principal (`pet.ownerUserId`) manda: el rol OWNER de la matriz (compatibilidad con las mascotas existentes, sin filas de co-propiedad).
 * - Un co-propietario `ACTIVE` cuenta como Propietario Legal (REQ-OWN12-005, paridad de derechos cotidianos) salvo el respaldo, que solo exporta el principal (D12-05).
 * - Cualquier otro estado de fila (`INVITED`, `DECLINED`, `CANCELLED`, `EXPIRED`, `LEFT`, `PROMOTED`, `ENDED`) o con `user_id` nulo no otorga nada.
 * - Miembros de hogar con la mascota asignada: la fila de su rol; el respaldo solo es del principal.
 * - Sin relación con la mascota (incluido un OPERATOR de plataforma) y toda acción fuera del catálogo (no existe expulsar ni degradar, INV-OWN12-002): `false`.
 * Función pura. Quien no tiene lectura recibe el 404 uniforme por otra vía (`requireReadablePet`); aquí solo importa permitir o no.
 *
 * @implements REQ-OWN12-005, REQ-OWN12-010, INV-ACC2-001, INV-ACC2-002, INV-OWN12-002, REQ-RBAC-001
 */

import { effectiveRole, type PetHouseholdAssignment, type RoleMembership } from './effective-role.ts';
import { can, type PetAction } from './rbac.ts';

/** Las 15 acciones de la matriz de la 002 (RBAC + medios + enlaces). */
export const ALL_PET_ACTIONS: readonly PetAction[] = [
  'EDIT_PET_BASICS',
  'DELETE_PET',
  'WRITE_HEALTH_EVENTS',
  'DELETE_HEALTH_EVENTS',
  'WRITE_WEIGHTS_AND_MEASUREMENTS',
  'WRITE_APPOINTMENTS_AND_PARAMETERS',
  'DELETE_OTHER_RECORDS',
  'MANAGE_HOUSEHOLD_MEMBERS',
  'TRANSFER_PET_OWNERSHIP',
  'ASSIGN_PET_TO_HOUSEHOLDS',
  'EXPORT_IMPORT_BACKUP',
  'READ_MEDIA',
  'WRITE_MEDIA',
  'DELETE_MEDIA',
  'CREATE_SHARE_LINK',
];
export type ActOnPetAction = PetAction;

export interface ActOnPetSubject {
  readonly id: string;
  readonly platformRole?: string;
}

export interface ActOnPetTarget {
  readonly id: string;
  readonly ownerUserId: string;
  readonly coOwners: ReadonlyArray<{ readonly userId: string | null; readonly status: string }>;
}

export interface ActOnPetHouseholds {
  readonly memberships: readonly RoleMembership[];
  readonly assignments: readonly PetHouseholdAssignment[];
}

/** ¿Es el principal o un co-propietario `ACTIVE`? (la comparación con `ownerUserId` vive SOLO en este módulo, regla Semgrep REQ-OWN12-010). */
export function isOwnerOfPet(userId: string, pet: Pick<ActOnPetTarget, 'ownerUserId' | 'coOwners'>): boolean {
  return pet.ownerUserId === userId || pet.coOwners.some((row) => row.userId === userId && row.status === 'ACTIVE');
}

export function canActOnPet(user: ActOnPetSubject, pet: ActOnPetTarget, action: ActOnPetAction, households: ActOnPetHouseholds): boolean {
  if (!ALL_PET_ACTIONS.includes(action)) return false;
  if (pet.ownerUserId === user.id) return can('OWNER', action);
  if (pet.coOwners.some((row) => row.userId === user.id && row.status === 'ACTIVE')) return action === 'EXPORT_IMPORT_BACKUP' ? false : can('OWNER', action);
  const role = effectiveRole({ id: user.id }, { id: pet.id, ownerUserId: pet.ownerUserId }, households.memberships, households.assignments);
  if (role === null) return false;
  return action === 'EXPORT_IMPORT_BACKUP' ? false : can(role, action);
}
