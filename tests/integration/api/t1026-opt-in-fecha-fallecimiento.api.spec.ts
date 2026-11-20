/**
 * T1026 (007, SC-007-016, REQ-FAL7-010) extremo a extremo por HTTP sobre SQLite: POST /pets/{petId}/share-links con includeDeceasedAt, ruta publica
 * GET /shared/{token}/summary y vista previa con la consulta includeDeceasedAt. `deceasedAt` solo viaja con el opt-in y nunca aparece en los registros de log (C4).
 * @implements REQ-FAL7-008, REQ-FAL7-010, SC-007-016
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateCreateShareLinkResult, validateSharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import { createShareApi, type ShareApi } from '../../fixtures/share-api-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const DEATH = '2026-06-10';
const LINKS = `/api/pets/${ARGOS.id}/share-links`;
const KEY = (n: number): Record<string, string> => ({ 'idempotency-key': `5a5a5a5a-0000-4000-8000-${String(n).padStart(12, '0')}` });
const tokenOf = (url: unknown): string => String(url).split('/shared/')[1]!;
type View = { summary: { disclosure: { deceasedAtIncluded?: boolean }; pets: { profile: { lifeStatus?: string; deceasedAt?: string } }[] } };

async function deceasedApi(): Promise<string> {
  api = await createShareApi();
  await api.deps.uow.runInTransaction((r) => r.pets.save({ ...upgradePet(ARGOS), lifeStatus: 'DECEASED', deceasedAt: DEATH }));
  return api.login('andres');
}

describe('T1026 opt-in includeDeceasedAt por HTTP (SC-007-016)', () => {
  it('[SC-007-016][REQ-FAL7-008] sin el flag el enlace publico no lleva la fecha; con includeDeceasedAt true la lleva junto con deceasedAtIncluded', async () => {
    const cookie = await deceasedApi();
    const off = await api.call('POST', LINKS, { cookie, body: {}, headers: KEY(1) });
    expect(off.status).toBe(201);
    expect(validateCreateShareLinkResult(off.json)).toBe(true);
    expect((off.json as { link: { includeDeceasedAt?: boolean } }).link.includeDeceasedAt).toBe(false);
    const offView = await api.call('GET', `/api/shared/${tokenOf((off.json as { url: string }).url)}/summary`);
    expect(validateSharedSummaryView(offView.json)).toBe(true);
    expect((offView.json as View).summary.pets[0]!.profile.lifeStatus).toBe('DECEASED');
    expect(JSON.stringify(offView.json)).not.toContain(DEATH);

    const on = await api.call('POST', LINKS, { cookie, body: { includeDeceasedAt: true }, headers: KEY(2) });
    expect(on.status).toBe(201);
    const onView = await api.call('GET', `/api/shared/${tokenOf((on.json as { url: string }).url)}/summary`);
    expect(validateSharedSummaryView(onView.json)).toBe(true);
    expect((onView.json as View).summary.pets[0]!.profile.deceasedAt).toBe(DEATH);
    expect((onView.json as View).summary.disclosure.deceasedAtIncluded).toBe(true);
  });

  it('[SC-007-016] un includeDeceasedAt que no es booleano es 422 ERR-SCHEMA-VALIDATION-FAILED y no escribe', async () => {
    const cookie = await deceasedApi();
    const bad = await api.call('POST', LINKS, { cookie, body: { includeDeceasedAt: 'si' }, headers: KEY(1) });
    expect(bad.status).toBe(422);
    expect((bad.json as { code?: string }).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(0);
  });

  it('[SC-007-016] la vista previa honra la consulta includeDeceasedAt (default false) y un valor invalido es 422', async () => {
    const cookie = await deceasedApi();
    const url = `/api/pets/${ARGOS.id}/clinical-summary`;
    expect(JSON.stringify((await api.call('GET', url, { cookie })).json)).not.toContain(DEATH);
    const on = await api.call('GET', `${url}?includeDeceasedAt=true`, { cookie });
    expect(on.status).toBe(200);
    expect((on.json as View).summary.pets[0]!.profile.deceasedAt).toBe(DEATH);
    expect((await api.call('GET', `${url}?includeDeceasedAt=quizas`, { cookie })).status).toBe(422);
  });

  it('[REQ-FAL7-010][SC-007-016] la fecha de fallecimiento no aparece en los registros de log tras crear el enlace y servirlo con el opt-in', async () => {
    const cookie = await deceasedApi();
    const on = await api.call('POST', LINKS, { cookie, body: { includeDeceasedAt: true }, headers: KEY(1) });
    await api.call('GET', `/api/shared/${tokenOf((on.json as { url: string }).url)}/summary`);
    expect(api.logLines.join('\n')).not.toContain(DEATH);
  });
});
