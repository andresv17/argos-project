import { afterEach, describe, expect, it } from 'vitest';
import { EXISTING_USER_EMAIL, bootEnv, delegateOf, emailOf, invite, listDelegates, loginRoot, observable, type Backend, type Env, type Resp } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): H-4 y `INV-ADM9-002`: el alta de delegados responde de forma UNIFORME (mismo código HTTP, cuerpo, cabeceras y tiempo similar)
 * para correo nuevo, duplicado, correo raíz y correo de un usuario existente, sin consultar `users` ni devolver `adminId`. El único rechazo diferenciable es el tope (409), independiente del correo
 * (cubierto en `t1525-tope-delegados-011.spec.ts`). Memoria y SQLite.
 *
 * @implements REQ-ADM11-001, INV-ADM9-002, INV-ADM11-001, EDGE-011-001
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const median = (values: number[]): number => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)]!;
const SAMPLES = 7;

async function timed(run: (n: number) => Promise<Resp>): Promise<{ ms: number; responses: Resp[] }> {
  const times: number[] = [];
  const responses: Resp[] = [];
  for (let n = 0; n < SAMPLES; n += 1) {
    const start = performance.now();
    responses.push(await run(n));
    times.push(performance.now() - start);
  }
  return { ms: median(times), responses };
}

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 anti-enumeración del alta de delegados (${backend})`, { timeout: 60_000 }, () => {
    it('[H-4][INV-ADM9-002] alta nueva, duplicado, correo raíz y correo de usuario existente: la MISMA respuesta (estado, cuerpo y cabeceras), sin adminId', async () => {
      env = await bootEnv(backend, { withExistingUser: true });
      const root = await loginRoot(env);
      const fresh = await invite(env, root, emailOf(1), 'SUPPORT');
      const duplicate = await invite(env, root, emailOf(1), 'SUPPORT');
      const duplicateUpper = await invite(env, root, emailOf(1).toUpperCase(), 'OPERATOR');
      const rootEmail = await invite(env, root, 'admin.uno@example.test', 'SUPPORT');
      const existingUser = await invite(env, root, EXISTING_USER_EMAIL, 'SUPPORT');
      const reference = observable(fresh);
      expect(reference.status).toBe(202);
      expect(fresh.json).toEqual({ accepted: true });
      for (const r of [duplicate, duplicateUpper, rootEmail, existingUser]) expect(observable(r)).toEqual(reference);
      expect(fresh.text).not.toMatch(/adminId|admin_id|[0-9a-f]{8}-[0-9a-f]{4}-/);
    });

    it('[H-4][INV-ADM9-002] la respuesta del alta no consulta la tabla users: ninguno de los cuatro casos toca el repositorio de usuarios', async () => {
      env = await bootEnv(backend, { withExistingUser: true });
      const root = await loginRoot(env);
      await invite(env, root, emailOf(1), 'SUPPORT');
      for (const email of [emailOf(2), emailOf(1), 'admin.uno@example.test', EXISTING_USER_EMAIL]) {
        env.resetUsersReads();
        const r = await invite(env, root, email, 'SUPPORT');
        expect([email, r.status, env.usersReads()]).toEqual([email, 202, 0]);
      }
    });

    it('[H-4][INV-ADM9-002] el tiempo de respuesta es similar entre alta nueva, duplicado, raíz y usuario existente (medianas dentro de un factor 4 o 25 ms)', async () => {
      env = await bootEnv(backend, { withExistingUser: true });
      const root = await loginRoot(env);
      const current = env;
      await invite(current, root, emailOf(40), 'SUPPORT');
      const fresh = await timed((n) => invite(current, root, emailOf(100 + n), 'SUPPORT'));
      const duplicate = await timed(() => invite(current, root, emailOf(40), 'SUPPORT'));
      const rootEmail = await timed(() => invite(current, root, 'admin.uno@example.test', 'SUPPORT'));
      const existing = await timed(() => invite(current, root, EXISTING_USER_EMAIL, 'SUPPORT'));
      for (const group of [fresh, duplicate, rootEmail, existing]) expect(group.responses.map((r) => r.status)).toEqual(Array(SAMPLES).fill(202));
      const times = [fresh.ms, duplicate.ms, rootEmail.ms, existing.ms];
      const slow = Math.max(...times);
      const fast = Math.min(...times);
      expect(slow <= fast * 4 || slow - fast <= 25).toBe(true);
    });

    it('[H-4][REQ-ADM11-001] el alta duplicada no cambia la fila existente ni crea otra, el correo raíz no crea fila y el de un usuario existente se trata como cualquier correo nuevo (una fila)', async () => {
      env = await bootEnv(backend, { withExistingUser: true });
      const root = await loginRoot(env);
      await invite(env, root, emailOf(1), 'SUPPORT');
      const before = await delegateOf(env, root, emailOf(1));
      await invite(env, root, emailOf(1), 'OPERATOR');
      await invite(env, root, 'admin.uno@example.test', 'SUPPORT');
      const user = await invite(env, root, EXISTING_USER_EMAIL, 'SUPPORT');
      expect(user.status).toBe(202);
      const page = await listDelegates(env, root);
      expect(page.items.map((d) => d.email).sort()).toEqual([EXISTING_USER_EMAIL, emailOf(1)].sort());
      expect(await delegateOf(env, root, emailOf(1))).toEqual(before);
    });
  });
}
