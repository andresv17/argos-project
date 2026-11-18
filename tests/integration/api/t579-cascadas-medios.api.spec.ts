/**
 * T579 [US4] cascadas de medios por HTTP (REQ-GCS-004, REQ-IMP-001, REQ-ACC-002, SC-ALM-015, SC-ALM-027): eliminar la cuenta y la importación por
 * reemplazo borran los objetos de GCS (cola + borrado tras el COMMIT + refuerzo por `list`), dejan `avatar_object_id` nulo y conservan `avatar_version`.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ELENA, ELENA_PET, IDENTITY_PASSWORDS } from '../../fixtures/identity-fixtures.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, PDF, PNG } from '../../fixtures/media-harness.ts';
import { createApi, createIdentityApi, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const name = { 'x-argos-filename': 'a', 'content-type': 'application/octet-stream' };
const AVATAR_ID = 'f0000000-0000-4000-8000-0000000a0a02';
const storageOf = () => new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));

describe('T579 eliminar la cuenta borra los medios y el avatar de todas sus mascotas (SC-ALM-015, REQ-ACC-002)', () => {
  it('[SC-ALM-015] tras eliminar la cuenta no queda ningún objeto bajo pets/{petId}/ ni filas de medios ni de la cola', async () => {
    const storage = storageOf();
    api = await createIdentityApi({ media: { storage, limits: DEFAULT_LIMITS } });
    const cookie = await api.login('elena.solo');
    const base = `/api/pets/${ELENA_PET.id}`;
    await api.call('POST', `${base}/media?kind=FILE`, { cookie, raw: PDF(), headers: name });
    await api.call('POST', `${base}/media?kind=PHOTO`, { cookie, raw: PNG(), headers: name });
    await storage.put(`pets/${ELENA_PET.id}/avatar/${AVATAR_ID}`, PNG(), 'image/png');
    await api.deps.uow.runInTransaction((r) => r.pets.replaceAvatar(ELENA_PET.id, AVATAR_ID).then(() => undefined));
    expect(await storage.keys(`pets/${ELENA_PET.id}/`)).toHaveLength(3);
    const token = await api.issueConfirmationToken(ELENA);
    const r = await api.call('POST', '/api/account/deletion', { cookie, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    expect(r.status).toBe(204);
    expect([await storage.keys(`pets/${ELENA_PET.id}/`), api.db.prepare('SELECT count(*) FROM pet_media').pluck().get(), api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()]).toEqual([[], 0, 0]);
  });

  it('[REQ-GCS-004] con el almacenamiento caído la cuenta se elimina igual y las claves quedan en la cola para el mantenimiento', async () => {
    const storage = storageOf();
    api = await createIdentityApi({ media: { storage, limits: DEFAULT_LIMITS } });
    const cookie = await api.login('elena.solo');
    await api.call('POST', `/api/pets/${ELENA_PET.id}/media?kind=FILE`, { cookie, raw: PDF(), headers: name });
    storage.down = true;
    const token = await api.issueConfirmationToken(ELENA);
    const r = await api.call('POST', '/api/account/deletion', { cookie, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    expect(r.status).toBe(204);
    expect(api.db.prepare('SELECT reason, attempts FROM media_deletion_queue').all()).toEqual([{ reason: 'DELETE', attempts: 1 }]);
  });
});

describe('T579 importar por reemplazo borra los medios de las mascotas reemplazadas (REQ-IMP-001, SC-ALM-015)', () => {
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');

  it('[REQ-IMP-001][D-15 A] la vista previa cuenta archivos, fotos y avatares que se eliminarán; al importar se borran, avatar_object_id queda nulo y avatar_version no retrocede', async () => {
    const storage = storageOf();
    api = await createApi(undefined, { media: { storage, limits: DEFAULT_LIMITS } });
    const cookie = await api.login('andres');
    const base = `/api/pets/${ARGOS.id}`;
    await api.call('POST', `${base}/media?kind=FILE`, { cookie, raw: PDF(), headers: name });
    await api.call('POST', `${base}/media?kind=PHOTO`, { cookie, raw: PNG(), headers: name });
    await storage.put(`pets/${ARGOS.id}/avatar/${AVATAR_ID}`, PNG(), 'image/png');
    await api.deps.uow.runInTransaction(async (r) => {
      await r.pets.replaceAvatar(ARGOS.id, 'f0000000-0000-4000-8000-0000000a0a00');
      await r.pets.replaceAvatar(ARGOS.id, AVATAR_ID);
    });
    const text = (await api.call('POST', '/api/backup/export', { cookie })).text;
    const preview = await api.call('POST', '/api/backup/import/preview', { cookie, raw: text });
    expect((preview.json as { mediaToDeleteCount: number }).mediaToDeleteCount).toBe(3);
    const done = await api.call('POST', '/api/backup/import', { cookie, raw: text, headers: { 'x-argos-import-confirm': sha(text) } });
    expect(done.status).toBe(200);
    expect(await storage.keys('pets/')).toEqual([]);
    expect(api.db.prepare('SELECT count(*) FROM pet_media').pluck().get()).toBe(0);
    expect(api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()).toBe(0);
    expect(api.db.prepare('SELECT avatar_version, avatar_object_id FROM pets WHERE id = ?').get(ARGOS.id)).toEqual({ avatar_version: 2, avatar_object_id: null });
  });

  it('[REQ-IMP-001] sin medios ni avatar la vista previa informa 0 y una mascota nueva del archivo nace con avatar_version 0', async () => {
    api = await createApi(undefined, { media: { storage: storageOf(), limits: DEFAULT_LIMITS } });
    const cookie = await api.login('andres');
    const text = (await api.call('POST', '/api/backup/export', { cookie })).text;
    const preview = await api.call('POST', '/api/backup/import/preview', { cookie, raw: text });
    expect((preview.json as { mediaToDeleteCount: number }).mediaToDeleteCount).toBe(0);
  });
});
