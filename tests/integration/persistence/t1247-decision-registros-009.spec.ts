import { afterEach, describe, expect, it } from 'vitest';
import { NO_PASSWORD_SENTINEL } from '../../../src/domain/auth/password-sentinel.ts';
import { ENGINE_NAMES, HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

/**
 * T1247 (Feature 009, Fase 4, #18): repositorio de la decisión de aprobación sobre los tres motores (memoria, SQLite y, con TEST_DATABASE_URL, PostgreSQL 17). El compare-and-set es UN
 * `UPDATE ... WHERE account_status = 'PENDING'` con el número de filas afectadas como veredicto: dos transacciones SIMULTÁNEAS (conexiones distintas en PostgreSQL) sobre la misma
 * solicitud dan exactamente una `true` y una `false`. Lista y contador respetan la ventana de 30 días (EDGE-009-039) y paginan por keyset estable.
 * @implements REQ-APR9-003, REQ-APR9-005, EDGE-009-002, EDGE-009-003, EDGE-009-039, SC-009-004
 */
const NOW = '2026-11-23T12:00:00.000Z';
const CUTOFF = '2026-10-24T12:00:00.000Z'; // NOW - 30 días
const ADMIN_A = '00000000-0000-4000-8000-0000000000a1';
const ADMIN_B = '00000000-0000-4000-8000-0000000000b2';
const ENGINES: EngineName[] = ENGINE_NAMES.filter((n) => n !== 'PostgreSQL' || HAS_POSTGRES);

describe.each(ENGINES)('T1247 [REQ-APR9-003] [EDGE-009-002] decisión atómica y lista de PENDING sobre %s', (name) => {
  let engine: IdentityEngine | null = null;
  afterEach(async () => {
    await engine?.dispose();
    engine = null;
  });
  const ids = { a: idOf(11), b: idOf(12), c: idOf(13), old: idOf(14), active: idOf(15), google: idOf(16) };

  async function seed(): Promise<IdentityEngine> {
    const pending = (id: string, username: string, createdAt: string) => ({ ...account(id, username, 'Clave2026x!', `${username}@example.test`), createdAt, accountStatus: 'PENDING' as const });
    return openEngine(
      name,
      stateWith([
        pending(ids.b, 'solicitud.b', '2026-11-20T10:00:00.000Z'),
        pending(ids.a, 'solicitud.a', '2026-11-20T10:00:00.000Z'), // misma fecha que b: desempata por id
        pending(ids.c, 'solicitud.c', '2026-11-22T10:00:00.000Z'),
        pending(ids.old, 'solicitud.vieja', '2026-10-20T10:00:00.000Z'),
        { ...pending(ids.google, 'solicitud.google', '2026-11-21T10:00:00.000Z'), passwordHash: NO_PASSWORD_SENTINEL },
        { ...account(ids.active, 'cuenta.activa', 'Clave2026x!'), createdAt: '2026-11-19T10:00:00.000Z' },
      ]),
    );
  }
  const run = <T>(e: IdentityEngine, work: (r: Parameters<Parameters<IdentityEngine['uow']['runInTransaction']>[0]>[0]) => Promise<T>): Promise<T> => e.uow.runInTransaction(work);
  const stateOf = (e: IdentityEngine, id: string) => run(e, (r) => r.sessions.findOwnerAccountStatus(id));

  it('lista solo PENDING dentro de la ventana, por fecha y desempate por id, con el método de registro; el contador coincide', async () => {
    engine = await seed();
    const rows = await run(engine, (r) => r.registrations.listPending(CUTOFF, 50, null));
    expect(rows.map((x) => x.registrationId)).toEqual([ids.a, ids.b, ids.google, ids.c]);
    expect(rows.map((x) => x.method)).toEqual(['PASSWORD', 'PASSWORD', 'GOOGLE', 'PASSWORD']);
    expect(Object.keys(rows[0]!).sort()).toEqual(['method', 'registrationId', 'requestedAt', 'username']);
    expect(await run(engine, (r) => r.registrations.countPending(CUTOFF))).toBe(4);
  });

  it('el keyset continúa exactamente tras la última fila entregada, también con fechas iguales', async () => {
    engine = await seed();
    const first = await run(engine, (r) => r.registrations.listPending(CUTOFF, 1, null));
    expect(first.map((x) => x.registrationId)).toEqual([ids.a]);
    const second = await run(engine, (r) => r.registrations.listPending(CUTOFF, 2, { requestedAt: first[0]!.requestedAt, registrationId: first[0]!.registrationId }));
    expect(second.map((x) => x.registrationId)).toEqual([ids.b, ids.google]);
    const rest = await run(engine, (r) => r.registrations.listPending(CUTOFF, 5, { requestedAt: second[1]!.requestedAt, registrationId: second[1]!.registrationId }));
    expect(rest.map((x) => x.registrationId)).toEqual([ids.c]);
  });

  it('decide fija estado, decided_at y decided_by; una vencida (más de 30 días), una ACTIVE o una inexistente no afectan ninguna fila', async () => {
    engine = await seed();
    expect(await run(engine, (r) => r.registrations.decide(ids.a, 'ACTIVE', ADMIN_A, NOW, CUTOFF))).toBe(true);
    expect(await run(engine, (r) => r.registrations.decide(ids.b, 'REJECTED', ADMIN_A, NOW, CUTOFF))).toBe(true);
    expect(await run(engine, (r) => r.registrations.decide(ids.old, 'ACTIVE', ADMIN_A, NOW, CUTOFF))).toBe(false);
    expect(await run(engine, (r) => r.registrations.decide(ids.active, 'REJECTED', ADMIN_A, NOW, CUTOFF))).toBe(false);
    expect(await run(engine, (r) => r.registrations.decide(idOf(99), 'ACTIVE', ADMIN_A, NOW, CUTOFF))).toBe(false);
    expect(await stateOf(engine, ids.a)).toBe('ACTIVE');
    expect(await stateOf(engine, ids.b)).toBe('REJECTED');
    expect(await stateOf(engine, ids.old)).toBe('PENDING');
    expect(await stateOf(engine, ids.active)).toBe('ACTIVE');
    if (name !== 'memoria') {
      const q = name === 'PostgreSQL' ? '$1' : '?';
      const row = (await engine.rawQuery(`SELECT decided_at, decided_by FROM users WHERE id = ${q}`, [ids.b]))![0]!;
      expect({ at: row['decided_at'], by: row['decided_by'] }).toEqual({ at: NOW, by: ADMIN_A });
    }
  });

  it('una decidida sale de la lista y del contador', async () => {
    engine = await seed();
    await run(engine, (r) => r.registrations.decide(ids.c, 'ACTIVE', ADMIN_A, NOW, CUTOFF));
    expect(await run(engine, (r) => r.registrations.countPending(CUTOFF))).toBe(3);
    expect((await run(engine, (r) => r.registrations.listPending(CUTOFF, 50, null))).map((x) => x.registrationId)).not.toContain(ids.c);
  });

  it('[EDGE-009-002] dos administradores a la vez sobre la misma solicitud: exactamente una transacción gana', async () => {
    engine = await seed();
    for (const target of [ids.a, ids.b, ids.c, ids.google]) {
      const results = await Promise.all([
        run(engine, (r) => r.registrations.decide(target, 'ACTIVE', ADMIN_A, NOW, CUTOFF)),
        run(engine, (r) => r.registrations.decide(target, 'REJECTED', ADMIN_B, NOW, CUTOFF)),
      ]);
      expect(results.filter(Boolean), `solicitud ${target}`).toHaveLength(1);
    }
  });
});
