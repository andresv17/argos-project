/**
 * T420 (REQ-PG-001, REQ-PG-006, REQ-PG-012): configuración del pool `pg` verificada con un doble del constructor
 * inyectado, sin conectarse a PostgreSQL. La conexión real se OMITE si falta TEST_DATABASE_URL (igual que T418).
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PG_CONNECTION_TIMEOUT_MS,
  PG_IDLE_TIMEOUT_MS,
  PG_KEEPALIVE_INITIAL_DELAY_MS,
  closePool,
  createPostgresPool,
  type PoolConstructor,
  type PoolLike,
  type PoolSettings,
} from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const URL_SECRETA = 'postgres://argos_app:clave-super-secreta@db.ejemplo.neon.tech/argos'; // argos-scan:allow

interface Doble {
  readonly ctor: PoolConstructor;
  readonly settings: PoolSettings[];
  readonly pool: { handlers: Map<string, (error: Error) => void>; end: ReturnType<typeof vi.fn> };
}

function crearDoble(): Doble {
  const settings: PoolSettings[] = [];
  const pool = { handlers: new Map<string, (error: Error) => void>(), end: vi.fn(async () => undefined) };
  const ctor: PoolConstructor = (config) => {
    settings.push(config);
    const like: PoolLike = {
      on(event, handler) {
        pool.handlers.set(event, handler);
        return like;
      },
      end: pool.end,
      connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined }),
      query: async () => ({ rows: [], rowCount: 0 }),
    };
    return like;
  };
  return { ctor, settings, pool };
}

describe('createPostgresPool (doble del constructor, sin Postgres)', () => {
  it('toma max de pgPoolMax de AppConfig y la URL como connectionString', () => {
    const d = crearDoble();
    createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 7 }, { createPool: d.ctor, log: () => undefined });
    expect(d.settings).toHaveLength(1);
    expect(d.settings[0]?.max).toBe(7);
    expect(d.settings[0]?.connectionString).toBe(URL_SECRETA);
  });

  it('fija timeouts y keepAlive cortos (REQ-PG-012)', () => {
    const d = crearDoble();
    createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: () => undefined });
    expect(d.settings[0]?.idleTimeoutMillis).toBe(PG_IDLE_TIMEOUT_MS);
    expect(d.settings[0]?.connectionTimeoutMillis).toBe(PG_CONNECTION_TIMEOUT_MS);
    expect(d.settings[0]?.keepAlive).toBe(true);
    expect(d.settings[0]?.keepAliveInitialDelayMillis).toBe(PG_KEEPALIVE_INITIAL_DELAY_MS);
    expect(PG_IDLE_TIMEOUT_MS).toBe(10_000);
    expect(PG_CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(PG_KEEPALIVE_INITIAL_DELAY_MS).toBe(10_000);
  });

  it('registra pool.on("error") y el manejador no incluye URL, clave ni host', () => {
    const d = crearDoble();
    const lines: string[] = [];
    createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: (l) => lines.push(l) });
    const handler = d.pool.handlers.get('error');
    expect(typeof handler).toBe('function');
    const err = Object.assign(new Error(`connect ECONNRESET ${URL_SECRETA}`), { code: 'ECONNRESET' });
    handler?.(err);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ECONNRESET');
    expect(lines[0]).not.toContain('clave-super-secreta');
    expect(lines[0]).not.toContain('db.ejemplo.neon.tech');
    expect(lines[0]).not.toContain('postgres://');
  });

  it('el manejador de error no lanza (no tumba el proceso)', () => {
    const d = crearDoble();
    createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: () => undefined });
    expect(d.pool.handlers.get('error')?.(new Error('boom'))).toBeUndefined();
  });

  it('rechaza pgPoolMax fuera de 1..10 o no entero', () => {
    const d = crearDoble();
    for (const bad of [0, 11, 2.5, Number.NaN]) {
      expect(() => createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: bad }, { createPool: d.ctor })).toThrow(RangeError);
    }
    expect(d.settings).toHaveLength(0);
  });

  it('no consulta schema_migrations ni abre conexión al crearse (REQ-PG-006, T464 lo hace)', () => {
    const d = crearDoble();
    const pool = createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: () => undefined });
    expect(Object.keys(pool).sort()).toEqual(['connect', 'end', 'on', 'query']);
  });
});

describe('T831 (006): el pool no migra; la ruta 0009_home_scenes.sql existe y es la última de Postgres', () => {
  it('el directorio de migraciones de Postgres termina en 0017_scene_enabled_seed.sql (009: 0017 siembra de scene.enabled, 0016 estado de aprobación de la cuenta, 0015 portal de administración, 0014 intención DELETE de oauth_flow_states; 008: 0013 acceso con Google, 0012 biografía; 007: 0010 estado de vida, 0011 opt-in del enlace; la 0009_home_scenes.sql es de 006) (el pool nunca las aplica, REQ-PG-006)', () => {
    const names = readdirSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url)).sort();
    expect(names.at(-1)).toBe('0017_scene_enabled_seed.sql');
    expect(names).toHaveLength(17);
  });
});

describe('closePool', () => {
  it('llama a end() una vez y es idempotente', async () => {
    const d = crearDoble();
    const pool = createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: () => undefined });
    await closePool(pool);
    await closePool(pool);
    expect(d.pool.end).toHaveBeenCalledTimes(1);
  });

  it('si end() falla, closePool no lanza y registra solo el código', async () => {
    const d = crearDoble();
    d.pool.end.mockRejectedValueOnce(Object.assign(new Error(URL_SECRETA), { code: 'ECONNRESET' }));
    const lines: string[] = [];
    const pool = createPostgresPool({ connectionString: URL_SECRETA, pgPoolMax: 5 }, { createPool: d.ctor, log: (l) => lines.push(l) });
    await expect(closePool(pool)).resolves.toBeUndefined();
    expect(lines).toEqual(['pg pool end error code=ECONNRESET']);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'pool real (SE OMITE: falta la variable TEST_DATABASE_URL; levanta docker-compose.test.yml y defínela)',
  () => {
    it('conecta, responde SELECT 1 y cierra', async () => {
      const pool = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 2 });
      const { rows } = await pool.query('SELECT 1 AS n');
      expect(rows[0]?.['n']).toBe(1);
      await closePool(pool);
    });
  },
);
