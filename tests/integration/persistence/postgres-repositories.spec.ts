/**
 * Conformidad de los repositorios de PostgreSQL contra la suite compartida (T422..T424, REQ-PG-002, INV-ARCH-005).
 * Contra un Postgres real: se OMITE sin TEST_DATABASE_URL (única lectura de process.env permitida en tests/ para PostgreSQL).
 * Cada prueba usa un esquema propio con el baseline 0001 aplicado; `dispose` lo elimina y cierra el pool.
 * Usa la fábrica completa createPostgresRepositories (3 partes, T424): ya no hay cast ni partes faltantes.
 * RESERVAS DE ORACLE PARA T427 (pendientes, no resueltas aquí): R-1 revokeOthers sin validación previa por fila (probar fila corrupta
 * y timestamp no canónico en Postgres real); R-2 comparaciones de fecha como TEXT (probar bordes de countSince y consume).
 */
import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { defineAuthIdentityRepositoryContractSuite } from '../../fixtures/auth-identity-repository-contract-suite.ts';
import { defineMediaRepositoryContractSuite } from '../../fixtures/media-repository-contract-suite.ts';
import { defineCareRepositoryContractSuite } from '../../fixtures/care-repository-contract-suite.ts';
import { defineRepositoryContractSuite } from '../../fixtures/repository-contract-suite.ts';
import { allPostgresMigrationsSql } from '../../fixtures/postgres-migrations.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
// Esquema vigente: el baseline y la 0002 (columna `revision` de los 6 registros, T540; los repositorios la leen y la escriben desde T614).
const BASELINE = allPostgresMigrationsSql();

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
    // T1655 tramo 2 (F7): repositorios de cuidado (care_routines, care_log_entries, caregiver_access), un esquema desechable por prueba.
    let carePool: PoolLike | undefined;
    let careAdmin: PoolLike | undefined;
    let careSchema = '';
    defineCareRepositoryContractSuite(
      'PostgreSQL',
      async () => {
        careSchema = `argos_c_${randomUUID().replaceAll('-', '')}`;
        careAdmin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
        await careAdmin.query(`CREATE SCHEMA ${careSchema}`);
        const url = new URL(TEST_DATABASE_URL ?? '');
        url.searchParams.set('options', `-c search_path=${careSchema}`);
        carePool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
        await carePool.query(BASELINE);
        const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as {
          createPostgresRepositories: (client: PoolClientLike) => RepositorySet;
        };
        return new PostgresUnitOfWork(carePool, createPostgresRepositories);
      },
      {
        dispose: async () => {
          if (carePool) await closePool(carePool);
          if (careAdmin) {
            await careAdmin.query(`DROP SCHEMA IF EXISTS ${careSchema} CASCADE`);
            await closePool(careAdmin);
          }
          carePool = undefined;
          careAdmin = undefined;
        },
      },
    );
    // T1117: repositorios del acceso con Google (auth_identities, oauth_flow_states y correo verificado de users), un esquema desechable por prueba.
    let ssoPool: PoolLike | undefined;
    let ssoAdmin: PoolLike | undefined;
    let ssoSchema = '';
    defineAuthIdentityRepositoryContractSuite(
      'PostgreSQL',
      async () => {
        ssoSchema = `argos_s_${randomUUID().replaceAll('-', '')}`;
        ssoAdmin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
        await ssoAdmin.query(`CREATE SCHEMA ${ssoSchema}`);
        const url = new URL(TEST_DATABASE_URL ?? '');
        url.searchParams.set('options', `-c search_path=${ssoSchema}`);
        ssoPool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
        await ssoPool.query(BASELINE);
        const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as {
          createPostgresRepositories: (client: PoolClientLike) => RepositorySet;
        };
        return new PostgresUnitOfWork(ssoPool, createPostgresRepositories);
      },
      {
        dispose: async () => {
          if (ssoPool) await closePool(ssoPool);
          if (ssoAdmin) {
            await ssoAdmin.query(`DROP SCHEMA IF EXISTS ${ssoSchema} CASCADE`);
            await closePool(ssoAdmin);
          }
          ssoPool = undefined;
          ssoAdmin = undefined;
        },
      },
    );
  },
);
