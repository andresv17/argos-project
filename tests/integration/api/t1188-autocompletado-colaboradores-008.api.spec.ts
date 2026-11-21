import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { account, idOf, stateWith } from '../../fixtures/identity-engines.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { PRODUCTION_LOGGER_OPTIONS } from '../../../src/infrastructure/http/server.ts';

/**
 * T1188 / T1190 (008, bloque J, `[GH:#24]`) `GET /households/{householdId}/invitees?q=` por HTTP sobre SQLite: prefijo mínimo de 3 (422 sin consultar), sin distinguir
 * mayúsculas, máximo 5, exclusiones (invitador, miembros ACTIVE, ya invitados), forma y estado uniformes con y sin resultados, solo gestores (propietario o ADMIN),
 * límite de tasa por usuario y consulta fuera de logs y de auditoría. Sin búsqueda por correo (D8-10 = A).
 * REQ-INV8-001, REQ-INV8-003, REQ-INV8-004, INV-INV8-001, EDGE-008-044, EDGE-008-046; SC-008-048..052.
 */
let api: Api;
afterEach(async () => api?.close());

const EXTRA = ['pedro.a', 'Pedro.B', 'pedro_c', 'pedro-d', 'pedro.e', 'pedro.f', 'pedro.g'].map((u, i) => account(idOf(100 + i), u, 'Clave2026x!', `${u.toLowerCase()}@example.test`));

async function setup() {
  api = await createApi(stateWith(EXTRA));
  const andres = await api.login('andres');
  const hid = ((await api.call('POST', '/api/households', { cookie: andres, body: { name: 'Casa colabs' } })).json as { household: { id: string } }).household.id;
  return { andres, hid };
}
const search = (cookie: string, hid: string, q: string) => api.call('GET', `/api/households/${hid}/invitees?q=${encodeURIComponent(q)}`, { cookie });
const names = (r: { json: unknown }) => (r.json as { items: Array<{ username: string }> }).items.map((i) => i.username);

describe('autocompletado de colaboradores por HTTP (T1188, T1190)', () => {
  it('[REQ-INV8-001][SC-008-048][SC-008-049] con menos de 3 caracteres, ausente o con caracteres no válidos responde 422 sin consultar; con 3 devuelve hasta 5 sin distinguir mayúsculas y en orden', async () => {
    const { andres, hid } = await setup();
    const rejected = await Promise.all(['pe', 'p', 'pe%20x', 'ped ro'].map(async (q) => problemOf(await api.call('GET', `/api/households/${hid}/invitees?q=${q}`, { cookie: andres }))));
    expect(rejected).toEqual(Array(4).fill({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }));
    expect(problemOf(await api.call('GET', `/api/households/${hid}/invitees`, { cookie: andres }))).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    const lower = await search(andres, hid, 'ped');
    const upper = await search(andres, hid, 'PED');
    expect([lower.status, names(lower), names(upper)]).toEqual([200, ['pedro-d', 'pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f'], ['pedro-d', 'pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f']]);
    expect(names(await search(andres, hid, 'pedro.')).length).toBe(5); // el punto es literal y los 5 más próximos
    expect(names(await search(andres, hid, 'pedro_'))).toEqual(['pedro_c']); // el guion bajo no es comodín
  });

  it('[REQ-INV8-003][INV-INV8-001][SC-008-052] sin coincidencias y con coincidencias dan el mismo estado, cabecera no-store y forma cerrada de solo username (sin correo, nombre ni id)', async () => {
    const { andres, hid } = await setup();
    const none = await search(andres, hid, 'zzz');
    const some = await search(andres, hid, 'pedro.a');
    expect([none.status, some.status, none.headers['cache-control'], some.headers['cache-control'], none.json]).toEqual([200, 200, 'no-store', 'no-store', { items: [] }]);
    expect(some.json).toEqual({ items: [{ username: 'pedro.a' }] });
    expect(some.text).not.toMatch(/example\.test|displayName|Nombre|c0000000/);
  });

  it('[REQ-INV8-004][EDGE-008-046][SC-008-050] no sugiere al invitador, a miembros ACTIVE ni a cuentas ya invitadas, y la respuesta conserva la misma forma', async () => {
    const { andres, hid } = await setup();
    await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username: 'maria.v', roleOnJoin: 'READER' } });
    await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login('maria.v') });
    await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username: 'pedro.a', roleOnJoin: 'READER' } });
    const results = await Promise.all(['and', 'mar', 'ped'].map((q) => search(andres, hid, q)));
    expect(results.map((r) => [r.status, names(r)])).toEqual([[200, []], [200, []], [200, ['pedro-d', 'Pedro.B', 'pedro.e', 'pedro.f', 'pedro.g']]]);
  });

  it('[REQ-INV8-001][REQ-RBAC-001][SC-008-048] un ADMIN puede buscar; Cuidador, Lector y quien no es del hogar no (403 y 404) y no se consulta nada', async () => {
    const { andres, hid } = await setup();
    const outsider = await api.login('lucia.r'); // todavía no es del hogar: 404 (INV-HOUSE-004)
    const outsiderStatus = (await search(outsider, hid, 'ped')).status;
    for (const [username, roleOnJoin] of [['carlos_88', 'ADMIN'], ['lucia.r', 'CAREGIVER'], ['maria.v', 'READER']] as const) {
      await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username, roleOnJoin } });
      await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
    }
    const outcomes: Array<[string, number]> = [];
    for (const username of ['carlos_88', 'lucia.r', 'maria.v']) outcomes.push([username, (await search(await api.login(username), hid, 'ped')).status]);
    expect(outcomes).toEqual([['carlos_88', 200], ['lucia.r', 403], ['maria.v', 403]]);
    expect([outsiderStatus, (await api.call('GET', `/api/households/${hid}/invitees?q=ped`, { cookie: null })).status]).toEqual([404, 401]);
  });

  it('[REQ-INV8-003][EDGE-008-044][SC-008-051] el exceso de consultas del usuario devuelve 429 ERR-RATE-LIMITED y otro usuario sigue pudiendo buscar', async () => {
    const { andres, hid } = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await search(andres, hid, 'ped')).status);
    expect([statuses.slice(0, 30).every((s) => s === 200), statuses[30]]).toEqual([true, 429]);
    expect(problemOf(await search(andres, hid, 'ped'))).toEqual({ status: 429, code: 'ERR-RATE-LIMITED' });
  });

  it('[REQ-INV8-003][EDGE-008-044] la búsqueda no escribe nada en la base (ni auditoría ni eventos) y la consulta no sale en el registro de la petición', async () => {
    const { andres, hid } = await setup();
    const before = api.dump();
    await search(andres, hid, 'pedro.a');
    expect(api.dump()).toBe(before);
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done(); } });
    const app = await buildApp({ deps: api.deps, cookieSecure: false, logger: { ...PRODUCTION_LOGGER_OPTIONS, level: 'info', stream } });
    const cookie = await api.login('andres');
    await app.inject({ method: 'GET', url: `/api/households/${hid}/invitees?q=pedro.a`, headers: { cookie, 'x-argos-request': '1' } });
    await app.close();
    const log = lines.join('');
    expect([log.length > 0, log.includes('pedro'), log.includes('invitees?q')]).toEqual([true, false, false]);
  });
});
