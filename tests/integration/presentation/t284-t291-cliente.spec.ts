import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { PASSWORDS } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from '../api/api-harness.ts';
import { createWebApi, CSRF_PARAMS, unwrap, type ApiClient } from '../../../src/presentation/web/api.ts';
import { petFormBody } from '../../../src/presentation/web/components/PetForm.tsx';
import { petTransferCandidates } from '../../../src/presentation/web/components/TransferOwnership.tsx';
import { formValues, validateInput } from '../../../src/presentation/web/validation.ts';
import type { Schemas } from '../../../src/presentation/web/view-model.ts';

/** T284/T291: los cuerpos y llamadas que arma la SPA contra la API real (cliente generado, Fastify en 127.0.0.1). */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function clientFor(base: string, username: string): Promise<ApiClient> {
  const client = createWebApi(base);
  const login = await client.POST('/auth/login', { params: CSRF_PARAMS, body: { username, password: PASSWORDS[username]! } });
  const cookie = (login.response.headers.get('set-cookie') ?? '').split(';')[0]!;
  client.use({
    onRequest({ request }) {
      request.headers.set('cookie', cookie);
      return request;
    },
  });
  return client;
}

async function start(): Promise<string> {
  api = await createApi();
  await api.app.listen({ host: '127.0.0.1', port: 0 });
  return `http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}/api`;
}

describe('T284/T291 cuerpos del formulario y transferencias contra la API real', () => {
  it('[REQ-PET2-001][INV-PET2-001] alta OTHER con speciesOther, estimada, esterilizada y microchip; la edición a CANINE vacía los anulables con null', async () => {
    const andres = await clientFor(await start(), 'andres');
    const raw = { name: 'Puas', species: 'OTHER', speciesOther: 'Erizo', breed: 'Africano', birthDate: '2024-01-01', birthDateIsEstimate: 'true', sex: 'FEMALE', neutered: 'true', microchipId: '123456789012345' };
    const body = formValues(raw, [], ['birthDateIsEstimate', 'neutered']);
    expect(validateInput('CreatePetInput', body)).toEqual({});
    const created = await unwrap(andres.POST('/pets', { params: CSRF_PARAMS, body: petFormBody(null, body) as unknown as Schemas['CreatePetInput'] }));
    expect([created.species, created.speciesOther, created.birthDateIsEstimate, created.neutered, created.microchipId]).toEqual(['OTHER', 'Erizo', true, true, '123456789012345']);
    const editBody = petFormBody(created, formValues({ ...raw, species: 'RABBIT', speciesOther: '', neutered: '', microchipId: '' }, [], ['birthDateIsEstimate', 'neutered']));
    const edited = await unwrap(andres.PATCH('/pets/{petId}', { params: { ...CSRF_PARAMS, path: { petId: created.id } }, body: editBody as Schemas['UpdatePetInput'] }));
    expect([edited.species, edited.speciesOther, edited.neutered, edited.microchipId]).toEqual(['RABBIT', null, null, null]);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001][REQ-OWN-001] cambio de rol, transferencia de mascota (candidatos de la UI) y transferencia de hogar por los endpoints servidos', async () => {
    const base = await start();
    const andres = await clientFor(base, 'andres');
    const maria = await clientFor(base, 'maria.v');
    const created = await unwrap(andres.POST('/households', { params: CSRF_PARAMS, body: { name: 'Hogar T291' } }));
    const hid = created.household.id;
    await unwrap(andres.POST('/households/{householdId}/invitations', { params: { ...CSRF_PARAMS, path: { householdId: hid } }, body: { username: 'maria.v', roleOnJoin: 'READER' } }));
    await unwrap(maria.POST('/invitations/{householdId}/accept', { params: { ...CSRF_PARAMS, path: { householdId: hid } } }));
    const mariaId = (await unwrap(andres.GET('/households'))).find((v) => v.household.id === hid)!.members.find((m) => m.membership.username === 'maria.v')!.membership.userId;

    const changed = await unwrap(andres.PATCH('/households/{householdId}/members/{userId}', { params: { ...CSRF_PARAMS, path: { householdId: hid, userId: mariaId } }, body: { role: 'ADMIN' } }));
    expect(changed.membership.role).toBe('ADMIN');

    const pet = await unwrap(andres.POST('/pets', { params: CSRF_PARAMS, body: { name: 'Nala', species: 'CANINE', breed: 'Mestiza', birthDate: '2022-01-01', sex: 'FEMALE' } }));
    await unwrap(andres.PUT('/pets/{petId}/assignments/{householdId}', { params: { ...CSRF_PARAMS, path: { petId: pet.id, householdId: hid } } }));
    const views = await unwrap(andres.GET('/households'));
    expect(petTransferCandidates(views, new Set([hid]), pet.ownerUserId).map((c) => c.userId)).toEqual([mariaId]);
    const moved = await unwrap(andres.POST('/pets/{petId}/ownership-transfer', { params: { ...CSRF_PARAMS, path: { petId: pet.id } }, body: { targetUserId: mariaId } }));
    expect([moved.pet.ownerUserId, moved.prunedAssignments]).toEqual([mariaId, []]);

    const house = await unwrap(andres.POST('/households/{householdId}/ownership-transfer', { params: { ...CSRF_PARAMS, path: { householdId: hid } }, body: { targetUserId: mariaId } }));
    expect([house.isHouseholdOwner, house.myRole]).toEqual([false, 'ADMIN']);
  });
});
