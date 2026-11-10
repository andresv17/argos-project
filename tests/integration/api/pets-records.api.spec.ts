import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { ARGOS_ID, KIRA_ID, LUNA_ID, NEW_PET, RECORD_INPUTS } from './api-fixtures.ts';

/**: rutas `pets` y `records` sobre la API real y SQLite. */
let api: Api;
afterEach(async () => api.close());

const names = (json: unknown) => (json as Array<{ profile: { name: string } }>).map((c) => c.profile.name);

describe('mascotas por HTTP (src/infrastructure/http/routes/pets.routes.ts)', () => {
  it('[REQ-PET-005] GET /pets lista solo las mascotas propias, ordenadas, con colorToken nulo fuera de hogar (EDGE-030)', async () => {
    api = await createApi();
    const r = await api.call('GET', '/api/pets', { cookie: await api.login('andres') });
    const cards = r.json as Array<{ owner: { colorToken: unknown }; canEdit: boolean }>;
    expect([r.status, names(r.json).sort(), cards.every((c) => c.owner.colorToken === null && c.canEdit)]).toEqual([
      200,
      ['Argos', 'Kira', 'Milo', 'Nyx', 'Toby'],
      true,
    ]);
  });

  it('[REQ-PET-005] D-03 y EDGE-039: q no distingue mayúsculas ni tildes ("lucia" encuentra "Lucía" y no "Lucas"); species filtra', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
    await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, name: 'Lucas' } });
    const q = await api.call('GET', '/api/pets?q=lucia', { cookie });
    const upper = await api.call('GET', '/api/pets?q=LUCÍA', { cookie });
    const cats = await api.call('GET', '/api/pets?species=CAT', { cookie });
    expect([names(q.json), names(upper.json), names(cats.json).sort()]).toEqual([['Lucía'], ['Lucía'], ['Milo', 'Nyx']]);
  });

  it('[REQ-PET-005] una consulta inválida (q de más de 50 caracteres, species desconocida, parámetro extra o q repetido) → 422', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const calls = ['q=' + 'a'.repeat(51), 'species=DRAGON', 'orden=asc', 'q=a&q=b'].map((qs) => api.call('GET', `/api/pets?${qs}`, { cookie }));
    const fields = (await Promise.all(calls)).map((r) => [r.status, (r.json as { code: string; field: string }).code, (r.json as { field: string }).field]);
    expect(fields).toEqual([
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'q'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'species'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'orden'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'q'],
    ]);
  });

  it('[REQ-PET-001] POST /pets crea la mascota del usuario autenticado (201) aunque el cuerpo intente fijar otro dueño', async () => {
    api = await createApi();
    const cookie = await api.login('maria.v');
    const ok = await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
    const foreignOwner = await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, ownerUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' } });
    expect([ok.status, (ok.json as { ownerUserId: string }).ownerUserId, problemOf(foreignOwner)]).toEqual([
      201,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-PET-001] PATCH con el cuerpo completo que envía el formulario de edición (sin avatarUrl vacío) → 200, también repetido', async () => {
    api = await createApi();
    const url = `/api/pets/${ARGOS_ID}`;
    const cookie = await api.login('andres');
    const body = { name: 'Argos', species: 'DOG', breed: 'Pastor alemán', birthDate: '2020-05-01', sex: 'MALE' };
    const first = await api.call('PATCH', url, { cookie, body });
    const second = await api.call('PATCH', url, { cookie, body: { ...body, name: 'Argos II' } });
    expect([first.status, second.status, (second.json as { name: string }).name]).toEqual([200, 200, 'Argos II']);
  });

  it('[REQ-PET-001] PATCH: el dueño edita (200); un miembro del hogar recibe 403; quien no la ve recibe 404; EDGE-007 → 422', async () => {
    api = await createApi();
    const url = `/api/pets/${ARGOS_ID}`;
    const owner = await api.call('PATCH', url, { cookie: await api.login('andres'), body: { name: 'Argos el Grande' } });
    const member = await api.call('PATCH', url, { cookie: await api.login('maria.v'), body: { name: 'X' } });
    const stranger = await api.call('PATCH', url, { cookie: await api.login('lucia.r'), body: { name: 'X' } });
    const badId = await api.call('PATCH', '/api/pets/no-es-un-uuid', { cookie: await api.login('andres'), body: { name: 'X' } });
    const afterRecords = await api.call('PATCH', url, { cookie: await api.login('andres'), body: { birthDate: '2026-10-15' } });
    expect([owner.status, (owner.json as { name: string }).name, problemOf(member), problemOf(stranger), problemOf(badId), problemOf(afterRecords)]).toEqual([
      200,
      'Argos el Grande',
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      { status: 422, code: 'ERR-PET-BIRTHDATE-AFTER-RECORDS' },
    ]);
  });

  it('[REQ-PET-004] EDGE-022: DELETE borra la mascota y en cascada sus registros (204); los de otras mascotas no cambian; un miembro recibe 403', async () => {
    api = await createApi();
    const tables = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'];
    const count = (petId: string) => tables.map((t) => api.db.prepare(`SELECT COUNT(*) FROM ${t} WHERE pet_id = ?`).pluck().get(petId));
    const kiraBefore = count(KIRA_ID);
    const member = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { cookie: await api.login('maria.v') });
    const owner = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { cookie: await api.login('andres') });
    const again = await api.call('DELETE', `/api/pets/${ARGOS_ID}`, { cookie: await api.login('andres') });
    expect([problemOf(member), owner.status, count(ARGOS_ID), count(KIRA_ID), problemOf(again)]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      204,
      [0, 0, 0, 0, 0, 0],
      kiraBefore,
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
    ]);
  });

  it('[REQ-PET-003] dashboard: el dueño y un miembro ACTIVE la ven (canEdit distinto); un usuario sin hogar compartido recibe 404 (EDGE-008)', async () => {
    api = await createApi();
    const url = `/api/pets/${ARGOS_ID}/dashboard`;
    const owner = await api.call('GET', url, { cookie: await api.login('andres') });
    const member = await api.call('GET', url, { cookie: await api.login('maria.v') });
    const invited = await api.call('GET', url, { cookie: await api.login('carlos_88') });
    const lunaByAndres = await api.call('GET', `/api/pets/${LUNA_ID}/dashboard`, { cookie: await api.login('andres') });
    const dash = owner.json as { canEdit: boolean; weights: unknown[]; computedAge: { years: number } };
    expect([dash.canEdit, dash.weights.length, (member.json as { canEdit: boolean }).canEdit, problemOf(invited), lunaByAndres.status]).toEqual([
      true,
      2,
      false,
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      200,
    ]);
  });
});

describe('registros por HTTP', () => {
  it.each([
    ['weights', 'REQ-REC-001'],
    ['measurements', 'REQ-REC-002'],
    ['vaccinations', 'REQ-REC-003'],
    ['dewormings', 'REQ-REC-004'],
    ['visits', 'REQ-REC-005'],
    ['custom-parameters', 'REQ-REC-006'],
  ] as const)('[REQ-REC-001][REQ-REC-002][REQ-REC-003][REQ-REC-004][REQ-REC-005][REQ-REC-006] POST /records/%s (%s): el dueño registra (201) y queda en la ficha; un miembro recibe 403 (EDGE-009)', async (path, _requirement) => {
    api = await createApi();
    const url = `/api/pets/${ARGOS_ID}/records/${path}`;
    const owner = await api.call('POST', url, { cookie: await api.login('andres'), body: RECORD_INPUTS[path] });
    const member = await api.call('POST', url, { cookie: await api.login('maria.v'), body: RECORD_INPUTS[path] });
    const body = owner.json as { id?: string; record?: { id: string } };
    expect([owner.status, (body.record?.id ?? body.id)?.startsWith('00000000-0000-4000-8000-'), problemOf(member)]).toEqual([
      201,
      true,
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
    ]);
  });

  it('[REQ-REC-001] EDGE-034 y EDGE-035: el peso nuevo devuelve deltaKg exacto y deltaPercent redondeado frente al último peso', async () => {
    api = await createApi();
    // Último peso de Argos: 32.85 kg (2026-11-01). 32.85 → 32.40 = -0.45 kg y -1.37 %.
    const r = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie: await api.login('andres'), body: { ...RECORD_INPUTS.weights, weightKg: 32.4 } });
    expect([(r.json as { deltaKg: number }).deltaKg, (r.json as { deltaPercent: number }).deltaPercent]).toEqual([-0.45, -1.37]);
  });

  it('[REQ-REC-003][REQ-REC-004] errores de dominio por HTTP: refuerzo el mismo día (EDGE-003), evento antes del nacimiento (EDGE-004) y fecha futura', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const booster = await api.call('POST', `/api/pets/${ARGOS_ID}/records/vaccinations`, { cookie, body: { ...RECORD_INPUTS.vaccinations, appliedAt: '2026-11-01', nextBoosterAt: '2026-11-01' } });
    const beforeBirth = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie, body: { recordedAt: '2022-01-01', weightKg: 3 } });
    const future = await api.call('POST', `/api/pets/${ARGOS_ID}/records/dewormings`, { cookie, body: { ...RECORD_INPUTS.dewormings, appliedAt: '2026-11-06', nextSuggestedDoseAt: '2027-01-01' } });
    expect([problemOf(booster), problemOf(beforeBirth), problemOf(future)]).toEqual([
      { status: 422, code: 'ERR-REC-INVALID-BOOSTER-DATE' },
      { status: 422, code: 'ERR-REC-DATE-BEFORE-BIRTH' },
      { status: 422, code: 'ERR-REC-FUTURE-EVENT-DATE' },
    ]);
  });
});
