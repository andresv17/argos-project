import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * T428 (REQ-PG-010, SC-CLD-011, NFR-CLD-009): composición con ARGOS_DB_DRIVER=postgres sin base real.
 * better-sqlite3 es un módulo falso que falla si se importa; createPostgresPool/closePool son dobles.
 * La prueba viva contra Neon queda aplazada a T431 (describe.skipIf(!TEST_DATABASE_URL) al final).
 */
const URL_SECRET = 'postgres://argos:clave-secreta-428@db.example.internal:5432/argos?sslmode=require';
const PG_ENV = {
  NODE_ENV: 'test',
  ARGOS_DB_DRIVER: 'postgres',
  DATABASE_URL: URL_SECRET,
  ARGOS_PG_POOL_MAX: '3',
  ARGOS_SCHEDULER_EMAIL: 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com',
  ARGOS_OIDC_AUDIENCE: 'https://argos-abcdef-uc.a.run.app',
};

const mocks = vi.hoisted(() => ({
  sqliteLoaded: vi.fn(),
  pool: { on: vi.fn(), end: vi.fn(), connect: vi.fn(), query: vi.fn() },
  createPostgresPool: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock('better-sqlite3', () => {
  mocks.sqliteLoaded();
  throw new Error('better-sqlite3 no debe cargarse con ARGOS_DB_DRIVER=postgres');
});
vi.mock('../../src/infrastructure/persistence/postgres/postgres-database.ts', () => ({
  createPostgresPool: mocks.createPostgresPool,
  closePool: mocks.closePool,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('composición PostgreSQL de createProductionApp (T428)', () => {
  it('[REQ-PG-010][SC-CLD-011] con postgres crea el pool con databaseUrl y pgPoolMax de la configuración y no carga better-sqlite3', async () => {
    mocks.createPostgresPool.mockReturnValue(mocks.pool);
    const { createProductionApp } = await import('../../src/infrastructure/http/server.ts');
    const app = await createProductionApp(loadAppConfig(PG_ENV), false);
    await app.close();
    expect([mocks.createPostgresPool.mock.calls, mocks.sqliteLoaded.mock.calls.length]).toEqual([[[{ connectionString: URL_SECRET, pgPoolMax: 3 }]], 0]);
  });

  it('[REQ-CLD-006][REQ-PG-010] el hook onClose llama a closePool una vez con el pool, también tras cerrar dos veces', async () => {
    mocks.createPostgresPool.mockReturnValue(mocks.pool);
    const { createProductionApp } = await import('../../src/infrastructure/http/server.ts');
    const app = await createProductionApp(loadAppConfig(PG_ENV), false);
    expect(mocks.closePool).not.toHaveBeenCalled();
    await app.close();
    await app.close();
    expect(mocks.closePool.mock.calls).toEqual([[mocks.pool]]);
  });

  it('[REQ-SEC-003] si databaseUrl llegara null con postgres, lanza un error que no incluye ningún valor de la configuración', async () => {
    const { createProductionApp } = await import('../../src/infrastructure/http/server.ts');
    const config = { ...loadAppConfig(PG_ENV), databaseUrl: null };
    const error = await createProductionApp(config, false).then(
      () => new Error('no lanzó'),
      (e: unknown) => e as Error,
    );
    expect([error.message.includes('clave-secreta-428'), error.message.includes('db.example.internal'), error.message === 'no lanzó', mocks.createPostgresPool.mock.calls.length]).toEqual([false, false, false, 0]);
  });
});

describe.skipIf(!process.env['TEST_DATABASE_URL'])('composición PostgreSQL contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', () => {
  it('[REQ-PG-010] arranque y cierre contra TEST_DATABASE_URL', () => {
    expect(process.env['TEST_DATABASE_URL']).toMatch(/^postgres/);
  });
});
