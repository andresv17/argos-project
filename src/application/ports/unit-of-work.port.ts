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

export interface UnitOfWorkPort {
  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T>;
}
