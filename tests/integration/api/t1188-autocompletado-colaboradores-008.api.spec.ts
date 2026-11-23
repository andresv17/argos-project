import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { account, idOf, stateWith } from '../../fixtures/identity-engines.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { PRODUCTION_LOGGER_OPTIONS } from '../../../src/infrastructure/http/server.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';

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

/** Espía de lecturas (H-J-1): registra `repositorio.método` de cada llamada que el caso de uso hace a los repositorios dentro de la transacción. */
function traceRepositories(repositories: RepositorySet, log: string[]): RepositorySet {
  return new Proxy(repositories, {
    get(target, name) {
      const repository: unknown = Reflect.get(target, name);
      if (typeof name !== 'string' || typeof repository !== 'object' || repository === null) return repository;
      return new Proxy(repository, {
        get(inner, method) {
          const member: unknown = Reflect.get(inner, method);
          if (typeof method !== 'string' || typeof member !== 'function') return member;
          return (...args: unknown[]) => {
            if (name !== 'sessions') log.push(`${name}.${method}`); // la sesión la lee el middleware de autenticación, no el caso de uso
            return member.apply(inner, args);
          };
        },
      });
    },
  });
}
function spyOnReads(): string[] {
  const log: string[] = [];
  const original = api.deps.uow;
  const spied: UnitOfWorkPort = Object.assign(Object.create(original) as UnitOfWorkPort, {
    runInTransaction: <T,>(work: (repositories: RepositorySet) => Promise<T>) => original.runInTransaction((repositories) => work(traceRepositories(repositories, log))),
  });
  (api.deps as { uow: UnitOfWorkPort }).uow = spied;
  return log;
}
const asMember = async (andres: string, hid: string, username: string, roleOnJoin: 'ADMIN' | 'CAREGIVER' | 'READER') => {
  await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username, roleOnJoin } });
  await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
};
const searchFrom = (cookie: string, hid: string, q: string, remoteAddress: string) =>
  api.app.inject({ method: 'GET', url: `/api/households/${hid}/invitees?q=${encodeURIComponent(q)}`, headers: { cookie, 'x-argos-request': '1' }, remoteAddress });

describe('oráculos de orden, cupo y tope del autocompletado (H-J-1, H-J-3, H-J-4)', () => {
  it('[REQ-INV8-001][SC-008-048][SC-008-049] H-J-1: un prefijo corto o inválido da 422 sin consultar candidatos, invitaciones ni perfiles; con prefijo válido sí los consulta', async () => {
    const { andres, hid } = await setup();
    const reads = spyOnReads();
    const perQuery: Array<[string, number, string[]]> = [];
    for (const q of ['pe', 'p', 'pe%20x', 'ped%20ro', 'ped%25']) {
      reads.length = 0;
      const response = await api.call('GET', `/api/households/${hid}/invitees?q=${q}`, { cookie: andres });
      perQuery.push([q, response.status, [...reads]]);
    }
    // La única lectura previa a validar es la de la membresía: el permiso se decide antes que el prefijo.
    expect(perQuery).toEqual(['pe', 'p', 'pe%20x', 'ped%20ro', 'ped%25'].map((q) => [q, 422, ['households.listMemberships']]));
    reads.length = 0;
    expect((await api.call('GET', `/api/households/${hid}/invitees`, { cookie: andres })).status).toBe(422);
    expect(reads).toEqual(['households.listMemberships']);
    reads.length = 0;
    expect((await search(andres, hid, 'ped')).status).toBe(200);
    expect(reads).toContain('users.searchUsernamesByPrefix');
    expect(reads).toContain('invitations.listByHousehold');
  });

  it('[REQ-INV8-001][REQ-RBAC-001][SC-008-048] H-J-1: con prefijo inválido, quien no es gestor recibe 403 o 404 (el permiso va antes que la validación) y solo se lee su membresía', async () => {
    const { andres, hid } = await setup();
    const outsider = await api.login('lucia.r');
    await asMember(andres, hid, 'maria.v', 'READER');
    const reader = await api.login('maria.v');
    const reads = spyOnReads();
    const outcomes: Array<[string, number, string[]]> = [];
    for (const [who, cookie] of [['ajeno', outsider], ['lector', reader]] as const) {
      for (const q of ['pe', 'ped']) {
        reads.length = 0;
        outcomes.push([`${who}:${q}`, (await search(cookie, hid, q)).status, [...reads]]);
      }
    }
    expect(outcomes).toEqual([
      ['ajeno:pe', 404, ['households.listMemberships']],
      ['ajeno:ped', 404, ['households.listMemberships']],
      ['lector:pe', 403, ['households.listMemberships']],
      ['lector:ped', 403, ['households.listMemberships']],
    ]);
  });

  it('[REQ-INV8-003][EDGE-008-044][SC-008-051] H-J-1: un 422 no consume cupo del limitador (35 rechazos y aun así caben las 30 búsquedas válidas)', async () => {
    const { andres, hid } = await setup();
    for (let i = 0; i < 35; i += 1) expect((await search(andres, hid, 'pe')).status).toBe(422);
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await search(andres, hid, 'ped')).status);
    expect([statuses.slice(0, 30).every((s) => s === 200), statuses[30]]).toEqual([true, 429]);
  });

  it('[REQ-INV8-003][EDGE-008-044][SC-008-051] H-J-3: el cupo por IP normalizada se agota entre usuarios distintos (IPv4 e IPv4 mapeada cuentan igual) y otra IP no se ve afectada', async () => {
    const { andres, hid } = await setup();
    await asMember(andres, hid, 'carlos_88', 'ADMIN');
    const carlos = await api.login('carlos_88');
    const sameIp = ['198.51.100.7', '::ffff:198.51.100.7'];
    const codes: number[] = [];
    for (let i = 0; i < 15; i += 1) codes.push((await searchFrom(andres, hid, 'ped', sameIp[i % 2]!)).statusCode);
    for (let i = 0; i < 15; i += 1) codes.push((await searchFrom(carlos, hid, 'ped', sameIp[i % 2]!)).statusCode);
    expect(codes).toEqual(Array(30).fill(200)); // ningún usuario pasa de 15: solo la IP acumula 30
    const rejected = await searchFrom(carlos, hid, 'ped', '198.51.100.7');
    expect([rejected.statusCode, (rejected.json() as { code: string }).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect((await searchFrom(andres, hid, 'ped', '198.51.100.8')).statusCode).toBe(200);
  });

  it('[REQ-INV8-001][SC-008-049] H-J-4: el tope de 5 no trunca mal: con 7 y 6 candidatos devuelve los 5 primeros; con exactamente 5 devuelve los 5 (el último incluido); con 4, los 4', async () => {
    const { andres, hid } = await setup();
    const invite = (username: string) => api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username, roleOnJoin: 'READER' } });
    expect(names(await search(andres, hid, 'ped'))).toEqual(['pedro-d', 'pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f']); // 7 candidatos
    await invite('pedro_c'); // sale el último del orden: quedan 6
    expect(names(await search(andres, hid, 'ped'))).toEqual(['pedro-d', 'pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f']);
    await invite('pedro-d'); // quedan exactamente 5
    expect(names(await search(andres, hid, 'ped'))).toEqual(['pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f', 'pedro.g']);
    expect(names(await search(andres, hid, 'pedro.'))).toEqual(['pedro.a', 'Pedro.B', 'pedro.e', 'pedro.f', 'pedro.g']);
    await invite('pedro.a'); // quedan 4
    expect(names(await search(andres, hid, 'ped'))).toEqual(['Pedro.B', 'pedro.e', 'pedro.f', 'pedro.g']);
  });
});
