import { afterEach, describe, expect, it } from 'vitest';
import { ANDRES, ARGOS, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**
 * T1656 (Feature 012, Bloque C, #26; `/keymaker`): rutas HTTP del Modo Cuidador sobre la API real y SQLite. El OpenAPI de la 012 no está cableado en el arnés de contrato de la 002/004
 * (`contract: false`). Cubre el orden de comprobaciones, 201/200, el 409 con autor visible, la caché `private, no-store` y los TRES cubos de límite de R-3 (120/h registros, 60/h rutinas, 30/h
 * reversiones) con `429 ERR-RATE-LIMITED` y `Retry-After`.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-008, SC-012-025, SC-012-026, SC-012-029, SC-012-031, SC-012-033, ERR-RATE-LIMITED
 */
let api: Api;
afterEach(async () => api.close());

const NC = { contract: false } as const;
const NOW = '2026-11-26T15:00:00.000Z'; // jueves 10:00 de Bogotá
const MED = { kind: 'MEDICATION', title: 'Amoxicilina', instructions: 'Con comida', doseAmount: 250, doseUnit: 'MG', timesOfDay: ['08:00'], daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-11-20', endDate: '2026-12-04' };
const PET = ARGOS.id;
const base = `/api/pets/${PET}/care`;

async function setup(): Promise<{ andres: string; maria: string }> {
  const state = canonicalState();
  state.memberships = state.memberships.map((m) => (m.userId === MARIA ? { ...m, role: 'CAREGIVER' as const, status: 'ACTIVE' as const } : m));
  api = await createApi(state);
  api.clock.setClock(NOW.slice(0, 10), NOW);
  return { andres: await api.login('andres'), maria: await api.login('maria.v') };
}

describe('rutinas, pendientes y registro (REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-005)', () => {
  it('[REQ-CAR12-005] el titular crea (201), lista y lee; el cuidador VIEW_ONLY lee y NO registra (403); con BASIC_LOG registra (201), reintenta (200) y el titular choca (409 con autor)', async () => {
    const { andres, maria } = await setup();
    const created = await api.call('POST', `${base}/routines`, { cookie: andres, body: MED, ...NC });
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('private, no-store');
    expect(String(created.headers['vary'])).toContain('Cookie');
    const routine = created.json as { id: string; version: number };
    expect((await api.call('GET', `${base}/routines`, { cookie: andres, ...NC })).status).toBe(200);
    expect((await api.call('GET', `${base}/routines/${routine.id}`, { cookie: maria, ...NC })).status).toBe(200);
    expect((await api.call('GET', `${base}/routines/${routine.id}`, { cookie: andres, ...NC })).json).toMatchObject({ id: routine.id, kind: 'MEDICATION' });
    expect((await api.call('POST', `${base}/routines`, { cookie: maria, body: MED, ...NC })).status).toBe(403);

    const today = await api.call('GET', `${base}/today`, { cookie: maria, ...NC });
    expect(today.status).toBe(200);
    expect(today.json).toMatchObject({ date: '2026-11-26', timezone: 'America/Bogota', items: [{ routineId: routine.id, occurrenceTime: '08:00', state: 'OVERDUE' }] });
    const entry = { routineId: routine.id, occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE' };
    const denied = await api.call('POST', `${base}/log`, { cookie: maria, body: entry, ...NC });
    expect([denied.status, problemOf(denied).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);

    const granted = await api.call('PUT', `${base}/access/${MARIA}`, { cookie: andres, body: { level: 'BASIC_LOG' }, ...NC });
    expect(granted.status).toBe(201);
    const first = await api.call('POST', `${base}/log`, { cookie: maria, body: entry, ...NC });
    expect(first.status).toBe(201);
    const logged = first.json as { id: string; late: boolean };
    expect(logged.late).toBe(true);
    expect((await api.call('POST', `${base}/log`, { cookie: maria, body: entry, ...NC })).status).toBe(200);

    const conflict = await api.call('POST', `${base}/log`, { cookie: andres, body: entry, ...NC });
    expect(conflict.status).toBe(409);
    expect(conflict.headers['content-type']).toContain('application/problem+json');
    expect(conflict.json).toMatchObject({ code: 'ERR-CAR12-ALREADY-LOGGED', existing: { status: 'DONE' } });
    expect((conflict.json as { existing: { performedByDisplayName: string } }).existing.performedByDisplayName).not.toBe('');

    const reverted = await api.call('POST', `${base}/log/${logged.id}/revert`, { cookie: maria, ...NC });
    expect(reverted.status).toBe(200);
    expect((reverted.json as { revertedAt: string | null }).revertedAt).toBe(NOW);
    const page = await api.call('GET', `${base}/log?limit=10`, { cookie: andres, ...NC });
    expect(page.status).toBe(200);
    expect(page.json).toMatchObject({ items: [], nextCursor: null });
    expect(problemOf(await api.call('GET', `${base}/log?limit=abc`, { cookie: andres, ...NC })).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('[R-1] editar la dosis versiona (201) y desactivar deja effectiveTo y updatedAt iguales al instante de la desactivación (200); sin sesión es 401', async () => {
    const { andres } = await setup();
    const routine = (await api.call('POST', `${base}/routines`, { cookie: andres, body: MED, ...NC })).json as { id: string; version: number };
    const edited = await api.call('PATCH', `${base}/routines/${routine.id}`, { cookie: andres, body: { expectedVersion: routine.version, doseAmount: 300 }, ...NC });
    expect(edited.status).toBe(201);
    expect(edited.json).toMatchObject({ versioned: true });
    const next = (edited.json as { routine: { id: string; version: number } }).routine;
    api.clock.setClock('2026-11-26', '2026-11-26T15:05:00.000Z');
    const off = await api.call('POST', `${base}/routines/${next.id}/deactivate`, { cookie: andres, body: { expectedVersion: next.version }, ...NC });
    expect(off.status).toBe(200);
    expect(off.json).toMatchObject({ active: false, effectiveTo: '2026-11-26T15:05:00.000Z', updatedAt: '2026-11-26T15:05:00.000Z' });
    const stale = await api.call('POST', `${base}/routines/${next.id}/deactivate`, { cookie: andres, body: { expectedVersion: next.version }, ...NC });
    expect([stale.status, problemOf(stale).code]).toEqual([409, 'ERR-CAR12-ROUTINE-STALE']);
    expect((await api.call('GET', `${base}/today`, { cookie: null, ...NC })).status).toBe(401);
  });
});

describe('límites de la capa HTTP (R-3, H-C1)', () => {
  it('el cubo de registros corta en 120/h con 429 ERR-RATE-LIMITED y Retry-After; el de reversiones es propio y sigue disponible; pasada la hora se libera', async () => {
    const { andres } = await setup();
    for (let i = 0; i < 120; i += 1) expect((await api.call('POST', `${base}/log`, { cookie: andres, body: {}, ...NC })).status).toBe(422);
    const blocked = await api.call('POST', `${base}/log`, { cookie: andres, body: {}, ...NC });
    expect([blocked.status, problemOf(blocked).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: andres, ...NC })).status).toBe(404);
    api.clock.setClock('2026-11-26', '2026-11-26T16:00:01.000Z'); // la sesión inactiva caduca a los 30 min: se vuelve a entrar
    expect((await api.call('POST', `${base}/log`, { cookie: await api.login('andres'), body: {}, ...NC })).status).toBe(422);
  });

  it('el cubo de rutinas y niveles corta en 60/h (compartido entre rutinas y niveles) y el de reversiones en 30/h, cada uno sin tocar a los otros', async () => {
    const { andres } = await setup();
    for (let i = 0; i < 30; i += 1) expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: andres, ...NC })).status).toBe(404);
    const revertBlocked = await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: andres, ...NC });
    expect([revertBlocked.status, problemOf(revertBlocked).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(String(revertBlocked.headers['retry-after'])).toMatch(/^[0-9]+$/);
    for (let i = 0; i < 30; i += 1) expect((await api.call('POST', `${base}/routines`, { cookie: andres, body: {}, ...NC })).status).toBe(422);
    for (let i = 0; i < 30; i += 1) expect((await api.call('DELETE', `${base}/access/${MARIA}`, { cookie: andres, ...NC })).status).toBe(204);
    const routineBlocked = await api.call('POST', `${base}/routines`, { cookie: andres, body: {}, ...NC });
    expect([routineBlocked.status, problemOf(routineBlocked).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(String(routineBlocked.headers['retry-after'])).toMatch(/^[0-9]+$/);
    expect((await api.call('DELETE', `${base}/access/${MARIA}`, { cookie: andres, ...NC })).status).toBe(429);
    expect((await api.call('GET', `${base}/routines`, { cookie: andres, ...NC })).status).toBe(200);
  });
  it('[R-3] un 403 de potestad no gasta cupo: tras más intentos que el tope sigue siendo 403 (nunca 429) y no vacía el cupo del propio usuario', async () => {
    const { andres, maria } = await setup(); // maria es CAREGIVER sin fila de nivel: VIEW_ONLY
    for (let i = 0; i < 125; i += 1) expect((await api.call('POST', `${base}/log`, { cookie: maria, body: {}, ...NC })).status).toBe(403);
    for (let i = 0; i < 65; i += 1) expect((await api.call('POST', `${base}/routines`, { cookie: maria, body: {}, ...NC })).status).toBe(403);
    for (let i = 0; i < 35; i += 1) expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: maria, ...NC })).status).toBe(403);
    expect((await api.call('POST', `${base}/log`, { cookie: andres, body: {}, ...NC })).status).toBe(422);
  });

  it('[R-3] con el cupo agotado, el 403 precede al 429: quien agotó su cupo como titular y pierde la potestad recibe 403, no 429', async () => {
    const { andres, maria } = await setup();
    for (let i = 0; i < 30; i += 1) expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: andres, ...NC })).status).toBe(404);
    expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: andres, ...NC })).status).toBe(429);
    expect((await api.call('POST', `${base}/log/${ANDRES}/revert`, { cookie: maria, ...NC })).status).toBe(403);
  });
});

describe('guardas de titular (H-2 de /kid): el CAREGIVER recibe 403 y el servidor no escribe', () => {
  it('[REQ-CAR12-004] un CAREGIVER BASIC_LOG no edita (PATCH), no desactiva ni concede o retira niveles (PUT/DELETE): 403 ERR-ACC-FORBIDDEN y la rutina y los niveles quedan intactos', async () => {
    const { andres, maria } = await setup();
    const routine = (await api.call('POST', `${base}/routines`, { cookie: andres, body: MED, ...NC })).json as { id: string; version: number };
    expect((await api.call('PUT', `${base}/access/${MARIA}`, { cookie: andres, body: { level: 'BASIC_LOG' }, ...NC })).status).toBe(201);
    const before = (await api.call('GET', `${base}/access`, { cookie: andres, ...NC })).json;

    const patch = await api.call('PATCH', `${base}/routines/${routine.id}`, { cookie: maria, body: { expectedVersion: routine.version, doseAmount: 999, title: 'Cambiada' }, ...NC });
    expect([patch.status, problemOf(patch).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    const off = await api.call('POST', `${base}/routines/${routine.id}/deactivate`, { cookie: maria, body: { expectedVersion: routine.version }, ...NC });
    expect([off.status, problemOf(off).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    const put = await api.call('PUT', `${base}/access/${MARIA}`, { cookie: maria, body: { level: 'VIEW_ONLY' }, ...NC });
    expect([put.status, problemOf(put).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
    const del = await api.call('DELETE', `${base}/access/${MARIA}`, { cookie: maria, ...NC });
    expect([del.status, problemOf(del).code]).toEqual([403, 'ERR-ACC-FORBIDDEN']);

    const after = (await api.call('GET', `${base}/routines/${routine.id}`, { cookie: andres, ...NC })).json;
    expect(after).toMatchObject({ id: routine.id, title: MED.title, doseAmount: 250, version: routine.version, active: true, effectiveTo: null });
    expect((await api.call('GET', `${base}/access`, { cookie: andres, ...NC })).json).toEqual(before);
  });
});
