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
    const cards = r.json as Array<{ owner: { colorToken: unknown }; myRole: string; permissions: { editPetBasics: boolean } }>;
    expect([r.status, names(r.json).sort(), cards.every((c) => c.owner.colorToken === null && c.myRole === 'OWNER' && c.permissions.editPetBasics)]).toEqual([
      200,
      ['Argos', 'Kira', 'Milo', 'Nyx', 'Toby'],
      true,
    ]);
  });

  it('[REQ-PET-005] D-03 y EDGE-039: q no distingue mayúsculas ni tildes ("lucia" encuentra "Lucía" y no "Lucas"); species y filter filtran', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
    await api.call('POST', '/api/pets', { cookie, body: { ...NEW_PET, name: 'Lucas' } });
    const q = await api.call('GET', '/api/pets?q=lucia', { cookie });
    const upper = await api.call('GET', '/api/pets?q=LUCÍA', { cookie });
    const cats = await api.call('GET', '/api/pets?species=FELINE', { cookie });
    const catsByFilter = await api.call('GET', '/api/pets?filter=FELINE', { cookie });
    expect([names(q.json), names(upper.json), names(cats.json).sort(), names(catsByFilter.json).sort()]).toEqual([['Lucía'], ['Lucía'], ['Milo', 'Nyx'], ['Milo', 'Nyx']]);
  });

  it('[REQ-PET-005] una consulta inválida (q de más de 50 caracteres, species desconocida, parámetro extra o q repetido) → 422', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const calls = ['q=' + 'a'.repeat(51), 'species=DRAGON', 'orden=asc', 'q=a&q=b', 'filter=DOG', 'filter=ALL&filter=CANINE'].map((qs) => api.call('GET', `/api/pets?${qs}`, { cookie }));
    const fields = (await Promise.all(calls)).map((r) => [r.status, (r.json as { code: string; field: string }).code, (r.json as { field: string }).field]);
    expect(fields).toEqual([
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'q'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'species'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'orden'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'q'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'filter'],
      [422, 'ERR-SCHEMA-VALIDATION-FAILED', 'filter'],
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
    const body = { name: 'Argos', species: 'CANINE', breed: 'Pastor alemán', birthDate: '2020-05-01', sex: 'MALE' };
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

  it('[REQ-PET-003] dashboard: el dueño y un miembro ACTIVE la ven (permisos distintos); un usuario sin hogar compartido recibe 404 (EDGE-008)', async () => {
    api = await createApi();
    const url = `/api/pets/${ARGOS_ID}/dashboard`;
    const owner = await api.call('GET', url, { cookie: await api.login('andres') });
    const member = await api.call('GET', url, { cookie: await api.login('maria.v') });
    const invited = await api.call('GET', url, { cookie: await api.login('carlos_88') });
    const lunaByAndres = await api.call('GET', `/api/pets/${LUNA_ID}/dashboard`, { cookie: await api.login('andres') });
    const dash = owner.json as { permissions: { editPetBasics: boolean }; weights: unknown[]; computedAge: { years: number } };
    expect([dash.permissions.editPetBasics, dash.weights.length, (member.json as { permissions: { editPetBasics: boolean } }).permissions.editPetBasics, problemOf(invited), lunaByAndres.status]).toEqual([
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

  it('[REQ-REC2-001] EDGE-034: el peso nuevo devuelve deltaKg exacto frente al último peso y la respuesta ya no trae deltaPercent', async () => {
    api = await createApi();
    // Último peso de Argos: 32.85 kg (2026-11-01). 32.85 → 32.40 = -0.45 kg.
    const r = await api.call('POST', `/api/pets/${ARGOS_ID}/records/weights`, { cookie: await api.login('andres'), body: { ...RECORD_INPUTS.weights, weightKg: 32.4 } });
    expect([(r.json as { deltaKg: number }).deltaKg, Object.keys(r.json as object).sort()]).toEqual([-0.45, ['deltaKg', 'record']]);
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

const SPECIES_8 = ['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'] as const;
const CHIP = '981020000000001';
const petInput = (patch: Record<string, unknown> = {}) => ({ ...NEW_PET, name: 'Nube', species: 'RABBIT', breed: 'Cabeza de león', birthDate: '2024-01-10', sex: 'MALE', ...patch });
const created = (r: { json: unknown }) => r.json as { id: string; species: string; speciesOther: unknown; neutered: unknown; microchipId: unknown; birthDate: string; birthDateIsEstimate: boolean };

describe('especies, edad estimada y microchip por HTTP (REQ-PET2-001, INV-PET2-001)', () => {
  it('[REQ-PET2-001][INV-PET2-001] POST /pets acepta las 8 especies y devuelve speciesOther solo en OTHER', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const out: unknown[] = [];
    for (const species of SPECIES_8) {
      const r = await api.call('POST', '/api/pets', { cookie, body: petInput({ species, name: `Pet ${species}`, ...(species === 'OTHER' ? { speciesOther: 'Erizo africano' } : {}) }) });
      out.push([r.status, created(r).species, created(r).speciesOther]);
    }
    expect(out).toEqual(SPECIES_8.map((sp) => [201, sp, sp === 'OTHER' ? 'Erizo africano' : null]));
  });

  it('[INV-PET2-001][ERR-SCHEMA-VALIDATION-FAILED] OTHER sin speciesOther, speciesOther en otra especie o vacío y una especie de la 001 → 422', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const bodies = [
      petInput({ species: 'OTHER' }),
      petInput({ species: 'OTHER', speciesOther: '' }),
      petInput({ species: 'OTHER', speciesOther: 'x'.repeat(61) }),
      petInput({ species: 'BIRD', speciesOther: 'Loro' }),
      petInput({ species: 'DOG' }),
    ];
    const results = [];
    for (const body of bodies) results.push(problemOf(await api.call('POST', '/api/pets', { cookie, body })));
    expect(results).toEqual(bodies.map(() => ({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' })));
  });

  it('[INV-PET2-001] PATCH valida el estado resultante: pasar a OTHER exige speciesOther y volver a una especie normal lo exige nulo', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const url = `/api/pets/${KIRA_ID}`;
    const missing = await api.call('PATCH', url, { cookie, body: { species: 'OTHER' } });
    const ok = await api.call('PATCH', url, { cookie, body: { species: 'OTHER', speciesOther: 'Erizo' } });
    const stale = await api.call('PATCH', url, { cookie, body: { species: 'FERRET' } });
    const cleared = await api.call('PATCH', url, { cookie, body: { species: 'FERRET', speciesOther: null } });
    expect([problemOf(missing), created(ok).speciesOther, problemOf(stale), created(cleared).species, created(cleared).speciesOther]).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      'Erizo',
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      'FERRET',
      null,
    ]);
  });

  it('[REQ-PET2-001] neutered es opcional: ausente es null y true y false se conservan', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const values: unknown[] = [];
    for (const patch of [{}, { neutered: true }, { neutered: false }, { neutered: null }]) {
      values.push(created(await api.call('POST', '/api/pets', { cookie, body: petInput(patch) })).neutered);
    }
    expect(values).toEqual([null, true, false, null]);
  });

  it('[REQ-PET2-001][ADR-002-16] estimatedAge se convierte a birthDate con el reloj del servidor y marca la estimación; es excluyente con birthDate', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const { birthDate: _b, ...noBirth } = petInput();
    const ok = await api.call('POST', '/api/pets', { cookie, body: { ...noBirth, estimatedAge: { years: 2, months: 3 } } });
    const both = await api.call('POST', '/api/pets', { cookie, body: { ...noBirth, birthDate: '2024-01-10', estimatedAge: { years: 2, months: 3 } } });
    const contradictory = await api.call('POST', '/api/pets', { cookie, body: { ...noBirth, estimatedAge: { years: 2, months: 3 }, birthDateIsEstimate: false } });
    const outOfRange = await api.call('POST', '/api/pets', { cookie, body: { ...noBirth, estimatedAge: { years: 61, months: 0 } } });
    const patch = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie, body: { estimatedAge: { years: 1, months: 0 } } });
    const afterRecords = await api.call('PATCH', `/api/pets/${ARGOS_ID}`, { cookie, body: { estimatedAge: { years: 0, months: 1 } } });
    expect([created(ok).birthDate, created(ok).birthDateIsEstimate, problemOf(both), problemOf(contradictory), problemOf(outOfRange), created(patch).birthDate, created(patch).birthDateIsEstimate, problemOf(afterRecords)]).toEqual([
      '2024-08-05',
      true,
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      '2025-11-05',
      true,
      { status: 422, code: 'ERR-PET-BIRTHDATE-AFTER-RECORDS' },
    ]);
  });

  it('[INV-PET-002][ERR-PET-FUTURE-BIRTHDATE] una fecha de nacimiento futura se rechaza en el alta y en la edición; hoy se admite', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const future = await api.call('POST', '/api/pets', { cookie, body: petInput({ birthDate: '2026-11-06' }) });
    const today = await api.call('POST', '/api/pets', { cookie, body: petInput({ birthDate: '2026-11-05' }) });
    const edit = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie, body: { birthDate: '2026-11-06' } });
    expect([problemOf(future), today.status, problemOf(edit)]).toEqual([
      { status: 422, code: 'ERR-PET-FUTURE-BIRTHDATE' },
      201,
      { status: 422, code: 'ERR-PET-FUTURE-BIRTHDATE' },
    ]);
  });

  it('[REQ-PET2-001][INV-PET-003] el microchip debe tener 15 dígitos exactos; con otro formato → 422', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const out = [];
    for (const microchipId of ['98102000000000', '9810200000000011', '98102000000000x', '']) {
      out.push(problemOf(await api.call('POST', '/api/pets', { cookie, body: petInput({ microchipId }) })));
    }
    expect(out).toEqual([1, 2, 3, 4].map(() => ({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' })));
  });

  it('[REQ-PET2-001][ERR-PET-MICROCHIP-DUPLICATE] el microchip es único por propietario: el mismo dueño recibe 409 (alta y edición) y otra cuenta lo puede usar', async () => {
    api = await createApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    const first = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ microchipId: CHIP }) });
    const dupCreate = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Otra', microchipId: CHIP }) });
    const dupEdit = await api.call('PATCH', `/api/pets/${KIRA_ID}`, { cookie: andres, body: { microchipId: CHIP } });
    const sameEdit = await api.call('PATCH', `/api/pets/${created(first).id}`, { cookie: andres, body: { microchipId: CHIP, name: 'Nube II' } });
    const otherAccount = await api.call('POST', '/api/pets', { cookie: maria, body: petInput({ microchipId: CHIP }) });
    const noChip = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Sin chip' }) });
    const noChip2 = await api.call('POST', '/api/pets', { cookie: andres, body: petInput({ name: 'Sin chip 2' }) });
    expect([first.status, problemOf(dupCreate), problemOf(dupEdit), sameEdit.status, otherAccount.status, noChip.status, noChip2.status]).toEqual([
      201,
      { status: 409, code: 'ERR-PET-MICROCHIP-DUPLICATE' },
      { status: 409, code: 'ERR-PET-MICROCHIP-DUPLICATE' },
      200,
      201,
      201,
      201,
    ]);
    expect(dupCreate.text).not.toContain(CHIP);
    expect((dupCreate.json as { field?: string }).field).toBe('microchipId');
  });

  it('[REQ-PET2-002] GET /pets?filter= separa Todos, Perros (CANINE), Gatos (FELINE) y Otros (las otras seis especies) y se combina con q', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    for (const species of ['RABBIT', 'BIRD', 'OTHER']) {
      await api.call('POST', '/api/pets', { cookie, body: petInput({ species, name: `Nube ${species}`, ...(species === 'OTHER' ? { speciesOther: 'Erizo' } : {}) }) });
    }
    const list = async (query: string) => names((await api.call('GET', `/api/pets${query}`, { cookie })).json).sort();
    expect([await list('?filter=ALL'), await list('?filter=CANINE'), await list('?filter=FELINE'), await list('?filter=OTHERS'), await list('?filter=OTHERS&q=bird')]).toEqual([
      ['Argos', 'Kira', 'Milo', 'Nube BIRD', 'Nube OTHER', 'Nube RABBIT', 'Nyx', 'Toby'],
      ['Argos', 'Kira', 'Toby'],
      ['Milo', 'Nyx'],
      ['Nube BIRD', 'Nube OTHER', 'Nube RABBIT'],
      ['Nube BIRD'],
    ]);
  });

  it('[REQ-PET2-002] GET /pets?filter=WITH_ALERTS lista solo las mascotas con alertas sanitarias activas', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const withAlerts = (await api.call('GET', '/api/pets?filter=WITH_ALERTS', { cookie })).json as Array<{ profile: { name: string }; alertsSummary: { totalActiveAlerts: number } }>;
    const all = (await api.call('GET', '/api/pets', { cookie })).json as typeof withAlerts;
    expect(withAlerts.map((c) => c.profile.name)).toEqual(all.filter((c) => c.alertsSummary.totalActiveAlerts > 0).map((c) => c.profile.name));
    expect(withAlerts.every((c) => c.alertsSummary.totalActiveAlerts > 0)).toBe(true);
  });
});

describe('peso por especie por HTTP (REQ-REC2-001, INV-REC2-002, SC-013)', () => {
  const weight = (recordedAt: string, weightKg: number) => ({ recordedAt, weightKg, notes: null });
  const post = (petId: string, cookie: string, body: unknown) => api.call('POST', `/api/pets/${petId}/records/weights`, { cookie, body });

  it('[INV-REC2-002][ERR-REC-WEIGHT-OUT-OF-RANGE] un perro o gato no admite menos de 0.05 kg ni 3 decimales; sí 0.05 y 150.00', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const out = [];
    for (const kg of [0.049, 0.04, 0.028, 0.001, 12.345, 150.01, 0]) out.push(problemOf(await post(ARGOS_ID, cookie, weight('2026-11-04', kg))));
    expect(out).toEqual([0.049, 0.04, 0.028, 0.001, 12.345, 150.01, 0].map(() => ({ status: 422, code: 'ERR-REC-WEIGHT-OUT-OF-RANGE' })));
    const small = await post(ARGOS_ID, cookie, weight('2026-11-04', 0.05));
    const big = await post(ARGOS_ID, cookie, weight('2026-11-04', 150));
    expect([small.status, big.status]).toEqual([201, 201]);
  });

  it('[INV-REC2-002][REQ-REC2-001] una especie pequeña admite desde 0.001 kg con 3 decimales y deltaKg exacto en gramos', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const rabbit = created(await api.call('POST', '/api/pets', { cookie, body: petInput() })).id;
    const first = await post(rabbit, cookie, weight('2026-05-01', 0.028));
    const second = await post(rabbit, cookie, weight('2026-06-01', 1.275));
    const third = await post(rabbit, cookie, weight('2026-07-01', 0.001));
    const tooFine = await post(rabbit, cookie, weight('2026-07-02', 0.0005));
    const tooBig = await post(rabbit, cookie, weight('2026-07-02', 150.001));
    const max = await post(rabbit, cookie, weight('2026-07-03', 150));
    expect([first, second, third].map((r) => (r.json as { deltaKg: number | null }).deltaKg)).toEqual([null, 1.247, -1.274]);
    expect([problemOf(tooFine), problemOf(tooBig), max.status]).toEqual([
      { status: 422, code: 'ERR-REC-WEIGHT-OUT-OF-RANGE' },
      { status: 422, code: 'ERR-REC-WEIGHT-OUT-OF-RANGE' },
      201,
    ]);
    const grams = api.db.prepare('SELECT weight_grams FROM weights WHERE pet_id = ? ORDER BY weight_grams').pluck().all(rabbit);
    expect(grams).toEqual([1, 28, 1275, 150000]);
  });

  it('[REQ-REC2-001] el dashboard devuelve la serie con deltaKg y sin deltaPercent, y los pesos de una especie pequeña sobreviven a la lectura', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const bird = created(await api.call('POST', '/api/pets', { cookie, body: petInput({ species: 'BIRD' }) })).id;
    await post(bird, cookie, weight('2026-10-01', 0.035));
    await post(bird, cookie, weight('2026-11-01', 0.038));
    const dash = (await api.call('GET', `/api/pets/${bird}/dashboard`, { cookie })).json as { weights: Array<{ record: { weightKg: number }; deltaKg: number | null }> };
    expect(dash.weights.map((w) => [w.record.weightKg, w.deltaKg, Object.keys(w).sort().join()])).toEqual([
      [0.038, 0.003, 'deltaKg,record'],
      [0.035, null, 'deltaKg,record'],
    ]);
  });

  it('[INV-ACC-002][REQ-REC2-001] un miembro sin permiso de escritura no registra peso (403) y quien no ve la mascota recibe 404', async () => {
    api = await createApi();
    const member = await post(ARGOS_ID, await api.login('maria.v'), weight('2026-11-04', 30));
    const stranger = await post(ARGOS_ID, await api.login('lucia.r'), weight('2026-11-04', 30));
    expect([problemOf(member), problemOf(stranger)]).toEqual([
      { status: 403, code: 'ERR-ACC-FORBIDDEN' },
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
    ]);
  });
});
