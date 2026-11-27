import { afterEach, describe, expect, it } from 'vitest';
import {
  bootEnv,
  changeRole,
  delegateOf,
  disable,
  invite,
  listDelegates,
  loginRoot,
  onboard,
  outcome,
  problemCode,
  reactivate,
  reinvite,
  type Backend,
  type Env,
  type Onboarded,
} from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): H-6 (D11-01 = A enmendada): solo la raíz (`ARGOS_ADMIN_EMAILS`) concede o revoca `SUPER_ADMIN`; un `SUPER_ADMIN` delegado gestiona
 * solo `OPERATOR` y `SUPPORT`, no toca a otro `SUPER_ADMIN` ni a la lista raíz; ningún rol se autopromueve ni se autoafecta; `OPERATOR` y `SUPPORT` no gestionan delegados. La regla se aplica por actor y
 * rol destino/objetivo, nunca por correo. Orden de comprobación del anexo: rol -> esquema -> existencia -> autoafectación -> concesión -> raíz protegida -> estado.
 *
 * @implements REQ-ADM11-005, REQ-ADM11-003, REQ-ADM11-002, EDGE-011-001, EDGE-011-003, EDGE-011-019
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

interface Team {
  readonly root: string;
  readonly sa1: Onboarded;
  readonly sa2: Onboarded;
  readonly op: Onboarded;
  readonly sup: Onboarded;
}
const EMAILS = { sa1: 'super.uno@example.test', sa2: 'super.dos@example.test', op: 'operador@example.test', sup: 'soporte@example.test' };

async function team(e: Env): Promise<Team> {
  const root = await loginRoot(e);
  const sa1 = await onboard(e, root, EMAILS.sa1, 'SUPER_ADMIN');
  const sa2 = await onboard(e, root, EMAILS.sa2, 'SUPER_ADMIN');
  const op = await onboard(e, root, EMAILS.op, 'OPERATOR');
  const sup = await onboard(e, root, EMAILS.sup, 'SUPPORT');
  for (const member of [sa1, sa2, op, sup]) expect([member.email, member.cookie !== null, member.adminId !== null]).toEqual([member.email, true, true]);
  return { root, sa1, sa2, op, sup };
}
const etagOf = async (e: Env, cookie: string | null, email: string): Promise<string> => (await delegateOf(e, cookie, email))!.etag;

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 concesión y límites de roles de plataforma (${backend})`, { timeout: 60_000 }, () => {
    it('[H-6][REQ-ADM11-005] la raíz concede SUPER_ADMIN en el alta y como cambio de rol', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      expect(await delegateOf(env, t.root, EMAILS.sa1)).toMatchObject({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
      const r = await changeRole(env, t.root, t.op.adminId!, await etagOf(env, t.root, EMAILS.op), 'SUPER_ADMIN');
      expect([r.status, (r.json as { role: string }).role]).toEqual([200, 'SUPER_ADMIN']);
    });

    it('[H-6][REQ-ADM11-005] un SUPER_ADMIN delegado NO puede dar de alta a un SUPER_ADMIN (403 ERR-ADM11-GRANT-FORBIDDEN, sin fila) pero sí a OPERATOR y SUPPORT', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const denied = await invite(env, t.sa1.cookie, 'nuevo.super@example.test', 'SUPER_ADMIN');
      expect([denied.status, problemCode(denied)]).toEqual([403, 'ERR-ADM11-GRANT-FORBIDDEN']);
      expect(await delegateOf(env, t.root, 'nuevo.super@example.test')).toBeUndefined();
      expect((await invite(env, t.sa1.cookie, 'nuevo.operador@example.test', 'OPERATOR')).status).toBe(202);
      expect((await invite(env, t.sa1.cookie, 'nuevo.soporte@example.test', 'SUPPORT')).status).toBe(202);
    });

    it('[H-6][REQ-ADM11-005] un SUPER_ADMIN delegado alterna OPERATOR <-> SUPPORT pero NO concede SUPER_ADMIN a nadie: el rol no cambia', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const ok = await changeRole(env, t.sa1.cookie, t.op.adminId!, await etagOf(env, t.sa1.cookie, EMAILS.op), 'SUPPORT');
      expect([ok.status, (ok.json as { role: string }).role]).toEqual([200, 'SUPPORT']);
      const denied = await changeRole(env, t.sa1.cookie, t.op.adminId!, await etagOf(env, t.sa1.cookie, EMAILS.op), 'SUPER_ADMIN');
      expect([denied.status, problemCode(denied)]).toEqual([403, 'ERR-ADM11-GRANT-FORBIDDEN']);
      expect((await delegateOf(env, t.root, EMAILS.op))!.role).toBe('SUPPORT');
    });

    it('[H-6][SC-011-025] un SUPER_ADMIN delegado no puede cambiar el rol, desactivar, re-invitar ni reactivar a otro SUPER_ADMIN: todo 403 ERR-ADM11-GRANT-FORBIDDEN y sa2 sigue ACTIVE SUPER_ADMIN', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const target = t.sa2.adminId!;
      const etag = () => etagOf(env!, t.root, EMAILS.sa2);
      const results = [
        await changeRole(env, t.sa1.cookie, target, await etag(), 'OPERATOR'),
        await disable(env, t.sa1.cookie, target, await etag()),
        await reinvite(env, t.sa1.cookie, target, await etag()),
        await reactivate(env, t.sa1.cookie, target, await etag(), 'OPERATOR'),
      ];
      expect(results.map(outcome)).toEqual(Array(4).fill('ERR-ADM11-GRANT-FORBIDDEN'));
      expect(await delegateOf(env, t.root, EMAILS.sa2)).toMatchObject({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
      expect((await env.call('GET', '/api/admin/me', { cookie: t.sa2.cookie })).status).toBe(200);
    });

    it('[H-6][REQ-ADM11-005] la raíz sí puede degradar y desactivar a un SUPER_ADMIN delegado', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const down = await changeRole(env, t.root, t.sa2.adminId!, await etagOf(env, t.root, EMAILS.sa2), 'OPERATOR');
      expect([down.status, (down.json as { role: string }).role]).toEqual([200, 'OPERATOR']);
      const off = await disable(env, t.root, t.sa1.adminId!, await etagOf(env, t.root, EMAILS.sa1));
      expect([off.status, (off.json as { status: string }).status]).toEqual([200, 'DISABLED']);
    });

    it('[H-6][REQ-ADM11-005] sin autoafectación: un SUPER_ADMIN delegado no cambia su propio rol ni se desactiva ni se re-invita (403 ERR-ADM11-SELF-MODIFICATION-FORBIDDEN, antes de la regla de concesión)', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const me = t.sa1.adminId!;
      const etag = () => etagOf(env!, t.root, EMAILS.sa1);
      const results = [await changeRole(env, t.sa1.cookie, me, await etag(), 'OPERATOR'), await disable(env, t.sa1.cookie, me, await etag()), await reinvite(env, t.sa1.cookie, me, await etag())];
      expect(results.map(outcome)).toEqual(Array(3).fill('ERR-ADM11-SELF-MODIFICATION-FORBIDDEN'));
      expect(await delegateOf(env, t.root, EMAILS.sa1)).toMatchObject({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
    });

    it('[H-6][REQ-ADM11-003] sin autopromoción: OPERATOR y SUPPORT no pueden gestionar delegados (403 ERR-ADM11-ROLE-NOT-AUTHORIZED aunque el cuerpo sea inválido: no se lee) y su rol no cambia', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      for (const [member, email] of [[t.op, EMAILS.op], [t.sup, EMAILS.sup]] as const) {
        const etag = await etagOf(env, t.root, email);
        const promote = await changeRole(env, member.cookie, member.adminId!, etag, 'SUPER_ADMIN');
        expect([email, promote.status, problemCode(promote)]).toEqual([email, 403, 'ERR-ADM11-ROLE-NOT-AUTHORIZED']);
        const unreadBody = await env.call('PUT', `/api/admin/administrators/${member.adminId}/role`, { cookie: member.cookie, raw: '{no es json', headers: { 'if-match': etag } });
        expect([email, unreadBody.status, problemCode(unreadBody)]).toEqual([email, 403, 'ERR-ADM11-ROLE-NOT-AUTHORIZED']);
        expect((await invite(env, member.cookie, 'otro@example.test', 'SUPPORT')).status).toBe(403);
        expect((await env.call('GET', '/api/admin/administrators', { cookie: member.cookie })).status).toBe(403);
      }
      expect((await listDelegates(env, t.root)).items.map((d) => `${d.email}:${d.role}`).sort()).toEqual([`${EMAILS.op}:OPERATOR`, `${EMAILS.sa1}:SUPER_ADMIN`, `${EMAILS.sa2}:SUPER_ADMIN`, `${EMAILS.sup}:SUPPORT`].sort());
    });

    it('[REQ-ADM11-005][EDGE-011-001] el administrador raíz no tiene fila: apuntar a su admin_id da 404 ERR-ADM11-DELEGATE-NOT-FOUND y su acceso no cambia', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      const rootId = ((await env.call('GET', '/api/admin/session', { cookie: t.root })).json as { adminId: string }).adminId;
      const r = await changeRole(env, t.sa1.cookie, rootId, '"abcdefgh12"', 'OPERATOR');
      expect([r.status, problemCode(r)]).toEqual([404, 'ERR-ADM11-DELEGATE-NOT-FOUND']);
      const own = await changeRole(env, t.root, rootId, '"abcdefgh12"', 'OPERATOR');
      expect([own.status, problemCode(own)]).toEqual([404, 'ERR-ADM11-DELEGATE-NOT-FOUND']);
      expect((await env.call('GET', '/api/admin/me', { cookie: t.root })).json).toEqual({ adminId: rootId, role: 'SUPER_ADMIN', isRoot: true });
    });

    it('[EDGE-011-003][REQ-ADM11-005] un delegado cuyo correo pasa a la lista raíz es raíz efectivo: la raíz no puede degradarlo ni desactivarlo (409 ERR-ADM11-ROOT-PROTECTED) y un SUPER_ADMIN delegado tampoco', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      env.kit.emails.push(EMAILS.op); // la lista de configuración manda: el operador pasa a ser raíz en la petición siguiente
      const me = await env.call('GET', '/api/admin/me', { cookie: t.op.cookie });
      expect(me.json).toEqual({ adminId: t.op.adminId, role: 'SUPER_ADMIN', isRoot: true });
      const etag = await etagOf(env, t.root, EMAILS.op);
      const byRoot = [await changeRole(env, t.root, t.op.adminId!, etag, 'SUPPORT'), await disable(env, t.root, t.op.adminId!, etag)];
      expect(byRoot.map(outcome)).toEqual(['ERR-ADM11-ROOT-PROTECTED', 'ERR-ADM11-ROOT-PROTECTED']);
      const byDelegate = [await changeRole(env, t.sa1.cookie, t.op.adminId!, etag, 'SUPPORT'), await disable(env, t.sa1.cookie, t.op.adminId!, etag)];
      for (const r of byDelegate) expect(['ERR-ADM11-GRANT-FORBIDDEN', 'ERR-ADM11-ROOT-PROTECTED']).toContain(problemCode(r));
      expect(await delegateOf(env, t.root, EMAILS.op)).toMatchObject({ role: 'OPERATOR', status: 'ACTIVE' });
    });

    it('[EDGE-011-003][REQ-ADM11-003] quitar un correo de la lista raíz lo degrada a su rol de delegado en esa misma petición; el rol efectivo sale de la lista y de la tabla, no de la sesión', async () => {
      env = await bootEnv(backend);
      const t = await team(env);
      env.kit.emails.push(EMAILS.sup);
      expect(((await env.call('GET', '/api/admin/me', { cookie: t.sup.cookie })).json as { role: string }).role).toBe('SUPER_ADMIN');
      env.kit.emails.pop();
      expect((await env.call('GET', '/api/admin/me', { cookie: t.sup.cookie })).json).toEqual({ adminId: t.sup.adminId, role: 'SUPPORT', isRoot: false });
    });
  });
}
