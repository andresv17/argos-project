import { afterEach, describe, expect, it } from 'vitest';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';

/**
 * T1179 / T1181 (008, bloque I, `[GH:#21]`) por HTTP sobre SQLite: la biografía de la mascota se edita por `PATCH /pets/{petId}` (If-Match de la ficha) solo con la acción
 * «Editar datos básicos» (propietario y ADMIN; Cuidador y Lector no), se valida 0..280 plano y recortado (vacío = null), se lee en la ficha, viaja en el respaldo 3.3.0 y un
 * respaldo anterior sin el campo la importa nula; nunca aparece en la tarjeta del listado ni en el resumen veterinario.
 * REQ-BIO8-001, REQ-BIO8-002, REQ-BIO8-004, REQ-RBAC-001, EDGE-008-041, EDGE-008-042, EDGE-008-043; SC-008-043, SC-008-044, SC-008-047.
 */
let api: Api;
afterEach(async () => api?.close());

const BIO = 'Adora el queso y le teme a los truenos';
const idOf = (json: unknown) => (json as { id: string }).id;
const ifMatch = (version: unknown): Record<string, string> => ({ 'if-match': `"${String(version)}"` });

/** Mascota de Andrés asignada a un hogar con lucia.r de CAREGIVER, maria.v de READER y carlos_88 de ADMIN. */
async function setup() {
  api = await createApi();
  const andres = await api.login('andres');
  const petId = idOf((await api.call('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: 'Nala' } })).json);
  const hid = ((await api.call('POST', '/api/households', { cookie: andres, body: { name: 'Casa bio' } })).json as { household: { id: string } }).household.id;
  for (const [username, roleOnJoin] of [['lucia.r', 'CAREGIVER'], ['maria.v', 'READER'], ['carlos_88', 'ADMIN']] as const) {
    await api.call('POST', `/api/households/${hid}/invitations`, { cookie: andres, body: { username, roleOnJoin } });
    await api.call('POST', `/api/invitations/${hid}/accept`, { cookie: await api.login(username) });
  }
  await api.call('PUT', `/api/pets/${petId}/assignments/${hid}`, { cookie: andres });
  return { andres, petId, hid };
}
const dashboard = async (cookie: string, petId: string) => (await api.call('GET', `/api/pets/${petId}/dashboard`, { cookie })).json as { profile: { version: number; biography?: string | null } };
const patch = (cookie: string, petId: string, version: number, body: unknown) => api.call('PATCH', `/api/pets/${petId}`, { cookie, body, headers: ifMatch(version) });

describe('biografía de la mascota por HTTP (T1179, T1181)', () => {
  it('[GH:#21][REQ-BIO8-001][REQ-BIO8-002][SC-008-043] el propietario guarda la biografía con If-Match, la respuesta y la ficha la devuelven y la versión de la ficha sube', async () => {
    const { andres, petId } = await setup();
    const before = await dashboard(andres, petId);
    expect(before.profile.biography).toBeNull();
    const saved = await patch(andres, petId, before.profile.version, { biography: BIO });
    expect([saved.status, (saved.json as { biography: string; version: number }).biography, (saved.json as { version: number }).version]).toEqual([200, BIO, before.profile.version + 1]);
    expect((await dashboard(andres, petId)).profile.biography).toBe(BIO);
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-008-041][SC-008-044] se recorta; vacía o solo espacios queda null; null la borra; 280 caracteres entran y 281 no', async () => {
    const { andres, petId } = await setup();
    let version = (await dashboard(andres, petId)).profile.version;
    const results: Array<[string, number, unknown]> = [];
    for (const [label, body] of [['recortada', { biography: `   ${BIO}  ` }], ['280', { biography: 'a'.repeat(280) }], ['vacía', { biography: '' }], ['espacios', { biography: '   ' }], ['null', { biography: null }]] as const) {
      const r = await patch(andres, petId, version, body);
      version += 1;
      results.push([label, r.status, (r.json as { biography: unknown }).biography]);
    }
    expect(results).toEqual([['recortada', 200, BIO], ['280', 200, 'a'.repeat(280)], ['vacía', 200, null], ['espacios', 200, null], ['null', 200, null]]);
    const tooLong = await patch(andres, petId, version, { biography: 'a'.repeat(281) });
    expect(problemOf(tooLong)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    expect((await dashboard(andres, petId)).profile.version).toBe(version); // un rechazo no cambia nada
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-008-041][SC-008-044] los caracteres de control y los saltos de línea se rechazan con 422 que no repite el texto', async () => {
    const { andres, petId } = await setup();
    const version = (await dashboard(andres, petId)).profile.version;
    for (const bio of ['uno\ndos', 'uno\tdos', 'uno\u0000dos', 'uno\u007fdos', 'x'.repeat(10) + '\r']) {
      const r = await patch(andres, petId, version, { biography: bio === 'x'.repeat(10) + '\r' ? `${'x'.repeat(10)}\r\ny` : bio });
      expect([problemOf(r), JSON.stringify(r.json).includes('dos')]).toEqual([{ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, false]);
    }
    expect((await dashboard(andres, petId)).profile.biography).toBeNull();
  });

  it('[GH:#21][REQ-BIO8-001][REQ-RBAC-001][SC-008-044] propietario y ADMIN la editan; Cuidador y Lector reciben 403 y la biografía no cambia', async () => {
    const { andres, petId } = await setup();
    let version = (await dashboard(andres, petId)).profile.version;
    const admin = await patch(await api.login('carlos_88'), petId, version, { biography: 'del administrador' });
    version += 1;
    expect([admin.status, (admin.json as { biography: string }).biography]).toEqual([200, 'del administrador']);
    for (const username of ['lucia.r', 'maria.v']) {
      const denied = await patch(await api.login(username), petId, version, { biography: 'intruso' });
      expect([username, problemOf(denied)]).toEqual([username, { status: 403, code: 'ERR-ACC-FORBIDDEN' }]);
    }
    const seen = await dashboard(await api.login('maria.v'), petId); // el Lector la ve
    expect([seen.profile.biography, seen.profile.version]).toEqual(['del administrador', version]);
  });

  it('[GH:#21][REQ-BIO8-001][EDGE-007-009] con una versión vieja de la ficha responde 412 y no cambia la biografía', async () => {
    const { andres, petId } = await setup();
    const version = (await dashboard(andres, petId)).profile.version;
    await patch(andres, petId, version, { biography: 'primera' });
    const stale = await patch(andres, petId, version, { biography: BIO });
    expect(problemOf(stale)).toEqual({ status: 412, code: 'ERR-PET-VERSION-CONFLICT' });
    expect((await dashboard(andres, petId)).profile.biography).toBe('primera');
  });

  it('[GH:#21][REQ-BIO8-002][EDGE-008-042][SC-008-046] la tarjeta del listado y el resumen veterinario compartido no llevan la biografía ni la palabra; la ficha sí', async () => {
    const { andres, petId } = await setup();
    const version = (await dashboard(andres, petId)).profile.version;
    await patch(andres, petId, version, { biography: BIO });
    const list = await api.call('GET', '/api/pets', { cookie: andres });
    const summary = await api.call('GET', `/api/pets/${petId}/clinical-summary`, { cookie: andres, contract: false });
    for (const response of [list, summary]) {
      expect(response.status).toBe(200);
      expect(response.text).not.toContain('queso');
      expect(response.text).not.toContain('biography');
    }
  });
});

describe('biografía en el respaldo 3.3.0 (T1179, T1180)', () => {
  it('[GH:#21][REQ-BIO8-004][EDGE-008-043][SC-008-047] el respaldo 3.3.0 lleva biography; reimportarlo la conserva y un respaldo 3.2.0 sin el campo se importa con null', async () => {
    const { andres, petId } = await setup();
    const version = (await dashboard(andres, petId)).profile.version;
    await patch(andres, petId, version, { biography: BIO });
    const exported = await api.call('POST', '/api/backup/export', { cookie: andres });
    const envelope = exported.json as { schemaVersion: string; pets: Array<Record<string, unknown>> };
    expect([exported.status, envelope.schemaVersion, envelope.pets.map((p) => [p['name'], p['biography']]).filter(([, bio]) => bio !== null), envelope.pets.every((p) => p['biography'] === null || typeof p['biography'] === 'string')]).toEqual([200, '3.3.0', [['Nala', BIO]], true]);
    expect(exported.text).not.toMatch(/auth_identities|googleSub|approval/i);
    const roundTripPreview = (await api.call('POST', '/api/backup/import/preview', { cookie: andres, raw: exported.text })).json as { fileDigest: string; sourceSchemaVersion: string };
    expect(roundTripPreview.sourceSchemaVersion).toBe('3.3.0');
    await api.call('POST', '/api/backup/import', { cookie: andres, raw: exported.text, headers: { 'x-argos-import-confirm': roundTripPreview.fileDigest } });
    expect((await dashboard(andres, petId)).profile.biography).toBe(BIO);
    const legacy = JSON.stringify({ ...envelope, schemaVersion: '3.2.0', pets: envelope.pets.map(({ biography: _b, ...pet }) => pet) });
    const legacyPreview = (await api.call('POST', '/api/backup/import/preview', { cookie: andres, raw: legacy })).json as { fileDigest: string; sourceSchemaVersion: string };
    expect(legacyPreview.sourceSchemaVersion).toBe('3.2.0');
    const imported = await api.call('POST', '/api/backup/import', { cookie: andres, raw: legacy, headers: { 'x-argos-import-confirm': legacyPreview.fileDigest } });
    expect([imported.status, (imported.json as { sourceSchemaVersion: string }).sourceSchemaVersion]).toEqual([200, '3.2.0']);
    expect((await dashboard(andres, petId)).profile.biography).toBeNull();
  });
});
