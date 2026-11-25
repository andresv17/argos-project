import type { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { adminKit } from './admin-fixtures.ts';
import { bootEnv, envOverUow, DELEGATE_ROOT_EMAIL, type Env } from './admin-delegates-011.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, TEST_DATABASE_URL } from './concurrent-engines.ts';

/**
 * Pares de clientes para las carreras de T1525 (H-2a, H-5, EDGE-011-010): `a` y `b` son dos «instancias» contra el MISMO almacenamiento.
 * - memoria y SQLite en proceso: `a === b` (la unidad de trabajo serializa por cola; no es evidencia de candados reales, EDGE-011-010).
 * - SQLite de dos conexiones a un archivo (la segunda con `busy_timeout = 0`): candados reales de `BEGIN IMMEDIATE`.
 * - PostgreSQL 17 real: solo con `TEST_DATABASE_URL`; sin ella la parte de PostgreSQL queda PENDIENTE DE ARNÉS (constante `POSTGRES_PENDING`).
 *
 * @implements EDGE-011-002, EDGE-011-010, EDGE-011-011
 */
export const POSTGRES_PENDING = 'T1525: la parte PostgreSQL real de H-2a/H-5/EDGE-011-010 (SELECT ... FOR UPDATE) queda pendiente de arnés: requiere TEST_DATABASE_URL; esta máquina no lo tiene';
export const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';

export interface Pair {
  readonly name: string;
  readonly a: Env;
  readonly b: Env;
  at(offsetMs: number): void;
  dispose(): Promise<void>;
}

export interface PairFactory {
  readonly name: string;
  readonly enabled: boolean;
  make(): Promise<Pair>;
}

async function single(name: 'memory' | 'sqlite'): Promise<Pair> {
  const env = await bootEnv(name);
  return { name, a: env, b: env, at: (ms) => env.at(ms), dispose: () => env.close() };
}

async function twoConnections(create: typeof createSqliteConcurrentEngine, name: string): Promise<Pair> {
  const engine = await create();
  const kit = adminKit([DELEGATE_ROOT_EMAIL]);
  const depsA = engine.depsA();
  const depsB = await engine.asClientB((deps) => Promise.resolve(deps)).result;
  const a = await envOverUow(`${name}-A`, engine.uowA, kit, depsA.clock as FixedClockAdapter, depsA);
  const b = await envOverUow(`${name}-B`, engine.uowB, kit, depsB.clock as FixedClockAdapter, depsB);
  return {
    name,
    a,
    b,
    at: (ms) => {
      a.at(ms);
      b.at(ms);
    },
    async dispose() {
      await a.close();
      await b.close();
      await engine.dispose();
    },
  };
}

export const PAIR_FACTORIES: readonly PairFactory[] = [
  { name: 'memoria', enabled: true, make: () => single('memory') },
  { name: 'SQLite en proceso', enabled: true, make: () => single('sqlite') },
  { name: 'SQLite dos conexiones (candados reales)', enabled: true, make: () => twoConnections(createSqliteConcurrentEngine, 'sqlite-2c') },
  { name: 'PostgreSQL real', enabled: HAS_POSTGRES, make: () => twoConnections(createPostgresConcurrentEngine, 'postgres') },
];
