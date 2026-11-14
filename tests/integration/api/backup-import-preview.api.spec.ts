import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { v2 } from '../../fixtures/backup-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';
import { LUNA_ID } from './api-fixtures.ts';

/**
 * T272 (fase roja, Rebanada 5, REQ-BACKUP2-002): previsualización (conteos, colisiones solo propias, aviso de
 * mascotas compartidas, fileDigest, sin persistir) y confirmación con X-Argos-Import-Confirm.
 *
 * @implements REQ-BACKUP2-002, STATE-BACKUP-001, ERR-BACKUP-SCHEMA-INVALID
 */
let api: Api;
afterEach(async () => api.close());

const PREVIEW = '/api/backup/import/preview';
const IMPORT = '/api/backup/import';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const preview = (cookie: string | null, raw: string, extra: { csrf?: boolean } = {}) =>
  api.call('POST', PREVIEW, { ...(cookie === null ? {} : { cookie }), raw, ...extra, ...(extra.csrf === false ? { contract: false } : {}) });
const confirm = (cookie: string, raw: string, digest: string | null) =>
  api.call('POST', IMPORT, { cookie, raw, ...(digest === null ? {} : { headers: { 'x-argos-import-confirm': digest } }) });
const exportText = async (cookie: string) => (await api.call('POST', '/api/backup/export', { cookie })).text;

describe('previsualización (REQ-BACKUP2-002, STATE-BACKUP-001)', () => {
  it('[REQ-BACKUP2-002] 200 con sourceSchemaVersion, conteos, colisiones, mascotas compartidas afectadas y fileDigest = SHA-256 de los bytes', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const r = await preview(cookie, text);
    const body = r.json as { sourceSchemaVersion?: string; fileDigest?: string; counts?: { pets: number }; collisions?: unknown; affectedSharedPets?: { petsCount: number } };
    expect([r.status, body.sourceSchemaVersion, body.fileDigest, body.counts?.pets, body.collisions, (body.affectedSharedPets?.petsCount ?? 0) > 0]).toEqual([
      200,
      '3.0.0',
      sha256(text),
      5,
      { petsReplacedCount: 5, sameIdPetsCount: 5 },
      true,
    ]);
  });

  it('[REQ-BACKUP2-002] la previsualización no persiste nada: base, sesión y auditoría idénticas', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const before = api.dump();
    const r = await preview(cookie, text);
    expect([r.status, api.dump() === before]).toEqual([200, true]);
  });

  it('[REQ-BACKUP2-002] las colisiones se miden solo contra mascotas propias: un archivo con 1 mascota propia deja petsReplacedCount 5 y sameIdPetsCount 1', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const file = JSON.parse(await exportText(cookie)) as { pets: Array<{ id: string }>; records: Record<string, Array<{ petId: string }>> };
    const keep = file.pets[0]!.id;
    file.pets = file.pets.filter((p) => p.id === keep);
    for (const k of Object.keys(file.records)) file.records[k] = file.records[k]!.filter((x) => x.petId === keep);
    const r = await preview(cookie, JSON.stringify(file));
    expect([r.status, (r.json as { collisions?: unknown }).collisions]).toEqual([200, { petsReplacedCount: 5, sameIdPetsCount: 1 }]);
  });

  it('[REQ-BACKUP2-002] un usuario sin mascotas (Lucía) no ve colisiones ni mascotas compartidas, aunque el archivo traiga IDs de otros', async () => {
    api = await createApi();
    const text = await exportText(await api.login('maria.v'));
    const r = await preview(await api.login('lucia.r'), text);
    const body = r.json as { collisions?: unknown; affectedSharedPets?: unknown };
    expect(JSON.stringify([r.status, body.collisions, body.affectedSharedPets, r.text.includes(LUNA_ID)])).toBe(
      JSON.stringify([200, { petsReplacedCount: 0, sameIdPetsCount: 0 }, { petsCount: 0, householdsCount: 0 }, false]),
    );
  });

  it('[REQ-BACKUP2-002] acepta el sobre 2.0.0 heredado: sourceSchemaVersion 2.0.0 y fileDigest de sus bytes', async () => {
    api = await createApi();
    const text = JSON.stringify(v2());
    const r = await preview(await api.login('andres'), text);
    const body = r.json as { sourceSchemaVersion?: string; fileDigest?: string };
    expect([r.status, body.sourceSchemaVersion, body.fileDigest]).toEqual([200, '2.0.0', sha256(text)]);
  });

  it('[REQ-BACKUP2-002] el fileDigest cambia con un solo byte distinto', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const a = await preview(cookie, text);
    const b = await preview(cookie, `${text}\n`);
    expect([a.status, b.status, (a.json as { fileDigest?: string }).fileDigest !== (b.json as { fileDigest?: string }).fileDigest]).toEqual([200, 200, true]);
  });

  it('[ERR-BACKUP-SCHEMA-INVALID] un sobre con esquema inválido → 422 en previsualización y la base queda igual', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const file = JSON.parse(await exportText(cookie)) as Record<string, unknown>;
    file['campoDesconocido'] = true;
    const before = api.dump();
    const r = await preview(cookie, JSON.stringify(file));
    expect([problemOf(r), api.dump() === before]).toEqual([{ status: 422, code: 'ERR-BACKUP-SCHEMA-INVALID', finalState: 'ROLLED_BACK' }, true]);
  });

  it('[INV-AUTH-007][REQ-RBAC-001] sin X-Argos-Request → 403 ERR-AUTH-CSRF-REJECTED y sin sesión → 401', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const noCsrf = await preview(cookie, text, { csrf: false });
    const noSession = await preview(null, text);
    expect([problemOf(noCsrf), problemOf(noSession)]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });
});

describe('confirmación con X-Argos-Import-Confirm (REQ-BACKUP2-002, STATE-BACKUP-001)', () => {
  it('[REQ-BACKUP2-002] importar sin X-Argos-Import-Confirm → 422 ERR-SCHEMA-VALIDATION-FAILED y la base queda igual', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const before = api.dump();
    const r = await confirm(cookie, text, null);
    expect([problemOf(r).status, problemOf(r).code, api.dump() === before]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED', true]);
  });

  it('[REQ-BACKUP2-002] un fileDigest de otro archivo → 422 ERR-SCHEMA-VALIDATION-FAILED y la base queda igual', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const before = api.dump();
    const r = await confirm(cookie, text, sha256(`${text} `));
    expect([problemOf(r).status, problemOf(r).code, api.dump() === before]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED', true]);
  });

  it('[REQ-BACKUP2-002] un digest mal formado (no SHA-256 hex) → 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const r = await confirm(cookie, await exportText(cookie), 'no-es-un-digest');
    expect([problemOf(r).status, problemOf(r).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });

  it('[REQ-BACKUP2-002] previsualizar y luego importar con el fileDigest devuelto → 200 COMPLETED con los conteos del archivo', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = await exportText(cookie);
    const p = await preview(cookie, text);
    const r = await confirm(cookie, text, (p.json as { fileDigest: string }).fileDigest);
    expect([p.status, r.status, r.json]).toEqual([200, 200, { finalState: 'COMPLETED', sourceSchemaVersion: '3.0.0', importedPetsCount: 5, importedRecordsCount: 8 }]);
  });
});
