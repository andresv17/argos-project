import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, PASSWORDS } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from '../api/api-harness.ts';
import { ARGOS_ID, H1 } from '../api/api-fixtures.ts';
import { ApiProblem, createWebApi, CSRF_PARAMS, unwrap, type ApiClient } from '../../../src/presentation/web/api.ts';
import { addRecord } from '../../../src/presentation/web/records.ts';
import { ownerBadge } from '../../../src/presentation/web/view-model.ts';

/**
 *: la SPA usa el cliente generado contra la API real (Fastify escuchando en 127.0.0.1).
 * En Node no hay almacén de cookies: un middleware reenvía la cookie de sesión, como haría el navegador.
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function baseUrl(): Promise<string> {
  api = await createApi();
  await api.app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = api.app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api`;
}

async function loggedClient(): Promise<ApiClient> {
  const client = createWebApi(await baseUrl());
  const login = await client.POST('/auth/login', { params: CSRF_PARAMS, body: { username: 'andres', password: PASSWORDS['andres']! } });
  const cookie = (login.response.headers.get('set-cookie') ?? '').split(';')[0]!;
  expect([login.response.status, login.data?.user.id, cookie.startsWith('argos_session=')]).toEqual([200, ANDRES, true]);
  client.use({
    onRequest({ request }) {
      request.headers.set('cookie', cookie);
      return request;
    },
  });
  return client;
}

describe('cliente generado de la SPA contra la API real', () => {
  it('[REQ-UI-007] en "Mis mascotas" colorToken es null y en el hogar cada tarjeta trae su colorToken', async () => {
    const client = await loggedClient();
    const mine = await unwrap(client.GET('/pets'));
    const house = await unwrap(client.GET('/households/{householdId}/pets', { params: { path: { householdId: H1 } } }));
    expect([
      mine.length > 0 && mine.every((c) => c.owner.colorToken === null && ownerBadge(c.owner).style === null),
      house.pets.length > mine.length && house.pets.every((c) => c.owner.colorToken !== null && ownerBadge(c.owner).style !== null),
      house.pets.some((c) => !c.permissions.editPetBasics),
    ]).toEqual([true, true, true]);
  });

  it('[REQ-UI-001] el filtro lo aplica la API en los dos contextos: "Mis mascotas" y el hogar (DEUDA-UI-FILTRO-001), con la misma normalización', async () => {
    const client = await loggedClient();
    const mine = await unwrap(client.GET('/pets', { params: { query: { q: 'ÁRG' } } }));
    const house = await unwrap(client.GET('/households/{householdId}/pets', { params: { path: { householdId: H1 }, query: { q: 'luná', species: 'CAT' } } }));
    expect([mine.map((c) => c.profile.name), house.pets.map((c) => [c.profile.name, c.owner.colorToken])]).toEqual([['Argos'], [['Luna', 'OWNER_COLOR_2']]]);
  });

  it('[REQ-UI-002] un alta desde los formularios de la ficha llega a la API y la ficha devuelve la serie con variación', async () => {
    const client = await loggedClient();
    const dashboard = () => unwrap(client.GET('/pets/{petId}/dashboard', { params: { path: { petId: ARGOS_ID } } }));
    const before = await dashboard();
    await addRecord(client, 'weights', ARGOS_ID, { recordedAt: '2026-11-04', weightKg: 33.1 });
    const after = await dashboard();
    expect([after.weights.length - before.weights.length, after.weights[0]?.record.weightKg, typeof after.weights[0]?.deltaKg, typeof (after.weights[0] as { deltaPercent?: unknown } | undefined)?.deltaPercent]).toEqual([
      1,
      33.1,
      'number',
      'number',
    ]);
  });

  it('[REQ-UI-005][ERR-AUTH-UNAUTHENTICATED] sin sesión la API responde ERR-AUTH-UNAUTHENTICATED y la SPA lo recibe como ApiProblem', async () => {
    const client = createWebApi(await baseUrl());
    const error = await unwrap(client.GET('/auth/me')).catch((e: unknown) => e);
    expect(error instanceof ApiProblem ? [error.problem.status, error.problem.code] : null).toEqual([401, 'ERR-AUTH-UNAUTHENTICATED']);
  });

  it('[REQ-UI-005][REQ-AUTH-004] la sesión de la SPA: registro con la política nueva, recarga con GET /auth/me y logout por el cliente generado', async () => {
    const client = createWebApi(await baseUrl());
    const registered = await client.POST('/auth/register', { params: CSRF_PARAMS, body: { username: 'nuevo', displayName: 'Nuevo', password: 'Secreto2026!', confirmPassword: 'Secreto2026!' } });
    const cookie = (registered.response.headers.get('set-cookie') ?? '').split(';')[0]!;
    const me = await client.GET('/auth/me', { headers: { cookie } });
    const out = await client.POST('/auth/logout', { params: CSRF_PARAMS, headers: { cookie } });
    const after = await client.GET('/auth/me', { headers: { cookie } });
    expect([registered.response.status, me.data?.user.username, me.data?.user.preferredLanguage, out.response.status, after.response.status]).toEqual([201, 'nuevo', 'es', 204, 401]);
  });

  it('[REQ-UI-005][ERR-AUTH-WEAK-PASSWORD] el cliente generado recibe ERR-AUTH-WEAK-PASSWORD como ApiProblem con el campo password', async () => {
    const client = createWebApi(await baseUrl());
    const error = await unwrap(client.POST('/auth/register', { params: CSRF_PARAMS, body: { username: 'debil', displayName: 'Débil', password: 'corta', confirmPassword: 'corta' } })).catch((e: unknown) => e);
    expect(error instanceof ApiProblem ? [error.problem.status, error.problem.code, error.problem.field] : null).toEqual([422, 'ERR-AUTH-WEAK-PASSWORD', 'password']);
  });
});
