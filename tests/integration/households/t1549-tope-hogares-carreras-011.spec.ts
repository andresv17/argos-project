import { afterEach, describe, expect, it } from 'vitest';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { CreateHouseholdUseCase, RespondInvitationUseCase } from '../../../src/application/use-cases/household-use-cases.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, gate, holdBeforeCommit, TEST_DATABASE_URL, type ConcurrentEngine } from '../../fixtures/concurrent-engines.ts';
import { activeCount, CAP, CARLOS, clearCanonicalInvitations, householdId, outcome, plan, seedHouseholds, seedInvitations, stateOfCarlos } from '../../fixtures/household-cap-011.ts';

/**
 * T1549 (011, Bloque H, #74; PRUEBAS ROJAS hasta T1550; `/keymaker`): carrera de dos operaciones simultáneas contra el tope de 5 hogares activos (REQ-HOG11-004,
 * INV-HOG11-001, EDGE-011-010, SC-011-053; ERR-HOG11-HOUSEHOLD-LIMIT-REACHED). Dos conexiones reales al mismo almacenamiento: SQLite (archivo; la segunda con `busy_timeout = 0`)
 * y PostgreSQL 17 (dos transacciones de dos clientes del pool; se OMITE sin `TEST_DATABASE_URL`). La memoria no serializa y NO sirve de evidencia (EDGE-011-010).
 * «A» retiene su transacción tras el trabajo y antes de confirmar; «B» llega mientras A sigue abierta y, con el candado bien tomado, solo cuenta después de que A confirme.
 *
 * @implements REQ-HOG11-004, INV-HOG11-001, EDGE-011-010, EDGE-011-016, SC-011-053, SC-011-054, SC-011-055, SC-011-056, ERR-HOG11-HOUSEHOLD-LIMIT-REACHED
 */
const LIMIT = 'ERR-HOG11-HOUSEHOLD-LIMIT-REACHED';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const accept = (deps: ApplicationDeps, n: number) => new RespondInvitationUseCase(deps).execute(CARLOS, householdId(n), 'ACCEPT');
const create = (deps: ApplicationDeps, name: string) => new CreateHouseholdUseCase(deps).execute(CARLOS, { name });

const open: ConcurrentEngine[] = [];
/** Dependencias de la conexión A, una por motor: sus ids deterministas (y los de auditoría) no se repiten entre llamadas. */
const bases = new Map<ConcurrentEngine, ApplicationDeps>();
const baseOf = (engine: ConcurrentEngine): ApplicationDeps => {
  let deps = bases.get(engine);
  if (deps === undefined) bases.set(engine, (deps = engine.depsA()));
  return deps;
};
afterEach(async () => {
  for (const engine of open.splice(0)) await engine.dispose();
});

/** Carlos con `active` hogares activos y `invitations` invitaciones abiertas, en el motor dado. */
async function setup(create: () => Promise<ConcurrentEngine>, active: number, invitations: readonly number[]): Promise<ConcurrentEngine> {
  const engine = await create();
  open.push(engine);
  await clearCanonicalInvitations(engine.uowA);
  await seedHouseholds(engine.uowA, plan(active));
  await seedInvitations(engine.uowA, invitations);
  return engine;
}

/** A hace su trabajo y retiene; B arranca con A abierta; tras una pausa se libera A. Devuelve los resultados de ambos. */
async function race(engine: ConcurrentEngine, a: (deps: ApplicationDeps) => Promise<unknown>, b: (deps: ApplicationDeps) => Promise<unknown>): Promise<{ a: string; b: string }> {
  const entered = gate();
  const hold = gate();
  const aOutcome = outcome(a({ ...baseOf(engine), uow: holdBeforeCommit(engine.uowA, entered.open, hold.promise) }));
  // Si A ya está por encima del tope, rechaza antes de llegar al commit retenido: no hay nada que esperar (EDGE-011-008).
  await Promise.race([entered.promise, aOutcome]);
  const bOutcome = outcome(engine.asClientB(b).result);
  await pause(300); // B ya intentó (SQLite: BUSY y reintentos; PostgreSQL: bloqueado en el candado o, sin candado, ya confirmó)
  hold.open();
  return { a: await aOutcome, b: await bOutcome };
}

function suite(name: string, make: () => Promise<ConcurrentEngine>, skip: boolean) {
  describe.skipIf(skip)(`T1549 carreras contra el tope de 5 hogares (${name})`, { timeout: 60_000 }, () => {
    it('[EDGE-011-010][INV-HOG11-001][SC-011-053] dos aceptaciones simultáneas desde 4 hogares: solo una prospera, la otra recibe ERR-HOG11-HOUSEHOLD-LIMIT-REACHED y quedan 5 activos', async () => {
      const engine = await setup(make, 4, [101, 102]);
      const result = await race(engine, (d) => accept(d, 101), (d) => accept(d, 102));
      expect([result.a, result.b].sort()).toEqual([LIMIT, 'OK']);
      expect(await activeCount(engine.uowA)).toBe(CAP);
    });

    it('[EDGE-011-010][EDGE-011-016][INV-HOG11-001][SC-011-054] la aceptación que pierde la carrera deja su invitación OPEN (reintentable) y no escribe membresía', async () => {
      const engine = await setup(make, 4, [101, 102]);
      const result = await race(engine, (d) => accept(d, 101), (d) => accept(d, 102));
      const loser = result.a === LIMIT ? 101 : 102;
      expect([result.a, result.b].sort()).toEqual([LIMIT, 'OK']);
      const state = await stateOfCarlos(engine.uowA);
      expect(state.open).toEqual([`${householdId(loser)}|INVITED`]);
      expect(state.memberships.filter((m) => m.startsWith(householdId(loser)))).toEqual([]);
    });

    it('[EDGE-011-010][INV-HOG11-001][SC-011-053] una aceptación y una creación simultáneas desde 4 hogares: solo una prospera y el total queda en 5', async () => {
      const engine = await setup(make, 4, [101]);
      const result = await race(engine, (d) => accept(d, 101), (d) => create(d, 'Carrera'));
      expect([result.a, result.b].sort()).toEqual([LIMIT, 'OK']);
      expect(await activeCount(engine.uowA)).toBe(CAP);
    });

    it('[EDGE-011-010][INV-HOG11-001][SC-011-053] dos creaciones simultáneas desde 4 hogares: solo una prospera y el total queda en 5', async () => {
      const engine = await setup(make, 4, []);
      const result = await race(engine, (d) => create(d, 'Carrera A'), (d) => create(d, 'Carrera B'));
      expect([result.a, result.b].sort()).toEqual([LIMIT, 'OK']);
      expect(await activeCount(engine.uowA)).toBe(CAP);
    });

    it('[EDGE-011-010][REQ-HOG11-004][SC-011-053] desde 3 hogares dos operaciones simultáneas caben las dos (5) y una tercera posterior recibe el tope: el tope no sobrerrestringe', async () => {
      const engine = await setup(make, 3, [101, 102, 103]);
      const result = await race(engine, (d) => accept(d, 101), (d) => accept(d, 102));
      expect([result.a, result.b]).toEqual(['OK', 'OK']);
      expect(await activeCount(engine.uowA)).toBe(CAP);
      expect(await outcome(accept(baseOf(engine), 103))).toBe(LIMIT);
      expect(await activeCount(engine.uowA)).toBe(CAP);
    });

    it('[EDGE-011-010][EDGE-011-008][INV-HOG11-001][SC-011-055] quien ya supera 5 (siembra con 6): dos aceptaciones simultáneas fallan las dos y conserva sus 6 hogares', async () => {
      const engine = await setup(make, 6, [101, 102]);
      const result = await race(engine, (d) => accept(d, 101), (d) => accept(d, 102));
      expect([result.a, result.b]).toEqual([LIMIT, LIMIT]);
      expect(await activeCount(engine.uowA)).toBe(6);
      expect((await stateOfCarlos(engine.uowA)).open).toHaveLength(2);
    });
  });
}

suite('SQLite real, dos conexiones', createSqliteConcurrentEngine, false);
suite('PostgreSQL 17 real', createPostgresConcurrentEngine, !TEST_DATABASE_URL);

describe.skipIf(Boolean(TEST_DATABASE_URL))('T1549 carreras contra el tope de 5 hogares (PostgreSQL 17: PENDIENTE DE ARNÉS)', () => {
  it('[EDGE-011-010][REQ-HOG11-004][SC-011-053] sin TEST_DATABASE_URL la carrera en PostgreSQL 17 queda PENDIENTE DE ARNÉS y no cuenta como evidencia', () => {
    expect(Boolean(TEST_DATABASE_URL)).toBe(false);
  });
});
