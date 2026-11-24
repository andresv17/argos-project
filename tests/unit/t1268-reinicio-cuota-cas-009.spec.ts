import { afterEach, describe, expect, it } from 'vitest';
import { ResetAdminSceneQuotaUseCase } from '../../src/application/use-cases/admin-parameter-use-cases.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { adminParameterRepository } from '../../src/infrastructure/persistence/sqlite/sqlite-admin-repositories.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import type { PoolClientLike } from '../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { adminKit, ADMIN_EMAIL, ADMIN_SUB } from '../fixtures/admin-fixtures.ts';
import { createDeps } from '../fixtures/application-harness.ts';
import { account, idOf, stateWith } from '../fixtures/identity-engines.ts';
import { seedSqlite } from '../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../fixtures/test-doubles.ts';
import { adminParameterRepository as postgresAdminParameterRepository } from '../../src/infrastructure/persistence/postgres/postgres-admin-repositories.ts';

/**
 * T1268 (Feature 009, Fase 5a, #20; OBS-1 del oraculo): rama determinista de PERDIDA DE LA CARRERA del reinicio de cuota. Un doble cambia `consumed_generations` ENTRE la lectura (SELECT) y la
 * escritura condicional (UPDATE ... WHERE consumed_generations = <leido>) de la segunda cuenta: el compare-and-set por fila debe devolver `null` (repositorio SQLite y PostgreSQL) y el caso
 * de uso debe responder 409 ERR-ADMIN-QUOTA-RESET-CONFLICT con la primera cuenta (ya puesta a cero dentro de la transaccion) restaurada por el rollback y 0 auditorias.
 * @implements REQ-CFG9-006, EDGE-009-023, SC-009-026, ERR-ADMIN-QUOTA-RESET-CONFLICT
 */
const T0 = '2026-11-01T00:00:00.000Z';
const WINDOW = '2026-11';
const EMAIL_A = 'cuenta.a1268@example.test';
const EMAIL_B = 'cuenta.b1268@example.test';
const A = account(idOf(1281), 'cuenta.a', 'x', EMAIL_A);
const B = account(idOf(1282), 'cuenta.b', 'x', EMAIL_B);
const VERIFIED_A = { ...A, emailVerifiedAt: T0 };
const VERIFIED_B = { ...B, emailVerifiedAt: T0 };
const SCENE_A = 'd0000000-0000-4000-8000-000000000021';
const SCENE_B = 'd0000000-0000-4000-8000-000000000022';

type Target = 'scene' | 'carry';

/** Base SQLite cuyo SELECT de `target` (segunda ejecucion = segunda cuenta) cambia el contador de esa fila justo despues de leerla. */
function racingDatabase(target: Target, armed: { on: boolean }): SqliteDatabase {
  const real = openSqliteDatabase(IN_MEMORY_DATABASE);
  const needle = target === 'scene' ? 'FROM home_scenes WHERE owner_user_id' : 'FROM scene_quota_carry WHERE owner_user_id';
  let calls = 0;
  const intercept = new Proxy(real, {
    get(obj, prop) {
      if (prop !== 'prepare') {
        const value = Reflect.get(obj, prop, obj) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(obj) : value;
      }
      return (sql: string) => {
        const statement = real.prepare(sql);
        if (!sql.includes(needle) || !sql.trimStart().startsWith('SELECT')) return statement;
        return new Proxy(statement, {
          get(st, p) {
            if (p !== 'all') {
              const v = Reflect.get(st, p, st) as unknown;
              return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(st) : v;
            }
            return (...args: unknown[]) => {
              const rows = (st as unknown as { all: (...a: unknown[]) => Array<Record<string, unknown>> }).all(...args);
              calls += 1;
              if (armed.on && calls === 2 && rows.length === 1) {
                if (target === 'scene') real.prepare('UPDATE home_scenes SET consumed_generations = consumed_generations + 1 WHERE id = ?').run(rows[0]!['id']);
                else real.prepare('UPDATE scene_quota_carry SET consumed_generations = consumed_generations + 1 WHERE owner_user_id = ? AND quota_window = ?').run(args[0], rows[0]!['quota_window']);
              }
              return rows;
            };
          },
        });
      };
    },
  });
  return intercept as SqliteDatabase;
}

const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
});

async function seeded(target: Target, armed: { on: boolean }): Promise<{ db: SqliteDatabase; uow: SqliteUnitOfWork }> {
  const db = racingDatabase(target, armed);
  opened.push(db);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, stateWith([VERIFIED_A, VERIFIED_B]));
  await uow.runInTransaction(async (r) => {
    await r.scenes.insert({ id: SCENE_A, householdId: null, ownerUserId: A.id, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 3, quotaWindow: WINDOW, createdAt: T0, updatedAt: T0 });
    await r.scenes.insert({ id: SCENE_B, householdId: null, ownerUserId: B.id, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false, consumedGenerations: 5, quotaWindow: WINDOW, createdAt: T0, updatedAt: T0 });
    await r.scenes.upsertQuotaCarry(A.id, WINDOW, 2);
    await r.scenes.upsertQuotaCarry(B.id, WINDOW, 4);
  });
  return { db, uow };
}

const snapshot = (uow: SqliteUnitOfWork) =>
  uow.runInTransaction(async (r) => ({
    scenes: [(await r.scenes.findByOwnerUserId(A.id))?.consumedGenerations, (await r.scenes.findByOwnerUserId(B.id))?.consumedGenerations],
    carry: [await r.scenes.findQuotaCarry(A.id, WINDOW), await r.scenes.findQuotaCarry(B.id, WINDOW)],
  }));

describe.each<Target>(['scene', 'carry'])('T1268 [REQ-CFG9-006] perdida de la carrera del reinicio (%s) con SQLite', (target) => {
  it('control sin carrera: reinicia las dos cuentas', async () => {
    const { db } = await seeded(target, { on: false });
    expect(await adminParameterRepository(db).resetAdminAccountsSceneQuota([], [EMAIL_A, EMAIL_B])).toEqual({ accountsReset: 2 });
  });

  it('repositorio: si el contador cambia entre el SELECT y el UPDATE condicional, devuelve null', async () => {
    const armed = { on: false };
    const { db } = await seeded(target, armed);
    armed.on = true;
    expect(await adminParameterRepository(db).resetAdminAccountsSceneQuota([], [EMAIL_A, EMAIL_B])).toBeNull();
  });

  it('caso de uso: 409 ERR-ADMIN-QUOTA-RESET-CONFLICT, estado intacto por el rollback y 0 auditorias', async () => {
    const armed = { on: false };
    const { db, uow } = await seeded(target, armed);
    const kit = adminKit([EMAIL_A, EMAIL_B]);
    const deps = { ...createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()), admin: kit.admin };
    const adminId = 'e0000000-0000-4000-8000-000000001268';
    await uow.runInTransaction((r) => r.adminIdentities.insertIfAbsent({ adminId, provider: 'GOOGLE', providerSubject: ADMIN_SUB, email: ADMIN_EMAIL, createdAt: T0 }));
    const before = await snapshot(uow);
    expect(before).toEqual({ scenes: [3, 5], carry: [2, 4] });
    armed.on = true;
    await expect(new ResetAdminSceneQuotaUseCase(deps).execute({ adminId, body: {} })).rejects.toMatchObject({ code: 'ERR-ADMIN-QUOTA-RESET-CONFLICT' });
    armed.on = false;
    // El competidor tambien se revierte (misma transaccion): el estado es exactamente el inicial.
    expect(await snapshot(uow)).toEqual(before);
    expect((db.prepare('SELECT COUNT(*) AS n FROM admin_audit_entries').get() as { n: number }).n).toBe(0);
  });
});

describe('T1268 [REQ-CFG9-006] perdida de la carrera del reinicio con el cliente PostgreSQL (doble programado)', () => {
  /** Cliente de doble: las lecturas devuelven filas fijas y el UPDATE condicional de la segunda cuenta ve 0 filas (otra escritura cambio el contador). */
  const client = (loser: 'home_scenes' | 'scene_quota_carry' | null): { client: PoolClientLike; updates: string[] } => {
    const updates: string[] = [];
    let sceneUpdates = 0;
    let carryUpdates = 0;
    const fake: PoolClientLike = {
      release: () => undefined,
      async query(text) {
        if (text.includes('FROM users')) return { rows: [{ id: A.id }, { id: B.id }], rowCount: 2 };
        if (text.includes('SELECT id, consumed_generations FROM home_scenes')) return { rows: [{ id: 's', consumed_generations: 3 }], rowCount: 1 };
        if (text.includes('SELECT quota_window, consumed_generations FROM scene_quota_carry')) return { rows: [{ quota_window: WINDOW, consumed_generations: 2 }], rowCount: 1 };
        updates.push(text);
        if (text.startsWith('UPDATE home_scenes')) sceneUpdates += 1;
        if (text.startsWith('UPDATE scene_quota_carry')) carryUpdates += 1;
        const lost = (loser === 'home_scenes' && text.startsWith('UPDATE home_scenes') && sceneUpdates === 2) || (loser === 'scene_quota_carry' && text.startsWith('UPDATE scene_quota_carry') && carryUpdates === 2);
        return { rows: [], rowCount: lost ? 0 : 1 };
      },
    };
    return { client: fake, updates };
  };

  it.each(['home_scenes', 'scene_quota_carry'] as const)('devuelve null si el UPDATE condicional de %s de la segunda cuenta afecta 0 filas', async (loser) => {
    const { client: fake } = client(loser);
    expect(await postgresAdminParameterRepository(fake).resetAdminAccountsSceneQuota([], [EMAIL_A, EMAIL_B])).toBeNull();
  });

  it('control: sin perdida, devuelve accountsReset = 2 y cada UPDATE es condicional sobre el valor leido', async () => {
    const { client: calm, updates } = client(null);
    expect(await postgresAdminParameterRepository(calm).resetAdminAccountsSceneQuota([], [EMAIL_A, EMAIL_B])).toEqual({ accountsReset: 2 });
    expect(updates).toHaveLength(4);
    expect(updates.every((u) => u.includes('AND consumed_generations ='))).toBe(true);
  });
});
