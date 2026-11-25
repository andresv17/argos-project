import { afterEach, describe, expect, it } from 'vitest';
import * as appConfig from '../../src/infrastructure/config/app-config.ts';
import { PAIR_FACTORIES, type Pair } from '../fixtures/admin-delegates-pairs-011.ts';
import {
  TTL_72H_MS,
  bootEnv,
  delegateOf,
  disable,
  emailOf,
  fillSlots,
  invite,
  listDelegates,
  loginAs,
  loginRoot,
  onboard,
  outcome,
  problemCode,
  reactivate,
  reinvite,
  retryBusy,
  subOf,
  type Env,
} from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): tope de delegados vigentes (`ACTIVE` + `INVITED` no caducadas = 20, D11-03 = B+A) y tope de filas (100), en alta, reactivación,
 * re-invitación y anclaje, también bajo concurrencia (EDGE-011-009, EDGE-011-010; la memoria no serializa y no sirve de evidencia de carrera: la evidencia son SQLite de dos conexiones y PostgreSQL real).
 * Las plazas se llenan con invitaciones vigentes de correos distintos (cuentan igual que `ACTIVE`, extensión derivada ORA-1a) y con algunos `ACTIVE` anclados de verdad.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-005, REQ-ADM11-006, STATE-ADM11-001, EDGE-011-009, EDGE-011-010, INV-ARCH-006
 */
/** Lectura por nombre: las constantes las añade T1527 y hoy no existen (la prueba falla por ausencia, no por tipos). */
const config = appConfig as Record<string, unknown>;
const ROW_LIMIT = 100;
let env: Env | null = null;
let pair: Pair | null = null;
afterEach(async () => {
  await env?.close();
  await pair?.dispose();
  env = null;
  pair = null;
});

describe('T1525 [INV-ARCH-006] constantes únicas en app-config.ts', () => {
  it('[INV-ARCH-006][REQ-ADM11-001] ADMIN_DELEGATE_ACTIVE_LIMIT = 20, ADMIN_DELEGATE_INVITATION_TTL_HOURS = 72 y ADMIN_DELEGATE_ROW_LIMIT = 100 viven en app-config.ts', () => {
    expect([config['ADMIN_DELEGATE_ACTIVE_LIMIT'], config['ADMIN_DELEGATE_INVITATION_TTL_HOURS'], config['ADMIN_DELEGATE_ROW_LIMIT']]).toEqual([20, 72, 100]);
  });
});

for (const backend of ['memory', 'sqlite'] as const) {
  describe(`T1525 tope de 20 delegados vigentes y de 100 filas (${backend})`, { timeout: 120_000 }, () => {
    it('[D11-03][REQ-ADM11-001] el 21.º delegado vigente se rechaza con 409 ERR-ADM11-DELEGATE-LIMIT-REACHED y no crea fila; el conteo informado es 20 de 20', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await fillSlots(env, root, 20);
      const page = await listDelegates(env, root);
      expect([page.status, page.items.length, page.activeCount, page.activeLimit]).toEqual([200, 20, 20, 20]);
      const over = await invite(env, root, emailOf(21), 'SUPPORT');
      expect([over.status, problemCode(over)]).toEqual([409, 'ERR-ADM11-DELEGATE-LIMIT-REACHED']);
      expect(await delegateOf(env, root, emailOf(21))).toBeUndefined();
    });

    it('[H-4][REQ-ADM11-001] el rechazo por tope no depende del correo: correo nuevo, ya invitado y correo raíz dan el mismo 409 (no revela si el correo existe)', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await fillSlots(env, root, 20);
      const codes: string[] = [];
      for (const email of [emailOf(99), emailOf(1), 'admin.uno@example.test']) {
        const r = await invite(env, root, email, 'SUPPORT');
        codes.push(`${r.status}:${problemCode(r)}`);
      }
      expect(codes).toEqual(Array(3).fill('409:ERR-ADM11-DELEGATE-LIMIT-REACHED'));
    });

    it('[EDGE-011-009][D11-03] con 20 delegados vigentes (algunos ACTIVE anclados) y 1 DISABLED anclado, reactivar el DISABLED se rechaza de forma determinista y no cambia nada', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const x = await onboard(env, root, emailOf(50), 'OPERATOR');
      const etagX = (await delegateOf(env, root, emailOf(50)))!.etag;
      expect((await disable(env, root, x.adminId!, etagX)).status).toBe(200);
      await onboard(env, root, emailOf(51), 'SUPPORT');
      await onboard(env, root, emailOf(52), 'SUPPORT');
      await fillSlots(env, root, 18);
      expect((await listDelegates(env, root)).activeCount).toBe(20);
      const fresh = (await delegateOf(env, root, emailOf(50)))!;
      const r = await reactivate(env, root, x.adminId!, fresh.etag, 'OPERATOR');
      expect([r.status, problemCode(r)]).toEqual([409, 'ERR-ADM11-DELEGATE-LIMIT-REACHED']);
      expect((await delegateOf(env, root, emailOf(50)))!.status).toBe('DISABLED');
    });

    it('[D11-03][STATE-ADM11-001] las INVITED caducadas no cuentan para el tope: con 20 invitaciones caducadas el alta siguiente prospera', async () => {
      env = await bootEnv(backend);
      const rootBefore = await loginRoot(env);
      await fillSlots(env, rootBefore, 20);
      env.at(TTL_72H_MS + 1000);
      const root = await loginRoot(env);
      const page = await listDelegates(env, root);
      expect(page.activeCount).toBe(0);
      expect((await invite(env, root, emailOf(77), 'SUPPORT')).status).toBe(202);
      expect(await delegateOf(env, root, emailOf(77))).toMatchObject({ status: 'INVITED', role: 'SUPPORT' });
    });

    it('[D11-03][H-5] la re-invitación ocupa plaza: con 20 vigentes y una caducada, re-invitar la caducada se rechaza con 409 ERR-ADM11-DELEGATE-LIMIT-REACHED', async () => {
      env = await bootEnv(backend);
      const rootBefore = await loginRoot(env);
      await invite(env, rootBefore, emailOf(60), 'SUPPORT');
      env.at(TTL_72H_MS + 1000);
      const root = await loginRoot(env);
      await fillSlots(env, root, 20);
      const stale = (await delegateOf(env, root, emailOf(60)))!;
      const r = await reinvite(env, root, stale.adminId, stale.etag);
      expect([r.status, problemCode(r)]).toEqual([409, 'ERR-ADM11-DELEGATE-LIMIT-REACHED']);
    });

    it('[D11-03][REQ-ADM11-001] el tope de filas (100, incluidas DISABLED) frena el alta aunque no haya ningún delegado vigente: 409 ERR-ADM11-DELEGATE-LIMIT-REACHED', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      let created = 0;
      while (created < ROW_LIMIT) {
        const batch = Math.min(20, ROW_LIMIT - created);
        const emails = await fillSlots(env, root, batch, created + 1);
        const items = (await listDelegates(env, root)).items.filter((d) => emails.includes(d.email));
        expect(items).toHaveLength(batch);
        for (const item of items) expect((await disable(env, root, item.adminId, item.etag)).status).toBe(200);
        created += batch;
      }
      const page = await listDelegates(env, root);
      expect([page.items.length, page.activeCount]).toEqual([100, 0]);
      const over = await invite(env, root, emailOf(500), 'SUPPORT');
      expect([over.status, problemCode(over)]).toEqual([409, 'ERR-ADM11-DELEGATE-LIMIT-REACHED']);
    });
  });
}

for (const factory of PAIR_FACTORIES) {
  describe.skipIf(!factory.enabled)(`T1525 carreras sobre el tope de 20 (${factory.name})`, { timeout: 120_000 }, () => {
    it('[EDGE-011-010][D11-03] con 19 vigentes, dos altas simultáneas de correos distintos: solo una ocupa la plaza 20; el total nunca pasa de 20', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      await fillSlots(a, root1, 19);
      const results = await Promise.all([retryBusy(() => invite(a, root1, emailOf(91), 'SUPPORT')), retryBusy(() => invite(b, root2, emailOf(92), 'OPERATOR'))]);
      expect(results.map(outcome).sort()).toEqual(['ERR-ADM11-DELEGATE-LIMIT-REACHED', 'OK202']);
      const page = await listDelegates(a, root1);
      expect([page.items.length, page.activeCount]).toEqual([20, 20]);
    });

    it('[EDGE-011-010][EDGE-011-009] con 19 vigentes y dos DISABLED anclados, dos reactivaciones simultáneas: solo una prospera (la otra, tope); el total nunca pasa de 20', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      const x = await onboard(a, root1, emailOf(70), 'SUPPORT');
      const y = await onboard(a, root1, emailOf(71), 'SUPPORT');
      expect([x.adminId !== null, y.adminId !== null]).toEqual([true, true]);
      for (const email of [emailOf(70), emailOf(71)]) {
        const v = (await delegateOf(a, root1, email))!;
        expect((await disable(a, root1, v.adminId, v.etag)).status).toBe(200);
      }
      await fillSlots(a, root1, 19, 1);
      expect((await listDelegates(a, root1)).activeCount).toBe(19);
      const vx = (await delegateOf(a, root1, emailOf(70)))!;
      const vy = (await delegateOf(a, root1, emailOf(71)))!;
      const results = await Promise.all([retryBusy(() => reactivate(a, root1, vx.adminId, vx.etag, 'SUPPORT')), retryBusy(() => reactivate(b, root2, vy.adminId, vy.etag, 'OPERATOR'))]);
      expect(results.map(outcome).sort()).toEqual(['ERR-ADM11-DELEGATE-LIMIT-REACHED', 'OK200']);
      expect((await listDelegates(a, root1)).activeCount).toBe(20);
    });

    it('[EDGE-011-010][REQ-ADM11-006] con 19 vigentes (una por anclar), un anclaje, una re-invitación y un alta simultáneos: el total nunca pasa de 20 y la plaza libre la toma una sola de las dos operaciones nuevas', async () => {
      pair = await factory.make();
      const { a, b } = pair;
      const rootOld = await loginRoot(a);
      await invite(a, rootOld, emailOf(80), 'SUPPORT'); // se re-invitará tras caducar
      pair.at(TTL_72H_MS + 1000);
      const root1 = await loginRoot(a);
      const root2 = await loginRoot(b);
      await fillSlots(a, root1, 19, 1); // 19 vigentes; la 80 está caducada y no cuenta
      const stale = (await delegateOf(a, root1, emailOf(80)))!;
      const anchoring = retryBusy(() => loginAs(a, { email: emailOf(1), sub: subOf(emailOf(1)) }), (r) => r.done.status);
      const reinviting = retryBusy(() => reinvite(b, root2, stale.adminId, stale.etag));
      const inviting = retryBusy(() => invite(a, root1, emailOf(81), 'SUPPORT'));
      const [anchored, reinvited, invited] = await Promise.all([anchoring, reinviting, inviting]);
      expect(anchored.cookie).toMatch(/^argos_admin_session=/);
      const slotTakers = [reinvited.status === 200, invited.status === 202].filter(Boolean).length;
      expect(slotTakers).toBe(1);
      const page = await listDelegates(a, root1);
      expect(page.activeCount).toBe(20);
    });
  });
}
