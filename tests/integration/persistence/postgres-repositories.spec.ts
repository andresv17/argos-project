/**
 * Conformidad de los repositorios de PostgreSQL contra la suite compartida (T422..T424, REQ-PG-002, INV-ARCH-005).
 * Contra un Postgres real: se OMITE sin TEST_DATABASE_URL (única lectura de process.env permitida en tests/ para PostgreSQL).
 * Cada prueba usa un esquema propio con el baseline 0001 aplicado; `dispose` lo elimina y cierra el pool.
 * Nota: la suite es única; sus pruebas de mascotas, registros, hogares e invitaciones solo pasan al completarse T423 y T424.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { closePool, createPostgresPool, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { defineRepositoryContractSuite } from '../../fixtures/repository-contract-suite.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const BASELINE = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0001_baseline.sql', import.meta.url), 'utf8');

describe.skipIf(!TEST_DATABASE_URL)(
  'repositorios PostgreSQL reales (SE OMITE: falta la variable TEST_DATABASE_URL; levanta docker-compose.test.yml y defínela)',
  () => {
    let pool: PoolLike | undefined;
    let admin: PoolLike | undefined;
    let schema = '';
    defineRepositoryContractSuite(
      'PostgreSQL',
      async () => {
        schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
        admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
        await admin.query(`CREATE SCHEMA ${schema}`);
        const url = new URL(TEST_DATABASE_URL ?? '');
        url.searchParams.set('options', `-c search_path=${schema}`);
        pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
        await pool.query(BASELINE);
        const { createPostgresRepositoriesPart1 } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as {
          createPostgresRepositoriesPart1(client: unknown): unknown;
        };
        return new PostgresUnitOfWork(pool, (client) => createPostgresRepositoriesPart1(client) as RepositorySet);
      },
      {
        dispose: async () => {
          if (pool) await closePool(pool);
          if (admin) {
            await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await closePool(admin);
          }
          pool = undefined;
          admin = undefined;
        },
      },
    );
  },
);
