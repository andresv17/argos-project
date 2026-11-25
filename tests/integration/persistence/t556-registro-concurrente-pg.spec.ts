/**
 * H-O-004US3-4 [US3] registro concurrente con el mismo username (sin distinguir mayúsculas) en PostgreSQL 17 real con DOS conexiones
 * (se OMITE sin TEST_DATABASE_URL) (REQ-LOG-002, INV-LOG-001, EDGE-009, ERR-AUTH-USERNAME-TAKEN):
 *  - dos altas simultáneas por la unidad de trabajo: el candado asesor global las serializa; resulta exactamente un usuario y la otra
 *    petición recibe ERR-AUTH-USERNAME-TAKEN (no un 500);
 *  - carrera REAL contra la restricción: una conexión «A» inserta el usuario SIN el candado asesor (como una segunda instancia o un proceso
 *    de mantenimiento) y queda con la transacción abierta; el alta «B» pasa la comprobación previa (A no ha confirmado), se bloquea en el
 *    índice `users_username_lower` y, al confirmar A, recibe 23505. El caso de uso lo traduce a ERR-AUTH-USERNAME-TAKEN (clase 3.1.0,
 *    campo `username`), sin datos del driver, y no crea un segundo usuario.
 * Limitación: con el candado asesor de PostgresUnitOfWork, dos altas por la misma unidad de trabajo jamás llegan al 23505; la carrera real
 * solo se reproduce con un escritor que no toma ese candado (el caso «A» de arriba).
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { RegisterUserUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { DomainError as DomainErrorV31 } from '../../../src/generated/v31/index.ts';
import { DomainError } from '../../../src/generated/index.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { createDeps } from '../../fixtures/application-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { HAS_POSTGRES, account, idOf } from '../../fixtures/identity-engines.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const NEW_PASSWORD = 'Clave2026x!';
const REGISTRATION = { displayName: 'Nuevo', password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, adultDeclaration: true };

interface Setup {
  readonly pool: PoolLike;
  readonly uow: PostgresUnitOfWork;
  readonly createRepositories: (client: PoolClientLike) => RepositorySet;
  readonly usersLike: (username: string) => Promise<string[]>;
}

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

async function setup(): Promise<Setup> {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 6 });
  disposers.push(async () => {
    await closePool(pool);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await closePool(admin);
  });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  return {
    pool,
    uow: new PostgresUnitOfWork(pool, createPostgresRepositories),
    createRepositories: createPostgresRepositories,
    usersLike: async (username) => (await pool.query('SELECT username FROM users WHERE lower(username) = lower($1)', [username])).rows.map((r) => String(r['username'])),
  };
}

const registerAs = (uow: PostgresUnitOfWork) => new RegisterUserUseCase(createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()));
async function outcome(promise: Promise<unknown>): Promise<{ readonly kind: 'OK' } | { readonly kind: 'ERR'; readonly error: DomainError | DomainErrorV31 }> {
  try {
    await promise;
    return { kind: 'OK' };
  } catch (error) {
    if (error instanceof DomainError || error instanceof DomainErrorV31) return { kind: 'ERR', error };
    throw error;
  }
}

describe.skipIf(!HAS_POSTGRES)('H-O-004US3-4 registro concurrente con el mismo username en PostgreSQL (dos conexiones)', () => {
  it('[REQ-LOG-002][INV-LOG-001][EDGE-009] dos altas simultáneas «Nuevo.Usuario» y «NUEVO.USUARIO»: exactamente un usuario y la otra con ERR-AUTH-USERNAME-TAKEN', async () => {
    const pg = await setup();
    const uowB = new PostgresUnitOfWork(pg.pool, pg.createRepositories);
    // Dos casos de uso con secuencias de ids propias: las dos conexiones jamás repiten id de entidad.
    const a = registerAs(pg.uow);
    const b = registerAs(uowB);
    const results = await Promise.all([a.execute({ username: 'Nuevo.Usuario', ...REGISTRATION }), b.execute({ username: 'NUEVO.USUARIO', ...REGISTRATION })].map(outcome));
    expect(results.filter((r) => r.kind === 'OK')).toHaveLength(1);
    const losers = results.filter((r): r is { kind: 'ERR'; error: DomainError | DomainErrorV31 } => r.kind === 'ERR');
    expect(losers.map((r) => [r.error.code, r.error.status, r.error.field])).toEqual([['ERR-AUTH-USERNAME-TAKEN', 409, 'username']]);
    expect(await pg.usersLike('nuevo.usuario')).toHaveLength(1);
  }, 60_000);

  it('[INV-LOG-001][EDGE-009] carrera real: A inserta sin el candado asesor y B, ya bloqueada en users_username_lower, recibe 23505 → ERR-AUTH-USERNAME-TAKEN (no 500) y no crea un segundo usuario', async () => {
    const pg = await setup();
    const clientA = await pg.pool.connect();
    let aOpen = true;
    try {
      await clientA.query('BEGIN');
      await pg.createRepositories(clientA).users.insert(account(idOf(77), 'Nuevo.Usuario', NEW_PASSWORD));
      // B llega mientras A sigue abierta: la comprobación previa no ve a A (sin confirmar) y el INSERT queda esperando el índice único.
      const b = outcome(registerAs(pg.uow).execute({ username: 'NUEVO.USUARIO', ...REGISTRATION }));
      const deadline = Date.now() + 10_000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        const waiting = await pg.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event IN ('transactionid', 'tuple') AND query ILIKE 'INSERT INTO%users%'");
        blocked = waiting.rows.length > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(blocked, 'B debe quedar bloqueada esperando el índice único de A').toBe(true);
      await clientA.query('COMMIT');
      aOpen = false;
      const result = await b;
      expect(result.kind).toBe('ERR');
      if (result.kind !== 'ERR') return;
      expect(result.error).toBeInstanceOf(DomainErrorV31);
      expect([result.error.code, result.error.status, result.error.field]).toEqual(['ERR-AUTH-USERNAME-TAKEN', 409, 'username']);
      // H-O-004US3R-1: sin distinguir mayúsculas (el username enviado es «NUEVO.USUARIO»): cuerpo serializado, mensaje, detalle y pila.
      const everything = (JSON.stringify(result.error) + result.error.message + String(result.error.detail) + String(result.error.stack)).toLowerCase();
      for (const leaked of ['users_username_lower', '23505', 'key (', 'nuevo.usuario']) expect(everything, leaked).not.toContain(leaked);
      expect(await pg.usersLike('nuevo.usuario')).toEqual(['Nuevo.Usuario']);
    } finally {
      if (aOpen) await clientA.query('ROLLBACK').catch(() => undefined);
      clientA.release();
    }
  }, 60_000);
});
