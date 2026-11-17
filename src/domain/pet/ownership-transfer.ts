/**
 * Transferencia de la Propiedad Legal de una mascota (función pura, sin reloj ni I/O).
 * - REQ-OWN-001: solo el Propietario Legal actual transfiere. El destino debe ser miembro ACTIVE de al menos un hogar
 *   al que la mascota está asignada; si no, ERR-OWN-TRANSFER-INVALID-TARGET. La transferencia es inmediata.
 * - Asignaciones: se conservan las de hogares donde el nuevo dueño es ACTIVE y se podan las demás (una fila UNASSIGN
 *   cada una). Las supervivientes pasan a `assignedByUserId = nuevo dueño` (data-model §2.7).
 * - INV-OWN2-001: la mascota queda con exactamente un ownerUserId; los registros pasan al nuevo dueño sin copia.
 * - Una fila OWNERSHIP_TRANSFER sobre la mascota (spec §auditoría H-F5-05).
 *
 * @implements REQ-OWN-001, INV-OWN2-001, ERR-OWN-TRANSFER-INVALID-TARGET, INV-HOUSE-004
 */

import { DomainError } from '../../generated/index.ts';
import type { LegacyHouseholdMember } from '../households/household-policies.ts';

export interface PetOwnershipRef {
  readonly id: string;
  readonly ownerUserId: string;
}

/** Asignación mascota-hogar con el dueño que la respondió (REQ-HOUSE2-003). */
export interface PetAssignmentRow {
  readonly petId: string;
  readonly householdId: string;
  readonly assignedByUserId?: string;
}

export interface TransferPetOwnershipCommand {
  readonly pet: PetOwnershipRef;
  readonly actorUserId: string;
  readonly newOwnerUserId: string;
  readonly memberships: readonly LegacyHouseholdMember[];
  readonly assignments: readonly PetAssignmentRow[];
}

export type PetAuditEntry =
  | { readonly kind: 'OWNERSHIP_TRANSFER'; readonly petId: string; readonly fromUserId: string; readonly toUserId: string }
  | { readonly kind: 'UNASSIGN'; readonly petId: string; readonly householdId: string };

export interface TransferPetOwnershipResult {
  readonly pet: PetOwnershipRef;
  readonly assignments: PetAssignmentRow[];
  readonly audit: PetAuditEntry[];
}

/**
 * @implements REQ-OWN-001, INV-OWN2-001, ERR-OWN-TRANSFER-INVALID-TARGET
 */
export function transferPetOwnership(command: TransferPetOwnershipCommand): TransferPetOwnershipResult {
  const { pet, actorUserId, newOwnerUserId, memberships, assignments } = command;

  if (pet.ownerUserId !== actorUserId) {
    throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'petId');
  }
  if (newOwnerUserId === pet.ownerUserId) {
    throw new DomainError('ERR-OWN-TRANSFER-INVALID-TARGET', undefined, 'newOwnerUserId');
  }

  const petHouseholds = assignments.filter((a) => a.petId === pet.id);
  const newOwnerActiveHouseholds = new Set(
    memberships.filter((m) => m.userId === newOwnerUserId && m.status === 'ACTIVE').map((m) => m.householdId),
  );
  const eligible = petHouseholds.filter((a) => newOwnerActiveHouseholds.has(a.householdId));
  if (eligible.length === 0) {
    throw new DomainError('ERR-OWN-TRANSFER-INVALID-TARGET', undefined, 'newOwnerUserId');
  }

  const kept: PetAssignmentRow[] = [];
  const audit: PetAuditEntry[] = [];
  for (const assignment of assignments) {
    if (assignment.petId !== pet.id) {
      kept.push(assignment);
    } else if (newOwnerActiveHouseholds.has(assignment.householdId)) {
      kept.push({ ...assignment, assignedByUserId: newOwnerUserId });
    } else {
      audit.push({ kind: 'UNASSIGN', petId: pet.id, householdId: assignment.householdId });
    }
  }

  return {
    pet: { ...pet, ownerUserId: newOwnerUserId },
    assignments: kept,
    audit: [{ kind: 'OWNERSHIP_TRANSFER', petId: pet.id, fromUserId: actorUserId, toUserId: newOwnerUserId }, ...audit],
  };
}
