/**
 * T556 [P] [US3] microchip trivial por HTTP (SC-CAT-029, REQ-PET4-002, EDGE-020), SQLite real con la API completa:
 *  - los 15 dígitos iguales y las secuencias consecutivas módulo 10 (ascendentes y descendentes) se rechazan en el alta y en la edición con
 *    422 ERR-SCHEMA-VALIDATION-FAILED y campo `microchipId`, sin guardar nada y sin repetir el valor en el cuerpo;
 *  - un microchip ordinario sigue entrando, y un duplicado recibe el 409 con el `detail` que remite al administrador.
 * El límite de 5 duplicados por usuario en 24 h (ERR-RATE-LIMITED) se prueba en t556-limite-duplicados.api.spec.ts.
 */
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { PRODUCTION_LOGGER_OPTIONS } from '../../../src/infrastructure/http/server.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { PASSWORDS, TEST_RATE_LIMITS, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { KIRA_ID, NEW_PET } from './api-fixtures.ts';

let api: Api;
afterEach(async () => api.close());

const TRIVIAL = ['123456789012345', '000000000000000', '987654321098765', '111111111111111', '999999999999999', '012345678901234', '543210987654321'];
// Descendentes módulo 10 que empiezan en 0, 1, 2 y 3: el patrón del contrato 3.1.0 los lista mal («09876543210-1-2-3-4», …), de modo que el esquema los deja pasar.
// Corregido el patrón (af2aa3b, H-K-004T556-1), el esquema ya las rechaza; la regla de dominio (T557) sigue cubriéndolas como segunda línea.
const TRIVIAL_FUERA_DEL_PATRON = ['098765432109876', '109876543210987', '210987654321098', '321098765432109'];
const ORDINARY = '981020000000001';
const petInput = (patch: Record<string, unknown> = {}) => ({ ...NEW_PET, name: 'Nube', species: 'RABBIT', breed: 'Cabeza de león', birthDate: '2024-01-10', sex: 'MALE', ...patch });

describe('T556 microchip trivial y texto del 409 (REQ-PET4-002, SC-CAT-029)', () => {
  it('[SC-CAT-029][EDGE-020] cada patrón trivial se rechaza en el alta con 422 ERR-SCHEMA-VALIDATION-FAILED en el campo microchipId y no crea la mascota', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = (await api.call('GET', '/api/pets', { cookie })).json as unknown[];
    const out: unknown[] = [];
    for (const microchipId of [...TRIVIAL, ...TRIVIAL_FUERA_DEL_PATRON]) {
      const r = await api.call('POST', '/api/pets', { cookie, body: petInput({ microchipId }) });
      out.push([problemOf(r), (r.json as { field?: string }).field]);
    }
    expect(out).toEqual([...TRIVIAL, ...TRIVIAL_FUERA_DEL_PATRON].map(() => [{ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, 'microchipId']));
    expect(((await api.call('GET', '/api/pets', { cookie })).json as unknown[]).length).toBe(before.length);
  });

  it('[SC-CAT-029] la edición con un patrón trivial también se rechaza (422, campo microchipId) y la mascota conserva su microchip', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    for (const microchipId of ['123456789012345', '000000000000000', '987654321098765', '098765432109876']) {
      const r = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie, body: { microchipId } });
      expect([problemOf(r), (r.json as { field?: string }).field]).toEqual([{ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, 'microchipId']);
    }
    const hole = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie, body: { microchipId: '109876543210987' } });
    // El `detail` de ajv cita el patrón del contrato, que ahora lista las 20 secuencias (incluida esta): se comprueba que el valor enviado no se repite en el resto del cuerpo.
    expect([problemOf(hole), JSON.stringify({ ...(hole.json as object), detail: undefined }).includes('109876543210987')]).toEqual([{ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, false]);
    const list = await api.call('GET', '/api/pets', { cookie });
    expect(JSON.stringify(list.json)).not.toMatch(/123456789012345|000000000000000|987654321098765|098765432109876|109876543210987/);
  });

  it('[SC-CAT-029] un microchip ordinario entra y su duplicado recibe el 409 con el detail que remite al administrador (sin el microchip en el cuerpo)', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const first = await api.call('POST', '/api/pets', { cookie, body: petInput({ microchipId: ORDINARY }) });
    const dup = await api.call('POST', '/api/pets', { cookie, body: petInput({ name: 'Otra', microchipId: ORDINARY }) });
    expect([first.status, problemOf(dup)]).toEqual([201, { status: 409, code: 'ERR-PET-MICROCHIP-DUPLICATE' }]);
    expect((dup.json as { detail?: string }).detail).toBe('Este microchip ya está registrado en ARGOS. Si es tuyo, contacta al administrador.');
    expect(dup.text).not.toContain(ORDINARY);
  });

  it('[SC-CAT-029][INV-LOG-001] REFUERZO de no eco: un microchip trivial NO literal del patrón (cubierto por el backreference) no aparece en el cuerpo completo (detail incluido) ni en el log, en el alta ni en la edición', async () => {
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
    const harnessApp = await buildApp({ deps: createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher(), TEST_RATE_LIMITS), cookieSecure: false, logger: { ...PRODUCTION_LOGGER_OPTIONS, redact: [...PRODUCTION_LOGGER_OPTIONS.redact], stream } });
    try {
      const headers = { 'x-argos-request': '1', 'content-type': 'application/json' };
      const session = await harnessApp.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username: 'andres', password: PASSWORDS['andres'] } });
      const cookie = (session.headers['set-cookie'] as string).split(';')[0]!;
      const bodies: string[] = [];
      const statuses: number[] = [];
      for (const microchipId of ['000000000000000', '777777777777777']) {
        const created = await harnessApp.inject({ method: 'POST', url: '/api/pets', headers: { ...headers, cookie }, payload: petInput({ microchipId }) });
        const edited = await harnessApp.inject({ method: 'PATCH', url: `/api/pets/${KIRA_ID}`, headers: { ...headers, cookie }, payload: { microchipId } });
        statuses.push(created.statusCode, edited.statusCode);
        bodies.push(created.body, edited.body);
      }
      expect(statuses).toEqual([422, 422, 422, 422]);
      expect(bodies.every((body) => body.includes('"ERR-SCHEMA-VALIDATION-FAILED"') && body.includes('"detail"'))).toBe(true);
      const scanned = [...bodies, ...lines].join('\n');
      expect(['000000000000000', '777777777777777'].filter((value) => scanned.includes(value))).toEqual([]);
    } finally {
      await harnessApp.close();
      db.close();
    }
  });
});
