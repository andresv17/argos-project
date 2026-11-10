/**
 * UnitOfWorkPort sobre una conexión better-sqlite3.
 * - Las transacciones se ejecutan en serie, en orden de llegada: la conexión es una sola y `work` es asíncrono.
 * - `BEGIN IMMEDIATE` al empezar; `COMMIT` si `work` termina. Si `work` lanza o el `COMMIT` falla, `ROLLBACK` y la
 *   promesa se rechaza con el error original (INV-ARCH-005).
 * - Convención de UnitOfWorkPort (C-6): si el `ROLLBACK` falla, los cambios pueden haber quedado
 *   confirmados; la promesa se rechaza con DomainError ERR-INTERNAL-UNEXPECTED y `finalState` `UNKNOWN`.
 * - C-5: un fallo de lectura dentro de `work` (p. ej. un dato corrupto) es un rechazo normal de la transacción; el
 *   caso de uso de importación lo traduce a `STORAGE_READ_FAILED` si ocurre en CHECKING_DOMAIN_INVARIANTS.
 *
 * @implements INV-ARCH-004, INV-ARCH-005, ERR-INTERNAL-UNEXPECTED
 */

import { DomainError } from '../../../generated/index.ts';
import type { RepositorySet } from '../../../application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.ts';
import type { SqliteDatabase } from './sqlite-database.ts';
import { createSqliteRepositories } from './sqlite-repositories.ts';

/** @implements INV-ARCH-005, ERR-INTERNAL-UNEXPECTED */
export class SqliteUnitOfWork implements UnitOfWorkPort {
  private readonly repositories: RepositorySet;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: SqliteDatabase) {
    this.repositories = createSqliteRepositories(db);
  }

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.execute(work));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async execute<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await work(this.repositories);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  /** Deshace la transacción; si no puede, el estado del almacenamiento es desconocido (C-6). */
  private rollback(): void {
    try {
      this.db.exec('ROLLBACK');
    } catch {
      throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'Falló el rollback del almacenamiento; el estado final es desconocido.', null, 'UNKNOWN');
    }
  }
}
