/**
 * Unidad de trabajo (plan §3, INV-ARCH-005): `runInTransaction(work)` entrega los repositorios de la transacción.
 * Si `work` termina, los cambios se confirman; si lanza, o si falla la confirmación, se descartan todos y la
 * promesa se rechaza con el error original.
 *
 * @implements INV-ARCH-005
 */

import type { RepositorySet } from './repositories.port.ts';

export interface UnitOfWorkPort {
  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T>;
}
