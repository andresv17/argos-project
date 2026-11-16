/**
 * Pool de conexiones de PostgreSQL (driver `pg`).
 * - `createPostgresPool({ connectionString, pgPoolMax })` crea el `pg.Pool` con `max` tomado de `AppConfig.pgPoolMax`
 *   (ARGOS_PG_POOL_MAX; este archivo NO lee `process.env`), `idleTimeoutMillis`, `connectionTimeoutMillis`, `keepAlive` TCP
 *   corto (REQ-PG-012) y un `pool.on('error')` que registra solo el código del error, sin URL, clave ni host.
 * - El constructor del pool y el registro son inyectables (pruebas sin Postgres).
 * - NO migra ni verifica `schema_migrations` al crearse (REQ-PG-006); la verificación perezosa es de T464 (REQ-PG-013).
 * - `closePool(pool)` es el cierre ordenado para T415 (`shutdownGracefully`): idempotente y sin lanzar.
 *
 * @implements REQ-PG-001, REQ-PG-006, REQ-PG-012, REQ-CLD-006
 */

import pg from 'pg';

/** Una conexión ociosa se cierra a los 10 s: no retiene cupos del pooler de Neon. */
export const PG_IDLE_TIMEOUT_MS = 10_000;
/** Esperar una conexión más de 5 s falla rápido (la solicitud responde 503) en lugar de encolarse sin tope. */
export const PG_CONNECTION_TIMEOUT_MS = 5_000;
/** `keepAlive` TCP corto para detectar cuanto antes un par muerto (REQ-PG-012). */
export const PG_KEEPALIVE_INITIAL_DELAY_MS = 10_000;

export const PG_POOL_MAX_LIMIT = 10;

export interface PoolSettings {
  readonly connectionString: string;
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly connectionTimeoutMillis: number;
  readonly keepAlive: boolean;
  readonly keepAliveInitialDelayMillis: number;
}

/** Superficie mínima del pool que usa el adaptador (T421 la amplía con `connect`). */
export interface PoolLike {
  on(event: 'error', handler: (error: Error) => void): PoolLike;
  end(): Promise<void>;
}

export type PoolConstructor = (settings: PoolSettings) => PoolLike;

export interface PostgresPoolConfig {
  /** DATABASE_URL (secreto: nunca se registra). */
  readonly connectionString: string;
  /** `AppConfig.pgPoolMax`, entero 1..10. */
  readonly pgPoolMax: number;
}

export interface PostgresPoolDeps {
  readonly createPool?: PoolConstructor;
  readonly log?: (line: string) => void;
}

const defaultCreatePool: PoolConstructor = (settings) => new pg.Pool({ ...settings });
const defaultLog = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/** Solo el código del error (p. ej. ECONNRESET, 57P01); nunca el mensaje, que puede incluir la URL. */
function safeCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(code)) return code;
  }
  return 'UNKNOWN';
}

const closed = new WeakSet<PoolLike>();
const loggers = new WeakMap<PoolLike, (line: string) => void>();

/** @implements REQ-PG-001, REQ-PG-012 */
export function createPostgresPool(config: PostgresPoolConfig, deps: PostgresPoolDeps = {}): PoolLike {
  const { pgPoolMax } = config;
  if (!Number.isInteger(pgPoolMax) || pgPoolMax < 1 || pgPoolMax > PG_POOL_MAX_LIMIT) {
    throw new RangeError('pgPoolMax debe ser un entero entre 1 y 10');
  }
  const log = deps.log ?? defaultLog;
  const pool = (deps.createPool ?? defaultCreatePool)({
    connectionString: config.connectionString,
    max: pgPoolMax,
    idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: PG_KEEPALIVE_INITIAL_DELAY_MS,
  });
  loggers.set(pool, log);
  pool.on('error', (error) => {
    log(`pg pool error code=${safeCode(error)}`);
  });
  return pool;
}

/** Cierre ordenado; idempotente y sin lanzar (REQ-CLD-006). */
export async function closePool(pool: PoolLike): Promise<void> {
  if (closed.has(pool)) return;
  closed.add(pool);
  try {
    await pool.end();
  } catch (error) {
    (loggers.get(pool) ?? defaultLog)(`pg pool end error code=${safeCode(error)}`);
  }
}
