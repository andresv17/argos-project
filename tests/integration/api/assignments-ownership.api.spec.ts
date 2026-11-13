import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { H1, LUNA_ID, NEW_PET, USERS_BY_NAME } from './api-fixtures.ts';

/**
 * Feature 002 · T239 (rojo): asignación mascota-hogar, desasignación, poda por salida, expulsión o eliminación del hogar
 * y transferencia de propiedad legal por HTTP (REQ-HOUSE2-003, REQ-OWN-001, INV-OWN2-001, SC-016, SC-017).
 * Cada prueba crea sus mascotas y hogares con el flujo real.
 * Cuerpos según pet.schema.json: TransferPetOwnershipInput {targetUserId}.
 * El OpenAPI no declara GET /pets/{petId}: el perfil y el dueño se leen del dashboard (profile.ownerUserId).
 */
let api: Api;
afterEach(async () => api?.close());

const idOf = (json: unknown) => (json as { id: string }).id;
const householdIdOf = (json: unknown) => (json as { household: { id: string } }).household.id;
const ownerOf = (json: unknown) => (json as { profile: { ownerUserId: string } }).profile.ownerUserId;
const assignedHouseholds = (json: unknown) => (json as Array<{ householdId: string }>).map((a) => a.householdId).sort();

async function newPet(cookie: string, name = 'Nala'): Promise<string> {
  const r = await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, name } });
  return idOf(r.json);
}
async function newHousehold(cookie: string, name = 'Hogar de asignación'): Promise<string> {
  const r = await api.call('POST', '/api/households', { cookie, body: { name } });
  return householdIdOf(r.json);
}
async function inviteAndAccept(hid: string, ownerCookie: string, username: string, roleOnJoin: string): Promise<void> {
  await api.call('POST', `/api/households/${hid}/invitations`, { cookie: ownerCookie, body: { username, roleOnJoin } });
  await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
}

describe('asignación de mascotas a hogares por HTTP (REQ-HOUSE2-003, SC-017)', () => {
  it('[REQ-HOUSE2-003][SC-017] Nala no es visible para una miembro ACTIVE hasta que el dueño la asigna al hogar: 404 antes, 200 después', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'READER');
    const maria = await api.login('maria.v');
    const before = problemOf(await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: maria }));
    const assigned = await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const after = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: maria });
    expect([before, assigned.status, after.status]).toEqual([{ status: 404, code: 'ERR-PET-NOT-FOUND' }, 200, 200]);
  });

  it('[REQ-HOUSE2-003][SC-017] desasignar retira la visibilidad: 204 y el miembro recibe 404 ERR-PET-NOT-FOUND', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'READER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const removed = await api.call('DELETE', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const hidden = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: await api.login('maria.v') });
    expect([removed.status, problemOf(hidden)]).toEqual([204, { status: 404, code: 'ERR-PET-NOT-FOUND' }]);
  });

  it('[REQ-HOUSE2-003][ERR-ACC-FORBIDDEN] asignar a un hogar donde el propietario no es miembro ACTIVE se rechaza con 403 y no escribe nada', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const foreignHousehold = await newHousehold(await api.login('lucia.r'), 'Hogar de Lucía');
    const r = await api.call('PUT', `/api/pets/${pet}/assignments/${foreignHousehold}`, { cookie: andres });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: andres });
    expect([problemOf(r), assignedHouseholds(list.json)]).toEqual([{ status: 403, code: 'ERR-ACC-FORBIDDEN' }, []]);
  });

  it('[REQ-HOUSE2-003][INV-OWN2-001] solo el Propietario Legal lista las asignaciones; una miembro ACTIVE que ve la mascota recibe 403', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'READER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: await api.login('maria.v') });
    expect(problemOf(list)).toEqual({ status: 403, code: 'ERR-ACC-FORBIDDEN' });
  });

  it('[REQ-HOUSE2-003] abandonar H1: maria.v deja el hogar (204) y se retira la asignación de Luna, su mascota, a H1', async () => {
    api = await createApi();
    const maria = await api.login('maria.v');
    await api.call('PUT', `/api/pets/${LUNA_ID}/assignments/${H1}`, { cookie: maria });
    const left = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.maria}`, { cookie: maria });
    const list = await api.call('GET', `/api/pets/${LUNA_ID}/assignments`, { cookie: maria });
    expect([left.status, assignedHouseholds(list.json).includes(H1)]).toEqual([204, false]);
  });

  it('[REQ-HOUSE2-003] expulsar a una miembro retira sus asignaciones: María, dueña de su mascota, la tenía en el hogar; tras la expulsión la lista del dueño no incluye el hogar', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    const mariaPet = await newPet(maria, 'Kira');
    await api.call('PUT', `/api/pets/${mariaPet}/assignments/${hid}`, { cookie: maria });
    const removed = await api.call('DELETE', `/api/households/${hid}/members/${USERS_BY_NAME.maria}`, { cookie: andres });
    const list = await api.call('GET', `/api/pets/${mariaPet}/assignments`, { cookie: maria });
    expect([removed.status, assignedHouseholds(list.json)]).toEqual([204, []]);
  });

  it('[REQ-HOUSE2-003] eliminar el hogar borra sus asignaciones y no toca la mascota: Nala sigue existiendo para su dueño (200)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const deleted = await api.call('DELETE', `/api/households/${hid}`, { cookie: andres });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: andres });
    const profile = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: andres });
    expect([deleted.status, assignedHouseholds(list.json), profile.status]).toEqual([204, [], 200]);
  });
});

describe('transferencia de propiedad legal por HTTP (REQ-OWN-001, SC-016, INV-OWN2-001)', () => {
  it('[REQ-OWN-001][SC-016] transferir Nala a maria.v (miembro ACTIVE del hogar donde está asignada) cambia el dueño de inmediato (200) y conserva la asignación', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    const transferred = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const profile = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: await api.login('maria.v') });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: await api.login('maria.v') });
    expect([transferred.status, ownerOf(profile.json), assignedHouseholds(list.json)]).toEqual([200, USERS_BY_NAME.maria, [hid]]);
  });

  it('[REQ-OWN-001][ERR-OWN-TRANSFER-INVALID-TARGET] transferir a carlos, que no es miembro ACTIVE de ningún hogar con la mascota, responde 422 y el dueño no cambia', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const r = await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.carlos } });
    const profile = await api.call('GET', `/api/pets/${pet}/dashboard`, { cookie: andres });
    expect([problemOf(r), ownerOf(profile.json)]).toEqual([{ status: 422, code: 'ERR-OWN-TRANSFER-INVALID-TARGET' }, USERS_BY_NAME.andres]);
  });

  it('[REQ-HOUSE2-003][REQ-OWN-001] transferir poda las asignaciones a hogares donde el nuevo dueño no es miembro ACTIVE: Nala queda solo en el hogar de maria.v', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const luciaCookie = await api.login('lucia.r');
    const pet = await newPet(andres);
    const hMaria = await newHousehold(andres, 'Casa compartida con María');
    await inviteAndAccept(hMaria, andres, 'maria.v', 'READER');
    const hLucia = await newHousehold(luciaCookie, 'Casa de Lucía');
    await inviteAndAccept(hLucia, luciaCookie, 'andres', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hMaria}`, { cookie: andres });
    await api.call('PUT', `/api/pets/${pet}/assignments/${hLucia}`, { cookie: andres });
    await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const list = await api.call('GET', `/api/pets/${pet}/assignments`, { cookie: await api.login('maria.v') });
    expect(assignedHouseholds(list.json)).toEqual([hMaria]);
  });

  it('[REQ-AUD-001][SC-016] la transferencia escribe una fila de auditoría OWNERSHIP_TRANSFER sobre la mascota (tabla audit_log, data-model.md §2.12)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const pet = await newPet(andres);
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, andres, 'maria.v', 'CAREGIVER');
    await api.call('PUT', `/api/pets/${pet}/assignments/${hid}`, { cookie: andres });
    await api.call('POST', `/api/pets/${pet}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const rows = api.db.prepare("SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'OWNERSHIP_TRANSFER' AND entity_type = 'PET' AND entity_id = ?").pluck().get(pet);
    expect(rows).toBe(1);
  });
});
