/**
 * T556/T557 [US3] límite de 5 duplicados de microchip por usuario en 24 h (REQ-PET4-002, SC-CAT-029, ADR-004-04), SQLite real con la API completa:
 *  - tras 5 duplicados, el sexto intento con microchipId (nuevo o repetido) recibe 429 ERR-RATE-LIMITED SIN guardar nada (chequeo previo);
 *  - el evento se registra solo al ocurrir un duplicado (alta, edición con cambio de microchipId, importación de respaldo), nunca por otra causa;
 *  - la ventana es deslizante de 1440 minutos; el 429 no deja estado parcial ni prolonga la ventana;
 *  - ni el microchip ni el identificador del usuario aparecen en el cuerpo ni en los logs.
 */
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { PRODUCTION_LOGGER_OPTIONS } from '../../../src/infrastructure/http/server.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { PASSWORDS, TEST_RATE_LIMITS, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';
import { digestOf } from '../../fixtures/backup-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { KIRA_ID, NEW_PET, USERS_BY_NAME } from './api-fixtures.ts';

let api: Api;
let app: FastifyInstance | undefined;
afterEach(async () => {
  await api?.close();
  await app?.close();
  app = undefined;
});

const CHIP = '981020000000001';
const petInput = (patch: Record<string, unknown> = {}) => ({ ...NEW_PET, name: 'Nube', species: 'RABBIT', breed: 'Cabeza de león', birthDate: '2024-01-10', sex: 'MALE', ...patch });
const chipN = (n: number) => `9810200000${String(10000 + n)}`; // 15 dígitos, no trivial
// El harness valida las respuestas contra el OpenAPI de la 002, que no declara el 429 de estas rutas (lo declara el OpenAPI 3.1.0 de la 004, cubierto por
// contracts-004-openapi.spec.ts): las llamadas que esperan 429 pasan `contract: false` y se comprueba el código y el estado del problema.
const NO_CONTRACT = { contract: false } as const;
const RATE = { status: 429, code: 'ERR-RATE-LIMITED' };
// Split REQ-CHP12-001: el chip de OTRA cuenta (aquí María es la titular) responde ERR-CHP12-MICROCHIP-REGISTERED; el límite de duplicados sigue contándolo (REQ-PET4-002).
const DUP = { status: 409, code: 'ERR-CHP12-MICROCHIP-REGISTERED' };
const events = () => api.db.prepare("SELECT COUNT(*) FROM rate_limit_events WHERE scope = 'MICROCHIP_DUPLICATE'").pluck().get() as number;
const petsWithChip = (chip: string) => api.db.prepare('SELECT COUNT(*) FROM pets WHERE microchip_id = ?').pluck().get(chip) as number;

/** María registra CHIP y Andrés lo duplica `times` veces (409 cada una); devuelve la cookie de Andrés. */
async function exhaust(times: number): Promise<string> {
  api = await createApi();
  const andres = await api.login('andres');
  const maria = await api.login('maria.v');
  expect((await api.call('POST', '/api/pets', { cookie: maria, body: petInput({ name: 'De María', microchipId: CHIP }) })).status).toBe(201);
  for (let i = 0; i < times; i += 1) {
    expect(problemOf(await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: `Intento ${i}`, microchipId: CHIP }) }))).toEqual(DUP);
  }
  return andres;
}

describe('T556/T557 límite de duplicados de microchip (REQ-PET4-002, SC-CAT-029, ADR-004-04)', () => {
  it('[SC-CAT-029][REQ-PET4-002] el sexto intento con microchipId tras 5 duplicados en 24 h recibe 429 ERR-RATE-LIMITED sin guardar, aunque el chip sea nuevo, y un chip repetido recibe el mismo 429', async () => {
    const andres = await exhaust(5);
    expect(events()).toBe(5);
    const before = api.dump();
    const fresh = chipN(1);
    const withNew = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Nuevo', microchipId: fresh }), ...NO_CONTRACT });
    const withDup = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Otra', microchipId: CHIP }), ...NO_CONTRACT });
    expect([problemOf(withNew), problemOf(withDup)]).toEqual([RATE, RATE]);
    expect(withDup.text).toBe(withNew.text);
    expect([petsWithChip(fresh), events(), api.dump() === before]).toEqual([0, 5, true]);
    expect(withNew.text).not.toContain(fresh);
  });

  it('[SC-CAT-029] con 4 duplicados un chip nuevo de alta normal NO se bloquea, y una alta sin microchip tampoco aunque el cupo esté agotado', async () => {
    const andres = await exhaust(4);
    const ok = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Libre', microchipId: chipN(2) }) });
    expect([ok.status, events()]).toEqual([201, 4]);
    expect(problemOf(await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Quinto', microchipId: CHIP }) }))).toEqual(DUP);
    expect(events()).toBe(5);
    const noChip = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Sin chip' }) });
    const nullChip = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Chip nulo', microchipId: null }) });
    expect([noChip.status, nullChip.status, events()]).toEqual([201, 201, 5]);
  });

  it('[SC-CAT-029] la edición que cambia microchipId aplica el límite (429 sin guardar); editar sin cambiar el microchip no se bloquea', async () => {
    const andres = await exhaust(3);
    // Dos duplicados por edición cuentan igual que por alta.
    for (let i = 0; i < 2; i += 1) expect(problemOf(await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie: andres, body: { microchipId: CHIP } }))).toEqual(DUP);
    expect(events()).toBe(5);
    const keptChip = (api.db.prepare('SELECT microchip_id FROM pets WHERE id = ?').pluck().get(KIRA_ID) ?? null) as string | null;
    const before = api.dump();
    const blocked = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie: andres, body: { microchipId: chipN(3) }, ...NO_CONTRACT });
    expect(problemOf(blocked)).toEqual(RATE);
    expect([petsWithChip(chipN(3)), api.dump() === before]).toEqual([0, true]);
    const sameChip = keptChip === null ? { name: 'Kira II' } : { name: 'Kira II', microchipId: keptChip };
    const renamed = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie: andres, body: sameChip });
    expect([renamed.status, (renamed.json as { name: string }).name]).toEqual([200, 'Kira II']);
  });

  it('[SC-CAT-029][REQ-IMP-001] la importación de respaldo con un microchip duplicado cuenta como un evento (409), y con el cupo agotado y un microchip no nulo responde 429 sin tocar nada', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    await api.call('POST', '/api/pets', { cookie: maria, body: petInput({ name: 'De María', microchipId: CHIP }) });
    const exported = (await api.call('POST', '/api/backup/export', { cookie: andres })).json as { pets: Array<Record<string, unknown>> };
    const withChip = (chip: string | null) => JSON.stringify({ ...exported, pets: exported.pets.map((p, i) => ({ ...p, microchipId: i === 0 ? chip : null })) });
    const importAs = (payload: string, rated = false) => api.call('POST', '/api/backup/import', { cookie: andres, raw: payload, headers: { 'x-argos-import-confirm': digestOf(payload) }, ...(rated ? NO_CONTRACT : {}) });

    const dupFile = withChip(CHIP);
    const first = await importAs(dupFile);
    // EDGE-012-044: el chip de otra cuenta en la importación lo rechaza el comprobador único (cuenta en CHIP_LOOKUP, no como evento de duplicado).
    expect([problemOf(first).status, problemOf(first).code, events()]).toEqual([409, 'ERR-CHP12-MICROCHIP-REGISTERED', 0]);
    for (let i = 0; i < 5; i += 1) await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: `Intento ${i}`, microchipId: CHIP }) });
    expect(events()).toBe(5);

    const own = () => JSON.stringify(['pets', 'weights', 'vaccinations'].map((t) => api.db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()));
    const dataBefore = own();
    const eventsBefore = api.db.prepare('SELECT COUNT(*) FROM rate_limit_events').pluck().get();
    const blocked = await importAs(withChip(chipN(4)), true);
    expect([problemOf(blocked), own() === dataBefore, api.db.prepare('SELECT COUNT(*) FROM rate_limit_events').pluck().get()]).toEqual([RATE, true, eventsBefore]);
    expect(blocked.text).not.toContain(chipN(4));
    // Sin ningún microchip no hay chequeo previo: el archivo se importa.
    const noChips = await importAs(withChip(null));
    expect(noChips.status).toBe(200);
  });

  it('[SC-CAT-029] el evento NO se registra cuando la operación no falla por duplicado (alta válida, 422, 404, edición válida, importación válida)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const ok = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ microchipId: chipN(5) }) });
    const trivial = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Trivial', microchipId: '123456789012345' }) });
    const missing = await api.call('PATCH', '/api/pets/00000000-0000-4000-8000-000000000000', { cookie: andres, body: { microchipId: chipN(6) } });
    const edit = await api.call('PATCH', `/api/pets/${(ok.json as { id: string }).id}`, { cookie: andres, body: { microchipId: chipN(7) } });
    const exported = await api.call('POST', '/api/backup/export', { cookie: andres });
    const imported = await api.call('POST', '/api/backup/import', { cookie: andres, raw: exported.text, headers: { 'x-argos-import-confirm': digestOf(exported.text) } });
    expect([ok.status, trivial.status, missing.status, edit.status, imported.status, events()]).toEqual([201, 422, 404, 200, 200, 0]);
  });

  it('[SC-CAT-029][ADR-004-04] el registro del evento es best effort: si falla, el duplicado se responde igual con 409 y no se guarda nada', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    await api.call('POST', '/api/pets', { cookie: maria, body: petInput({ name: 'De María', microchipId: CHIP }) });
    vi.spyOn(api.deps.rateLimiter, 'record').mockRejectedValue(new Error('fallo simulado del registro'));
    const before = api.dump();
    const dup = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Otra', microchipId: CHIP }) });
    expect([problemOf(dup), events(), api.dump() === before]).toEqual([DUP, 0, true]);
    vi.restoreAllMocks();
  });

  it('[SC-CAT-029] el límite es por usuario: tras agotar el cupo de Andrés, María puede registrar chips nuevos', async () => {
    await exhaust(5);
    const maria = await api.login('maria.v');
    const ok = await api.call('POST', '/api/pets', { cookie: maria, body: petInput({ name: 'Nueva de María', microchipId: chipN(8) }) });
    expect(ok.status).toBe(201);
  });

  it('[SC-CAT-029][ADR-004-04] ventana deslizante de 24 h: a las 23 h 59 min sigue el 429 (y no se prolonga) y al cumplirse las 24 h el cupo vuelve', async () => {
    await exhaust(5);
    const start = api.clock.nowIsoTimestamp();
    const at = (ms: number) => new Date(Date.parse(start) + ms).toISOString();
    api.clock.setClock('2026-11-06', at(24 * 3_600_000 - 60_000));
    const early = await api.call('POST', '/api/pets', { cookie: await api.login('andres'), body: petInput({ name: 'Pronto', microchipId: chipN(9) }), ...NO_CONTRACT });
    expect(problemOf(early)).toEqual(RATE);
    api.clock.setClock('2026-11-06', at(24 * 3_600_000 + 1_000));
    const later = await api.call('POST', '/api/pets', { cookie: await api.login('andres'), body: petInput({ name: 'Después', microchipId: chipN(9) }) });
    expect(later.status).toBe(201);
  });

  it('[SC-CAT-029][INV-LOG-001] ni el microchip ni el identificador del usuario aparecen en el cuerpo ni en los logs, en el 409 ni en el 429', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(...chunk.toString('utf8').split('\n').filter((l) => l.length > 0));
        done();
      },
    });
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow, canonicalState());
    const clock = new FixedClockAdapter();
    app = await buildApp({ deps: createDeps(uow, clock, new SpyPasswordHasher(), TEST_RATE_LIMITS), cookieSecure: false, logger: { ...PRODUCTION_LOGGER_OPTIONS, redact: [...PRODUCTION_LOGGER_OPTIONS.redact], stream } });
    app.addHook('onClose', async () => db.close());
    const headers = { 'x-argos-request': '1', 'content-type': 'application/json' };
    const login = async (user: string) => {
      const r = await app!.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: user, password: PASSWORDS[user] } });
      return (r.headers['set-cookie'] as string).split(';')[0]!;
    };
    const post = async (cookie: string, payload: object) => app!.inject({ method: 'POST', url: '/api/pets', headers: { ...headers, cookie }, payload });
    const maria = await login('maria.v');
    const andres = await login('andres');
    await post(maria, petInput({ name: 'De María', microchipId: CHIP }));
    const bodies: string[] = [];
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await post(andres, petInput({ name: `Intento ${i}`, microchipId: CHIP }));
      statuses.push(r.statusCode);
      bodies.push(r.body);
    }
    const sixth = await post(andres, petInput({ name: 'Sexto', microchipId: chipN(10) }));
    statuses.push(sixth.statusCode);
    bodies.push(sixth.body);
    expect(statuses).toEqual([409, 409, 409, 409, 409, 429]);
    const scanned = [...bodies, ...lines].join('\n');
    expect([CHIP, chipN(10), USERS_BY_NAME.andres].filter((secret) => scanned.includes(secret))).toEqual([]);
    expect(lines.length).toBeGreaterThanOrEqual(7);
  });
});
