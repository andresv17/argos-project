import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';

/**
 * Asignación inicial al crear una mascota (REQ-HOUSE2-003, INV-HOUSE-004, SC-017). `baseHouseholdId` del alta es una
 * asignación real: el dueño debe ser miembro ACTIVE del hogar; si no, 403 ERR-ACC-FORBIDDEN y la mascota no se crea
 * (misma transacción). Sin `baseHouseholdId`, el alta no asigna nada.
 */
let api: Api;
afterEach(async () => api?.close());

const idOf = (json: unknown) => (json as { id: string }).id;
const householdIdOf = (json: unknown) => (json as { household: { id: string } }).household.id;
const assignedHouseholds = (json: unknown) => (json as Array<{ householdId: string }>).map((a) => a.householdId).sort();
const petNames = (json: unknown) => (json as Array<{ profile: { name: string } }>).map((c) => c.profile.name).sort();

describe('alta de mascota con hogar base (REQ-HOUSE2-003, INV-HOUSE-004)', () => {
  it('[REQ-HOUSE2-003][SC-017] alta con baseHouseholdId de un hogar donde el dueño es miembro ACTIVE: 201 y la mascota queda asignada a ese hogar', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = householdIdOf((await api.call('POST', '/api/households', { cookie: andres, body: { name: 'Casa base' } })).json);
    const created = await api.call('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: 'Mimi', baseHouseholdId: hid } });
    const assignments = await api.call('GET', `/api/pets/${idOf(created.json)}/assignments`, { cookie: andres });
    expect([created.status, assignedHouseholds(assignments.json)]).toEqual([201, [hid]]);
  });

  it('[REQ-HOUSE2-003][ERR-ACC-FORBIDDEN] alta con baseHouseholdId de un hogar donde el dueño no es miembro: 403 y no se crea ninguna mascota', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const foreignHid = householdIdOf((await api.call('POST', '/api/households', { cookie: await api.login('lucia.r'), body: { name: 'Hogar de Lucía' } })).json);
    const before = petNames((await api.call('GET', '/api/pets', { cookie: andres })).json);
    const created = await api.call('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: 'Fantasma', baseHouseholdId: foreignHid } });
    const after = petNames((await api.call('GET', '/api/pets', { cookie: andres })).json);
    expect([problemOf(created), after]).toEqual([{ status: 403, code: 'ERR-ACC-FORBIDDEN' }, before]);
  });

  it('[REQ-HOUSE2-003] alta sin baseHouseholdId: 201 y ninguna asignación', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const created = await api.call('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: 'Solita' } });
    const assignments = await api.call('GET', `/api/pets/${idOf(created.json)}/assignments`, { cookie: andres });
    expect([created.status, assignedHouseholds(assignments.json)]).toEqual([201, []]);
  });
});
