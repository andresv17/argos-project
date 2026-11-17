import { afterEach, describe, expect, it } from 'vitest';
import { createApi, type Api } from '../integration/api/api-harness.ts';
import { ARGOS_ID } from '../integration/api/api-fixtures.ts';

/** H-T251-2: la próxima fecha es opcional en la entrada; ausente se persiste como null (REQ-REC2-002). */
let api: Api;
afterEach(async () => api.close());

describe('próxima dosis opcional (src/application/use-cases/record-use-cases.ts)', () => {
  it('[REQ-REC2-002][REQ-REC-003] POST de vacuna sin nextBoosterAt responde 201 y persiste nextBoosterAt en null', async () => {
    api = await createApi();
    const r = await api.call('POST', `/api/pets/${ARGOS_ID}/records/vaccinations`, {
      cookie: await api.login('andres'),
      body: { vaccineName: 'Rabia', appliedAt: '2026-11-04' },
    });
    const body = (r.json as { record?: { nextBoosterAt: unknown; vaccineName: string; category: string }; code?: string });
    expect([r.status, body.code ?? null, body.record?.vaccineName, body.record?.category, body.record?.nextBoosterAt]).toEqual([201, null, 'Rabia', 'VACCINE', null]);
  });

  it('[REQ-REC2-002][REQ-REC-004] POST de desparasitación sin nextSuggestedDoseAt responde 201 y persiste nextSuggestedDoseAt en null', async () => {
    api = await createApi();
    const r = await api.call('POST', `/api/pets/${ARGOS_ID}/records/dewormings`, {
      cookie: await api.login('andres'),
      body: { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-11-04' },
    });
    const body = (r.json as { record?: { nextSuggestedDoseAt: unknown; productBrand: string; category: string }; code?: string });
    expect([r.status, body.code ?? null, body.record?.productBrand, body.record?.category, body.record?.nextSuggestedDoseAt]).toEqual([201, null, 'Drontal', 'DEWORMING', null]);
  });
});
