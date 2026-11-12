import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { H1, USERS_BY_NAME } from './api-fixtures.ts';

/**: rutas `households` sobre la API real y SQLite. Casa Vallejo: Andrés OWNER, María ACTIVE, Carlos INVITED. */
let api: Api;
afterEach(async () => api.close());

const statuses = (json: unknown) => (json as { members: Array<{ membership: { status: string } }> }).members.map((m) => m.membership.status);

describe('hogares por HTTP (src/infrastructure/http/routes/households.routes.ts)', () => {
  it('[REQ-HOUSE-001] crear un hogar → 201 con el creador como propietario con rol ADMIN ACTIVE; aparece en GET /households', async () => {
    api = await createApi();
    const cookie = await api.login('lucia.r');
    const created = await api.call('POST', '/api/households', { cookie, body: { name: 'Casa Rivas' } });
    const list = await api.call('GET', '/api/households', { cookie });
    const view = created.json as { myRole: string; household: { name: string; ownerUserId: string } };
    expect([created.status, view.myRole, view.household.ownerUserId, statuses(created.json), (list.json as unknown[]).length]).toEqual([
      201,
      'ADMIN',
      USERS_BY_NAME.lucia,
      ['ACTIVE'],
      1,
    ]);
  });

  it('[REQ-HOUSE-004][ERR-HOUSE-NOT-FOUND] D-01: EDGE-037 un INVITED recibe 404; EDGE-038 members solo lista ACTIVE y el OWNER ve la invitación INVITED en pendingInvitations; un MEMBER solo ACTIVE', async () => {
    api = await createApi();
    const owner = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('andres') });
    const member = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('maria.v') });
    const invited = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('carlos_88') });
    const stranger = await api.call('GET', `/api/households/${H1}`, { cookie: await api.login('lucia.r') });
    const pending = (json: unknown) => (json as { pendingInvitations: Array<{ inviteeUsername: string; status: string }> }).pendingInvitations.map((i) => `${i.inviteeUsername}:${i.status}`);
    expect([statuses(owner.json), pending(owner.json), statuses(member.json), problemOf(invited), problemOf(stranger)]).toEqual([
      ['ACTIVE', 'ACTIVE'],
      ['carlos_88:INVITED'],
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
    expect([await view('?q=LÚNA'), await view('?species=FELINE'), await view('?q=y&species=FELINE'), await view('?q=zz')]).toEqual([
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
    for (const query of [`?q=${'a'.repeat(51)}`, '?species=DRAGON', '?otro=1', '?q=a&q=b']) {
      results.push([
        query.slice(0, 12),
        problemOf(await api.call('GET', `/api/households/${H1}/pets${query}`, { cookie: member })),
        problemOf(await api.call('GET', `/api/households/${H1}/pets${query}`, { cookie: invited })),
      ]);
    }
    expect(results).toEqual(
      ['?q=aaaaaaaaa', '?species=DRA', '?otro=1', '?q=a&q=b'].map((q) => [q, { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }]),
    );
  });

  it('[REQ-HOUSE2-001][INV-AUTH-006][INV-HOUSE-003] invitar responde 202 {received:true} idéntico exista o no el username, ya sea miembro o ya invitado, sin revelar nada', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const invite = (username: string) => api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username, roleOnJoin: 'CAREGIVER' } });
    const responses = [await invite('lucia.r'), await invite('nadie.x'), await invite('maria.v'), await invite('carlos_88'), await invite('lucia.r')];
    const shape = (r: (typeof responses)[number]) => [r.status, r.json, r.text, r.headers['content-type'], r.headers['set-cookie'] ?? null];
    expect(shape(responses[0]!)).toEqual([202, { received: true }, '{"received":true}', 'application/json; charset=utf-8', null]);
    for (const response of responses) expect(shape(response)).toEqual(shape(responses[0]!));
  });

  it('[REQ-HOUSE2-001][INV-AUTH-006] los errores de enumeración de la 001 ya no existen: ninguna respuesta de invitar es 404 de usuario ni 409 de miembro', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const codes = new Set<string>();
    for (const username of ['nadie.x', 'maria.v', 'carlos_88', 'lucia.r', 'andres']) {
      const r = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username, roleOnJoin: 'READER' } });
      codes.add(`${r.status}:${problemOf(r).code ?? 'ok'}`);
    }
    expect([...codes]).toEqual(['202:ok']);
  });

  it('[REQ-HOUSE2-001][INV-HOUSE-003] una cuenta real recibe su fila INVITED con el rol y un username inexistente deja una fila inerte (sin usuario) que nadie puede aceptar', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'lucia.r', roleOnJoin: 'ADMIN' } });
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'nadie.x', roleOnJoin: 'READER' } });
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'nadie.x', roleOnJoin: 'READER' } });
    const rows = api.db
      .prepare('SELECT household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, responded_at FROM household_invitations ORDER BY invitee_username')
      .all();
    expect(rows).toEqual([
      { household_id: H1, invitee_username: 'carlos_88', invitee_user_id: USERS_BY_NAME.carlos, invited_by_user_id: USERS_BY_NAME.andres, role_on_join: 'CAREGIVER', status: 'INVITED', responded_at: null },
      { household_id: H1, invitee_username: 'lucia.r', invitee_user_id: USERS_BY_NAME.lucia, invited_by_user_id: USERS_BY_NAME.andres, role_on_join: 'ADMIN', status: 'INVITED', responded_at: null },
      { household_id: H1, invitee_username: 'nadie.x', invitee_user_id: null, invited_by_user_id: USERS_BY_NAME.andres, role_on_join: 'READER', status: 'INVITED', responded_at: null },
    ]);
  });

  it('[REQ-HOUSE2-001][ERR-SCHEMA-VALIDATION-FAILED] se invita siempre por username con roleOnJoin: sin rol, rol inválido, correo o userId, y un username con mayúsculas o espacios → 422', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const attempt = async (body: unknown) => problemOf(await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body }));
    const schemaError = { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' };
    expect([
      await attempt({ username: 'lucia.r' }),
      await attempt({ username: 'lucia.r', roleOnJoin: 'OWNER' }),
      await attempt({ email: 'lucia@example.com', roleOnJoin: 'READER' }),
      await attempt({ userId: USERS_BY_NAME.lucia, roleOnJoin: 'READER' }),
      await attempt({ username: ' Lucia.R ', roleOnJoin: 'READER' }),
      await attempt({ username: 'lucia.r', roleOnJoin: 'READER', extra: 1 }),
    ]).toEqual(Array(6).fill(schemaError));
    expect(api.db.prepare('SELECT COUNT(*) AS n FROM household_invitations WHERE invitee_username <> \'carlos_88\'').get()).toEqual({ n: 0 });
  });

  it('[REQ-HOUSE2-001][INV-AUTH-006] el tiempo de respuesta es similar exista o no el username (medición con tolerancia amplia)', async () => {
    api = await createApi(undefined, { rateLimits: { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 1000, windowMinutes: 15 } } });
    const andres = await api.login('andres');
    const median = async (username: string) => {
      const times: number[] = [];
      for (let i = 0; i < 15; i += 1) {
        const started = performance.now();
        await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username, roleOnJoin: 'READER' }, contract: false });
        times.push(performance.now() - started);
      }
      return times.sort((x, y) => x - y)[7]!;
    };
    const existing = await median('lucia.r');
    const inert = await median('nadie.x');
    expect(Math.abs(existing - inert)).toBeLessThan(100);
  });

  it('[REQ-HOUSE2-001][ERR-HOUSE-NOT-FOUND][ERR-ACC-FORBIDDEN] solo el propietario invita (T238 PENDIENTE: ADMIN): un miembro recibe 403 y quien no ve el hogar, 404; ninguno consume el límite', async () => {
    api = await createApi(undefined, { rateLimits: { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 1, windowMinutes: 15 } } });
    const body = { username: 'lucia.r', roleOnJoin: 'READER' };
    const byMember = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: await api.login('maria.v'), body });
    const byStranger = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: await api.login('lucia.r'), body });
    const byOwner = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: await api.login('andres'), body });
    expect([problemOf(byMember), problemOf(byStranger), byOwner.status]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 404, code: 'ERR-HOUSE-NOT-FOUND' },
      202,
    ]);
  });

  it('[REQ-HOUSE2-001][ERR-RATE-LIMITED] al superar INVITE_MAX_PER_WINDOW → 429 con el mismo resultado para usernames reales e inexistentes; la ventana es deslizante y exacta a 15 min', async () => {
    api = await createApi(undefined, { rateLimits: { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 3, windowMinutes: 15 } } });
    const andres = await api.login('andres');
    const invite = (username: string) => api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username, roleOnJoin: 'READER' } });
    const first = [await invite('lucia.r'), await invite('nadie.x'), await invite('maria.v')];
    const realBlocked = await invite('lucia.r');
    const ghostBlocked = await invite('nadie.x');
    api.clock.setClock('2026-11-05', '2026-11-05T12:14:59.999Z');
    const justBefore = await invite('lucia.r');
    api.clock.setClock('2026-11-05', '2026-11-05T12:15:00.000Z');
    const reopened = await invite('nadie.x');
    expect([first.map((r) => r.status), problemOf(realBlocked), problemOf(ghostBlocked), realBlocked.text === ghostBlocked.text, problemOf(justBefore), reopened.status]).toEqual([
      [202, 202, 202],
      { status: 429, code: 'ERR-RATE-LIMITED' },
      { status: 429, code: 'ERR-RATE-LIMITED' },
      true,
      { status: 429, code: 'ERR-RATE-LIMITED' },
      202,
    ]);
  });

  it('[REQ-HOUSE2-001][ERR-RATE-LIMITED] el límite es por actor: otra propietaria con su propio hogar no queda bloqueada por el consumo de Andrés', async () => {
    api = await createApi(undefined, { rateLimits: { EXPORT: { maxPerWindow: 5, windowMinutes: 15 }, INVITE: { maxPerWindow: 1, windowMinutes: 15 } } });
    const andres = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const created = await api.call('POST', '/api/households', { cookie: lucia, body: { name: 'Casa Rivas' }, contract: false });
    const ownHousehold = (created.json as { household: { id: string } }).household.id;
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'nadie.x', roleOnJoin: 'READER' } });
    const blocked = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'nadie.y', roleOnJoin: 'READER' } });
    const other = await api.call('POST', `/api/households/${ownHousehold}/invitations`, { cookie: lucia, body: { username: 'nadie.y', roleOnJoin: 'READER' } });
    expect([problemOf(blocked), other.status]).toEqual([{ status: 429, code: 'ERR-RATE-LIMITED' }, 202]);
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

// Feature 002 · T238 (rojo): roles de hogar por HTTP. Cada prueba crea su hogar con Andrés (propietario) y
// lleva a los demás miembros por el flujo real (invitar con roleOnJoin, aceptar), así no depende del estado 001.
// Cuerpos según identity.schema.json: InviteMemberInput {username, roleOnJoin}, ChangeRoleInput {role},
// TransferHouseholdOwnershipInput {targetUserId}.
describe('roles de hogar por HTTP (REQ-HOUSE2-001, REQ-HOUSE2-002, REQ-HOUSE-003, STATE-HOUSE-MEMBERSHIP-001) · T238', () => {
  const idOf = (json: unknown) => (json as { household: { id: string } }).household.id;
  const myRoleOf = (json: unknown) => (json as { myRole: string }).myRole;
  async function newHousehold(cookie: string): Promise<string> {
    const created = await api.call('POST', '/api/households', { cookie, body: { name: 'Casa de roles' } });
    return idOf(created.json);
  }
  async function inviteAndAccept(hid: string, owner: string, username: string, roleOnJoin: string): Promise<void> {
    await api.call('POST', `/api/households/${hid}/invitations`, { cookie: await api.login(owner), body: { username, roleOnJoin } });
    await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
  }

  it('[REQ-HOUSE2-001][REQ-HOUSE-003] invitar a lucia.r con roleOnJoin CAREGIVER y aceptar la deja ACTIVE como CAREGIVER; el creador es ADMIN', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    const invited = await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username: 'lucia.r', roleOnJoin: 'CAREGIVER' } });
    const accepted = await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login('lucia.r') });
    const luciaView = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('lucia.r') });
    const ownerView = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    expect([invited.status, accepted.status, myRoleOf(luciaView.json), myRoleOf(ownerView.json)]).toEqual([202, 200, 'CAREGIVER', 'ADMIN']);
  });

  it('[REQ-HOUSE2-002] el propietario cambia el rol de lucia.r de CAREGIVER a READER (200) y la vista de lucia lo refleja de inmediato', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'lucia.r', 'CAREGIVER');
    const changed = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.lucia}`, { cookie: andres, body: { role: 'READER' } });
    const view = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('lucia.r') });
    expect([changed.status, myRoleOf(view.json)]).toEqual([200, 'READER']);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001][ERR-ACC-FORBIDDEN] un Lector y un Administrador no cambian el rol del propietario ni el suyo: 403', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'lucia.r', 'READER');
    await inviteAndAccept(hid, 'andres', 'maria.v', 'ADMIN');
    const readerOnOwner = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.andres}`, { cookie: await api.login('lucia.r'), body: { role: 'READER' } });
    const adminOnOwner = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.andres}`, { cookie: await api.login('maria.v'), body: { role: 'READER' } });
    const adminOnSelf = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.maria}`, { cookie: await api.login('maria.v'), body: { role: 'READER' } });
    expect([problemOf(readerOnOwner), problemOf(adminOnOwner), problemOf(adminOnSelf)]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
    ]);
  });

  it('[REQ-HOUSE2-002][ERR-HOUSE-MEMBERSHIP-NOT-FOUND] cambiar el rol de quien nunca fue invitado (carlos_88) responde 404 ERR-HOUSE-MEMBERSHIP-NOT-FOUND', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    const r = await api.call('PATCH', `/api/households/${hid}/members/${USERS_BY_NAME.carlos}`, { cookie: andres, body: { role: 'READER' } });
    expect(problemOf(r)).toEqual({ status: 404, code: 'ERR-HOUSE-MEMBERSHIP-NOT-FOUND' });
  });

  it('[REQ-HOUSE2-002] expulsar: el propietario retira a lucia.r (204) y ella ya no ve el hogar (404 ERR-HOUSE-NOT-FOUND)', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'lucia.r', 'CAREGIVER');
    const removed = await api.call('DELETE', `/api/households/${hid}/members/${USERS_BY_NAME.lucia}`, { cookie: andres });
    const after = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('lucia.r') });
    expect([removed.status, problemOf(after)]).toEqual([204, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }]);
  });

  it('[REQ-HOUSE2-002][ERR-HOUSE-OWNER-CANNOT-LEAVE] el propietario no puede abandonar su hogar: 409 y sigue como ADMIN', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    const r = await api.call('DELETE', `/api/households/${hid}/members/${USERS_BY_NAME.andres}`, { cookie: andres });
    const view = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    expect([problemOf(r), myRoleOf(view.json)]).toEqual([{ status: 409, code: 'ERR-HOUSE-OWNER-CANNOT-LEAVE' }, 'ADMIN']);
  });

  it('[REQ-HOUSE2-002] abandonar: lucia.r deja el hogar (204) y ya no lo ve; el propietario sigue como ADMIN', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'lucia.r', 'CAREGIVER');
    const left = await api.call('DELETE', `/api/households/${hid}/members/${USERS_BY_NAME.lucia}`, { cookie: await api.login('lucia.r') });
    const luciaView = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('lucia.r') });
    const ownerView = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    expect([left.status, problemOf(luciaView), myRoleOf(ownerView.json)]).toEqual([204, { status: 404, code: 'ERR-HOUSE-NOT-FOUND' }, 'ADMIN']);
  });

  it('[REQ-HOUSE2-002][INV-HOUSE2-001] transferir: el propietario cede el hogar a maria.v (200); maria pasa a ser propietaria con ADMIN y el hogar la nombra', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'maria.v', 'CAREGIVER');
    const transferred = await api.call('POST', `/api/households/${hid}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    const mariaView = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('maria.v') });
    const andresView = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    const owner = (mariaView.json as { household: { ownerUserId: string } }).household.ownerUserId;
    expect([transferred.status, owner, myRoleOf(mariaView.json), myRoleOf(andresView.json)]).toEqual([200, USERS_BY_NAME.maria, 'ADMIN', 'ADMIN']);
  });

  it('[REQ-HOUSE2-002][ERR-ACC-FORBIDDEN] un ADMIN que no es propietario no transfiere el hogar (403) y el propietario no cambia', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'maria.v', 'ADMIN');
    const r = await api.call('POST', `/api/households/${hid}/ownership-transfer`, { cookie: await api.login('maria.v'), body: { targetUserId: USERS_BY_NAME.maria } });
    const view = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    expect([problemOf(r), (view.json as { household: { ownerUserId: string } }).household.ownerUserId]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      USERS_BY_NAME.andres,
    ]);
  });

  it('[REQ-HOUSE2-002] eliminar el hogar: un ADMIN recibe 403; el propietario lo borra (204) y después el hogar responde 404 ERR-HOUSE-NOT-FOUND', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await inviteAndAccept(hid, 'andres', 'maria.v', 'ADMIN');
    const mariaBefore = await api.call('GET', `/api/households/${hid}`, { cookie: await api.login('maria.v') });
    expect(myRoleOf(mariaBefore.json)).toBe('ADMIN'); // precondición: maria.v es ADMIN real (roleOnJoin ADMIN al aceptar)
    const byAdmin = await api.call('DELETE', `/api/households/${hid}`, { cookie: await api.login('maria.v') });
    const byOwner = await api.call('DELETE', `/api/households/${hid}`, { cookie: andres });
    const after = await api.call('GET', `/api/households/${hid}`, { cookie: andres });
    expect([problemOf(byAdmin), byOwner.status, problemOf(after)]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      204,
      { status: 404, code: 'ERR-HOUSE-NOT-FOUND' },
    ]);
  });

  it('[REQ-HOUSE-003][ERR-HOUSE-INVITATION-NOT-FOUND] responder dos veces a la misma invitación: la segunda es 404 ERR-HOUSE-INVITATION-NOT-FOUND, nunca 403', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const hid = await newHousehold(andres);
    await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username: 'lucia.r', roleOnJoin: 'READER' } });
    const luciaCookie = await api.login('lucia.r');
    const first = await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: luciaCookie });
    const second = await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: luciaCookie });
    expect([first.status, problemOf(second)]).toEqual([200, { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' }]);
  });
});
