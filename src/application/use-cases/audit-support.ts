/**
 * Auditoría de los casos de uso mutadores (REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-005).
 * Regla de filas: una por operación del usuario sobre la entidad raíz; las entidades hijas o en cascada no generan fila
 * propia. Única excepción: cada asignación podada genera una fila UNASSIGN/PET_ASSIGNMENT.
 * Los hashes son SHA-256 sin clave de la vista pública canónica (dominio); `null` en creación (anterior) y borrado (nuevo).
 * Todas las funciones reciben el `RepositorySet` de la transacción en curso: sin transacción propia, la fila y la
 * mutación confirman o se revierten juntas. El reloj y los ids salen de los puertos (INV-ARCH-001, INV-ARCH-002).
 *
 * @implements REQ-AUD-001, INV-AUD-001, SC-012, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import { stateHash } from '../../domain/audit/state-hash.ts';
import type { AuditEntityType, AuditMutationType } from '../../generated/index.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { RecordModule } from '../../domain/records/record-invariants.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export interface AuditChange {
  readonly executorUserId: string;
  readonly mutationType: AuditMutationType;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  /** Estado de la entidad antes de la mutación; `null` en creación. */
  readonly previous: unknown;
  /** Estado de la entidad después de la mutación; `null` en borrado. */
  readonly next: unknown;
}

/** Entidad de auditoría de cada módulo de registros clínicos. */
export const RECORD_ENTITY_TYPE: Readonly<Record<RecordModule, AuditEntityType>> = {
  weights: 'WEIGHT_RECORD',
  bodyMeasurements: 'BODY_MEASUREMENT',
  vaccinations: 'VACCINATION_RECORD',
  dewormings: 'DEWORMING_RECORD',
  medicalVisits: 'APPOINTMENT_RECORD',
  customParameters: 'CUSTOM_PARAMETER',
};

/** Añade la fila de auditoría de una mutación exitosa dentro de la transacción en curso. */
export async function recordAudit(deps: ApplicationDeps, repositories: RepositorySet, change: AuditChange): Promise<void> {
  await deps.auditLog.append(repositories, {
    id: deps.auditIds.nextId(),
    timestamp: deps.clock.nowIsoTimestamp(),
    executorUserId: change.executorUserId,
    mutationType: change.mutationType,
    entityType: change.entityType,
    entityId: change.entityId,
    previousStateHash: change.previous === null ? null : stateHash(change.previous),
    newStateHash: change.next === null ? null : stateHash(change.next),
  });
}

/** `entityId` determinista de una asignación: HMAC de "<petId>:<householdId>" (sin identificadores en claro). */
export function assignmentAuditId(deps: ApplicationDeps, petId: string, householdId: string): string {
  return deps.auditPseudonym.hmacUserId(`${petId}:${householdId}`, deps.auditHmacSecret);
}

/** Fila UNASSIGN de una asignación retirada (poda por transferencia, baja o salida de un miembro). */
export async function recordAssignmentRemoved(
  deps: ApplicationDeps,
  repositories: RepositorySet,
  executorUserId: string,
  assignment: { readonly petId: string; readonly householdId: string },
): Promise<void> {
  await recordAudit(deps, repositories, {
    executorUserId,
    mutationType: 'UNASSIGN',
    entityType: 'PET_ASSIGNMENT',
    entityId: assignmentAuditId(deps, assignment.petId, assignment.householdId),
    previous: assignment,
    next: null,
  });
}
