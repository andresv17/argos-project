/**
 * H-T591-1 [US4] renovación pasiva del visor (SC-ALM-036, INV-AUTH2-002, REQ-ARC-003): `getMediaAccess` con la cabecera `X-Argos-Renewal: 1` valida la sesión igual
 * (revocada, 30 min de inactividad, 24 h absolutas, 401 uniforme) pero NO desplaza `lastActivityAt`. Cualquier otro valor, valor repetido o ausencia renueva (fail-safe) y
 * las demás rutas ignoran la cabecera.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, PDF } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const MEDIA = `/api/pets/${ARGOS.id}/media`;
const MINUTE = 60_000;
const START = Date.parse('2026-11-05T12:00:00.000Z');
const at = (offsetMs: number) => new Date(START + offsetMs).toISOString();
const advance = (offsetMs: number) => api.clock.setClock('2026-11-05', at(offsetMs));
const UNAUTHENTICATED = { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' };
const fileHeaders = { 'x-argos-filename': encodeURIComponent('a.pdf'), 'content-type': 'application/octet-stream' };

async function setup() {
  api = await createApi(undefined, { media: { storage: new ControlledStorage(() => new Date(START)), limits: DEFAULT_LIMITS } });
  const cookie = await api.login('andres');
  const created = await api.call('POST', `${MEDIA}?kind=FILE`, { cookie, raw: PDF(), headers: fileHeaders });
  const accessUrl = `${MEDIA}/${(created.json as { id: string }).id}/access`;
  return { cookie, accessUrl };
}
const lastActivity = (): string => (api.db.prepare('SELECT last_activity_at AS a FROM sessions').get() as { a: string }).a;

describe('H-T591-1 renovación pasiva de getMediaAccess (SC-ALM-036)', () => {
  it('[SC-ALM-036][INV-AUTH2-002] con X-Argos-Renewal: 1 la respuesta es 200 y lastActivityAt no cambia', async () => {
    const { cookie, accessUrl } = await setup();
    const before = lastActivity();
    advance(10 * MINUTE);
    const r = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    expect([r.status, lastActivity()]).toEqual([200, before]);
  });

  it('[SC-ALM-036] sin la cabecera, o con valores distintos de 1 (0, vacío, true, " 1", 1,1), la petición renueva lastActivityAt', async () => {
    const { cookie, accessUrl } = await setup();
    const seen: string[] = [];
    let offset = 0;
    for (const value of [undefined, '0', '', 'true', ' 2', '1,1', 'uno']) {
      offset += MINUTE;
      advance(offset);
      const r = await api.call('GET', accessUrl, { cookie, ...(value === undefined ? {} : { headers: { 'x-argos-renewal': value } }) });
      expect(r.status).toBe(200);
      seen.push(lastActivity());
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => at(n * MINUTE)));
  });

  it('[SC-ALM-036] una cabecera duplicada (dos X-Argos-Renewal) o en forma de array renueva (fail-safe)', async () => {
    const { cookie, accessUrl } = await setup();
    advance(5 * MINUTE);
    // light-my-request entrega un valor array como cabecera repetida.
    const r = await api.app.inject({ method: 'GET', url: accessUrl, headers: { 'x-argos-request': '1', cookie, 'x-argos-renewal': ['1', '1'] as unknown as string } });
    expect([r.statusCode, lastActivity()]).toEqual([200, at(5 * MINUTE)]);
  });

  it('[SC-ALM-036][INV-AUTH2-002] con la cabecera, 30 min exactos de inactividad dan 401 sin escribir; 29 min 59 s sigue vigente sin renovar', async () => {
    const { cookie, accessUrl } = await setup();
    const before = lastActivity();
    advance(30 * MINUTE - 1000);
    const alive = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    advance(30 * MINUTE);
    const idle = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    expect([alive.status, problemOf(idle), lastActivity()]).toEqual([200, UNAUTHENTICATED, before]);
  });

  it('[SC-ALM-036] las renovaciones pasivas repetidas no estiran la sesión: tras 31 min desde la última actividad real, 401', async () => {
    const { cookie, accessUrl } = await setup();
    for (const minute of [10, 20, 28]) {
      advance(minute * MINUTE);
      expect((await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } })).status).toBe(200);
    }
    advance(31 * MINUTE);
    const r = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    expect(problemOf(r)).toEqual(UNAUTHENTICATED);
  });

  it('[SC-ALM-036] con la cabecera, una sesión revocada da 401 uniforme', async () => {
    const { cookie, accessUrl } = await setup();
    await api.call('POST', '/api/auth/logout', { cookie });
    const r = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    const noCookie = await api.call('GET', accessUrl, { headers: { 'x-argos-renewal': '1' } });
    expect([problemOf(r), problemOf(noCookie)]).toEqual([UNAUTHENTICATED, UNAUTHENTICATED]);
  });

  it('[SC-ALM-036][INV-AUTH2-002] a las 24 h absolutas el 401 llega aunque la actividad sea reciente y no se escribe nada', async () => {
    const { cookie, accessUrl } = await setup();
    for (let minute = 25; minute < 24 * 60; minute += 25) {
      advance(minute * MINUTE);
      expect((await api.call('GET', `${MEDIA}?kind=FILE&page=1`, { cookie })).status).toBe(200);
    }
    const before = lastActivity();
    advance(24 * 60 * MINUTE);
    const r = await api.call('GET', accessUrl, { cookie, headers: { 'x-argos-renewal': '1' } });
    expect([problemOf(r), lastActivity()]).toEqual([UNAUTHENTICATED, before]);
  });

  it('[SC-ALM-036] las demás rutas ignoran la cabecera: listMedia y /api/auth/me con X-Argos-Renewal: 1 renuevan lastActivityAt', async () => {
    const { cookie } = await setup();
    advance(3 * MINUTE);
    await api.call('GET', `${MEDIA}?kind=FILE&page=1`, { cookie, headers: { 'x-argos-renewal': '1' } });
    const afterList = lastActivity();
    advance(6 * MINUTE);
    await api.call('GET', '/api/auth/me', { cookie, headers: { 'x-argos-renewal': '1' } });
    expect([afterList, lastActivity()]).toEqual([at(3 * MINUTE), at(6 * MINUTE)]);
  });
});
