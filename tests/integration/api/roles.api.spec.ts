import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { NEW_PET, USERS_BY_NAME } from './api-fixtures.ts';

/**
 * Feature 002 · T247: rutas de roles y propiedad por HTTP que no cubren las otras suites (H-T246-7).
 * PATCH /households/{id}/members/{userId}, POST /households/{id}/ownership-transfer, POST /pets/{id}/ownership-transfer
 * y las asignaciones (PUT idempotente, DELETE por quien no es el Propietario Legal).
 * Orden de la frontera: sesión, acceso (404/403) y después el cuerpo (422) en la transferencia de mascota, que es la
 * única de estas rutas con 422 declarado en el OpenAPI; el contrato no declara 422 para PATCH members (H-T246-5).
 */
let api: Api;
afterEach(async () => api?.close());

const idOf = (json: unknown) => (json as { id: string }).id;
const householdIdOf = (json: unknown) => (json as { household: { id: string } }).household.id;
const assignedIds = (json: unknown) => (json as Array<{ householdId: string }>).map((a) => a.householdId).sort();

async function newPet(cookie: string, name = 'Nala'): Promise<string> {
  return idOf((await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, name } })).json);
}
async function newHousehold(cookie: string, name = 'Hogar de roles'): Promise<string> {
  return householdIdOf((await api.call('POST', '/api/households', { cookie, body: { name } })).json);
}
async function inviteAndAccept(hid: string, ownerCookie: string, username: string, roleOnJoin: string): Promise<void> {
  await api.call('POST', `/api/households/${hid}/invitations`, { cookie: ownerCookie, body: { username, roleOnJoin } });
  await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
}

describe('PATCH /households/{id}/members/{userId} y POST /households/{id}/ownership-transfer', () => {
  it('[REQ-HOUSE2-002] el cambio de rol responde HouseholdMemberView con el miembro ACTIVE y el rol nuevo', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'lucia.r', 'CAREGIVER');
    const r = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.lucia}`, { cookie: andres, body: { role: 'ADMIN' } });
    const membership = (r.json as { membership: { userId: string; householdId: string; role: string; status: string } }).membership;
    expect([r.status, membership.userId, membership.householdId, membership.role, membership.status]).toEqual([200, USERS_BY_NAME.lucia, hid, 'ADMIN', 'ACTIVE']);
  });

  it('[REQ-HOUSE2-002][ERR-ACC-FORBIDDEN] un miembro Lector no cambia el rol de otro: 403 y el rol del otro sigue igual', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'lucia.r', 'READER');
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    const r = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.maria}`, { cookie: await api.login('lucia.r'), body: { role: 'ADMIN' } });
    const view = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('maria.v') });
    expect([problemOf(r), (view.json as { myRole: string }).myRole]).toEqual([{ status: 403, code: 'ERR-ACC-FORBIDDEN' }, 'CAREGIVER']);
  });

  it('[REQ-HOUSE2-002] sin sesión ambas rutas responden 401 ERR-AUTH-UNAUTHENTICATED', async () => {
    api = await createApi();
    const patch = await api.call('PATCH', `/api/households/${'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'}/members/${USERS_BY_NAME.maria}`, { body: { role: 'READER' } });
    const transfer = await api.call('POST', `/api/households/${'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'}/ownership-transfer`, { body: { targetUserId: USERS_BY_NAME.maria } });
    expect([problemOf(patch), problemOf(transfer)]).toEqual([
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[REQ-HOUSE2-002][REQ-OWN-001] transferir el hogar no poda asignaciones: Nala sigue asignada al hogar tras ceder la propiedad del hogar a maria.v', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const transferred = await api.call('POST', `/api/households/${hid}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: andres });
    expect([transferred.status, assignedIds(list.json)]).toEqual([200, [hid]]);
  });
});

describe('POST /pets/{petId}/ownership-transfer: orden de la frontera y resultado', () => {
  it('[REQ-OWN-001][ERR-PET-NOT-FOUND] quien no ve la mascota recibe 404 aunque el cuerpo sea inválido (el acceso va antes que el 422)', async () => {
    api = await createApi();
    const pet = await newPet(await api.login('andres'));
    const r = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: await api.login('lucia.r'), body: { basura: true } });
    expect(problemOf(r)).toEqual({ status: 404, code: 'ERR-PET-NOT-FOUND' });
  });

  it('[REQ-OWN-001][ERR-ACC-FORBIDDEN] una miembro que ve la mascota sin ser dueña recibe 403 aunque el cuerpo sea inválido y el dueño no cambia', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'ADMIN');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const r = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: await api.login('maria.v'), body: { basura: true } });
    const dash = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: andres });
    expect([problemOf(r), (dash.json as { profile: { ownerUserId: string } }).profile.ownerUserId]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      USERS_BY_NAME.andres,
    ]);
  });

  it('[REQ-OWN-001][ERR-SCHEMA-VALIDATION-FAILED] el dueño con cuerpo sin targetUserId o con campos extra recibe 422 de esquema', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const missing = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: {} });
    const extra = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria, extra: 1 } });
    expect([problemOf(missing), problemOf(extra)]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-OWN-001][ERR-OWN-TRANSFER-INVALID-TARGET] transferirse la mascota a sí mismo responde 422 ERR-OWN-TRANSFER-INVALID-TARGET', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const r = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.andres } });
    expect(problemOf(r)).toEqual({ status: 422, code: 'ERR-OWN-TRANSFER-INVALID-TARGET' });
  });

  it('[REQ-OWN-001][SC-016] el resultado trae la mascota con el dueño nuevo y prunedAssignments con el hogar podado; la asignación que sobrevive pasa a assignedByUserId = nuevo dueño', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const pet = await newPet(andres);
    const hMaria = await newHousehold(andres, 'Casa con María');
    await inviteAndAccept(hMaria, andres, 'maria.v', 'READER');
    const hLucia = await newHousehold(lucia, 'Casa de Lucía');
    await inviteAndAccept(hLucia, lucia, 'andres', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hMaria}`, { cookie: andres });
    await api.call('PUT', `/api/pets/${pet}/assignments/${hLucia}`, { cookie: andres });
    const r = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const body = r.json as { pet: { id: string; ownerUserId: string }; prunedAssignments: string[] };
    const rows = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: await api.login('maria.v') });
    expect([r.status, body.pet.id, body.pet.ownerUserId, body.prunedAssignments, rows.json]).toEqual([
      200,
      pet,
      USERS_BY_NAME.maria,
      [hLucia],
      [{ petId: pet, householdId: hMaria, assignedByUserId: USERS_BY_NAME.maria, assignedAt: (rows.json as Array<{ assignedAt: string }>)[0]!.assignedAt }],
    ]);
  });

  it('[REQ-OWN-001][INV-OWN2-001][ERR-ACC-FORBIDDEN] tras transferir, el dueño anterior que en el hogar compartido es solo CAREGIVER ya no edita la mascota: 403 (perder la propiedad revoca la edición)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const pet = await newPet(andres);
    const hid = await newHousehold(lucia, 'Casa de Lucía');
    await inviteAndAccept(hid, lucia, 'andres', 'CAREGIVER');
    await inviteAndAccept(hid, lucia, 'maria.v', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const transfer = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const edit = await api.call('PATCH', `/api/pets/${pet}`, { cookie: andres, body: { name: 'Otro' } });
    expect([transfer.status, (transfer.json as { prunedAssignments: string[] }).prunedAssignments, problemOf(edit)]).toEqual([200, [], { status: 403, code: 'ERR-ACC-FORBIDDEN' }]);
  });

  it('[REQ-OWN-001][REQ-RBAC-001] tras transferir, el dueño anterior conserva su rol en cada hogar: como ADMIN del hogar compartido sí edita los datos básicos de la mascota (200)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const edit = await api.call('PATCH', `/api/pets/${pet}`, { cookie: andres, body: { name: 'Otro' } });
    expect([edit.status, (edit.json as { name: string }).name]).toEqual([200, 'Otro']);
  });
});

describe('asignaciones: idempotencia y permisos', () => {
  it('[REQ-HOUSE2-003] asignar dos veces es idempotente: 200 ambas, una sola fila, mismo assignedAt y assignedByUserId = propietario', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    const first = await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const second = await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: andres });
    const row = first.json as { petId: string; householdId: string; assignedByUserId: string; assignedAt: string };
    expect([first.status, second.status, second.json, list.json]).toEqual([200, 200, row, [row]]);
    expect([row.petId, row.householdId, row.assignedByUserId]).toEqual([pet, hid, USERS_BY_NAME.andres]);
  });

  it('[REQ-HOUSE2-003][ERR-ACC-FORBIDDEN] una miembro que ve la mascota no asigna ni desasigna: 403 y la asignación sigue', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    const hid2 = await newHousehold(andres, 'Segundo hogar');
    await inviteAndAccept(hid, andres, 'maria.v', 'ADMIN');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const maria = await api.login('maria.v');
    const assign = await api.call('PUT', `/api/pets/${pet}/assignments/${hid2}`, { cookie: maria });
    const unassign = await api.call('DELETE', `/api/pets/${pet}/assignments/${hid}`, { cookie: maria });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: andres });
    expect([problemOf(assign), problemOf(unassign), assignedIds(list.json)]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      [hid],
    ]);
  });

  it('[REQ-HOUSE2-003][ERR-PET-NOT-FOUND] quien no ve la mascota recibe 404 al asignar, desasignar o listar', async () => {
    api = await createApi();
    const pet = await newPet(await api.login('andres'));
    const lucia = await api.login('lucia.r');
    const hid = await newHousehold(lucia);
    const calls = [
      await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: lucia }),
      await api.call('DELETE', `/api/pets/${pet}/assignments/${hid}`, { cookie: lucia }),
      await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: lucia }),
    ];
    expect(calls.map(problemOf)).toEqual(Array(3).fill({ status: 404, code: 'ERR-PET-NOT-FOUND' }));
  });
});

describe('lectura del hogar y de la ficha tras desasignar (H-T247-1, REQ-HOUSE2-004, INV-ACC2-001)', () => {
  it('[REQ-HOUSE2-004][ERR-PET-NOT-FOUND] tras DELETE de la asignación, el Lector no ve la mascota en GET /households/{id}/pets y su ficha responde 404', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'READER');
    const pet = await newPet(andres, 'Vista');
    const maria = await api.login('maria.v');
    const namesOf = async () => ((await api.call('GET', `/api/households/${hid}/pets`, { cookie: maria })).json as { pets: Array<{ profile: { name: string } }> }).pets.map((p) => p.profile.name);
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const before = [await namesOf(), (await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: maria })).status];
    await api.call('DELETE', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const after = [await namesOf(), problemOf(await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: maria }))];
    expect([before, after]).toEqual([[['Vista'], 200], [[], { status: 404, code: 'ERR-PET-NOT-FOUND' }]]);
  });
});
