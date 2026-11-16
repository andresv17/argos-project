import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * T428 (REQ-PG-010, SC-CLD-011): con ARGOS_DB_DRIVER=sqlite no se carga pg ni ningún módulo postgres-*.
 * `pg` es un módulo falso que falla si se importa; los módulos postgres-* se sustituyen por dobles que registran su carga.
 */
const mocks = vi.hoisted(() => ({ loaded: vi.fn() }));

vi.mock('pg', () => {
  mocks.loaded('pg');
  throw new Error('pg no debe cargarse con ARGOS_DB_DRIVER=sqlite');
});
vi.mock('../../src/infrastructure/persistence/postgres/postgres-database.ts', () => {
  mocks.loaded('postgres-database');
  return { createPostgresPool: vi.fn(), closePool: vi.fn() };
});
vi.mock('../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts', () => {
  mocks.loaded('postgres-unit-of-work');
  return { PostgresUnitOfWork: vi.fn() };
});
vi.mock('../../src/infrastructure/persistence/postgres/postgres-repositories.ts', () => {
  mocks.loaded('postgres-repositories');
  return { createPostgresRepositories: vi.fn() };
});

describe('composición SQLite de createProductionApp (T428)', () => {
  it('[REQ-PG-010][SC-CLD-011] con sqlite arranca, cierra y no carga pg ni los módulos postgres-*', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t428-'));
    try {
      const { createProductionApp } = await import('../../src/infrastructure/http/server.ts');
      const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'argos.sqlite') }), false);
      await app.close();
      expect(mocks.loaded.mock.calls).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
