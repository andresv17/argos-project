/**
 * T427 (REQ-PG-004, SC-CLD-002, INV-ARCH-005): concurrencia de la unidad de trabajo de PostgreSQL.
 * - NO VIVAS (con dobles, siempre se ejecutan): la parte semántica. Un doble de `pg_advisory_xact_lock` que se comporta como
 *   exclusión mutua verifica que dos transacciones concurrentes (de dos pools distintos) pasan por el MISMO candado con la
 *   MISMA constante, que `lock_timeout` se emite antes del candado, y que un 55P03 se propaga sin traducir.
 *   El orden y el texto exactos ya los fijan T421/T465 (postgres-session-caps.spec.ts); aquí solo se añade lo concurrente.
 * - VIVAS (Postgres real): se OMITEN sin TEST_DATABASE_URL; la prueba viva se aplaza a T431 (decisión de Neo, Docker apagado).
 * Reservas de Oracle (T423/T424, T425) trasladadas a T431: R-1 revokeOthers sin validación por fila, R-2 fechas como TEXT,
 * R-1 de T425 texto sin zona; requieren base real y no se cubren con dobles.
 */
import { describe, expect, it, vi } from 'vitest';
import { PG_ADVISORY_LOCK_KEY, PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { closePool, createPostgresPool } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const ADVISORY = 'SELECT pg_advisory_xact_lock($1)';
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '10s'";

/** Candado asesor simulado: un titular por clave; el candado se libera al terminar la transacción (COMMIT o ROLLBACK). */
class AdvisoryLockSim {
  private readonly holders = new Map<unknown, Promise<void>>();
  readonly acquisitions: unknown[] = [];
  /** Si se define, la adquisición rechaza con este error en lugar de esperar (simula lock_timeout vencido). */
  timeoutError: Error | undefined;

  async acquire(key: unknown): Promise<() => void> {
    this.acquisitions.push(key);
    const prior = this.holders.get(key);
    if (prior && this.timeoutError) throw this.timeoutError;
    let release: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => (release = resolve));
    this.holders.set(key, mine); // cola FIFO: cada espera se encadena detrás del último titular
    if (prior) await prior;
    return release;
  }
}

interface SimClient {
  readonly statements: string[];
  readonly release: ReturnType<typeof vi.fn>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
}

function simClient(sim: AdvisoryLockSim, label: string, events: string[]): SimClient {
  let unlock: (() => void) | undefined;
  const client: SimClient = {
    statements: [],
    release: vi.fn(),
    async query(text, values = []) {
      client.statements.push(text);
      if (text === ADVISORY) {
        unlock = await sim.acquire(values[0]);
        events.push(`${label}:locked`);
      }
      if (text === 'COMMIT' || text === 'ROLLBACK') {
        events.push(`${label}:end`);
        unlock?.();
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

const poolOf = (client: SimClient) => ({ connect: vi.fn(async () => client), query: vi.fn(), on: vi.fn(), end: vi.fn(async () => undefined) });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('concurrencia de PostgresUnitOfWork con dobles (REQ-PG-004, SC-CLD-002)', () => {
  it('dos transacciones de dos pools pasan por el mismo candado con la constante 0x4152474f53', async () => {
    const sim = new AdvisoryLockSim();
    const events: string[] = [];
    const a = simClient(sim, 'A', events);
    const b = simClient(sim, 'B', events);
    const uowA = new PostgresUnitOfWork(poolOf(a), () => ({}) as never);
    const uowB = new PostgresUnitOfWork(poolOf(b), () => ({}) as never);
    await Promise.all([uowA.runInTransaction(async () => 1), uowB.runInTransaction(async () => 2)]);
    expect(PG_ADVISORY_LOCK_KEY).toBe(0x4152474f53);
    expect(sim.acquisitions).toEqual([0x4152474f53, 0x4152474f53]);
    for (const client of [a, b]) expect(client.statements.filter((s) => s === ADVISORY)).toHaveLength(1);
  });

  it('el resultado es serial: el trabajo de B no empieza hasta que A termina, y lectura-modificación-escritura no pierde cuentas', async () => {
    const sim = new AdvisoryLockSim();
    const events: string[] = [];
    const uows = ['A', 'B', 'C'].map((label) => new PostgresUnitOfWork(poolOf(simClient(sim, label, events)), () => ({}) as never));
    let counter = 0;
    const increment = (label: string) => async () => {
      events.push(`${label}:work-start`);
      const read = counter;
      await tick();
      await tick();
      counter = read + 1;
      events.push(`${label}:work-end`);
    };
    await Promise.all(uows.map((uow, i) => uow.runInTransaction(increment('ABC'[i] ?? '?'))));
    expect(counter).toBe(3);
    // Nunca dos `work` solapados: cada work-start va precedido del work-end del anterior.
    const works = events.filter((e) => e.includes('work'));
    for (let i = 0; i < works.length; i += 2) {
      expect(works[i]).toMatch(/work-start$/);
      expect(works[i + 1]).toMatch(/work-end$/);
      expect(works[i]?.[0]).toBe(works[i + 1]?.[0]);
    }
  });

  it('sin el candado (control negativo) las mismas transacciones pierden cuentas: el doble sí detecta la falta de serialización', async () => {
    let counter = 0;
    const racy = async () => {
      const read = counter;
      await tick();
      await tick();
      counter = read + 1;
    };
    await Promise.all([racy(), racy(), racy()]);
    expect(counter).toBeLessThan(3);
  });

  it('lock_timeout se emite dentro de la transacción antes del candado en ambas transacciones concurrentes', async () => {
    const sim = new AdvisoryLockSim();
    const events: string[] = [];
    const a = simClient(sim, 'A', events);
    const b = simClient(sim, 'B', events);
    await Promise.all([
      new PostgresUnitOfWork(poolOf(a), () => ({}) as never).runInTransaction(async () => undefined),
      new PostgresUnitOfWork(poolOf(b), () => ({}) as never).runInTransaction(async () => undefined),
    ]);
    for (const client of [a, b]) {
      expect(client.statements.indexOf('BEGIN')).toBeLessThan(client.statements.indexOf(LOCK_TIMEOUT));
      expect(client.statements.indexOf(LOCK_TIMEOUT)).toBeLessThan(client.statements.indexOf(ADVISORY));
    }
  });

  it('55P03 (lock_not_available) en el candado: ROLLBACK, work no corre, error original sin traducir y cliente liberado una vez', async () => {
    const sim = new AdvisoryLockSim();
    sim.timeoutError = Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
    const events: string[] = [];
    const holder = simClient(sim, 'H', events);
    await holder.query(ADVISORY, [PG_ADVISORY_LOCK_KEY]); // titular que nunca suelta
    const waiter = simClient(sim, 'W', events);
    const work = vi.fn(async () => 'dato');
    const error = await new PostgresUnitOfWork(poolOf(waiter), () => ({}) as never).runInTransaction(work).catch((e: unknown) => e);
    expect(error).toBe(sim.timeoutError);
    expect((error as { code: string }).code).toBe('55P03');
    expect(work).not.toHaveBeenCalled();
    expect(waiter.statements.at(-1)).toBe('ROLLBACK');
    expect(waiter.statements).not.toContain('COMMIT');
    expect(waiter.release).toHaveBeenCalledTimes(1);
    expect(waiter.release.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('tras un 55P03 la siguiente transacción vuelve a funcionar (el fallo no deja estado en la unidad de trabajo)', async () => {
    const sim = new AdvisoryLockSim();
    const events: string[] = [];
    const failing = simClient(sim, 'F', events);
    const ok = simClient(sim, 'O', events);
    let calls = 0;
    const pool = { connect: vi.fn(async () => (calls++ === 0 ? failing : ok)), query: vi.fn(), on: vi.fn(), end: vi.fn(async () => undefined) };
    const queryFailing = failing.query.bind(failing);
    failing.query = async (text, values) => {
      if (text === ADVISORY) throw Object.assign(new Error('lock timeout'), { code: '55P03' });
      return queryFailing(text, values);
    };
    const uow = new PostgresUnitOfWork(pool, () => ({}) as never);
    await expect(uow.runInTransaction(async () => 1)).rejects.toMatchObject({ code: '55P03' });
    await expect(uow.runInTransaction(async () => 2)).resolves.toBe(2);
  });

  it('un lock_timeout de 55P03 no se confunde con ECONNRESET: no hay reintento', async () => {
    const sim = new AdvisoryLockSim();
    sim.timeoutError = Object.assign(new Error('lock timeout'), { code: '55P03' });
    const events: string[] = [];
    const holder = simClient(sim, 'H', events);
    await holder.query(ADVISORY, [PG_ADVISORY_LOCK_KEY]);
    const waiter = simClient(sim, 'W', events);
    const pool = poolOf(waiter);
    await expect(new PostgresUnitOfWork(pool, () => ({}) as never).runInTransaction(async () => 1)).rejects.toMatchObject({ code: '55P03' });
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'concurrencia en PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)',
  { timeout: 60_000 },
  () => {
    type Pool = ReturnType<typeof createPostgresPool>;
    const withSchema = async (run: (admin: Pool, urlFor: () => string) => Promise<void>) => {
      const schema = `argos_c_${Math.random().toString(36).slice(2, 12)}`;
      const admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      await admin.query(`CREATE TABLE ${schema}.counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`);
      await admin.query(`INSERT INTO ${schema}.counter VALUES (1, 0)`);
      const urlFor = () => {
        const url = new URL(TEST_DATABASE_URL ?? '');
        url.searchParams.set('options', `-c search_path=${schema}`);
        return url.toString();
      };
      try {
        await run(admin, urlFor);
      } finally {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await closePool(admin);
      }
    };
    const clientRef = () => {
      const ref: { current: { query(sql: string, v?: unknown[]): Promise<{ rows: Array<Record<string, number>> }> } | undefined } = { current: undefined };
      return ref;
    };

    it('2 pools escribiendo a la vez con lectura-modificación-escritura dan resultado serial (sin cuentas perdidas)', async () => {
      await withSchema(async (_admin, urlFor) => {
        const pools = [createPostgresPool({ connectionString: urlFor(), pgPoolMax: 4 }), createPostgresPool({ connectionString: urlFor(), pgPoolMax: 4 })];
        try {
          const runs = pools.flatMap((pool) =>
            Array.from({ length: 10 }, async () => {
              const ref = clientRef();
              const uow = new PostgresUnitOfWork(pool, (c) => ((ref.current = c as never), {}) as never);
              await uow.runInTransaction(async () => {
                const read = (await ref.current?.query('SELECT n FROM counter WHERE id = 1'))?.rows[0]?.['n'] ?? -1;
                await ref.current?.query('UPDATE counter SET n = $1 WHERE id = 1', [read + 1]);
              });
            }),
          );
          await Promise.all(runs);
          const final = await pools[0]?.query('SELECT n FROM counter WHERE id = 1');
          expect(final?.rows[0]?.['n']).toBe(20);
        } finally {
          for (const pool of pools) await closePool(pool);
        }
      });
    }, 60_000);

    it('lock_timeout/statement_timeout produce error controlado (55P03 o 57014) a los ~10 s si otro cliente retiene el candado, y la siguiente transacción funciona', async () => {
      await withSchema(async (_admin, urlFor) => {
        const holderPool = createPostgresPool({ connectionString: urlFor(), pgPoolMax: 1 });
        const waiterPool = createPostgresPool({ connectionString: urlFor(), pgPoolMax: 1 });
        const holder = await holderPool.connect();
        try {
          await holder.query('BEGIN');
          await holder.query(ADVISORY, [PG_ADVISORY_LOCK_KEY]);
          const started = Date.now();
          const error = await new PostgresUnitOfWork(waiterPool, () => ({}) as never).runInTransaction(async () => 1).catch((e: unknown) => e);
          const elapsed = Date.now() - started;
          expect(['55P03', '57014']).toContain((error as { code?: string }).code);
          expect(elapsed).toBeGreaterThanOrEqual(9_000);
          expect(elapsed).toBeLessThan(15_000);
          await holder.query('ROLLBACK');
          await expect(new PostgresUnitOfWork(waiterPool, () => ({}) as never).runInTransaction(async () => 7)).resolves.toBe(7);
        } finally {
          holder.release();
          await closePool(holderPool);
          await closePool(waiterPool);
        }
      });
    }, 60_000);

    it('no hay bloqueos muertos: 3 pools con 15 transacciones que escriben dos filas en orden opuesto terminan todas sin 40P01', async () => {
      await withSchema(async (_admin, urlFor) => {
        const pools = [1, 2, 3].map(() => createPostgresPool({ connectionString: urlFor(), pgPoolMax: 3 }));
        try {
          await pools[0]?.query('INSERT INTO counter VALUES (2, 0) ON CONFLICT DO NOTHING');
          const results = await Promise.allSettled(
            pools.flatMap((pool, p) =>
              Array.from({ length: 5 }, async (_, i) => {
                const ref = clientRef();
                const order = (p + i) % 2 === 0 ? [1, 2] : [2, 1];
                const uow = new PostgresUnitOfWork(pool, (c) => ((ref.current = c as never), {}) as never);
                await uow.runInTransaction(async () => {
                  for (const id of order) await ref.current?.query('UPDATE counter SET n = n + 1 WHERE id = $1', [id]);
                });
              }),
            ),
          );
          expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
          const rows = (await pools[0]?.query('SELECT id, n FROM counter ORDER BY id'))?.rows;
          expect(rows).toEqual([
            { id: 1, n: 15 },
            { id: 2, n: 15 },
          ]);
        } finally {
          for (const pool of pools) await closePool(pool);
        }
      });
    }, 60_000);
  },
);
