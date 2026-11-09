import { afterEach, describe, expect, it } from 'vitest';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from '../api/api-harness.ts';
import { ARGOS_ID, H1, NEW_PET, RECORD_INPUTS } from '../api/api-fixtures.ts';
import { OPERATIONS, checkResponse } from './openapi-contract.ts';

/** TASK-111: cada operación del OpenAPI está implementada y sus respuestas reales cumplen el contrato. */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

describe('TASK-111: conformidad de la API con contracts/openapi/pet-tracker-api.openapi.yaml', () => {
  it('[REQ-AUTH-001][REQ-PET-001][REQ-HOUSE-001][REQ-BACKUP-001] cada una de las 27 operaciones del OpenAPI tiene su ruta en Fastify', async () => {
    api = await createApi();
    const missing = OPERATIONS.filter((op) => !api!.app.hasRoute({ method: op.method as 'GET', url: op.path.replace(/\{([^}]+)\}/g, ':$1') }));
    expect([OPERATIONS.length, missing.map((op) => op.operationId)]).toEqual([27, []]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] el validador del contrato rechaza un estado no declarado, un cuerpo que no cumple el esquema y una ruta inexistente', () => {
    expect([
      checkResponse('GET', '/api/auth/me', 418, 'application/json', {}).errors,
      checkResponse('GET', '/api/auth/me', 200, 'application/json', { user: { id: 'x' } }).errors.length > 0,
      checkResponse('GET', '/api/auth/me', 401, 'application/json', {}).errors,
      checkResponse('GET', '/api/nada', 200, 'application/json', {}).errors,
    ]).toEqual([
      ['getCurrentSession: estado 418 no declarado (200, 401, 500)'],
      true,
      ['getCurrentSession: content-type application/json en vez de application/problem+json'],
      ['sin operación en el OpenAPI para GET /api/nada'],
    ]);
  });

  it('[REQ-AUTH-002][REQ-PET-003][REQ-REC-001][REQ-HOUSE-005][REQ-BACKUP-002] recorrido feliz por las 27 operaciones: todas responden lo que declara el OpenAPI', async () => {
    api = await createApi();
    const seen = new Set<string>();
    const call: Api['call'] = async (method, url, options = {}) => {
      const response = await api!.call(method, url, options);
      seen.add(checkResponse(method, url, response.status, response.headers['content-type'] as string | undefined, response.json ?? (response.text || undefined)).operationId!);
      return response;
    };
    const statuses: number[] = [];
    const step = async (method: string, url: string, options: Parameters<Api['call']>[2] = {}) => {
      const r = await call(method, url, options);
      statuses.push(r.status);
      return r;
    };
    const lucia = (await step('POST', '/api/auth/register', { body: { username: 'Nueva.Usuaria', displayName: 'Nueva', password: 'Clave2026x' } })).cookie!;
    const andres = (await step('POST', '/api/auth/login', { body: { username: 'andres', password: 'Argos2026a' } })).cookie!;
    const carlos = await api.login('carlos_88');
    await step('GET', '/api/auth/me', { cookie: andres });
    await step('GET', '/api/pets?q=arg&species=DOG', { cookie: andres });
    const created = (await step('POST', '/api/pets', { cookie: andres, body: NEW_PET })).json as { id: string };
    await step('PATCH', `/api/pets/${created.id}`, { cookie: andres, body: { breed: 'Criolla' } });
    await step('GET', `/api/pets/${ARGOS_ID}/dashboard`, { cookie: andres });
    for (const [path, body] of Object.entries(RECORD_INPUTS)) await step('POST', `/api/pets/${ARGOS_ID}/records/${path}`, { cookie: andres, body });
    await step('DELETE', `/api/pets/${created.id}`, { cookie: andres });
    await step('GET', '/api/households', { cookie: andres });
    const house = (await step('POST', '/api/households', { cookie: lucia, body: { name: 'Casa Nueva' } })).json as { household: { id: string } };
    await step('GET', `/api/households/${H1}`, { cookie: andres });
    await step('GET', `/api/households/${H1}/pets`, { cookie: andres });
    await step('POST', `/api/households/${house.household.id}/invitations`, { cookie: lucia, body: { username: 'carlos_88' } });
    await step('GET', '/api/invitations', { cookie: carlos });
    await step('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    await step('POST', `/api/invitations/${house.household.id}/decline`, { cookie: carlos });
    await step('DELETE', `/api/households/${H1}/members/${canonicalState().users[2]!.id}`, { cookie: andres });
    await step('DELETE', `/api/households/${house.household.id}`, { cookie: lucia });
    const exported = await step('GET', '/api/backup/export', { cookie: andres });
    await step('POST', '/api/backup/import', { cookie: andres, raw: exported.text });
    await step('POST', '/api/auth/logout', { cookie: andres });
    expect([[...seen].sort(), statuses.every((s) => s < 300)]).toEqual([OPERATIONS.map((op) => op.operationId).sort(), true]);
  });
});
