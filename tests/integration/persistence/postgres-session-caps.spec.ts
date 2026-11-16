/**
 * T465 (REQ-PG-004, REQ-PG-005, REQ-PG-012, REQ-CLD-006, INV-ARCH-005): topes de sesión de la unidad de trabajo de
 * PostgreSQL verificados con un doble del cliente (sin Postgres). El módulo se importa de forma dinámica para que cada
 * prueba falle por separado mientras `postgres-unit-of-work.ts` no exista (pruebas primero).
 * Las pruebas contra Postgres real se OMITEN sin TEST_DATABASE_URL.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { SHUTDOWN_TIMEOUT_MS, installShutdownHandlers } from '../../../src/infrastructure/http/graceful-shutdown.ts';
import { closePool, createPostgresPool } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const UOW_PATH = '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
const UOW_SOURCE = new URL(UOW_PATH, import.meta.url);

interface UowModule {
  PostgresUnitOfWork: new (pool: unknown, createRepositories: (client: unknown) => unknown) => {
    runInTransaction<T>(work: (repositories: never) => Promise<T>): Promise<T>;
  };
}
const loadUow = async (): Promise<UowModule> => (await import(/* @vite-ignore */ UOW_PATH)) as UowModule;

const ADVISORY = 'SELECT pg_advisory_xact_lock($1)';
const CAPS = ["SET LOCAL lock_timeout = '10s'", "SET LOCAL statement_timeout = '10s'", "SET LOCAL idle_in_transaction_session_timeout = '15s'"];

const reset = (code: string) => Object.assign(new Error('read ECONNRESET postgres://u:clave-secreta@host/db'), { code }); // argos-scan:allow

interface FakeClient {
  readonly statements: string[];
  readonly values: unknown[][];
  readonly release: ReturnType<typeof vi.fn>;
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
}

/** `failOn`: texto exacto de la sentencia -> error que se lanza al ejecutarla. */
function fakeClient(failOn: Record<string, Error> = {}): FakeClient {
  const client: FakeClient = {
    statements: [],
    values: [],
    release: vi.fn(),
    async query(text, values = []) {
      client.statements.push(text);
      client.values.push(values);
      const error = failOn[text];
      if (error) throw error;
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

/** Pool doble: cada `connect()` entrega el siguiente cliente (o rechaza si es un Error). */
function fakePool(...clients: Array<FakeClient | Error>) {
  let next = 0;
  const connect = vi.fn(async () => {
    const item = clients[next++];
    if (item === undefined) throw new Error('sin más clientes');
    if (item instanceof Error) throw item;
    return item;
  });
  return { connect, query: vi.fn(), on: vi.fn(), end: vi.fn(async () => undefined) };
}

async function uowOn(pool: ReturnType<typeof fakePool>) {
  const { PostgresUnitOfWork } = await loadUow();
  return new PostgresUnitOfWork(pool, () => ({}));
}

describe('PostgresUnitOfWork: orden y texto de las sentencias (REQ-PG-004, REQ-PG-012)', () => {
  it('emite BEGIN, los tres SET LOCAL, el candado asesor y COMMIT, en ese orden y con ese texto exacto', async () => {
    const client = fakeClient();
    const uow = await uowOn(fakePool(client));
    const seen: string[] = [];
    await uow.runInTransaction(async () => {
      seen.push(...client.statements);
      return 1;
    });
    expect(client.statements).toEqual(['BEGIN', ...CAPS, ADVISORY, 'COMMIT']);
    expect(seen).toEqual(['BEGIN', ...CAPS, ADVISORY]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('idle_in_transaction_session_timeout es 15 s; lock y statement 10 s (REQ-PG-004/012)', async () => {
    const client = fakeClient();
    await (await uowOn(fakePool(client))).runInTransaction(async () => undefined);
    expect(client.statements).toContain("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    expect(client.statements).toContain("SET LOCAL lock_timeout = '10s'");
    expect(client.statements).toContain("SET LOCAL statement_timeout = '10s'");
  });

  it('el candado asesor usa una constante numérica fija y la misma en cada transacción', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const uow = await uowOn(fakePool(a, b));
    await uow.runInTransaction(async () => undefined);
    await uow.runInTransaction(async () => undefined);
    const idx = a.statements.indexOf(ADVISORY);
    expect(a.values[idx]).toHaveLength(1);
    expect(typeof a.values[idx]?.[0]).toBe('number');
    expect(b.values[b.statements.indexOf(ADVISORY)]).toEqual(a.values[idx]);
  });

  it('devuelve el resultado de work', async () => {
    const uow = await uowOn(fakePool(fakeClient()));
    await expect(uow.runInTransaction(async () => 42)).resolves.toBe(42);
  });

  it('el módulo no usa SET de sesión ni process.env (INV-ARCH-006, PgBouncer)', () => {
    const source = readFileSync(UOW_SOURCE, 'utf8');
    expect(source).not.toMatch(/\bSET\s+(?!LOCAL)/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/schema_migrations/);
  });
});

describe('PostgresUnitOfWork: COMMIT, ROLLBACK y convención C-6 (REQ-PG-005, INV-ARCH-005)', () => {
  it('si work lanza: ROLLBACK, sin COMMIT, error original', async () => {
    const client = fakeClient();
    const boom = new Error('fallo de negocio');
    await expect((await uowOn(fakePool(client))).runInTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(client.statements.at(-1)).toBe('ROLLBACK');
    expect(client.statements).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('si COMMIT falla: ROLLBACK y error original', async () => {
    const commitError = Object.assign(new Error('commit falló'), { code: '40001' });
    const client = fakeClient({ COMMIT: commitError });
    await expect((await uowOn(fakePool(client))).runInTransaction(async () => 1)).rejects.toBe(commitError);
    expect(client.statements.slice(-2)).toEqual(['COMMIT', 'ROLLBACK']);
  });

  it('si ROLLBACK falla: DomainError ERR-INTERNAL-UNEXPECTED con finalState UNKNOWN y el cliente se descarta', async () => {
    const client = fakeClient({ ROLLBACK: Object.assign(new Error('rollback falló'), { code: '57P01' }) });
    const uow = await uowOn(fakePool(client));
    const error = await uow.runInTransaction(async () => Promise.reject(new Error('original'))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ERR-INTERNAL-UNEXPECTED');
    expect((error as DomainError).finalState).toBe('UNKNOWN');
    expect(client.release.mock.calls[0]?.[0]).toBeTruthy();
  });
});

describe('PostgresUnitOfWork: reintento único por ECONNRESET previo al primer comando (REQ-PG-005)', () => {
  it('ECONNRESET en BEGIN: descarta el cliente y reintenta una vez con otro', async () => {
    const dead = fakeClient({ BEGIN: reset('ECONNRESET') });
    const alive = fakeClient();
    const pool = fakePool(dead, alive);
    const work = vi.fn(async () => 'ok');
    await expect((await uowOn(pool)).runInTransaction(work)).resolves.toBe('ok');
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(work).toHaveBeenCalledTimes(1);
    expect(dead.release.mock.calls[0]?.[0]).toBeTruthy();
    expect(alive.statements).toEqual(['BEGIN', ...CAPS, ADVISORY, 'COMMIT']);
  });

  it('ECONNRESET en connect(): reintenta una vez', async () => {
    const alive = fakeClient();
    const pool = fakePool(reset('ECONNRESET'), alive);
    await expect((await uowOn(pool)).runInTransaction(async () => 1)).resolves.toBe(1);
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });

  it('dos ECONNRESET seguidos: un solo reintento y luego falla', async () => {
    const pool = fakePool(fakeClient({ BEGIN: reset('ECONNRESET') }), fakeClient({ BEGIN: reset('ECONNRESET') }), fakeClient());
    await expect((await uowOn(pool)).runInTransaction(async () => 1)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });

  it('ECONNRESET después de BEGIN (en un SET LOCAL): no se reintenta', async () => {
    const pool = fakePool(fakeClient({ [CAPS[0] ?? '']: reset('ECONNRESET') }), fakeClient());
    const work = vi.fn(async () => 1);
    await expect((await uowOn(pool)).runInTransaction(work)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it('ECONNRESET dentro de work: no se reintenta ni se repite work', async () => {
    const pool = fakePool(fakeClient(), fakeClient());
    const work = vi.fn(async () => Promise.reject(reset('ECONNRESET')));
    await expect((await uowOn(pool)).runInTransaction(work)).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('otro código en BEGIN (57P01): no se reintenta', async () => {
    const pool = fakePool(fakeClient({ BEGIN: reset('57P01') }), fakeClient());
    await expect((await uowOn(pool)).runInTransaction(async () => 1)).rejects.toMatchObject({ code: '57P01' });
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});

describe('keepAlive y SIGTERM (REQ-PG-012, REQ-CLD-006)', () => {
  afterEach(() => vi.useRealTimers());

  it('el pool se crea con keepAlive TCP corto', () => {
    const seen: Array<{ keepAlive: boolean; keepAliveInitialDelayMillis: number }> = [];
    createPostgresPool(
      { connectionString: 'postgres://u:p@h/d', pgPoolMax: 3 }, // argos-scan:allow
      { createPool: (s) => (seen.push(s), { on: () => ({}) as never, end: async () => undefined } as never), log: () => undefined },
    );
    expect(seen[0]?.keepAlive).toBe(true);
    expect(seen[0]?.keepAliveInitialDelayMillis).toBeLessThanOrEqual(10_000);
  });

  it('SIGTERM: espera el cierre del servidor (<= 7 s) y luego cierra el pool; sale con 0', async () => {
    vi.useFakeTimers();
    const pool = fakePool();
    const order: string[] = [];
    const handlers = new Map<string, () => void>();
    const exit = vi.fn();
    installShutdownHandlers({
      target: { on: (signal, listener) => handlers.set(signal, listener) },
      exit,
      closeServer: () => new Promise<void>((r) => setTimeout(() => (order.push('server'), r()), 3_000)),
      closePool: async () => {
        order.push('pool');
        await closePool(pool as never);
      },
    });
    handlers.get('SIGTERM')?.();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(order).toEqual(['server', 'pool']);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(SHUTDOWN_TIMEOUT_MS).toBe(7_000);
  });

  it('SIGTERM con servidor colgado: a los 7 s declara plazo agotado y sale con 1 (antes del SIGKILL de 10 s)', async () => {
    vi.useFakeTimers();
    const handlers = new Map<string, () => void>();
    const exit = vi.fn();
    installShutdownHandlers({
      target: { on: (signal, listener) => handlers.set(signal, listener) },
      exit,
      closeServer: () => new Promise<void>(() => undefined),
    });
    handlers.get('SIGTERM')?.();
    await vi.advanceTimersByTimeAsync(6_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'unidad de trabajo PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)',
  { timeout: 60_000 },
  () => {
    it('los topes SET LOCAL se ven dentro de la transacción y desaparecen al terminar', async () => {
      const { PostgresUnitOfWork } = await loadUow();
      const pool = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 2 });
      let client: { query(sql: string): Promise<{ rows: Array<Record<string, string>> }> } | undefined;
      const uow = new PostgresUnitOfWork(pool, (c) => {
        client = c as typeof client;
        return {};
      });
      const inside = await uow.runInTransaction(async () => {
        const r = await client?.query("SELECT current_setting('lock_timeout') AS l, current_setting('statement_timeout') AS s, current_setting('idle_in_transaction_session_timeout') AS i");
        return r?.rows[0];
      });
      expect(inside).toEqual({ l: '10s', s: '10s', i: '15s' });
      await closePool(pool);
    });
  },
);
