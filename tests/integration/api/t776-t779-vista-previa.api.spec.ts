/**
 * T776 / T779 [US5] vista previa autenticada del propietario (REQ-SUM-004, REQ-SUM-007; SC-005-045; D5-15) sobre SQLite: con `includeMicrochip=true` el microchip
 * sale íntegro como dato declarado por el cuidador; con `false` el microchip está AUSENTE y la divulgación lo declara; una mascota ajena da 404, un `CAREGIVER`
 * recibe `ERR-ACC-FORBIDDEN` y la vista previa no crea ni devuelve token (`validUntil` null, sin filas nuevas).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateSharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import { createShareApi, type ShareApi } from '../../fixtures/share-api-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());

type View = { validUntil: unknown; summary: { disclosure: { microchipIncluded: boolean }; pets: { profile: { microchipId?: string } }[] } };
const CHIP = '985112345678901';
const PREVIEW = `/api/pets/${ARGOS.id}/clinical-summary`;

describe('T776 vista previa autenticada (SC-005-045, REQ-SUM-004)', () => {
  it('[SC-005-045][REQ-SUM-004] con includeMicrochip=true muestra el microchip íntegro como dato declarado y con false lo omite y lo declara no compartido', async () => {
    api = await createShareApi();
    await api.deps.uow.runInTransaction((r) => r.pets.save({ ...upgradePet(ARGOS), microchipId: CHIP }));
    const cookie = await api.login('andres');
    const on = await api.call('GET', `${PREVIEW}?includeMicrochip=true`, { cookie });
    expect(on.status).toBe(200);
    expect(validateSharedSummaryView(on.json)).toBe(true);
    const onView = on.json as View;
    expect(onView.summary.disclosure.microchipIncluded).toBe(true);
    expect(onView.summary.pets[0]?.profile.microchipId).toBe(CHIP);
    const off = await api.call('GET', `${PREVIEW}?includeMicrochip=false`, { cookie });
    const offView = off.json as View;
    expect(offView.summary.disclosure.microchipIncluded).toBe(false);
    expect(offView.summary.pets[0]?.profile).not.toHaveProperty('microchipId');
    expect(JSON.stringify(off.json)).not.toContain(CHIP);
  });

  it('[SC-005-045][D5-15] la vista previa no crea ni devuelve token: validUntil es null, no hay filas de enlace ni de auditoría nuevas y la respuesta es no-store', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const links = api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get();
    const audits = api.db.prepare('SELECT COUNT(*) FROM share_link_audit').pluck().get();
    const response = await api.call('GET', `${PREVIEW}?includeMicrochip=true&includeClinicalFiles=true`, { cookie });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((response.json as View).validUntil).toBeNull();
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(links);
    expect(api.db.prepare('SELECT COUNT(*) FROM share_link_audit').pluck().get()).toBe(audits);
    expect(response.text).not.toMatch(/\/shared\/[A-Za-z0-9_-]{43}/);
  });

  it('[SC-005-045][REQ-SUM-004] un CAREGIVER recibe 403 ERR-ACC-FORBIDDEN, quien no ve la mascota recibe 404 y sin sesión 401', async () => {
    api = await createShareApi({ role: 'CAREGIVER' });
    const maria = await api.login('maria');
    const forbidden = await api.call('GET', PREVIEW, { cookie: maria });
    expect(forbidden.status).toBe(403);
    expect((forbidden.json as { code: string }).code).toBe('ERR-ACC-FORBIDDEN');
    const lucia = await api.login('lucia');
    const hidden = await api.call('GET', PREVIEW, { cookie: lucia });
    expect(hidden.status).toBe(404);
    expect((await api.call('GET', PREVIEW, { cookie: null })).status).toBe(401);
  });
});
