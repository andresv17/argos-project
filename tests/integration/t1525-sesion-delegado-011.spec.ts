import { afterEach, describe, expect, it } from 'vitest';
import { bootEnv, loginRoot, onboard, type Backend, type Env } from '../fixtures/admin-delegates-011.ts';

/**
 * T1526 (011, Bloque D, #63; `/keymaker`): la sesión de un delegado `ACTIVE` sigue las reglas de 009 (`admin-session-policy`): 30 min absolutos y 10 min de inactividad, con reloj controlado.
 * Solo las mutaciones renuevan la inactividad (`GET` no) y, por O1 (`/trinity`), solo si el rol alcanza la ruta: un 403 de rol no mantiene viva la sesión. Tras caducar, el 404 uniforme.
 *
 * @implements REQ-ADM11-004, REQ-ADM9-002, INV-ADM11-001, EDGE-009-008
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const MIN = 60 * 1000;
const SUPPORT_EMAIL = 'soporte.sesion@example.test';
/** Mutación PERMITIDA a `SUPPORT` (el efecto da igual: la puerta renueva antes del manejador). */
const ALLOWED_MUTATION = '/api/admin/registrations/60000000-0000-4000-8000-000000000001/approve';

const alive = async (e: Env, cookie: string | null): Promise<boolean> => (await e.call('GET', '/api/admin/session', { cookie })).status === 200;

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`sesión del delegado [${backend}]`, () => {
    async function activeSupport(): Promise<{ e: Env; cookie: string }> {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const support = await onboard(env, root, SUPPORT_EMAIL, 'SUPPORT');
      expect(support.cookie).toMatch(/^argos_admin_session=/);
      return { e: env, cookie: support.cookie! };
    }

    it('[REQ-ADM9-002] caduca a los 10 min de inactividad (sin keep-alive por GET) y responde 404 uniforme', async () => {
      const { e, cookie } = await activeSupport();
      e.at(9 * MIN);
      expect(await alive(e, cookie)).toBe(true);
      e.at(10 * MIN + 1000); // el GET anterior no renovó
      const r = await e.call('GET', '/api/admin/session', { cookie });
      expect(r.status).toBe(404);
      expect(r.text).toBe('Not Found');
    });

    it('[REQ-ADM9-002] la actividad (mutación permitida) dentro del límite mantiene viva la sesión y el tope absoluto de 30 min la corta aunque haya actividad', async () => {
      const { e, cookie } = await activeSupport();
      for (const minute of [9, 18, 27]) {
        e.at(minute * MIN);
        await e.call('POST', ALLOWED_MUTATION, { cookie });
      }
      e.at(29 * MIN);
      expect(await alive(e, cookie)).toBe(true);
      e.at(30 * MIN + 1000);
      const r = await e.call('GET', '/api/admin/session', { cookie });
      expect(r.status).toBe(404);
      expect(r.text).toBe('Not Found');
    });

    it('[O1][REQ-ADM11-003] un 403 de rol NO renueva la inactividad: la sesión caduca a los 10 min del último acceso real', async () => {
      const { e, cookie } = await activeSupport();
      e.at(9 * MIN);
      const denied = await e.call('POST', '/api/admin/administrators', { cookie, body: { email: 'x@example.test', emailConfirmation: 'x@example.test', role: 'SUPPORT' } });
      expect(denied.status).toBe(403);
      e.at(11 * MIN);
      expect((await e.call('GET', '/api/admin/session', { cookie })).status).toBe(404);
    });

    it('[O1] contraste: la misma mutación permitida a los 9 min SÍ mantiene viva la sesión a los 11 min', async () => {
      const { e, cookie } = await activeSupport();
      e.at(9 * MIN);
      await e.call('POST', ALLOWED_MUTATION, { cookie });
      e.at(11 * MIN);
      expect(await alive(e, cookie)).toBe(true);
    });
  });
}
