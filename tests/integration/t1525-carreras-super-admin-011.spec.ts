import { afterEach, describe, expect, it } from 'vitest';
import { HAS_POSTGRES, PAIR_FACTORIES, POSTGRES_PENDING, type Pair } from '../fixtures/admin-delegates-pairs-011.ts';
import { changeRole, delegateOf, disable, listDelegates, loginAs, loginRoot, onboard, outcome, retryBusy, ROOT_IDENTITY, problemCode } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): carreras del último super-administrador y de la doble escritura sobre el mismo delegado (H-2a, H-5).
 * Memoria y SQLite en proceso, SQLite con DOS conexiones al mismo archivo (candados reales de `BEGIN IMMEDIATE`) y PostgreSQL 17 real si hay `TEST_DATABASE_URL`.
 * Sin `TEST_DATABASE_URL` la parte de PostgreSQL queda PENDIENTE DE ARNÉS y así consta en la última prueba de este archivo (`POSTGRES_PENDING`).
 *
 * Nota de alcance: con H-6 un `SUPER_ADMIN` delegado no toca a otro `SUPER_ADMIN`; por eso las dos degradaciones simultáneas entre delegados dejan GRANT-FORBIDDEN o un único
 * éxito, y la guarda serializada del último `SUPER_ADMIN` es defensa en profundidad del servicio de dominio único (H-2a). La prueba exige el INVARIANTE (nunca cero, nunca dos éxitos).
 *
 * @implements REQ-ADM11-005, REQ-ADM11-004, STATE-ADM11-001, EDGE-011-002, EDGE-011-011
 */
let pair: Pair | null = null;
afterEach(async () => {
  await pair?.dispose();
  pair = null;
});

const SUPER_1 = 'super.uno@example.test';
const SUPER_2 = 'super.dos@example.test';
const OPERATOR_X = 'operador.x@example.test';

for (const factory of PAIR_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1525 carreras del último SUPER_ADMIN y de la doble escritura (${factory.name})`, { timeout: 60_000 }, () => {
    it('[EDGE-011-002][REQ-ADM11-005] dos SUPER_ADMIN delegados se degradan a la vez con la lista raíz vacía: nunca dos éxitos y siempre queda al menos un SUPER_ADMIN efectivo', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root = await loginRoot(a);
      const d1 = await onboard(a, root, SUPER_1, 'SUPER_ADMIN');
      const d2 = await onboard(a, root, SUPER_2, 'SUPER_ADMIN');
      expect([d1.cookie !== null, d2.cookie !== null, d1.adminId !== null, d2.adminId !== null]).toEqual([true, true, true, true]);
      // D-4: el listado del delegado ya no incluye a otros SUPER_ADMIN; los etags se leen con la raíz antes de vaciar la lista.
      const rootItems = (await listDelegates(a, root)).items;
      const view1 = rootItems.find((d) => d.email === SUPER_1)!;
      const view2 = rootItems.find((d) => d.email === SUPER_2)!;
      a.kit.emails.length = 0; // dev/test permiten la lista vacía (F-03); ya no hay raíz
      const results = await Promise.all([retryBusy(() => changeRole(a, d1.cookie, d2.adminId!, view2.etag, 'OPERATOR')), retryBusy(() => changeRole(b, d2.cookie, d1.adminId!, view1.etag, 'OPERATOR'))]);
      expect(results.map(outcome).every((o) => ['OK200', 'ERR-ADM11-GRANT-FORBIDDEN', 'ERR-ADM11-LAST-SUPER-ADMIN'].includes(o))).toBe(true);
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
      const survivors = [d1, d2].filter((d) => d.cookie !== null);
      const roles: string[] = [];
      for (const d of survivors) {
        const me = await a.call('GET', '/api/admin/me', { cookie: d.cookie });
        if (me.status === 200) roles.push((me.json as { role: string }).role);
      }
      expect(roles).toContain('SUPER_ADMIN');
    });

    it('[EDGE-011-002][REQ-ADM11-005] dos SUPER_ADMIN delegados se desactivan a la vez con la lista raíz vacía: nunca dos éxitos y queda al menos un SUPER_ADMIN ACTIVE', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root = await loginRoot(a);
      const d1 = await onboard(a, root, SUPER_1, 'SUPER_ADMIN');
      const d2 = await onboard(a, root, SUPER_2, 'SUPER_ADMIN');
      expect([d1.adminId !== null, d2.adminId !== null]).toEqual([true, true]);
      const items = (await listDelegates(a, root)).items; // D-4: etags leídos con la raíz antes de vaciar la lista
      a.kit.emails.length = 0;
      const e1 = items.find((d) => d.email === SUPER_1)!.etag;
      const e2 = items.find((d) => d.email === SUPER_2)!.etag;
      const results = await Promise.all([retryBusy(() => disable(a, d1.cookie, d2.adminId!, e2)), retryBusy(() => disable(b, d2.cookie, d1.adminId!, e1))]);
      expect(results.map(outcome).every((o) => ['OK200', 'ERR-ADM11-GRANT-FORBIDDEN', 'ERR-ADM11-LAST-SUPER-ADMIN', 'HTTP404'].includes(o))).toBe(true);
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
      let active = 0;
      for (const d of [d1, d2]) if ((await a.call('GET', '/api/admin/me', { cookie: d.cookie })).status === 200) active += 1;
      expect(active).toBeGreaterThanOrEqual(1);
    });

    it('[EDGE-011-011][REQ-ADM11-005] con la lista raíz no vacía, la raíz degrada a uno y desactiva a otro SUPER_ADMIN delegado a la vez (dos sesiones raíz): ambas prosperan y la raíz sigue siendo SUPER_ADMIN', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      const d1 = await onboard(a, root1, SUPER_1, 'SUPER_ADMIN');
      const d2 = await onboard(a, root1, SUPER_2, 'SUPER_ADMIN');
      expect([d1.adminId !== null, d2.adminId !== null]).toEqual([true, true]);
      const items = (await listDelegates(a, root1)).items;
      const e1 = items.find((d) => d.email === SUPER_1)!.etag;
      const e2 = items.find((d) => d.email === SUPER_2)!.etag;
      const results = await Promise.all([retryBusy(() => changeRole(a, root1, d1.adminId!, e1, 'OPERATOR')), retryBusy(() => disable(b, root2, d2.adminId!, e2))]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const me = await a.call('GET', '/api/admin/me', { cookie: root1 });
      expect(me.json).toEqual({ adminId: expect.any(String), role: 'SUPER_ADMIN', isRoot: true });
    });

    it('[REQ-ADM11-005][STATE-ADM11-001] dos desactivaciones simultáneas del mismo delegado (mismo If-Match): exactamente una prospera y la otra es INVALID-TRANSITION o PRECONDITION-FAILED', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      const x = await onboard(a, root1, OPERATOR_X, 'OPERATOR');
      expect(x.adminId).toMatch(/^[0-9a-f-]{36}$/);
      const etag = (await delegateOf(a, root1, OPERATOR_X))!.etag;
      const results = await Promise.all([retryBusy(() => disable(a, root1, x.adminId!, etag)), retryBusy(() => disable(b, root2, x.adminId!, etag))]);
      const codes = results.map(outcome).sort();
      expect(codes.filter((c) => c === 'OK200')).toHaveLength(1);
      expect(codes.filter((c) => ['ERR-ADM11-INVALID-TRANSITION', 'ERR-ADM11-PRECONDITION-FAILED'].includes(c))).toHaveLength(1);
      expect((await delegateOf(a, root1, OPERATOR_X))!.status).toBe('DISABLED');
      expect((await a.call('GET', '/api/admin/session', { cookie: x.cookie })).status).toBe(404);
    });

    it('[REQ-ADM11-005][STATE-ADM11-001] dos cambios de rol simultáneos sobre el mismo delegado con el mismo If-Match: uno prospera y el otro es PRECONDITION-FAILED (412); el rol final es uno solo', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      const x = await onboard(a, root1, OPERATOR_X, 'OPERATOR');
      expect(x.adminId).toMatch(/^[0-9a-f-]{36}$/);
      const etag = (await delegateOf(a, root1, OPERATOR_X))!.etag;
      const results = await Promise.all([retryBusy(() => changeRole(a, root1, x.adminId!, etag, 'SUPPORT')), retryBusy(() => changeRole(b, root2, x.adminId!, etag, 'SUPER_ADMIN'))]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
      expect(results.filter((r) => r.status === 412).map(problemCode)).toEqual(['ERR-ADM11-PRECONDITION-FAILED']);
      expect(['SUPPORT', 'SUPER_ADMIN']).toContain((await delegateOf(a, root1, OPERATOR_X))!.role);
    });

    it('[EDGE-011-011][REQ-ADM11-004] la lista raíz vacía en una petición posterior deja sin acceso a la raíz sin alterar la tabla: el último SUPER_ADMIN delegado conserva el acceso', async () => {
      pair = await factory.make();
      const { a } = pair;
      const root = await loginRoot(a);
      const d1 = await onboard(a, root, SUPER_1, 'SUPER_ADMIN');
      expect(d1.cookie).toMatch(/^argos_admin_session=/);
      a.kit.emails.length = 0;
      expect((await a.call('GET', '/api/admin/me', { cookie: root })).status).toBe(404);
      const me = await a.call('GET', '/api/admin/me', { cookie: d1.cookie });
      expect(me.json).toEqual({ adminId: d1.adminId, role: 'SUPER_ADMIN', isRoot: false });
      const again = await loginAs(a, ROOT_IDENTITY);
      expect(again.cookie).toBeNull();
    });
  });
}

describe('T1525 PostgreSQL real de las carreras (H-2a, H-5, EDGE-011-010)', () => {
  it('[EDGE-011-010][EDGE-011-011] la parte PostgreSQL queda pendiente de arnés cuando falta TEST_DATABASE_URL y así consta (con la variable, la fábrica PostgreSQL de este archivo corre las mismas pruebas)', () => {
    expect(HAS_POSTGRES ? 'real' : POSTGRES_PENDING).toBe(HAS_POSTGRES ? 'real' : 'T1525: la parte PostgreSQL real de H-2a/H-5/EDGE-011-010 (SELECT ... FOR UPDATE) queda pendiente de arnés: requiere TEST_DATABASE_URL; esta máquina no lo tiene');
  });
});
