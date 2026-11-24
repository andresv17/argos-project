import { afterEach, describe, expect, it } from 'vitest';
import { runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { HARNESS_ADMIN_ID } from '../../fixtures/active-accounts.ts';
import { HAS_POSTGRES, account, idOf, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

/**
 * T1245 (pruebas rojas, Feature 009, Fase 4, #18): purga de cuentas en el mantenimiento programado existente. REQ-APR9-007, EDGE-009-004, EDGE-009-007, NFR-009-004; SC-009-049.
 * `PENDING` se purga a los 30 días de su creación (`users.created_at`); `REJECTED` a los 30 días de la decisión (`users.decided_at`, no de la creación); `ACTIVE` nunca. Al purgarse se libera el
 * `username` y el `sub` de Google (la cascada elimina `auth_identities`) y no queda correo. Los conteos de `MaintenanceCounts` los define T1248; aquí solo se afirma el efecto en las filas.
 * El reloj fijo es 2026-11-05T12:00:00.000Z, de modo que el umbral es 2026-10-06T12:00:00.000Z. Corre sobre SQLite y, con TEST_DATABASE_URL, sobre PostgreSQL 17.
 */
const NOW = '2026-11-05T12:00:00.000Z';
const OLD = '2026-10-06T11:59:59.999Z'; // 30 días y 1 ms antes: vencida
const EDGE = '2026-10-06T12:00:00.000Z'; // exactamente 30 días: aún vigente (se purga solo lo MÁS antiguo que el umbral)
const RECENT = '2026-10-20T12:00:00.000Z';
const LONG_AGO = '2026-01-01T00:00:00.000Z';
const ENGINES: EngineName[] = HAS_POSTGRES ? ['SQLite', 'PostgreSQL'] : ['SQLite'];

describe.each(ENGINES)('T1245 [EDGE-009-007] [SC-009-049] purga a 30 días de cuentas PENDING y REJECTED sobre %s', (name) => {
  let engine: IdentityEngine | null = null;
  afterEach(async () => {
    await engine?.dispose();
    engine = null;
  });
  const p = (n: number) => (name === 'SQLite' ? '?' : `$${n}`);
  const ids = { pendingOld: idOf(1), pendingEdge: idOf(2), pendingRecent: idOf(3), rejectedOld: idOf(4), rejectedRecentDecision: idOf(5), activeOld: idOf(6), rejectedEdge: idOf(7) };

  async function seed(): Promise<IdentityEngine> {
    // La fecha de creación vive en `users.data.createdAt` (no hay columna `created_at`); se siembra por el estado, igual en ambos motores.
    const made = (id: string, username: string, createdAt: string, email: string | null = null) => ({ ...account(id, username, 'Clave2026x!', email), createdAt });
    const e = await openEngine(
      name,
      stateWith([
        made(ids.pendingOld, 'pendiente.vencida', OLD, 'pendiente.vencida@example.test'),
        made(ids.pendingEdge, 'pendiente.borde', EDGE),
        made(ids.pendingRecent, 'pendiente.reciente', RECENT),
        made(ids.rejectedOld, 'rechazada.vencida', LONG_AGO, 'rechazada.vencida@example.test'),
        made(ids.rejectedRecentDecision, 'rechazada.reciente', LONG_AGO),
        made(ids.activeOld, 'activa.antigua', LONG_AGO),
        made(ids.rejectedEdge, 'rechazada.borde', LONG_AGO),
      ]),
    );
    const q = (sql: string, values: unknown[]) => e.rawQuery(sql, values);
    const setPending = (id: string) => q(`UPDATE users SET account_status = 'PENDING', decided_at = NULL, decided_by = NULL WHERE id = ${p(1)}`, [id]);
    const setRejected = (id: string, decidedAt: string) => q(`UPDATE users SET account_status = 'REJECTED', decided_at = ${p(1)}, decided_by = ${p(2)} WHERE id = ${p(3)}`, [decidedAt, HARNESS_ADMIN_ID, id]);
    await setPending(ids.pendingOld);
    await setPending(ids.pendingEdge);
    await setPending(ids.pendingRecent);
    await setRejected(ids.rejectedOld, OLD); // creada hace meses y decidida hace más de 30 días
    await setRejected(ids.rejectedRecentDecision, RECENT); // creada hace meses pero decidida hace 16 días: la base es la DECISIÓN
    await setRejected(ids.rejectedEdge, EDGE);
    for (const [id, sub] of [
      [ids.pendingOld, 'sub-pendiente-vencida'],
      [ids.rejectedOld, 'sub-rechazada-vencida'],
      [ids.rejectedRecentDecision, 'sub-rechazada-reciente'],
    ] as const) {
      await q(`INSERT INTO auth_identities (provider, provider_subject, user_id, created_at) VALUES ('GOOGLE', ${p(1)}, ${p(2)}, ${p(3)})`, [sub, id, LONG_AGO]);
    }
    e.clock.setClock('2026-11-05', NOW);
    return e;
  }
  const usernames = async (e: IdentityEngine) => (await e.rawQuery("SELECT username FROM users WHERE id LIKE 'c0000000%' ORDER BY username", []))!.map((r) => r['username']);

  it('purga PENDING con más de 30 días desde la creación y REJECTED con más de 30 días desde la decisión; conserva el resto (incluido el límite exacto y ACTIVE)', async () => {
    engine = await seed();
    await runMaintenance({ uow: engine.uow, clock: engine.clock });
    expect(await usernames(engine)).toEqual(['activa.antigua', 'pendiente.borde', 'pendiente.reciente', 'rechazada.borde', 'rechazada.reciente']);
  });

  it('al purgar se libera el sub de Google (la identidad cae con la cuenta) y no queda correo del solicitante; el sub de la rechazada vigente sigue ocupado [EDGE-009-004]', async () => {
    engine = await seed();
    await runMaintenance({ uow: engine.uow, clock: engine.clock });
    const subs = (await engine.rawQuery('SELECT provider_subject FROM auth_identities ORDER BY provider_subject', []))!.map((r) => r['provider_subject']);
    expect(subs).toEqual(['sub-rechazada-reciente']);
    const mails = (await engine.rawQuery("SELECT COUNT(*) AS n FROM users WHERE email IN ('pendiente.vencida@example.test', 'rechazada.vencida@example.test')", []))![0]!['n'];
    expect(Number(mails)).toBe(0);
    expect(await engine.read((r) => r.users.findByUsername('pendiente.vencida'))).toBeNull();
    expect(await engine.read((r) => r.users.findByUsername('rechazada.reciente'))).toMatchObject({ username: 'rechazada.reciente' });
  });

  it('una segunda pasada no encuentra nada más que purgar (idempotente)', async () => {
    engine = await seed();
    await runMaintenance({ uow: engine.uow, clock: engine.clock });
    const after = await usernames(engine);
    await runMaintenance({ uow: engine.uow, clock: engine.clock });
    expect(await usernames(engine)).toEqual(after);
    expect(after).not.toContain('pendiente.vencida');
  });
});
