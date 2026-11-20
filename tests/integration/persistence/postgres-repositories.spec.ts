/**
 * Conformidad de los repositorios de PostgreSQL contra la suite compartida (T422..T424, REQ-PG-002, INV-ARCH-005).
 * Contra un Postgres real: se OMITE sin TEST_DATABASE_URL (única lectura de process.env permitida en tests/ para PostgreSQL).
 * Cada prueba usa un esquema propio con el baseline 0001 aplicado; `dispose` lo elimina y cierra el pool.
 * Usa la fábrica completa createPostgresRepositories (3 partes, T424): ya no hay cast ni partes faltantes.
 * RESERVAS DE ORACLE PARA T427 (pendientes, no resueltas aquí): R-1 revokeOthers sin validación previa por fila (probar fila corrupta
 * y timestamp no canónico en Postgres real); R-2 comparaciones de fecha como TEXT (probar bordes de countSince y consume).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { defineMediaRepositoryContractSuite } from '../../fixtures/media-repository-contract-suite.ts';
import { defineRepositoryContractSuite } from '../../fixtures/repository-contract-suite.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
// Esquema vigente: el baseline y la 0002 (columna `revision` de los 6 registros, T540; los repositorios la leen y la escriben desde T614).
const BASELINE = ['0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql', '0005_pet_media.sql', '0009_home_scenes.sql', '0010_pet_life_status.sql']
  .map((name) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${name}`, import.meta.url), 'utf8'))
  .join('\n');

describe.skipIf(!TEST_DATABASE_URL)(
  'repositorios PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)',
  { timeout: 60_000 },
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
        const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as {
          createPostgresRepositories: (client: PoolClientLike) => RepositorySet;
        };
        return new PostgresUnitOfWork(pool, createPostgresRepositories);
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

    // T575: repositorios de medios (pet_media, media_deletion_queue y avatar), un esquema desechable por prueba.
    let mediaPool: PoolLike | undefined;
    let mediaAdmin: PoolLike | undefined;
    let mediaSchema = '';
    defineMediaRepositoryContractSuite(
      'PostgreSQL',
      async () => {
        mediaSchema = `argos_m_${randomUUID().replaceAll('-', '')}`;
        mediaAdmin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
        await mediaAdmin.query(`CREATE SCHEMA ${mediaSchema}`);
        const url = new URL(TEST_DATABASE_URL ?? '');
        url.searchParams.set('options', `-c search_path=${mediaSchema}`);
        mediaPool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
        await mediaPool.query(BASELINE);
        const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as {
          createPostgresRepositories: (client: PoolClientLike) => RepositorySet;
        };
        return new PostgresUnitOfWork(mediaPool, createPostgresRepositories);
      },
      {
        dispose: async () => {
          if (mediaPool) await closePool(mediaPool);
          if (mediaAdmin) {
            await mediaAdmin.query(`DROP SCHEMA IF EXISTS ${mediaSchema} CASCADE`);
            await closePool(mediaAdmin);
          }
          mediaPool = undefined;
          mediaAdmin = undefined;
        },
      },
    );
  },
);
