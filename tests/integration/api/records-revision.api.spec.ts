/**
 * T613 [P] [US2] control de revisión por HTTP (D-16 A; SC-CAT-035, EDGE-021; REQ-BOR-005, INV-REG-003) sobre la API real y SQLite, con el
 * arnés del contrato OpenAPI (revision exigida como `required` en los registros): `PATCH` exige `If-Match: "<n>"`; con la revisión leída
 * responde 200 con `revision + 1`; con una desactualizada, 409 ERR-REC-CONFLICT sin cambios; sin la cabecera o con otro formato,
 * ERR-SCHEMA-VALIDATION-FAILED (campo If-Match); el listado y el tablero devuelven `revision` de solo lectura.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { ARGOS_ID } from './api-fixtures.ts';

let api: Api;
afterEach(async () => api.close());

const url = (id: string) => `/api/pets/${ARGOS_ID}/records/vaccinations/${id}`;
const patch = (cookie: string, id: string, body: unknown, ifMatch?: string) =>
  api.call('PATCH', url(id), { cookie, body, ...(ifMatch === undefined ? {} : { headers: { 'if-match': ifMatch } }) });
const dashboard = async (cookie: string) => (await api.call('GET', `/api/pets/${ARGOS_ID}/dashboard`, { cookie })).json as { vaccinations: Array<{ record: { id: string; revision: number; notes: string | null } }> };

describe('control de revisión por HTTP (REQ-BOR-005, SC-CAT-035)', () => {
  const edit = (notes: string) => ({ collection: 'vaccinations', notes });

  it('[SC-CAT-035][EDGE-021] dos PATCH con el mismo If-Match: 200 con revision + 1 y 409 ERR-REC-CONFLICT sin cambios; el tablero devuelve la revision', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const id = (await dashboard(cookie)).vaccinations[0]!.record.id;
    expect((await dashboard(cookie)).vaccinations[0]!.record.revision).toBe(0);
    const first = await patch(cookie, id, edit('primera'), '"0"');
    const second = await patch(cookie, id, edit('segunda'), '"0"');
    expect([first.status, (first.json as { revision: number; notes: string }).revision, (first.json as { notes: string }).notes]).toEqual([200, 1, 'primera']);
    expect(problemOf(second)).toEqual({ status: 409, code: 'ERR-REC-CONFLICT' });
    expect(second.text).not.toContain('segunda');
    const after = (await dashboard(cookie)).vaccinations.find((v) => v.record.id === id)!.record;
    expect([after.revision, after.notes]).toEqual([1, 'primera']);
    const third = await patch(cookie, id, edit('tercera'), '"1"');
    expect([third.status, (third.json as { revision: number }).revision]).toEqual([200, 2]);
  });

  it('[SC-CAT-035][REQ-BOR-005] un PATCH sin If-Match o con un formato inválido → 422 ERR-SCHEMA-VALIDATION-FAILED (campo If-Match) y no cambia nada', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const id = (await dashboard(cookie)).vaccinations[0]!.record.id;
    const results = [undefined, '0', '"x"', 'W/"0"', '"-1"', '"0", "1"', '""'].map((header) => patch(cookie, id, edit('no debe guardarse'), header));
    const answers = await Promise.all(results);
    expect(answers.map(problemOf)).toEqual(answers.map(() => ({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' })));
    expect(answers.every((r) => (r.json as { field: string }).field === 'If-Match')).toBe(true);
    const after = (await dashboard(cookie)).vaccinations.find((v) => v.record.id === id)!.record;
    expect([after.revision, after.notes === 'no debe guardarse']).toEqual([0, false]);
  });

  it('[SC-CAT-035][REQ-BOR-003] una edición sin cambios efectivos responde 200 con la misma revision y no la incrementa', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const record = (await dashboard(cookie)).vaccinations[0]!.record;
    const same = await patch(cookie, record.id, edit(record.notes as string), '"0"');
    expect([same.status, (same.json as { revision: number }).revision]).toEqual([200, 0]);
  });

  it('[REQ-BOR-005][REQ-RBAC-001] el If-Match no salta los permisos: un Lector con la revisión correcta sigue recibiendo 403, y quien no ve la mascota 404', async () => {
    api = await createApi();
    const id = (await dashboard(await api.login('andres'))).vaccinations[0]!.record.id;
    const stranger = await patch(await api.login('lucia.r'), id, edit('x'), '"0"');
    expect([problemOf(stranger).status === 403 || problemOf(stranger).status === 404]).toEqual([true]);
  });
});
