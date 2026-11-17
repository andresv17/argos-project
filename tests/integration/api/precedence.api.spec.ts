import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '../../../src/generated/index.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { ARGOS_ID, NEW_PET } from './api-fixtures.ts';

/**: precedencia de la frontera y ProblemDetails desde el catálogo. */
let api: Api;
afterEach(async () => api.close());

describe('precedencia de validación en la frontera HTTP', () => {
  it('[INV-AUTH-007][ERR-AUTH-CSRF-REJECTED] regla 1: sin X-Argos-Request: 1 → 403 antes que la sesión, el cuerpo y el esquema (EDGE-018)', async () => {
    api = await createApi();
    const noHeader = await api.call('POST', '/api/pets', { csrf: false, raw: '{roto' });
    const wrongValue = await api.call('POST', '/api/pets', { csrf: false, headers: { 'x-argos-request': '0' }, body: NEW_PET });
    const publicRoute = await api.call('POST', '/api/auth/login', { csrf: false, body: { username: 'andres', password: 'Argos2026a' } });
    const deleteRoute = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { csrf: false });
    expect([problemOf(noHeader), problemOf(wrongValue), problemOf(publicRoute), problemOf(deleteRoute), (noHeader.json as { field: string }).field]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      'X-Argos-Request',
    ]);
  });

  it('[INV-AUTH-007] las lecturas (GET) no exigen la cabecera CSRF', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    expect((await api.call('GET', '/api/pets', { csrf: false, cookie })).status).toBe(200);
  });

  it('[REQ-AUTH-004] regla 2: con CSRF correcto y sin sesión → 401 antes de leer el cuerpo o validar el esquema', async () => {
    api = await createApi();
    const malformed = await api.call('POST', '/api/pets', { raw: '{roto' });
    const invalid = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { body: { weightKg: -1 } });
    expect([problemOf(malformed), problemOf(invalid)]).toEqual([
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[REQ-AUTH2-001] reglas 4 y 5: el username ya no se normaliza (mayúsculas o espacios → esquema) y el esquema va antes del dominio', async () => {
    api = await createApi();
    const body = (username: string, password: string) => ({ username, displayName: 'Otro', password, confirmPassword: password });
    const notNormalized = await api.call('POST', '/api/auth/register', { body: body('  ANDRES ', 'Clave2026x!') });
    const taken = await api.call('POST', '/api/auth/register', { body: body('andres', 'Clave2026x!') });
    const schemaBeforeDomain = await api.call('POST', '/api/auth/register', { body: body('andres', 'abcdefghij') });
    expect([problemOf(notNormalized), problemOf(taken), problemOf(schemaBeforeDomain)]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 409, code: 'ERR-AUTH-USERNAME-TAKEN' },
      { status: 422, code: 'ERR-AUTH-WEAK-PASSWORD' },
    ]);
  });

  it('[REQ-PET-001][REQ-REC-001] regla 4: campo anotado → su código; ausente o no autorizado → ERR-SCHEMA-VALIDATION-FAILED, antes que el dominio', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const weights = `/api/pets/${ARGOS_ID}/records/weights`;
    const annotated = await api.call('POST', weights, { cookie, body: { recordedAt: '2026-11-04', weightKg: -2.5 } });
    const missing = await api.call('POST', weights, { cookie, body: { recordedAt: '2030-01-01' } });
    const extraAndFuture = await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, birthDate: '2030-01-01', hack: true } });
    const futureOnly = await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, birthDate: '2030-01-01' } });
    const javascriptAvatar = await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, avatarUrl: 'javascript:alert(1)' } });
    expect([problemOf(annotated), problemOf(missing), problemOf(extraAndFuture), problemOf(futureOnly), problemOf(javascriptAvatar)]).toEqual([
      { status: 422, code: 'ERR-REC-WEIGHT-OUT-OF-RANGE' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-PET-FUTURE-BIRTHDATE' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-PET-001] un cuerpo que no es JSON, que no es UTF-8 válido o que falta → 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const notJson = await api.call('POST', '/api/pets', { cookie, raw: '{"name":' });
    const badUtf8 = await api.call('POST', '/api/pets', { cookie, raw: new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]) });
    const empty = await api.call('POST', '/api/pets', { cookie });
    const textPlain = await api.call('POST', '/api/pets', { cookie, raw: JSON.stringify(NEW_PET), headers: { 'content-type': 'text/plain' } });
    expect([problemOf(notJson), problemOf(badUtf8), problemOf(empty), textPlain.status]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      201,
    ]);
  });

  it('[REQ-PET-001] un cuerpo de más de 1 MB fuera de la importación → 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const r = await api.call('POST', '/api/pets', { cookie, raw: JSON.stringify({ ...NEW_PET, breed: 'x'.repeat(1_100_000) }) });
    expect(problemOf(r)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });
});

describe('ProblemDetails desde el catálogo (src/infrastructure/http/plugins/problem-details.ts)', () => {
  it('[ERR-AUTH-CSRF-REJECTED] el problema es application/problem+json con type, title, status e invariantRef del catálogo e instance sin consulta', async () => {
    api = await createApi();
    const r = await api.call('POST', '/api/pets?x=1', { csrf: false, body: NEW_PET });
    const entry = ERROR_CATALOG['ERR-AUTH-CSRF-REJECTED'];
    expect([r.headers['content-type'], r.json]).toEqual([
      'application/problem+json; charset=utf-8',
      {
        type: 'urn:argos:error:ERR-AUTH-CSRF-REJECTED',
        code: 'ERR-AUTH-CSRF-REJECTED',
        title: entry.title,
        status: 403,
        detail: entry.detailTemplate,
        invariantRef: entry.invariantRef,
        field: 'X-Argos-Request',
        instance: '/api/pets',
      },
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] un error no previsto → 500 ERR-INTERNAL-UNEXPECTED con el detalle del catálogo, sin mensaje ni traza interna', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    api.db.exec('DROP TABLE weights');
    const r = await api.call('GET', `/api/pets/${ARGOS_ID}/dashboard`, { cookie });
    expect([r.status, r.headers['content-type'], (r.json as { code: string }).code, (r.json as { detail: string }).detail, /weights|sqlite|at |\.ts/i.test(r.text)]).toEqual([
      500,
      'application/problem+json; charset=utf-8',
      'ERR-INTERNAL-UNEXPECTED',
      ERROR_CATALOG['ERR-INTERNAL-UNEXPECTED'].detailTemplate,
      false,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] F4: un dato corrupto en SQLite → 500 ERR-INTERNAL-UNEXPECTED controlado y la API sigue respondiendo', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    api.db.prepare('UPDATE pets SET data = ? WHERE id = ?').run('{corrupto', ARGOS_ID);
    const broken = await api.call('GET', '/api/pets', { cookie });
    const stillUp = await api.call('GET', '/api/auth/me', { cookie });
    expect([problemOf(broken), stillUp.status]).toEqual([{ status: 500, code: 'ERR-INTERNAL-UNEXPECTED' }, 200]);
  });
});
