import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { ARGOS_ID } from './api-fixtures.ts';

/**
 * T1617 (Feature 012, Bloque A, #22; `/keymaker`): rutas HTTP de co-propiedad y de solicitudes sobre la API real y SQLite. El OpenAPI de la 012 no está cableado en el arnés de contrato de
 * la 002/004 (que solo conoce sus operaciones), por eso las llamadas llevan `contract: false`; el contrato de la 012 lo cubren los esquemas de `src/generated/v38` dentro de los casos de uso.
 *
 * @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004, ERR-SCHEMA-VALIDATION-FAILED, ERR-RATE-LIMITED
 * Cubre SC-012-001, SC-012-004, SC-012-075 (HTTP), B-3.
 */
let api: Api;
afterEach(async () => api.close());

const NO_CONTRACT = { contract: false } as const;

describe('co-propiedad por HTTP (src/infrastructure/http/routes/co-ownership.routes.ts)', () => {
  it('[B-3][REQ-OWN12-004] POST /pets/{id}/owner-requests con un único propietario ACTIVE responde 422 ERR-SCHEMA-VALIDATION-FAILED (nunca 400 ni ERR-VALIDATION)', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const response = await api.call('POST', `/api/pets/${ARGOS_ID}/owner-requests`, { cookie, body: { action: 'DELETE_PET' }, ...NO_CONTRACT });
    expect(problemOf(response)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    const malformed = await api.call('POST', `/api/pets/${ARGOS_ID}/owner-requests`, { cookie, body: { action: 'NOPE' }, ...NO_CONTRACT });
    expect(problemOf(malformed)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });

  it('[REQ-OWN12-002][SC-012-001][SC-012-075] invitar da 202 uniforme (username inexistente o existente); la co-propiedad aparece tras aceptar por HTTP', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const missing = await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners`, { cookie: andres, body: { username: 'zz.nadie' }, ...NO_CONTRACT });
    const existing = await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners`, { cookie: andres, body: { username: 'lucia.r' }, ...NO_CONTRACT });
    expect([missing.status, existing.status, existing.json]).toEqual([202, 202, missing.json]);
    const lucia = await api.login('lucia.r');
    const invitations = await api.call('GET', '/api/co-owner-invitations', { cookie: lucia, ...NO_CONTRACT });
    const list = invitations.json as Array<{ coOwnerId: string; petName: string }>;
    expect(list).toHaveLength(1);
    expect((await api.call('GET', `/api/pets/${ARGOS_ID}/ownership`, { cookie: lucia, ...NO_CONTRACT })).status).toBe(404);
    const accepted = await api.call('POST', `/api/co-owner-invitations/${list[0]!.coOwnerId}/accept`, { cookie: lucia, ...NO_CONTRACT });
    expect(accepted.status).toBe(200);
    const ownership = await api.call('GET', `/api/pets/${ARGOS_ID}/ownership`, { cookie: lucia, ...NO_CONTRACT });
    expect(ownership.status).toBe(200);
  });

  it('[INV-OWN12-004][H-05] un tercero (miembro de hogar incluido) recibe 404 uniforme, nunca 403, en ownership, invitar, solicitar y salir; sin sesión 401', async () => {
    api = await createApi();
    const maria = await api.login('maria.v'); // miembro ACTIVE del hogar con ARGOS asignada, no propietaria
    const statuses = [
      (await api.call('GET', `/api/pets/${ARGOS_ID}/ownership`, { cookie: maria, ...NO_CONTRACT })).status,
      (await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners`, { cookie: maria, body: { username: 'lucia.r' }, ...NO_CONTRACT })).status,
      (await api.call('POST', `/api/pets/${ARGOS_ID}/owner-requests`, { cookie: maria, body: { action: 'DELETE_PET' }, ...NO_CONTRACT })).status,
      (await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners/leave`, { cookie: maria, body: {}, ...NO_CONTRACT })).status,
    ];
    expect(statuses).toEqual([404, 404, 404, 404]);
    expect((await api.call('GET', '/api/owner-requests', { cookie: null, ...NO_CONTRACT })).status).toBe(401);
    const missing = await api.call('GET', '/api/owner-requests/99999999-9999-4999-8999-999999999999', { cookie: maria, ...NO_CONTRACT });
    expect(problemOf(missing)).toEqual({ status: 404, code: 'ERR-PET-NOT-FOUND' });
  });

  it('[H-02][SC-012-075] el sexto intento de invitar en el día responde 429 ERR-RATE-LIMITED por HTTP', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    for (let i = 0; i < 5; i += 1) expect((await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners`, { cookie, body: { username: `zz.nadie.${i}` }, ...NO_CONTRACT })).status).toBe(202);
    const sixth = await api.call('POST', `/api/pets/${ARGOS_ID}/co-owners`, { cookie, body: { username: 'zz.nadie.6' }, ...NO_CONTRACT });
    expect(problemOf(sixth)).toEqual({ status: 429, code: 'ERR-RATE-LIMITED' });
  });
});
