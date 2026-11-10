import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { H1, USERS_BY_NAME } from './api-fixtures.ts';

/**: rutas `households` sobre la API real y SQLite. Casa Vallejo: Andrés OWNER, María ACTIVE, Carlos INVITED. */
let api: Api;
afterEach(async () => api.close());

const statuses = (json: unknown) => (json as { members: Array<{ membership: { status: string } }> }).members.map((m) => m.membership.status);

describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)', () => {
  it('[REQ-HOUSE-001] crear un hogar → 201 con el creador como OWNER ACTIVE; aparece en GET /households', async () => {
    api = await createApi();
    const cookie = await api.login('lucia.r');
    const created = await api.call('POST', '/api/households', { cookie, body: { name: 'Casa Rivas' } });
    const list = await api.call('GET', '/api/households', { cookie });
    const view = created.json as { myRole: string; household: { name: string; ownerUserId: string } };
    expect([created.status, view.myRole, view.household.ownerUserId, statuses(created.json), (list.json as unknown[]).length]).toEqual([
      201,
      'OWNER',
      USERS_BY_NAME.lucia,
      ['ACTIVE'],
      1,
    ]);
  });

  it('[REQ-HOUSE-004][ERR-HOUSE-NOT-FOUND] D-01: EDGE-037 un INVITED recibe 404; EDGE-038 el OWNER ve INVITED en members y un MEMBER solo ACTIVE', async () => {
    api = await createApi();
    const owner = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('andres') });
    const member = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('maria.v') });
    const invited = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('carlos_88') });
    const stranger = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('lucia.r') });
    expect([statuses(owner.json), statuses(member.json), problemOf(invited), problemOf(stranger)]).toEqual([
      ['ACTIVE', 'ACTIVE', 'INVITED'],
      ['ACTIVE', 'ACTIVE'],
      { status: 404, code: 'ERR-HOUSE-NOT-FOUND' },
      { status: 404, code: 'ERR-HOUSE-NOT-FOUND' },
    ]);
  });

  it('[REQ-HOUSE-005][ERR-HOUSE-NOT-FOUND] mascotas del hogar: los miembros ACTIVE ven las de todos con dueño y color; un INVITED recibe 404 (EDGE-017)', async () => {
    api = await createApi();
    const member = await api.call('GET', `/api/households/${H1}/pets`, { cookie: await api.login('maria.v') });
    const invited = await api.call('GET', `/api/households/${H1}/pets`, { cookie: await api.login('carlos_88') });
    const pets = (member.json as { pets: Array<{ profile: { name: string }; owner: { colorToken: string | null } }> }).pets;
    expect([pets.map((p) => p.profile.name).sort(), pets.every((p) => p.owner.colorToken !== null), problemOf(invited)]).toEqual([
      ['Argos', 'Kira', 'Luna', 'Milo', 'Nyx', 'Toby'],
      true,
      { status: 404, code: 'ERR-HOUSE-NOT-FOUND' },
    ]);
  });

  it('[REQ-PET-005][REQ-UI-001] DEUDA-UI-FILTRO-001: GET /households/{id}/pets filtra por q (sin mayúsculas ni tildes) y species sin cambiar los colores de dueño', async () => {
    api = await createApi();
    const cookie = await api.login('maria.v');
    const view = async (query: string) =>
      ((await api.call('GET', `/api/households/${H1}/pets${query}`, { cookie })).json as { pets: Array<{ profile: { name: string }; owner: { colorToken: string } }> }).pets.map(
        (p) => `${p.profile.name}:${p.owner.colorToken}`,
      );
    expect([await view('?q=LÚNA'), await view('?species=CAT'), await view('?q=y&species=CAT'), await view('?q=zz')]).toEqual([
      ['Luna:OWNER_COLOR_2'],
      ['Milo:OWNER_COLOR_1', 'Nyx:OWNER_COLOR_1', 'Luna:OWNER_COLOR_2'],
      ['Nyx:OWNER_COLOR_1'],
      [],
    ]);
  });

  it('[REQ-PET-005][ERR-SCHEMA-VALIDATION-FAILED] consulta inválida en el hogar → 422 para un miembro; quien no ve el hogar recibe 404 antes (D-108-4)', async () => {
    api = await createApi();
    const member = await api.login('maria.v');
    const invited = await api.login('carlos_88');
    const results = [];
    for (const query of [`?q=${'a'.repeat(51)}`, '?species=BIRD', '?otro=1', '?q=a&q=b']) {
      results.push([
        query.slice(0, 12),
        problemOf(await api.call('GET', `/api/households/${H1}/pets${query}`, { cookie: member })),
        problemOf(await api.call('GET', `/api/households/${H1}/pets${query}`, { cookie: invited })),
      ]);
    }
    expect(results).toEqual(
      ['?q=aaaaaaaaa', '?species=BIR', '?otro=1', '?q=a&q=b'].map((q) => [q, { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }]),
    );
  });

  it('[REQ-HOUSE-002] invitar: 201 INVITED; usuario inexistente → 404; ya INVITED → 409 (EDGE-016); un MEMBER no puede invitar → 403', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const ok = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: ' Lucia.R ' } });
    const ghost = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'nadie.x' } });
    const duplicate = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'carlos_88' } });
    const byMember = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: await api.login('maria.v'), body: { username: 'lucia.r' } });
    expect([ok.status, (ok.json as { membership: { status: string; userId: string } }).membership, problemOf(ghost), problemOf(duplicate), problemOf(byMember)]).toEqual([
      201,
      expect.objectContaining({ status: 'INVITED', userId: USERS_BY_NAME.lucia }),
      { status: 404, code: 'ERR-AUTH-USER-NOT-FOUND' },
      { status: 409, code: 'ERR-HOUSE-MEMBER-ALREADY-EXISTS' },
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
    ]);
  });

  it('[REQ-HOUSE-003] invitaciones: Carlos ve la suya, la acepta (200, ACTIVE) y luego ve el hogar; sin invitación → 404, nunca 403 (EDGE-026, EDGE-027)', async () => {
    api = await createApi();
    const carlos = await api.login('carlos_88');
    const inbox = await api.call('GET', '/api/invitations', { cookie: carlos });
    const accepted = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const nowVisible = await api.call('GET', `/api/households/${H1}`, { cookie: carlos });
    const luciaAccept = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: await api.login('lucia.r') });
    const mariaDecline = await api.call('POST', `/api/invitations/${H1}/decline`, { cookie: await api.login('maria.v') });
    expect([
      (inbox.json as Array<{ household: { id: string } }>).map((i) => i.household.id),
      accepted.status,
      (accepted.json as { membership: { status: string } }).membership.status,
      nowVisible.status,
      problemOf(luciaAccept),
      problemOf(mariaDecline),
    ]).toEqual([[H1], 200, 'ACTIVE', 200, { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' }, { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' }]);
  });

  it('[REQ-HOUSE-003] rechazar la invitación → 204 y deja de aparecer en la bandeja', async () => {
    api = await createApi();
    const carlos = await api.login('carlos_88');
    const declined = await api.call('POST', `/api/invitations/${H1}/decline`, { cookie: carlos });
    const inbox = await api.call('GET', '/api/invitations', { cookie: carlos });
    expect([declined.status, inbox.json]).toEqual([204, []]);
  });

  it('[REQ-HOUSE-004][ERR-HOUSE-MEMBERSHIP-NOT-FOUND] bajas: el OWNER retira a María y cancela a Carlos (204); Lucía sin membresía → 404 (EDGE-025); el OWNER no puede irse (EDGE-015)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const member = (name: keyof typeof USERS_BY_NAME) => `/api/households/${H1}/members/${USERS_BY_NAME[name]}`;
    const removed = await api.call('DELETE', member('maria'), { cookie: andres });
    const cancelled = await api.call('DELETE', member('carlos'), { cookie: andres });
    const missing = await api.call('DELETE', member('lucia'), { cookie: andres });
    const ownerLeaves = await api.call('DELETE', member('andres'), { cookie: andres });
    const view = await api.call('GET', `/api/households/${H1}`, { cookie: andres });
    expect([removed.status, cancelled.status, problemOf(missing), problemOf(ownerLeaves), statuses(view.json)]).toEqual([
      204,
      204,
      { status: 404, code: 'ERR-HOUSE-MEMBERSHIP-NOT-FOUND' },
      { status: 409, code: 'ERR-HOUSE-OWNER-CANNOT-LEAVE' },
      ['ACTIVE'],
    ]);
  });

  it('[REQ-HOUSE-004][ERR-HOUSE-NOT-FOUND] María abandona el hogar (204) y deja de verlo; quien no es miembro ACTIVE recibe 404 al dar de baja a otro', async () => {
    api = await createApi();
    const maria = await api.login('maria.v');
    const left = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.maria}`, { cookie: maria });
    const after = await api.call('GET', `/api/households/${H1}`, { cookie: maria });
    const stranger = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: await api.login('lucia.r') });
    expect([left.status, problemOf(after), problemOf(stranger)]).toEqual([204, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }]);
  });

  it('[REQ-HOUSE-004] C5: el OWNER borra el hogar (204), se borran sus membresías y las mascotas quedan; un MEMBER recibe 403', async () => {
    api = await createApi();
    const petsBefore = api.db.prepare('SELECT COUNT(*) FROM pets').pluck().get();
    const byMember = await api.call('DELETE', `/api/households/${H1}`, { cookie: await api.login('maria.v') });
    const byOwner = await api.call('DELETE', `/api/households/${H1}`, { cookie: await api.login('andres') });
    const counts = ['households', 'household_members', 'pets'].map((t) => api.db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get());
    expect([problemOf(byMember), byOwner.status, counts]).toEqual([{ status: 403, code: 'ERR-ACC-FORBIDDEN' }, 204, [0, 0, petsBefore]]);
  });
});
