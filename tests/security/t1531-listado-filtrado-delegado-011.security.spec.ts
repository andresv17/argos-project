import { afterEach, describe, expect, it } from 'vitest';
import { bootEnv, DELEGATE_ROOT_EMAIL, listDelegates, loginRoot, onboard, type Backend, type Env } from '../fixtures/admin-delegates-011.ts';

/**
 * T1531 (011, D-4 aprobada por Neo): el listado `GET /api/admin/administrators` filtra en servidor. Un SUPER_ADMIN delegado recibe solo filas OPERATOR y SUPPORT:
 * nunca el correo de otro SUPER_ADMIN delegado ni el de la raíz (`ARGOS_ADMIN_EMAILS`). La raíz ve todo. Defensa en profundidad.
 *
 * @implements REQ-ADM11-003, NFR-011-002
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const EMAILS = { sa1: 'super.uno@example.test', sa2: 'super.dos@example.test', op: 'operador@example.test', sup: 'soporte@example.test' };

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1531 listado filtrado para SUPER_ADMIN delegado (${backend})`, { timeout: 60_000 }, () => {
    it('[D-4][REQ-ADM11-003] el delegado solo ve OPERATOR y SUPPORT; la raíz ve todo', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const sa1 = await onboard(env, root, EMAILS.sa1, 'SUPER_ADMIN');
      await onboard(env, root, EMAILS.sa2, 'SUPER_ADMIN');
      await onboard(env, root, EMAILS.op, 'OPERATOR');
      await onboard(env, root, EMAILS.sup, 'SUPPORT');

      const delegated = await listDelegates(env, sa1.cookie);
      expect(delegated.status).toBe(200);
      const seen = delegated.items.map((d) => d.email).sort();
      expect(seen).toEqual([EMAILS.op, EMAILS.sup].sort());
      expect(delegated.items.every((d) => d.role === 'OPERATOR' || d.role === 'SUPPORT')).toBe(true);
      expect(JSON.stringify(delegated)).not.toContain(EMAILS.sa2);
      expect(JSON.stringify(delegated)).not.toContain(EMAILS.sa1);
      expect(JSON.stringify(delegated)).not.toContain(DELEGATE_ROOT_EMAIL);

      const all = await listDelegates(env, root);
      expect(all.status).toBe(200);
      expect(all.items.map((d) => d.email).sort()).toEqual([EMAILS.sa1, EMAILS.sa2, EMAILS.op, EMAILS.sup].sort());
    });
  });
}
