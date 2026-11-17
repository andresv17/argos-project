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
import type { MaintenanceCounts, MaintenanceCutoffs, UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.ts';
import type { DeterministicFaultInjector } from '../fault-injector.ts';
import type { SqliteDatabase } from './sqlite-database.ts';
import { createSqliteRepositories } from './sqlite-repositories.ts';

/** @implements INV-ARCH-005, ERR-INTERNAL-UNEXPECTED */
export class SqliteUnitOfWork implements UnitOfWorkPort {
  private readonly repositories: RepositorySet;
  private queue: Promise<unknown> = Promise.resolve();

  /** `faultInjector`: fallo determinista de la escritura N de cada transacción (SC-004, T277); sin él, no cambia nada. */
  constructor(
    private readonly db: SqliteDatabase,
    private readonly faultInjector?: DeterministicFaultInjector,
  ) {
    this.repositories = createSqliteRepositories(db);
  }

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.execute(work));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * ADR-002-13 / plan.md:99: checkpoint del WAL con truncado tras el commit. `wal_checkpoint(TRUNCATE)` devuelve
   * `{ busy, log, checkpointed }`; `busy !== 0` (o una excepción) es un fallo: se reintenta una vez y, si persiste, solo se
   * emite un aviso sin identificadores. Nunca revierte nada.
   */
  async checkpointAfterCommit(): Promise<void> {
    await this.queue;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (this.truncateWal()) return;
    }
    process.emitWarning('No se pudo truncar el WAL tras la eliminación; el borrado físico queda pendiente.');
  }

  /**
   * ADR-002-14: purga de retención en una transacción. Las sentencias son definitivas (`secure_delete = ON` borra el
   * contenido de las páginas) y solo se devuelven conteos. Tras el commit se trunca el WAL (ADR-002-13).
   * @implements REQ-AUD-001, INV-AUD-001
   */
  async purgeExpired(cutoffs: MaintenanceCutoffs): Promise<MaintenanceCounts> {
    const counts = await this.runInTransaction(async () => {
      const at = (modifiers: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', @now${modifiers})`;
      const run = (sql: string) => this.db.prepare(sql).run(cutoffs).changes;
      return {
        sessionsPurged: run(
          `DELETE FROM sessions WHERE revoked_at < ${at(", '-7 days'")} OR created_at < ${at(", '-7 days', '-24 hours'")} OR last_activity_at < ${at(", '-7 days', '-30 minutes'")}`,
        ),
        confirmationTokensPurged: run('DELETE FROM backup_confirmation_tokens WHERE expires_at < @now'),
        membershipsPurged: run(`DELETE FROM household_members WHERE status IN ('LEFT', 'REMOVED') AND json_extract(data, '$.updatedAt') < ${at(", '-90 days'")}`),
        invitationsPurged: run(
          `DELETE FROM household_invitations WHERE status IN ('ACCEPTED', 'DECLINED', 'CANCELLED') AND COALESCE(responded_at, created_at) < ${at(", '-90 days'")}`,
        ),
        auditRowsPurged: run('DELETE FROM audit_log WHERE timestamp < @auditBefore'),
      };
    });
    await this.checkpointAfterCommit();
    return counts;
  }

  /** true si el checkpoint terminó sin bloqueo (`busy === 0`). */
  private truncateWal(): boolean {
    try {
      const rows = this.db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy?: number }> | undefined;
      return rows?.[0]?.busy === 0;
    } catch {
      return false;
    }
  }

  private async execute<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.faultInjector?.beginTransaction();
      const result = await work(this.faultInjector?.wrap(this.repositories) ?? this.repositories);
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
