/**
 * UnitOfWorkPort sobre un pool de PostgreSQL (`pg`).
 * - Cada transacción toma un cliente del pool y ejecuta, en este orden: `BEGIN`; `SET LOCAL` de `lock_timeout` (10 s),
 *   `statement_timeout` (10 s) e `idle_in_transaction_session_timeout` (15 s); `pg_advisory_xact_lock(K)`; `work`; `COMMIT`.
 *   Los `SET LOCAL` van ANTES del candado para que `lock_timeout` acote la espera del propio candado (REQ-PG-004, REQ-PG-012).
 *   `SET LOCAL` es de transacción: compatible con PgBouncer en modo transacción (nunca el de sesión). El mismo tope
 *   ocioso se fija además a nivel de rol en la migración, no aquí.
 * - `pg_advisory_xact_lock` serializa a los escritores de todas las instancias, como `BEGIN IMMEDIATE` en SQLite (INV-ARCH-005).
 * - Dos niveles de bloqueo (REQ-OWN12-011): (1) candado asesor global, con `lock_timeout` de 10 s por defecto o de `OWNERSHIP_LOCK_TIMEOUT_MS` (3 s) en las
 *   transacciones de propiedad (`boundedLockWait`), cuyo vencimiento (SQLSTATE 55P03) es `ERR-OWN12-RETRYABLE`; (2) `SELECT ... FOR UPDATE` por mascota
 *   (repositorios de propiedad), defensa en profundidad. Orden: global y luego mascotas en `pet_id ASC`. Sin la opcion, 55P03 se propaga (003 intacto).
 * - Convención C-6 (la del adaptador SQLite): si `work` lanza o el `COMMIT` falla, se hace `ROLLBACK` y la promesa se rechaza con
 *   el error original; si el `ROLLBACK` falla, los cambios pueden haber quedado confirmados y se rechaza con DomainError
 *   `ERR-INTERNAL-UNEXPECTED` y `finalState` `UNKNOWN`. En ese caso el cliente se destruye en lugar de devolverse al pool.
 * - Reintento único (REQ-PG-005): un `ECONNRESET` al obtener el cliente o al ejecutar `BEGIN` (el primer comando) descarta
 *   esa conexión y repite desde cero UNA vez con otra; en cualquier momento posterior no hay reintentos.
 * - Sin lectura del entorno (INV-ARCH-006) ni consulta a la tabla de migraciones (T464). Los repositorios los aporta la fábrica
 *   `createRepositories` (T422 en adelante), que recibe el cliente de la transacción.
 *
 * @implements REQ-PG-004, REQ-PG-005, REQ-PG-012, INV-ARCH-005, ERR-INTERNAL-UNEXPECTED
 */

import { DomainError } from '../../../generated/index.ts';
import { DomainError as DomainErrorV38 } from '../../../generated/v38/index.ts';
import type { RepositorySet } from '../../../application/ports/repositories.port.ts';
import type { MaintenanceCounts, MaintenanceCutoffs, UnitOfWorkPort } from '../../../application/ports/unit-of-work.port.ts';
import type { PoolClientLike, PoolLike } from './postgres-database.ts';
import { OWNERSHIP_LOCK_TIMEOUT_MS } from '../../../domain/platform/feature-012-limits.ts';
import { purgeExpiredInBatches } from './postgres-maintenance.ts';

/** Constante de Argos del candado asesor global (ASCII de "ARGOS"). */
export const PG_ADVISORY_LOCK_KEY = 0x4152474f53;
export const PG_LOCK_TIMEOUT = '10s';
export const PG_STATEMENT_TIMEOUT = '10s';
/** Tope de sesión ociosa dentro de una transacción (H-LOCK-003); un cliente muerto libera el candado en 15 s. */
export const PG_IDLE_IN_TRANSACTION_TIMEOUT = '15s';

const SESSION_CAPS: readonly string[] = [
  `SET LOCAL lock_timeout = '${PG_LOCK_TIMEOUT}'`,
  `SET LOCAL statement_timeout = '${PG_STATEMENT_TIMEOUT}'`,
  `SET LOCAL idle_in_transaction_session_timeout = '${PG_IDLE_IN_TRANSACTION_TIMEOUT}'`,
];
const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock($1)';
const OWNERSHIP_LOCK_TIMEOUT_SQL = `SET LOCAL lock_timeout = '${OWNERSHIP_LOCK_TIMEOUT_MS}ms'`;
const isLockNotAvailable = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '55P03';

const isConnectionReset = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ECONNRESET';

/** @implements REQ-PG-004, REQ-PG-005, REQ-PG-012, INV-ARCH-005, ERR-INTERNAL-UNEXPECTED */
export class PostgresUnitOfWork implements UnitOfWorkPort {
  constructor(
    private readonly pool: PoolLike,
    private readonly createRepositories: (client: PoolClientLike) => RepositorySet,
  ) {}

  runInTransaction<T>(work: (repositories: RepositorySet) => Promise<T>, options?: { readonly boundedLockWait?: boolean }): Promise<T> {
    return this.transaction((client) => work(this.createRepositories(client)), options?.boundedLockWait === true);
  }

  /**
   * Lectura coherente de UNA instantánea (feature 005, REQ-VET-006, EDGE-005-14, SC-005-049): `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, con los mismos
   * topes de sesión (`SET LOCAL`) y SIN el candado asesor global: una lectura pública no bloquea ni es bloqueada por las escrituras (`READ COMMITTED` no da
   * una sola vista entre consultas). Una escritura dentro de ella falla con SQLSTATE 25006.
   */
  async runReadOnly<T>(work: (repositories: RepositorySet) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    try {
      for (const sql of SESSION_CAPS) await client.query(sql);
      const result = await work(this.createRepositories(client));
      await client.query('COMMIT');
      client.release();
      return result;
    } catch (error) {
      await this.rollback(client, error);
      throw error;
    }
  }

  /** Mantenimiento ADR-002-14 (REQ-PG-008): solo `DELETE` por lotes en una transacción con los mismos topes y candado. */
  purgeExpired(cutoffs: MaintenanceCutoffs): Promise<MaintenanceCounts> {
    return this.transaction((client) => purgeExpiredInBatches(client, cutoffs));
  }

  private async transaction<T>(work: (client: PoolClientLike) => Promise<T>, boundedLockWait = false): Promise<T> {
    const client = await this.begin();
    try {
      for (const sql of SESSION_CAPS) await client.query(sql);
      if (boundedLockWait) await client.query(OWNERSHIP_LOCK_TIMEOUT_SQL);
      try {
        await client.query(ADVISORY_LOCK_SQL, [PG_ADVISORY_LOCK_KEY]);
      } catch (error) {
        if (boundedLockWait && isLockNotAvailable(error)) throw new DomainErrorV38('ERR-OWN12-RETRYABLE');
        throw error;
      }
      const result = await work(client);
      await client.query('COMMIT');
      client.release();
      return result;
    } catch (error) {
      await this.rollback(client, error);
      throw error;
    }
  }

  /** Obtiene un cliente con `BEGIN` ya emitido; reintenta una sola vez si la conexión se reinició antes de eso. */
  private async begin(): Promise<PoolClientLike> {
    try {
      return await this.openTransaction();
    } catch (error) {
      if (!isConnectionReset(error)) throw error;
      return this.openTransaction();
    }
  }

  private async openTransaction(): Promise<PoolClientLike> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    return client;
  }

  /**
   * Deshace la transacción y libera el cliente; si no puede deshacer, el estado es desconocido (C-6).
   * Desvío documentado (R1 de Oracle): con una conexión realmente caída dentro de `work`, el `ROLLBACK` también falla y el
   * llamador recibe ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN, no el ECONNRESET original. Es conservador (no se afirma un
   * estado que no se pudo comprobar) y coherente con C-6; lo verifican T427/T477 con Postgres real.
   */
  private async rollback(client: PoolClientLike, cause: unknown): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      client.release(rollbackError instanceof Error ? rollbackError : true);
      throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'Falló el rollback del almacenamiento; el estado final es desconocido.', null, 'UNKNOWN');
    }
    client.release(isConnectionReset(cause) ? (cause as Error) : undefined);
  }
}
