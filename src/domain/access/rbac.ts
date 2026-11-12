/**
 * Matriz de permisos por rol efectivo (funciones puras).
 * - `can(rol, acción)` decide cada acción con el rol efectivo del usuario sobre la mascota (REQ-RBAC-001).
 * - `petPermissionsFor(rol)` proyecta `can` sobre las 9 acciones de `PetPermissions` que ve la interfaz.
 * - Rol nulo (sin acceso): ninguna acción permitida. La visibilidad la decide `effectiveRole` (INV-ACC2-001).
 *
 * La fila «Invitar, expulsar y cambiar rol de miembros» (MANAGE_HOUSEHOLD_MEMBERS) es una acción sobre el hogar:
 * aquí solo fija el rol; las excepciones del propietario del hogar viven en el caso de uso (REQ-HOUSE2-002).
 *
 * @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002, ERR-ACC-FORBIDDEN
 */

import type { PetPermissions, RbacAction, RbacRole } from '../../generated/index.ts';

export type { PetPermissions, RbacAction, RbacRole };

/** Roles que pueden ejecutar cada acción (REQ-RBAC-001, tabla §5.2 de la spec). */
const RBAC_MATRIX: Readonly<Record<RbacAction, readonly RbacRole[]>> = {
  EDIT_PET_BASICS: ['OWNER', 'ADMIN'],
  DELETE_PET: ['OWNER'],
  WRITE_HEALTH_EVENTS: ['OWNER', 'ADMIN', 'CAREGIVER'],
  DELETE_HEALTH_EVENTS: ['OWNER', 'ADMIN'],
  WRITE_WEIGHTS_AND_MEASUREMENTS: ['OWNER', 'ADMIN', 'CAREGIVER'],
  WRITE_APPOINTMENTS_AND_PARAMETERS: ['OWNER', 'ADMIN'],
  DELETE_OTHER_RECORDS: ['OWNER', 'ADMIN'],
  MANAGE_HOUSEHOLD_MEMBERS: ['OWNER', 'ADMIN'],
  TRANSFER_PET_OWNERSHIP: ['OWNER'],
  ASSIGN_PET_TO_HOUSEHOLDS: ['OWNER'],
  EXPORT_IMPORT_BACKUP: ['OWNER', 'ADMIN', 'CAREGIVER', 'READER'],
};

/**
 * Indica si el rol efectivo puede ejecutar la acción.
 * @implements REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002
 */
export function can(role: RbacRole, action: RbacAction): boolean {
  return RBAC_MATRIX[action].includes(role);
}

/**
 * Proyecta la matriz sobre una mascota: los 9 permisos que la interfaz recibe en `permissions`.
 * Sin rol efectivo (null) todos son falsos.
 * @implements REQ-RBAC-001, INV-ACC2-002
 */
export function petPermissionsFor(role: RbacRole | null): PetPermissions {
  const allowed = (action: RbacAction): boolean => role !== null && can(role, action);
  return {
    editPetBasics: allowed('EDIT_PET_BASICS'),
    deletePet: allowed('DELETE_PET'),
    writeHealthEvents: allowed('WRITE_HEALTH_EVENTS'),
    deleteHealthEvents: allowed('DELETE_HEALTH_EVENTS'),
    writeWeightsAndMeasurements: allowed('WRITE_WEIGHTS_AND_MEASUREMENTS'),
    writeAppointmentsAndParameters: allowed('WRITE_APPOINTMENTS_AND_PARAMETERS'),
    deleteOtherRecords: allowed('DELETE_OTHER_RECORDS'),
    transferPetOwnership: allowed('TRANSFER_PET_OWNERSHIP'),
    assignPetToHouseholds: allowed('ASSIGN_PET_TO_HOUSEHOLDS'),
  };
}
