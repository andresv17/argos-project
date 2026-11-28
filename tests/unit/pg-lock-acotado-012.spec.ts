/**
 * Bloqueo acotado de las transacciones de propiedad en PostgreSQL (REQ-OWN12-011, NFR-012-008, EDGE-012-052): orden de los topes y mapeo 55P03 -> ERR-OWN12-RETRYABLE
 * del candado asesor global, con doble del pool (sin Postgres).
 */
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../src/generated/v38/index.ts';
import { OWNERSHIP_LOCK_TIMEOUT_MS } from '../../src/domain/platform/feature-012-limits.ts';
import {
  PG_IDLE_IN_TRANSACTION_TIMEOUT,
  PG_LOCK_TIMEOUT,
  PG_STATEMENT_TIMEOUT,
  PostgresUnitOfWork,
} from '../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';

const ADVISORY = 'SELECT pg_advisory_xact_lock($1)';
const seconds = (value: string): number => Number(value.replace('s', '')) * 1000;

function clientFailingOnLock(code: string) {
  const statements: string[] = [];
  const client = {
    statements,
    release: vi.fn(),
    async query(text: string) {
      statements.push(text);
      if (text === ADVISORY) throw Object.assign(new Error('canceling statement due to lock timeout'), { code });
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}
const uowOn = (client: ReturnType<typeof clientFailingOnLock>) =>
  new PostgresUnitOfWork({ connect: async () => client, query: vi.fn(), on: vi.fn(), end: vi.fn() } as never, () => ({}) as never);

describe('orden de los topes de espera (REQ-OWN12-011, REQ-PG-004/012)', () => {
  it('OWNERSHIP_LOCK_TIMEOUT_MS < lock_timeout global = statement_timeout < idle_in_transaction', () => {
    expect(OWNERSHIP_LOCK_TIMEOUT_MS).toBeLessThan(seconds(PG_LOCK_TIMEOUT));
    expect(seconds(PG_LOCK_TIMEOUT)).toBe(seconds(PG_STATEMENT_TIMEOUT));
    expect(seconds(PG_STATEMENT_TIMEOUT)).toBeLessThan(seconds(PG_IDLE_IN_TRANSACTION_TIMEOUT));
    expect([OWNERSHIP_LOCK_TIMEOUT_MS, seconds(PG_LOCK_TIMEOUT), seconds(PG_IDLE_IN_TRANSACTION_TIMEOUT)]).toEqual([3000, 10000, 15000]);
  });
});

describe('candado asesor global acotado (boundedLockWait)', () => {
  it('con la opcion, 55P03 en el candado da ERR-OWN12-RETRYABLE, tras SET LOCAL lock_timeout de 3000 ms y con ROLLBACK', async () => {
    const client = clientFailingOnLock('55P03');
    const work = vi.fn(async () => 1);
    const error = await uowOn(client).runInTransaction(work, { boundedLockWait: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ERR-OWN12-RETRYABLE');
    expect(work).not.toHaveBeenCalled();
    expect(client.statements.indexOf(`SET LOCAL lock_timeout = '${OWNERSHIP_LOCK_TIMEOUT_MS}ms'`)).toBeGreaterThan(client.statements.indexOf("SET LOCAL idle_in_transaction_session_timeout = '15s'"));
    expect(client.statements.indexOf(`SET LOCAL lock_timeout = '${OWNERSHIP_LOCK_TIMEOUT_MS}ms'`)).toBeLessThan(client.statements.indexOf(ADVISORY));
    expect(client.statements).toContain('ROLLBACK');
    expect(client.statements).not.toContain('COMMIT');
  });

  it('sin la opcion, 55P03 se propaga tal cual y no se fija el tope de 3 s (003 intacto)', async () => {
    const client = clientFailingOnLock('55P03');
    const error = await uowOn(client).runInTransaction(async () => 1).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(DomainError);
    expect((error as { code?: string }).code).toBe('55P03');
    expect(client.statements.some((s) => s.includes(`${OWNERSHIP_LOCK_TIMEOUT_MS}ms`))).toBe(false);
  });

  it('con la opcion, otro SQLSTATE del candado se propaga sin mapear', async () => {
    const client = clientFailingOnLock('57014');
    const error = await uowOn(client).runInTransaction(async () => 1, { boundedLockWait: true }).catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe('57014');
  });
});
