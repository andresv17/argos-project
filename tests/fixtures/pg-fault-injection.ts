/**
 * Envoltorio de fallos para los repositorios de PostgreSQL (T426, SC-004 de la 002; REQ-PG-002, INV-ARCH-005).
 * Solo se usa en pruebas, por eso vive en tests/fixtures y no en el adaptador: `PostgresUnitOfWork` ya recibe la fábrica de
 * repositorios por constructor, así que basta envolver esa fábrica; el código de producción no cambia. Reutiliza el
 * `DeterministicFaultInjector` de SQLite y memoria (T277): la escritura N de cada transacción falla antes de emitir su SQL.
 * La fábrica se invoca una vez por transacción, y ahí se reinicia el contador (el N es relativo a la transacción en curso).
 */
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { DeterministicFaultInjector } from '../../src/infrastructure/persistence/fault-injector.ts';
import type { PoolClientLike } from '../../src/infrastructure/persistence/postgres/postgres-database.ts';

export function faultInjectingRepositories(
  injector: DeterministicFaultInjector,
  createRepositories: (client: PoolClientLike) => RepositorySet,
): (client: PoolClientLike) => RepositorySet {
  return (client) => {
    injector.beginTransaction();
    return injector.wrap(createRepositories(client));
  };
}
