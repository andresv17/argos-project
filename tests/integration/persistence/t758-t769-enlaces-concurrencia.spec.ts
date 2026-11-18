/**
 * T758 / T769 [US4] conexiones intercaladas del enlace veterinario en SQLite (archivo, dos conexiones) y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL):
 *  - T769 (SC-005-038, EDGE-005-15): con 19 enlaces HOUSEHOLD activos, dos creadores DISTINTOS (el propietario y un ADMIN) que crean a la vez dejan exactamente 20
 *    y el segundo recibe ERR-SHARE-LINK-LIMIT; con 19 de una mascota, dos creaciones simultáneas dejan 20;
 *  - T754 (SC-005-051): dos creaciones con la misma Idempotency-Key desde dos conexiones crean una sola fila;
 *  - T758 (SC-005-049, EDGE-005-14): la lectura pública corre en una transacción `REPEATABLE READ READ ONLY`: si el propietario revoca y confirma a mitad
 *    de la lectura, la respuesta es la instantánea coherente del inicio (nunca una mezcla), y la lectura no bloquea ni es bloqueada por la escritura.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { SharedAccessLimiter } from '../../../src/application/sharing/shared-access-limiter.ts';
import { CreateShareLinkUseCase, RevokeShareLinkUseCase } from '../../../src/application/use-cases/share-link-use-cases.ts';
import { GetSharedSummaryUseCase } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { ANDRES, ARGOS, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { POSTGRES_SCHEMA_SQL, createSqliteConcurrentEngine, gate, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { HOUSEHOLD_ID, KEY, SHARE_IP_SECRET, SequentialShareTokenGenerator, codeOf } from '../../fixtures/share-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const HOUSE_REF = { scope: 'HOUSEHOLD', householdId: HOUSEHOLD_ID } as const;
const PET_REF = { scope: 'PET', petId: ARGOS.id } as const;
const PG_SHARE_SQL = ['0007_platform_parameters.sql', '0008_share_links.sql'].map((m) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${m}`, import.meta.url), 'utf8')).join('\n');

interface Engine {
  readonly name: 'SQLite' | 'PostgreSQL';
  readonly raw: ConcurrentEngine;
  /** Dependencias de la conexión A y B con el reparto de ids de cada una. */
  a(uow?: UnitOfWorkPort): ApplicationDeps;
  b(): { readonly deps: ApplicationDeps; readonly starts: () => number; readonly result: <T>(call: (deps: ApplicationDeps) => Promise<T>) => Promise<T> };
  /** Cliente de la última transacción abierta por A (solo PostgreSQL, para `SHOW`). */
  readonly lastClient: () => PoolClientLike | null;
  countLinks(): Promise<number>;
  dispose(): Promise<void>;
}

function withSharing(deps: ApplicationDeps, prefix = 'conexion-a'): ApplicationDeps {
  return { ...deps, sharing: { tokens: new SequentialShareTokenGenerator(prefix), ipHmacSecret: SHARE_IP_SECRET, limiter: new SharedAccessLimiter() } };
}

async function promoteMariaToAdmin(uow: UnitOfWorkPort): Promise<void> {
  await uow.runInTransaction(async (r) => {
    const m = (await r.households.listMembershipsOfUsers([MARIA])).find((x) => x.householdId === HOUSEHOLD_ID)!;
    await r.households.saveMembership({ ...m, role: 'ADMIN' });
  });
}

async function sqliteEngine(): Promise<Engine> {
  const raw = await createSqliteConcurrentEngine();
  await promoteMariaToAdmin(raw.uowA);
  // Una sola secuencia de ids y de tokens para la conexión A durante toda la prueba (las dependencias se reutilizan; solo cambia la unidad de trabajo).
  const baseA = withSharing(raw.depsA(), 'conexion-a');
  return {
    name: 'SQLite',
    raw,
    a: (uow) => (uow === undefined ? baseA : { ...baseA, uow }),
    b: () => {
      let client: { readonly result: Promise<unknown>; workStarts(): number } | null = null;
      return {
        deps: withSharing(raw.depsA(raw.uowB), 'conexion-b'),
        starts: () => client?.workStarts() ?? 0,
        result: <T,>(call: (deps: ApplicationDeps) => Promise<T>) => {
          client = raw.asClientB((deps) => call(withSharing(deps, 'conexion-b')));
          return client.result as Promise<T>;
        },
      };
    },
    lastClient: () => null,
    countLinks: async () => raw.uowA.runInTransaction((r) => r.shareLinks.listAll()).then((rows) => rows.length),
    dispose: () => raw.dispose(),
  };
}

async function postgresEngine(): Promise<Engine> {
  const schema = `argos_s_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 8 });
  await pool.query(`${POSTGRES_SCHEMA_SQL}\n${PG_SHARE_SQL}`);
  const { createPostgresRepositories } = (await import('../../../src/infrastructure/persistence/postgres/postgres-repositories.ts')) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  let last: PoolClientLike | null = null;
  const factory = (client: PoolClientLike): RepositorySet => {
    last = client;
    return createPostgresRepositories(client);
  };
  const uowA = new PostgresUnitOfWork(pool, factory);
  const uowB = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uowA, canonicalState());
  await promoteMariaToAdmin(uowA);
  const { createDeps } = await import('../../fixtures/application-harness.ts');
  const { FixedClockAdapter } = await import('../../../src/infrastructure/adapters/fixed-clock.adapter.ts');
  const { DeterministicIdAdapter } = await import('../../../src/infrastructure/adapters/deterministic-id.adapter.ts');
  const { SpyPasswordHasher } = await import('../../fixtures/test-doubles.ts');
  const ids = (prefix: string) => Array.from({ length: 300 }, (_, i) => `${prefix}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const make = (uow: UnitOfWorkPort, e: string, au: string, prefix: string): ApplicationDeps =>
    withSharing({ ...createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()), ids: new DeterministicIdAdapter(ids(e)), auditIds: new DeterministicIdAdapter(ids(au)) }, prefix);
  const baseA = make(uowA, 'aaaaaaa1', 'aaaaaaa2', 'conexion-a');
  const baseB = make(uowB, 'ccccccc1', 'ccccccc2', 'conexion-b');
  const raw = { dispose: async () => undefined } as unknown as ConcurrentEngine;
  return {
    name: 'PostgreSQL',
    raw,
    a: (uow) => (uow === undefined ? baseA : { ...baseA, uow }),
    b: () => {
      let starts = 0;
      const counting: UnitOfWorkPort = {
        ...(uowB.runReadOnly === undefined ? {} : { runReadOnly: <T>(work: (r: RepositorySet) => Promise<T>) => uowB.runReadOnly!(work) }),
        runInTransaction: <T>(work: (r: RepositorySet) => Promise<T>) => uowB.runInTransaction((r) => {
          starts += 1;
          return work(r);
        }),
      };
      const deps: ApplicationDeps = { ...baseB, uow: counting };
      return { deps, starts: () => starts, result: (call) => call(deps) };
    },
    lastClient: () => last,
    countLinks: async () => Number((await pool.query('SELECT COUNT(*) AS n FROM share_links')).rows[0]!['n']),
    async dispose() {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
}

let engine: Engine | undefined;
afterEach(async () => {
  await engine?.dispose();
  engine = undefined;
});

/** Retiene la transacción de A tras ejecutar el trabajo y antes de confirmar. */
function hold(uow: UnitOfWorkPort, entered: () => void, release: Promise<void>): UnitOfWorkPort {
  return {
    runInTransaction: <T>(work: (repositories: RepositorySet) => Promise<T>) =>
      uow.runInTransaction(async (repositories) => {
        const result = await work(repositories);
        entered();
        await release;
        return result;
      }),
  };
}

function define(name: 'SQLite' | 'PostgreSQL', build: () => Promise<Engine>): void {
  describe(`enlace veterinario con conexiones intercaladas (${name})`, { timeout: 60_000 }, () => {
    const seed = async (e: Engine, count: number, ref: typeof HOUSE_REF | typeof PET_REF, start = 1) => {
      for (let n = start; n < start + count; n += 1) await new CreateShareLinkUseCase(e.a()).execute(ANDRES, ref, KEY(n), {});
    };

    it('[SC-005-038][EDGE-005-15][REQ-VET-012] con 19 enlaces HOUSEHOLD, A (propietario) retiene su transacción y B (ADMIN, otro creador) espera: tras confirmar A, B recibe ERR-SHARE-LINK-LIMIT y quedan 20', async () => {
      engine = await build();
      await seed(engine, 19, HOUSE_REF);
      const entered = gate();
      const release = gate();
      const depsA = engine.a(hold(engine.a().uow, entered.open, release.promise));
      const first = new CreateShareLinkUseCase(depsA).execute(ANDRES, HOUSE_REF, KEY(100), {});
      await entered.promise;
      const b = engine.b();
      const second = codeOf(b.result((deps) => new CreateShareLinkUseCase(deps).execute(MARIA, HOUSE_REF, KEY(101), {})));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(b.starts(), 'B no empezó su trabajo mientras A retiene el candado').toBe(0);
      release.open();
      expect((await first).kind).toBe('CREATED');
      expect(await second).toBe('ERR-SHARE-LINK-LIMIT');
      expect(await engine.countLinks()).toBe(20);
    });

    it('[SC-005-038] con 19 enlaces de una mascota, dos creaciones simultáneas dejan exactamente 20', async () => {
      engine = await build();
      await seed(engine, 19, PET_REF);
      const b = engine.b();
      const results = await Promise.all([codeOf(new CreateShareLinkUseCase(engine.a()).execute(ANDRES, PET_REF, KEY(100), {})), codeOf(b.result((deps) => new CreateShareLinkUseCase(deps).execute(ANDRES, PET_REF, KEY(101), {})))]);
      expect(results.sort()).toEqual(['ERR-SHARE-LINK-LIMIT', 'OK']);
      expect(await engine.countLinks()).toBe(20);
    });

    it('[SC-005-051][EDGE-005-16] dos creaciones con la misma Idempotency-Key desde dos conexiones crean una sola fila: una CREATED y una REPLAY', async () => {
      engine = await build();
      const b = engine.b();
      const [x, y] = await Promise.all([new CreateShareLinkUseCase(engine.a()).execute(ANDRES, PET_REF, KEY(7), {}), b.result((deps) => new CreateShareLinkUseCase(deps).execute(ANDRES, PET_REF, KEY(7), {}))]);
      expect([x.kind, y.kind].sort()).toEqual(['CREATED', 'REPLAY']);
      expect(await engine.countLinks()).toBe(1);
    });
  });
}

define('SQLite', sqliteEngine);

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', () => {
  define('PostgreSQL', postgresEngine);

  describe('T758 lectura pública REPEATABLE READ READ ONLY (SC-005-049, EDGE-005-14, EDGE-005-24)', { timeout: 60_000 }, () => {
    it('[SC-005-049] la transacción de lectura es REPEATABLE READ READ ONLY (verificado contra READ COMMITTED) y rechaza escrituras', async () => {
      engine = await postgresEngine();
      const deps = engine.a();
      const seen = await deps.uow.runReadOnly!(async (r) => {
        await r.shareLinks.findByTokenHash('x');
        const client = engine!.lastClient()!;
        const iso = (await client.query('SHOW transaction_isolation')).rows[0]!['transaction_isolation'];
        const readOnly = (await client.query('SHOW transaction_read_only')).rows[0]!['transaction_read_only'];
        const write = await client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('zzz.write', '1', 'x', 'x')").then(() => 'escribió', (e: { code?: string }) => e.code);
        return { iso, readOnly, write };
      });
      expect(seen).toEqual({ iso: 'repeatable read', readOnly: 'on', write: '25006' });
      const control = await deps.uow.runInTransaction(async () => (await engine!.lastClient()!.query('SHOW transaction_isolation')).rows[0]!['transaction_isolation']);
      expect(control).toBe('read committed');
    });

    it('[SC-005-049][EDGE-005-14] el propietario revoca y confirma a mitad de la lectura: la respuesta es el resumen coherente de la instantánea (nunca una mezcla) y la revocación no espera a la lectura', async () => {
      engine = await postgresEngine();
      const created = await new CreateShareLinkUseCase(engine.a()).execute(ANDRES, PET_REF, KEY(1), {});
      if (created.kind !== 'CREATED') throw new Error('creación');
      const midRead = gate();
      const resume = gate();
      const base = engine.a();
      const wrapped: UnitOfWorkPort = {
        runInTransaction: (work) => base.uow.runInTransaction(work),
        runReadOnly: <T>(work: (r: RepositorySet) => Promise<T>) =>
          base.uow.runReadOnly!(async (r) => {
            const proxied = new Proxy(r, {
              get(target, prop) {
                const value = (target as unknown as Record<string | symbol, unknown>)[prop];
                if (prop !== 'records' || typeof value !== 'object' || value === null) return value;
                return new Proxy(value, {
                  get(inner, method) {
                    const fn = (inner as Record<string | symbol, unknown>)[method];
                    if (method !== 'listForPet' || typeof fn !== 'function') return fn;
                    return async (...args: unknown[]) => {
                      midRead.open();
                      await resume.promise;
                      return (fn as (...a: unknown[]) => unknown).apply(inner, args);
                    };
                  },
                });
              },
            });
            return work(proxied);
          }),
      };
      const reading = new GetSharedSummaryUseCase({ ...base, uow: wrapped }).execute(created.token, '203.0.113.7');
      await midRead.promise;
      const b = engine.b();
      await b.result((deps) => new RevokeShareLinkUseCase(deps).execute(ANDRES, created.link.id));
      resume.open();
      const view = await reading;
      expect(view.summary.pets.map((p) => p.profile.name)).toEqual(['Argos']);
      expect(view.summary.pets[0]!.weights.length).toBeGreaterThan(0);
      const after = await codeOf(new GetSharedSummaryUseCase(engine.a()).execute(created.token, '203.0.113.8'));
      expect(after).toBe('ERR-SHARE-NOT-FOUND');
    });
  });
});

void NOW;
