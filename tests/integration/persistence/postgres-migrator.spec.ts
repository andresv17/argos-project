/**
 * T429 (REQ-PG-006, REQ-PG-010, REQ-PG-014, REQ-CICD-005, SC-CLD-020): migrador acotado de PostgreSQL. Pruebas con un doble del
 * cliente (sin Postgres): candado de sesión con pg_try_advisory_lock acotado a 60 s y liberado en finally, lock_timeout de 5 s con
 * hasta 3 reintentos, statement_timeout, application_name, una transacción por migración, idempotencia y salida sin secretos.
 * Los módulos (scripts/migrate-postgres.ts y config/migrator-config.ts) se importan de forma dinámica para que cada prueba falle
 * por separado (pruebas primero). La prueba contra Postgres real se OMITE sin TEST_DATABASE_URL (aplazada a T431, decisión de Neo).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { norm } from '../../fixtures/pg-fake-client.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const MIGRATOR_PATH = '../../../scripts/migrate-postgres.ts';
const CONFIG_PATH = '../../../src/infrastructure/config/migrator-config.ts';
const read = (relative: string) => readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');

const PASSWORD = 's3cr3tPassw0rd';
const URL_DIRECT = `postgresql://argos_owner:${PASSWORD}@ep-direct.neon.example/argos?sslmode=require`;

interface Settings {
  readonly connectionString: string;
  readonly application_name: string;
  readonly statement_timeout: number;
  readonly connectionTimeoutMillis: number;
}
interface ClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  end(): Promise<void>;
}
interface Migration {
  readonly version: string;
  readonly sql: string;
}
interface MigratorModule {
  runPostgresMigrations(options: {
    databaseUrl: string;
    migrations: readonly Migration[];
    connect: (settings: Settings) => Promise<ClientLike>;
    log: (line: string) => void;
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  }): Promise<string[]>;
  MigrationLockTimeoutError: new (...args: never[]) => Error;
  MIGRATION_LOCK_KEY: number;
  LOCK_ACQUIRE_BUDGET_MS: number;
  MAX_LOCK_RETRIES: number;
}
interface ConfigModule {
  loadMigratorConfig(env: Record<string, string | undefined>): { databaseUrlDirect: string };
}
const loadMigrator = async (): Promise<MigratorModule> => (await import(/* @vite-ignore */ MIGRATOR_PATH)) as MigratorModule;
const loadConfig = async (): Promise<ConfigModule> => (await import(/* @vite-ignore */ CONFIG_PATH)) as ConfigModule;

const BASELINE: Migration = { version: '0001_baseline', sql: 'CREATE TABLE schema_migrations (version TEXT PRIMARY KEY); CREATE TABLE users (id TEXT);' };
const SECOND: Migration = { version: '0002_expand', sql: 'ALTER TABLE users ADD COLUMN nick TEXT;' };

interface World {
  readonly statements: string[];
  readonly logs: string[];
  readonly sleeps: number[];
  readonly settings: Settings[];
  ended: number;
  clock: number;
  executed: string[];
  committed: string[];
  applied: Set<string>;
  hasTable: boolean;
  /** Respuestas sucesivas de pg_try_advisory_lock; agotadas repite la última. */
  lockReplies: boolean[];
  /** Errores a lanzar al ejecutar el SQL de una migración (por versión), en orden. */
  failures: Map<string, Array<{ code: string; message: string }>>;
}

function makeWorld(partial: Partial<World> = {}) {
  const world: World = {
    statements: [],
    logs: [],
    sleeps: [],
    settings: [],
    ended: 0,
    clock: 0,
    executed: [],
    committed: [],
    applied: new Set(),
    hasTable: false,
    lockReplies: [true],
    failures: new Map(),
    ...partial,
  };
  let lockCalls = 0;
  let pending: string[] = [];
  let inTx = false;
  const sqlByMigration = new Map<string, string>();
  const client: ClientLike = {
    async query(text, values = []) {
      const sql = norm(text);
      world.statements.push(sql);
      if (sql === 'BEGIN') {
        inTx = true;
        pending = [];
        return { rows: [], rowCount: null };
      }
      if (sql === 'COMMIT') {
        world.committed.push(...pending);
        for (const v of pending) world.applied.add(v);
        world.hasTable = world.hasTable || pending.length > 0;
        inTx = false;
        return { rows: [], rowCount: null };
      }
      if (sql === 'ROLLBACK') {
        pending = [];
        inTx = false;
        return { rows: [], rowCount: null };
      }
      if (sql.startsWith('SET ')) return { rows: [], rowCount: null };
      if (sql.includes('pg_try_advisory_lock')) {
        const reply = world.lockReplies[Math.min(lockCalls, world.lockReplies.length - 1)]!;
        lockCalls += 1;
        return { rows: [{ locked: reply }], rowCount: 1 };
      }
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }], rowCount: 1 };
      if (sql.includes('to_regclass')) return { rows: [{ t: world.hasTable ? 'schema_migrations' : null }], rowCount: 1 };
      if (/^SELECT version FROM schema_migrations/.test(sql)) return { rows: [...world.applied].map((version) => ({ version })), rowCount: world.applied.size };
      if (/^INSERT INTO schema_migrations/.test(sql)) {
        expect(inTx).toBe(true);
        pending.push(String(values[0]));
        return { rows: [], rowCount: 1 };
      }
      const version = [...sqlByMigration.entries()].find(([, body]) => body === text)?.[0] ?? 'desconocida';
      expect(inTx).toBe(true);
      world.executed.push(version);
      const queue = world.failures.get(version);
      const failure = queue?.shift();
      if (failure) throw Object.assign(new Error(failure.message), { code: failure.code });
      return { rows: [], rowCount: null };
    },
    async end() {
      world.ended += 1;
    },
  };
  type Options = Parameters<MigratorModule['runPostgresMigrations']>[0];
  const options = (migrations: readonly Migration[]): Options => {
    for (const m of migrations) sqlByMigration.set(m.version, m.sql);
    return {
      databaseUrl: URL_DIRECT,
      migrations,
      connect: async (settings: Settings) => {
        world.settings.push(settings);
        return client;
      },
      log: (line: string) => {
        world.logs.push(line);
      },
      now: () => world.clock,
      sleep: async (ms: number) => {
        world.sleeps.push(ms);
        world.clock += ms;
      },
    };
  };
  return Object.assign(world, { options });
}

describe('T429 migrador: candado de sesión acotado (REQ-PG-014)', () => {
  it('pide el candado con pg_try_advisory_lock y la clave del migrador, y lo libera en finally', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE]));
    const lockIndex = world.statements.findIndex((s) => s.includes('pg_try_advisory_lock'));
    const unlockIndex = world.statements.findIndex((s) => s.includes('pg_advisory_unlock'));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(unlockIndex).toBeGreaterThan(lockIndex);
    expect(world.statements.some((s) => /pg_advisory_lock\s*\(/.test(s))).toBe(false);
    expect(world.statements.at(-1)).toContain('pg_advisory_unlock');
    expect(mod.MIGRATION_LOCK_KEY).not.toBe(0x4152474f53);
    expect(world.ended).toBe(1);
  });

  it('libera el candado y cierra la conexión aunque una migración falle', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    world.failures.set('0001_baseline', [{ code: '42P07', message: 'relation exists' }]);
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).rejects.toThrow();
    expect(world.statements.at(-1)).toContain('pg_advisory_unlock');
    expect(world.statements).toContain('ROLLBACK');
    expect(world.ended).toBe(1);
  });

  it('con el candado ya tomado falla dentro de 60 s, sin aplicar nada y sin intentar liberar un candado ajeno', async () => {
    const mod = await loadMigrator();
    const world = makeWorld({ lockReplies: [false] });
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).rejects.toBeInstanceOf(mod.MigrationLockTimeoutError);
    expect(mod.LOCK_ACQUIRE_BUDGET_MS).toBe(60_000);
    const waited = world.sleeps.reduce((a, b) => a + b, 0);
    expect(waited).toBeGreaterThan(0);
    expect(waited).toBeLessThanOrEqual(60_000);
    expect(world.sleeps.length).toBeGreaterThan(1);
    expect(world.statements.filter((s) => s.includes('pg_try_advisory_lock')).length).toBeGreaterThan(1);
    expect(world.statements).not.toContain('BEGIN');
    expect(world.executed).toEqual([]);
    expect(world.statements.some((s) => s.includes('pg_advisory_unlock'))).toBe(false);
    expect(world.ended).toBe(1);
  });

  it('obtiene el candado cuando se libera antes de agotar los 60 s', async () => {
    const mod = await loadMigrator();
    const world = makeWorld({ lockReplies: [false, false, false, true] });
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).resolves.toEqual(['0001_baseline']);
    expect(world.sleeps.length).toBe(3);
  });
});

describe('T429 migrador: topes y reintentos (REQ-PG-014)', () => {
  it('fija application_name, lock_timeout 5 s y statement_timeout antes de migrar, sobre la URL directa', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE]));
    expect(world.settings).toHaveLength(1);
    expect(world.settings[0]!.application_name).toBe('argos-migrator');
    expect(world.settings[0]!.connectionString).toBe(URL_DIRECT);
    expect(world.settings[0]!.statement_timeout).toBeGreaterThan(0);
    const lockTimeout = world.statements.findIndex((s) => /^SET lock_timeout = '5s'$/.test(s));
    const statementTimeout = world.statements.findIndex((s) => /^SET statement_timeout = /.test(s));
    const firstTry = world.statements.findIndex((s) => s.includes('pg_try_advisory_lock'));
    expect(lockTimeout).toBeGreaterThanOrEqual(0);
    expect(statementTimeout).toBeGreaterThanOrEqual(0);
    expect(Math.max(lockTimeout, statementTimeout)).toBeLessThan(firstTry);
  });

  it('reintenta una migración bloqueada (55P03) como máximo 3 veces con espera creciente y luego tiene éxito', async () => {
    const mod = await loadMigrator();
    expect(mod.MAX_LOCK_RETRIES).toBe(3);
    const world = makeWorld();
    const blocked = { code: '55P03', message: 'lock timeout' };
    world.failures.set('0001_baseline', [blocked, blocked, blocked]);
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).resolves.toEqual(['0001_baseline']);
    expect(world.executed).toEqual(['0001_baseline', '0001_baseline', '0001_baseline', '0001_baseline']);
    expect(world.statements.filter((s) => s === 'ROLLBACK')).toHaveLength(3);
    expect(world.sleeps).toHaveLength(3);
    expect(world.sleeps[1]!).toBeGreaterThan(world.sleeps[0]!);
    expect(world.sleeps[2]!).toBeGreaterThan(world.sleeps[1]!);
  });

  it('tras 3 reintentos fallidos (4 intentos) falla y no registra la versión', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    const blocked = { code: '55P03', message: 'lock timeout' };
    world.failures.set('0001_baseline', [blocked, blocked, blocked, blocked, blocked]);
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).rejects.toThrow();
    expect(world.executed).toHaveLength(4);
    expect(world.committed).toEqual([]);
    expect(world.statements.at(-1)).toContain('pg_advisory_unlock');
  });

  it('un error distinto de 55P03 no se reintenta', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    world.failures.set('0001_baseline', [{ code: '42601', message: 'syntax error' }]);
    await expect(mod.runPostgresMigrations(world.options([BASELINE]))).rejects.toThrow();
    expect(world.executed).toEqual(['0001_baseline']);
    expect(world.sleeps).toEqual([]);
  });
});

describe('T429 migrador: transacción por migración e idempotencia (REQ-PG-006)', () => {
  it('cada migración corre en su propia transacción y registra su versión dentro de ella', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE, SECOND]));
    const relevant = world.statements.filter((s) => s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK' || s.startsWith('INSERT INTO schema_migrations') || s.startsWith('CREATE') || s.startsWith('ALTER'));
    expect(relevant.map((s) => s.split(' ')[0] + (s.startsWith('INSERT') ? '-rec' : ''))).toEqual(['BEGIN', 'CREATE', 'INSERT-rec', 'COMMIT', 'BEGIN', 'ALTER', 'INSERT-rec', 'COMMIT']);
    expect(world.committed).toEqual(['0001_baseline', '0002_expand']);
  });

  it('si la segunda migración falla, la primera queda confirmada y la segunda revertida', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    world.failures.set('0002_expand', [{ code: '42703', message: 'boom' }]);
    await expect(mod.runPostgresMigrations(world.options([BASELINE, SECOND]))).rejects.toThrow();
    expect(world.committed).toEqual(['0001_baseline']);
    expect(world.statements).toContain('ROLLBACK');
  });

  it('el baseline crea schema_migrations: sin la tabla se parte de cero con to_regclass, sin crearla por fuera', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE]));
    expect(world.statements.some((s) => s.includes('to_regclass'))).toBe(true);
    expect(world.statements.some((s) => /CREATE TABLE (IF NOT EXISTS )?schema_migrations/.test(s) && !s.includes('users'))).toBe(false);
    expect(world.statements.some((s) => /^SELECT version FROM schema_migrations/.test(s))).toBe(false);
  });

  it('es idempotente: la segunda ejecución no vuelve a aplicar 0001', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    const first = await mod.runPostgresMigrations(world.options([BASELINE]));
    const second = await mod.runPostgresMigrations(world.options([BASELINE]));
    expect(first).toEqual(['0001_baseline']);
    expect(second).toEqual([]);
    expect(world.executed).toEqual(['0001_baseline']);
    expect(world.statements.filter((s) => s === 'BEGIN')).toHaveLength(1);
    expect(world.logs.at(-1)).toMatch(/sin migraciones pendientes/);
  });

  it('aplica solo las pendientes y en orden de versión', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE]));
    const result = await mod.runPostgresMigrations(world.options([SECOND, BASELINE]));
    expect(result).toEqual(['0002_expand']);
  });
});

describe('T429 migrador: salida sin secretos (REQ-PG-006, REQ-PG-010)', () => {
  it('ni la salida ni el error contienen la URL, el usuario ni la contraseña, aunque el driver los incluya en su mensaje', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    world.failures.set('0001_baseline', [{ code: '28P01', message: `password authentication failed for ${URL_DIRECT}` }]);
    let thrown: unknown;
    try {
      await mod.runPostgresMigrations(world.options([BASELINE]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const surface = `${world.logs.join('\n')}\n${(thrown as Error).message}\n${String((thrown as Error).stack ?? '')}`;
    expect(surface).not.toContain(PASSWORD);
    expect(surface).not.toContain('argos_owner');
    expect(surface).not.toContain('ep-direct.neon.example');
    expect(surface).not.toContain('postgresql://');
    expect(world.logs.join('\n')).toContain('0001_baseline');
  });

  it('en el éxito solo registra versiones y conteos', async () => {
    const mod = await loadMigrator();
    const world = makeWorld();
    await mod.runPostgresMigrations(world.options([BASELINE]));
    const output = world.logs.join('\n');
    expect(output).toContain('0001_baseline');
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain('postgresql://');
  });
});

describe('T429 lectura de DATABASE_URL_DIRECT por config (INV-ARCH-006, REQ-PG-010)', () => {
  it('devuelve la URL directa válida', async () => {
    const { loadMigratorConfig } = await loadConfig();
    expect(loadMigratorConfig({ DATABASE_URL_DIRECT: URL_DIRECT })).toEqual({ databaseUrlDirect: URL_DIRECT });
  });

  it.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['sin sslmode=require', 'postgresql://u:p@ep.example/db'],
    ['esquema http', 'http://u:p@ep.example/db?sslmode=require'],
    ['con -pooler en el host (no es directa)', `postgresql://u:${PASSWORD}@ep-x-pooler.neon.example/db?sslmode=require`],
    ['no es una URL', `${PASSWORD} no url`],
  ])('rechaza %s nombrando solo la variable, nunca el valor', async (_label, value) => {
    const { loadMigratorConfig } = await loadConfig();
    let message = '';
    try {
      loadMigratorConfig({ DATABASE_URL_DIRECT: value });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('DATABASE_URL_DIRECT');
    expect(message).not.toContain(PASSWORD);
    expect(message).not.toContain('postgresql://');
  });

  it('el script no lee process.env ni abre un segundo punto de lectura (el valor llega por config)', () => {
    const source = read('scripts/migrate-postgres.ts');
    expect(source).not.toMatch(/process\.env/);
    expect(source).toContain('loadMigratorConfig');
    expect(source).toContain('pg_try_advisory_lock');
    expect(source).not.toMatch(/pg_advisory_lock\s*\(/);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  'T429 migrador contra PostgreSQL real (omitida sin TEST_DATABASE_URL; aplazada a T431 por decisión de Neo, sin Docker)',
  () => {
    it('aplica 0001_baseline una sola vez sobre una base vacía y la segunda ejecución no aplica nada', async () => {
      const mod = await loadMigrator();
      const real = (await import('pg')).default;
      const baseline = { version: '0001_baseline', sql: read('src/infrastructure/persistence/postgres/migrations/0001_baseline.sql') };
      const connect = async (settings: Settings): Promise<ClientLike> => {
        const client = new real.Client({ connectionString: settings.connectionString, application_name: settings.application_name, statement_timeout: settings.statement_timeout });
        await client.connect();
        return client as unknown as ClientLike;
      };
      const base = { databaseUrl: TEST_DATABASE_URL!, migrations: [baseline], connect, log: () => undefined, now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
      const first = await mod.runPostgresMigrations(base);
      const second = await mod.runPostgresMigrations(base);
      expect(second).toEqual([]);
      expect(first.length === 0 || first[0] === '0001_baseline').toBe(true);
    });
  },
);
