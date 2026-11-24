/**
 * Unidad de trabajo: `runInTransaction(work)` entrega los repositorios de la transacción.
 * Si `work` termina, los cambios se confirman; si lanza, o si falla la confirmación, se descartan todos y la
 * promesa se rechaza con el error original.
 *
 * Fallo del rollback (STATE-BACKUP-001, H-06 C-6): si el almacenamiento no puede deshacer los cambios,
 * la promesa se rechaza con un `DomainError` de código `ERR-INTERNAL-UNEXPECTED` y `finalState` `UNKNOWN`. Cualquier
 * otro rechazo del almacenamiento durante el commit es un `STORAGE_ERROR` (`ERR-BACKUP-ATOMIC-ROLLBACK`). El adaptador
 * de SQLite debe respetar esta convención.
 *
 * @implements INV-ARCH-005
 */

import type { RepositorySet } from './repositories.port.ts';

/**
 * Entradas del mantenimiento ADR-002-14 (UTC). El adaptador deriva de `now` las ventanas fijas (sesiones 7 días más su
 * vida útil de 24 h o 30 min, tokens vencidos, terminales 90 días); `auditBefore` llega calculado en meses de calendario.
 */
export interface MaintenanceCutoffs {
  readonly now: string;
  /** Ahora menos 24 meses de calendario: se purgan las filas de `audit_log` (`timestamp`) y de `admin_audit_entries` (`occurred_at`) anteriores. */
  readonly auditBefore: string;
}

/**
 * Conteos de filas borradas por el mantenimiento: nunca identificadores ni hashes (ADR-002-14, INV-AUD-001).
 * `auditRowsPurged` = filas de `audit_log` + filas de `admin_audit_entries` (RAMA-T1239-03): una sola clave, contrato 003 de 5 claves intacto.
 */
export interface MaintenanceCounts {
  readonly sessionsPurged: number;
  readonly confirmationTokensPurged: number;
  readonly membershipsPurged: number;
  readonly invitationsPurged: number;
  readonly auditRowsPurged: number;
}

export interface UnitOfWorkPort {
  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T>;
  /**
   * Lectura coherente de UNA instantánea (feature 005, REQ-VET-006, EDGE-005-14, SC-005-049): PostgreSQL abre `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`
   * (no toma el candado asesor global: una lectura no bloquea ni es bloqueada por las escrituras); SQLite lee sobre el WAL con `query_only`; memoria trabaja
   * sobre una copia que descarta. Escribir dentro falla. Opcional: sin ella los casos de uso de lectura caen en `runInTransaction`.
   */
  runReadOnly?<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T>;
  /**
   * Borrado físico (ADR-002-13): checkpoint del WAL con truncado, que se invoca DESPUÉS del commit de una eliminación.
   * Nunca lanza: si falla no se revierte nada y el adaptador reintenta y avisa sin identificadores. Opcional: los
   * almacenamientos sin WAL (memoria) lo omiten.
   */
  checkpointAfterCommit?(): Promise<void>;
  /**
   * Mantenimiento ADR-002-14: purga en una sola transacción y devuelve solo conteos. No es una mutación del usuario:
   * no escribe filas de auditoría. Opcional: los almacenamientos sin purga física (memoria) lo omiten.
   */
  purgeExpired?(cutoffs: MaintenanceCutoffs): Promise<MaintenanceCounts>;
}
