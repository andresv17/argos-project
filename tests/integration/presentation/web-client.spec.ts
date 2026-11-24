import type { AddressInfo } from 'node:net';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, PASSWORDS } from '../../fixtures/application-harness.ts';
import { activateAccount, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { createApi, type Api } from '../api/api-harness.ts';
import { ARGOS_ID, H1 } from '../api/api-fixtures.ts';
import { ApiProblem, createWebApi, CSRF_PARAMS, problemMessage, unwrap, type ApiClient } from '../../../src/presentation/web/api.ts';
import { PetCardList, PetFilter } from '../../../src/presentation/web/components/PetCards.tsx';
import { addRecord } from '../../../src/presentation/web/records.ts';
import { ownerBadge, type Species } from '../../../src/presentation/web/view-model.ts';

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
  expect([login.response.status, (login.data as { user?: { id: string } } | undefined)?.user?.id, cookie.startsWith('argos_session=')]).toEqual([200, ANDRES, true]);
  client.use({
    onRequest({ request }) {
      request.headers.set('cookie', cookie);
      return request;
    },
  });
  return client;
}

describe('cliente generado de la SPA contra la API real', () => {
  it('[REQ-UI-007][REQ-UI2-003] en "Mis mascotas" colorToken es null y en el hogar cada tarjeta trae su colorToken (OWNER_COLOR_1..8) con permissions por rol', async () => {
    const client = await loggedClient();
    const mine = await unwrap(client.GET('/pets'));
    const house = await unwrap(client.GET('/households/{householdId}/pets', { params: { path: { householdId: H1 } } }));
    const luna = house.pets.find((c) => c.profile.name === 'Luna')!;
    expect([
      mine.length > 0 && mine.every((c) => c.owner.colorToken === null && ownerBadge(c.owner).style === null),
      // La 002 muestra en "Mis mascotas" las propias y las visibles por hogar: el hogar H1 trae el mismo conjunto, ahora con color.
      house.pets.map((c) => c.profile.id).sort(),
      house.pets.every((c) => c.owner.colorToken !== null && ownerBadge(c.owner).style !== null),
      // Luna es de María: Andrés la ve como ADMIN (edita lo básico; no elimina ni transfiere) con el color 2 del dueño.
      [luna.owner.colorToken, luna.myRole, luna.permissions.editPetBasics, luna.permissions.deletePet, luna.permissions.transferPetOwnership],
    ]).toEqual([true, mine.map((c) => c.profile.id).sort(), true, ['OWNER_COLOR_2', 'ADMIN', true, false, false]]);
  });

  it('[REQ-UI-001] el filtro lo aplica la API en los dos contextos: "Mis mascotas" y el hogar (DEUDA-UI-FILTRO-001), con la misma normalización', async () => {
    const client = await loggedClient();
    const mine = await unwrap(client.GET('/pets', { params: { query: { q: 'ÁRG' } } }));
    const house = await unwrap(client.GET('/households/{householdId}/pets', { params: { path: { householdId: H1 }, query: { q: 'luná', species: 'FELINE' } } }));
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
      'undefined',
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
    // 009 (T1246): el alta nace PENDING y no inicia sesión (sin Set-Cookie); el arnés T1244 la activa y la persona entra con sus credenciales.
    expect(registered.response.headers.get('set-cookie')).toBeNull();
    await activateAccount(sqliteRunner(api!.db), 'sqlite', 'nuevo', '2026-11-23T10:00:00.000Z');
    const entered = await client.POST('/auth/login', { params: CSRF_PARAMS, body: { username: 'nuevo', password: 'Secreto2026!' } });
    const cookie = (entered.response.headers.get('set-cookie') ?? '').split(';')[0]!;
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

/** T284 — la UI de la Rebanada 6 consume el contrato 002 real: permissions, colorToken, 8 especies y mensajes humanos. */
describe('presentación de la Rebanada 6 contra la API real (T284)', () => {
  const noop = (): void => undefined;
  const NEW_SPECIES: ReadonlyArray<readonly [Species, string]> = [
    ['RABBIT', 'Copito'],
    ['FERRET', 'Hurón Uno'],
    ['BIRD', 'Piolín'],
    ['REPTILE', 'Rex'],
    ['SMALL_MAMMAL', 'Hamtaro'],
    ['OTHER', 'Axel'],
  ];

  it('[REQ-UI2-002][REQ-PET2-002] la UI ofrece los cinco filtros del contrato y la API real filtra por ellos con la misma semántica (Otros = resto de especies)', async () => {
    const client = await loggedClient();
    for (const [species, name] of NEW_SPECIES) {
      const body = { name, species, speciesOther: species === 'OTHER' ? 'Axolote' : null, breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE' as const, avatarUrl: null };
      await unwrap(client.POST('/pets', { params: CSRF_PARAMS, body: body as never }));
    }
    const names = async (filter: 'ALL' | 'CANINE' | 'FELINE' | 'OTHERS' | 'WITH_ALERTS') => (await unwrap(client.GET('/pets', { params: { query: { filter } } }))).map((c) => c.profile.name);
    const markup = renderToStaticMarkup(h(PetFilter, { q: '', species: '', onChange: noop }));
    const texts = [...markup.matchAll(/>([^<>]+)</g)].map((m) => (m[1] ?? '').trim());
    const labels = ['Todos', 'Perros', 'Gatos', 'Otros', 'Con alertas sanitarias'];
    const otherNames = (await names('OTHERS')).sort();
    expect({ offered: texts.filter((t) => labels.includes(t)), others: otherNames }).toEqual({ offered: labels, others: NEW_SPECIES.map(([, n]) => n).sort() });
  });

  it('[REQ-UI2-003][INV-HOUSE-005] las tarjetas reales del hogar muestran «Dueño: [Nombre]» con el color de la API y «Solo lectura» solo si todos los permisos de escritura son falsos', async () => {
    const client = await loggedClient();
    const house = await unwrap(client.GET('/households/{householdId}/pets', { params: { path: { householdId: H1 } } }));
    const markup = renderToStaticMarkup(h(PetCardList, { cards: house.pets, activePetId: null, onSelect: noop }));
    const isReadOnly = (c: (typeof house.pets)[number]): boolean => !c.permissions.editPetBasics && !c.permissions.writeHealthEvents && !c.permissions.writeWeightsAndMeasurements && !c.permissions.writeAppointmentsAndParameters;
    const observed = house.pets.map((c) => {
      const li = new RegExp(`data-pet-id="${c.profile.id}"[\\s\\S]*?</li>`).exec(markup)?.[0] ?? '';
      return [c.profile.name, c.myRole, li.includes(`data-owner-badge="${c.owner.colorToken}"`), li.includes(`Dueño: ${c.owner.displayName}`), li.includes('Solo lectura')];
    });
    expect(observed).toEqual(house.pets.map((c) => [c.profile.name, c.myRole, true, true, isReadOnly(c)]));
    expect(house.pets.map((c) => c.myRole)).toContain('ADMIN');
  });

  it('[REQ-UI-005][ERR-SCHEMA-VALIDATION-FAILED] el rechazo real del registro con un usuario inválido llega a la UI sin el texto técnico del esquema formal', async () => {
    const client = createWebApi(await baseUrl());
    const error = await unwrap(client.POST('/auth/register', { params: CSRF_PARAMS, body: { username: 'con espacios', displayName: 'X', password: 'Secreto2026!', confirmPassword: 'Secreto2026!' } })).catch((e: unknown) => e);
    const shown = error instanceof ApiProblem ? [error.problem.code, problemMessage(error.problem).includes('El payload incumple el esquema formal')] : null;
    expect(shown).toEqual(['ERR-SCHEMA-VALIDATION-FAILED', false]);
  });
});
