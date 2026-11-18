/**
 * T722 [P][US1] listado del álbum y límite por la API (REQ-ALB5-001, REQ-ALB5-002, REQ-ALB5-005; SC-005-001, SC-005-002, SC-005-034):
 *  - `kind=PHOTO` lista solo fotos y `kind=FILE` solo archivos (3 fotos y 2 archivos clínicos);
 *  - `GET /api/pets/{petId}/album/limits` devuelve `{photoCount, maxPhotosPerPet}`;
 *  - la undécima foto es 409 `application/problem+json` ERR-MEDIA-ALBUM-LIMIT y los archivos clínicos siguen entrando.
 * Las respuestas de `album/limits` y del 409 de la 005 se comprueban sin el oráculo OpenAPI de la 004 (`contract: false`): su contrato
 * es el de la 005 (`specs/005-.../contracts/`), que el comprobador de la 004 no conoce.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, PDF, PNG } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const BASE = `/api/pets/${ARGOS.id}`;
type Item = { id: string; kind: string };
type Page = { items: Item[]; total: number };

async function start(platformParameters?: { getInt(key: 'album.max_photos_per_pet'): Promise<number> }) {
  api = await createApi(undefined, { media: { storage: new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z')), limits: DEFAULT_LIMITS }, ...(platformParameters === undefined ? {} : { platformParameters }) });
  return api.login('andres');
}
const post = (cookie: string, kind: 'PHOTO' | 'FILE', contract = true) =>
  api.call('POST', `${BASE}/media?kind=${kind}`, { cookie, raw: kind === 'PHOTO' ? PNG(40) : PDF(40), headers: { 'x-argos-filename': 'a', 'content-type': 'application/octet-stream' }, contract });

describe('T722 listado del álbum y límites (API)', () => {
  it('[SC-005-001] con 3 fotos y 2 archivos clínicos, kind=PHOTO lista solo las 3 fotos y kind=FILE solo los 2 archivos', async () => {
    const cookie = await start();
    for (const kind of ['PHOTO', 'PHOTO', 'FILE', 'PHOTO', 'FILE'] as const) expect((await post(cookie, kind)).status).toBe(201);
    const photos = (await api.call('GET', `${BASE}/media?kind=PHOTO`, { cookie })).json as Page;
    const files = (await api.call('GET', `${BASE}/media?kind=FILE`, { cookie })).json as Page;
    expect([photos.total, photos.items.map((i) => i.kind)]).toEqual([3, ['PHOTO', 'PHOTO', 'PHOTO']]);
    expect([files.total, files.items.map((i) => i.kind)]).toEqual([2, ['FILE', 'FILE']]);
  });

  it('[SC-005-034][REQ-ALB5-005] GET album/limits devuelve {photoCount, maxPhotosPerPet}: 3 de 10; los archivos clínicos no suman', async () => {
    const cookie = await start();
    for (const kind of ['PHOTO', 'FILE', 'PHOTO', 'PHOTO', 'FILE'] as const) await post(cookie, kind);
    const response = await api.call('GET', `${BASE}/album/limits`, { cookie, contract: false });
    expect([response.status, response.json]).toEqual([200, { photoCount: 3, maxPhotosPerPet: 10 }]);
  });

  it('[SC-005-034] sin sesión es 401 y una mascota inexistente o ajena es 404 ERR-PET-NOT-FOUND', async () => {
    const cookie = await start();
    expect((await api.call('GET', `${BASE}/album/limits`, { contract: false })).status).toBe(401);
    const ghost = await api.call('GET', '/api/pets/99999999-9999-4999-8999-999999999999/album/limits', { cookie, contract: false });
    expect(problemOf(ghost)).toEqual({ status: 404, code: 'ERR-PET-NOT-FOUND' });
  });

  it('[SC-005-002][REQ-ALB5-002] la undécima foto es 409 problem+json ERR-MEDIA-ALBUM-LIMIT, el conteo sigue en 10 y un archivo clínico se acepta', async () => {
    const cookie = await start();
    for (let n = 0; n < 10; n += 1) expect((await post(cookie, 'PHOTO')).status).toBe(201);
    const rejected = await post(cookie, 'PHOTO', false);
    expect(problemOf(rejected)).toEqual({ status: 409, code: 'ERR-MEDIA-ALBUM-LIMIT' });
    expect(rejected.headers['content-type']).toContain('application/problem+json');
    expect(rejected.json).toMatchObject({ type: 'urn:argos:error:ERR-MEDIA-ALBUM-LIMIT', title: 'Álbum completo', status: 409 });
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect((await api.call('GET', `${BASE}/album/limits`, { cookie, contract: false })).json).toEqual({ photoCount: 10, maxPhotosPerPet: 10 });
    expect((await post(cookie, 'FILE')).status).toBe(201);
  });

  it('[SC-005-004] con el parámetro en 12 el álbum admite 12 fotos y album/limits lo informa', async () => {
    const cookie = await start({ getInt: async () => 12 });
    for (let n = 0; n < 12; n += 1) expect((await post(cookie, 'PHOTO', false)).status).toBe(201);
    expect(problemOf(await post(cookie, 'PHOTO', false))).toEqual({ status: 409, code: 'ERR-MEDIA-ALBUM-LIMIT' });
    expect((await api.call('GET', `${BASE}/album/limits`, { cookie, contract: false })).json).toEqual({ photoCount: 12, maxPhotosPerPet: 12 });
  });
});
