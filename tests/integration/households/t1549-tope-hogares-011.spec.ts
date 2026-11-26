import { afterEach, describe, expect, it } from 'vitest';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { CreateHouseholdUseCase, InviteMemberUseCase, LeaveHouseholdUseCase, ListMyHouseholdsUseCase, RespondInvitationUseCase } from '../../../src/application/use-cases/household-use-cases.ts';
import { createSqliteConcurrentEngine, createPostgresConcurrentEngine, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { activeCount, CAP, clearCanonicalInvitations, once, CARLOS, CARLOS_USERNAME, createLocalTargets, householdId, LUCIA, outcome, plan, seedHouseholds, seedInvitations, stateOfCarlos, type CapTarget } from '../../fixtures/household-cap-011.ts';

/**
 * T1549 (011, Bloque H, #74; PRUEBAS ROJAS hasta T1550; `/keymaker`): tope de 5 hogares activos por persona al crear un hogar y al aceptar una invitación
 * (REQ-HOG11-004, INV-HOG11-001, ERR-HOG11-HOUSEHOLD-LIMIT-REACHED; SC-011-053..056). Memoria, SQLite en proceso y PostgreSQL 17 real (se OMITE sin `TEST_DATABASE_URL`).
 * Las carreras viven en `t1549-tope-hogares-carreras-011.spec.ts` (SQLite y PostgreSQL reales; la memoria no serializa y no sirve de evidencia, EDGE-011-010).
 *
 * @implements REQ-HOG11-004, INV-HOG11-001, EDGE-011-008, EDGE-011-016, SC-011-053, SC-011-054, SC-011-055, SC-011-056, ERR-HOG11-HOUSEHOLD-LIMIT-REACHED
 */
const LIMIT = 'ERR-HOG11-HOUSEHOLD-LIMIT-REACHED';
const create = (t: CapTarget, name = 'Casa nueva') => new CreateHouseholdUseCase(t.deps()).execute(CARLOS, { name });
const accept = (t: CapTarget, n: number) => new RespondInvitationUseCase(t.deps()).execute(CARLOS, householdId(n), 'ACCEPT');
const leave = (t: CapTarget, n: number) => new LeaveHouseholdUseCase(t.deps()).execute(CARLOS, householdId(n));

const open: CapTarget[] = [];
afterEach(async () => {
  for (const t of open.splice(0)) await t.dispose();
});

/** Adapta los motores de `concurrent-engines.ts` (solo la conexión A) al contrato de un solo cliente. */
async function singleClient(make: () => Promise<{ uowA: UnitOfWorkPort; depsA: () => ReturnType<CapTarget['deps']>; dispose: () => Promise<void> }>, name: string): Promise<CapTarget> {
  const engine = await make();
  return { name, uow: engine.uowA, deps: once(() => engine.depsA()), dispose: () => engine.dispose() };
}

/** Un solo motor de los locales (el otro se cierra), para que cada motor sea su propia suite y su fallo no oculte al otro. */
async function only(name: string): Promise<CapTarget[]> {
  const all = await createLocalTargets();
  for (const t of all.filter((x) => x.name !== name)) await t.dispose();
  return all.filter((x) => x.name === name);
}

const FACTORIES: Array<{ name: string; enabled: boolean; make: () => Promise<CapTarget[]> }> = [
  { name: 'memoria', enabled: true, make: () => only('memoria') },
  { name: 'SQLite en proceso', enabled: true, make: () => only('SQLite') },
  { name: 'SQLite archivo', enabled: true, make: async () => [await singleClient(createSqliteConcurrentEngine, 'SQLite archivo')] },
  { name: 'PostgreSQL 17', enabled: Boolean(TEST_DATABASE_URL), make: async () => [await singleClient(createPostgresConcurrentEngine, 'PostgreSQL 17')] },
];

for (const factory of FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1549 tope de 5 hogares activos (${factory.name})`, { timeout: 60_000 }, () => {
    async function targets(active: number, left = 0, removed = 0, invitations: readonly number[] = []): Promise<CapTarget[]> {
      const made = await factory.make();
      for (const t of made) {
        open.push(t);
        await clearCanonicalInvitations(t.uow);
        await seedHouseholds(t.uow, plan(active, left, removed));
        if (invitations.length > 0) await seedInvitations(t.uow, invitations);
      }
      return made;
    }

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-053] crear: con 4 hogares activos el quinto se crea y el sexto falla con ERR-HOG11-HOUSEHOLD-LIMIT-REACHED sin escribir nada', async () => {
      for (const t of await targets(4)) {
        expect([t.name, await outcome(create(t, 'Quinto'))]).toEqual([t.name, 'OK']);
        expect(await activeCount(t.uow)).toBe(CAP);
        const before = await stateOfCarlos(t.uow);
        expect([t.name, await outcome(create(t, 'Sexto'))]).toEqual([t.name, LIMIT]);
        expect(await stateOfCarlos(t.uow)).toEqual(before);
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-053] aceptar invitación: con 4 activos la quinta se acepta y la sexta falla con ERR-HOG11-HOUSEHOLD-LIMIT-REACHED', async () => {
      for (const t of await targets(4, 0, 0, [101, 102])) {
        expect([t.name, await outcome(accept(t, 101))]).toEqual([t.name, 'OK']);
        expect(await activeCount(t.uow)).toBe(CAP);
        expect([t.name, await outcome(accept(t, 102))]).toEqual([t.name, LIMIT]);
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-053] con 5 hogares activos crear y aceptar fallan con el mismo código (determinista, repetible)', async () => {
      for (const t of await targets(5, 0, 0, [101])) {
        const outcomes = [await outcome(create(t)), await outcome(create(t)), await outcome(accept(t, 101)), await outcome(accept(t, 101))];
        expect([t.name, outcomes]).toEqual([t.name, [LIMIT, LIMIT, LIMIT, LIMIT]]);
      }
    });

    it('[EDGE-011-016][INV-HOG11-001][SC-011-054] la invitación rechazada por el tope queda OPEN y reintentable; no cambia de estado ni crea membresía', async () => {
      for (const t of await targets(5, 0, 0, [101])) {
        const before = await stateOfCarlos(t.uow);
        expect(await outcome(accept(t, 101))).toBe(LIMIT);
        const after = await stateOfCarlos(t.uow);
        expect([t.name, after]).toEqual([t.name, before]);
        expect(after.open).toEqual([`${householdId(101)}|INVITED`]);
        // al salir de un hogar queda cupo y la MISMA invitación se acepta
        await leave(t, 2);
        expect(await activeCount(t.uow)).toBe(CAP - 1);
        expect([t.name, await outcome(accept(t, 101))]).toEqual([t.name, 'OK']);
        expect((await stateOfCarlos(t.uow)).open).toEqual([]);
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[EDGE-011-016][INV-HOG11-001][SC-011-054] «activo» = membresía ACTIVE: LEFT y REMOVED no cuentan (4 ACTIVE + 3 LEFT + 3 REMOVED permite uno más y luego tope)', async () => {
      for (const t of await targets(4, 3, 3)) {
        expect([t.name, await outcome(create(t, 'Quinto'))]).toEqual([t.name, 'OK']);
        expect([t.name, await outcome(create(t, 'Sexto'))]).toEqual([t.name, LIMIT]);
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[EDGE-011-016][INV-HOG11-001][SC-011-054] invitaciones INVITED y DECLINED no cuentan como hogar activo: con 4 activos y 3 invitaciones abiertas se crea el quinto y las invitaciones no suman', async () => {
      for (const t of await targets(4, 0, 0, [101, 102, 103])) {
        expect([t.name, await outcome(create(t, 'Quinto'))]).toEqual([t.name, 'OK']);
        expect((await stateOfCarlos(t.uow)).open).toHaveLength(3);
        expect(await outcome(accept(t, 101))).toBe(LIMIT);
        await new RespondInvitationUseCase(t.deps()).execute(CARLOS, householdId(102), 'DECLINE');
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[EDGE-011-008][INV-HOG11-001][SC-011-055] quien ya supera 5 (siembra con 7) conserva todos sus hogares, no puede crear ni aceptar y no hay expulsión', async () => {
      for (const t of await targets(7, 0, 0, [101])) {
        const listed = await new ListMyHouseholdsUseCase(t.deps()).execute(CARLOS);
        expect([t.name, listed.length]).toEqual([t.name, 7]);
        expect(await outcome(create(t))).toBe(LIMIT);
        expect(await outcome(accept(t, 101))).toBe(LIMIT);
        expect((await new ListMyHouseholdsUseCase(t.deps()).execute(CARLOS)).length).toBe(7);
        expect(await activeCount(t.uow)).toBe(7);
      }
    });

    it('[EDGE-011-008][REQ-HOG11-004][SC-011-055] salir libera cupo: con 7 hay que bajar a 4 para crear; con 6 y con 5 sigue rechazando', async () => {
      for (const t of await targets(7)) {
        await leave(t, 2); // 6 (el hogar 2 es de Lucía; Carlos es miembro)
        expect(await outcome(create(t))).toBe(LIMIT);
        await leave(t, 4); // 5
        expect(await outcome(create(t))).toBe(LIMIT);
        await leave(t, 6); // 4
        expect(await activeCount(t.uow)).toBe(CAP - 1);
        expect([t.name, await outcome(create(t, 'Con cupo'))]).toEqual([t.name, 'OK']);
        expect(await activeCount(t.uow)).toBe(CAP);
      }
    });

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-056] sin tope de invitaciones pendientes: con 5 hogares activos Carlos recibe invitaciones sin límite y el tope solo se aplica al aceptar', async () => {
      for (const t of await targets(5)) {
        await seedInvitations(t.uow, [201, 202, 203, 204, 205, 206, 207]);
        const sent = new InviteMemberUseCase(t.deps());
        await sent.execute(LUCIA, householdId(201), { username: CARLOS_USERNAME, roleOnJoin: 'READER' }); // invitación repetida: uniforme, sin efecto ni tope
        const state = await stateOfCarlos(t.uow);
        expect([t.name, state.open.length]).toEqual([t.name, 7]);
        expect(await outcome(accept(t, 201))).toBe(LIMIT);
        expect((await stateOfCarlos(t.uow)).open).toHaveLength(7);
      }
    });

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-056] invitar NO comprueba el tope del invitado: un propietario invita a quien ya tiene 5 hogares y la invitación se guarda', async () => {
      for (const t of await targets(5)) {
        await t.uow.runInTransaction(async (r: RepositorySet) => {
          await r.households.insert({ id: householdId(301), name: 'Casa de Lucía', ownerUserId: LUCIA, createdAt: '2026-03-20T10:00:00.000Z' });
          await r.households.saveMembership({ membershipId: 'e0000000-0000-4000-0001-000000000301', householdId: householdId(301), userId: LUCIA, role: 'OWNER', status: 'ACTIVE', invitedByUserId: null, invitedAt: null, joinedAt: '2026-03-20T10:00:00.000Z', firstJoinedAt: '2026-03-20T10:00:00.000Z', updatedAt: '2026-03-20T10:00:00.000Z' });
        });
        await new InviteMemberUseCase(t.deps()).execute(LUCIA, householdId(301), { username: CARLOS_USERNAME, roleOnJoin: 'READER' });
        expect([t.name, (await stateOfCarlos(t.uow)).open]).toEqual([t.name, [`${householdId(301)}|INVITED`]]);
      }
    });

    it('[REQ-HOG11-004][INV-HOG11-001][SC-011-053] conteo e inserción en la misma transacción: crear y aceptar usan UNA sola runInTransaction y, al rechazar, no queda ninguna escritura', async () => {
      for (const t of await targets(4, 0, 0, [101, 102])) {
        let runs = 0;
        const counting: UnitOfWorkPort = { runInTransaction: (work) => { runs += 1; return t.uow.runInTransaction(work); } };
        const deps = { ...t.deps(), uow: counting };
        await new CreateHouseholdUseCase(deps).execute(CARLOS, { name: 'Quinto' });
        expect([t.name, runs]).toEqual([t.name, 1]);
        runs = 0;
        const before = await stateOfCarlos(t.uow);
        const rejected = outcome(new RespondInvitationUseCase(deps).execute(CARLOS, householdId(101), 'ACCEPT'));
        expect(await rejected).toBe(LIMIT);
        expect(runs).toBe(1);
        expect(await stateOfCarlos(t.uow)).toEqual(before);
      }
    });

    it('[INV-HOG11-001][REQ-HOG11-004][SC-011-053] el tope es por persona: que Carlos esté en 5 no impide a Lucía crear ni aceptar', async () => {
      for (const t of await targets(5)) {
        const lucia = await new CreateHouseholdUseCase(t.deps()).execute(LUCIA, { name: 'De Lucía' });
        expect([t.name, lucia.household.name]).toEqual([t.name, 'De Lucía']);
      }
    });
  });
}
