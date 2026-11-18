/**
 * T730 [US2] archivos clínicos por la API (REQ-CLI5-001; SC-005-001, SC-005-007): PDF, JPEG, PNG y WebP se aceptan con `kind=FILE` (201) y se listan solo con
 * `kind=FILE`; un `.docx` es 415 `application/problem+json` ERR-MEDIA-TYPE-NOT-ALLOWED; los archivos clínicos no aparecen con `kind=PHOTO` ni en `album/limits`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF, PNG, WEBP } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const BASE = `/api/pets/${ARGOS.id}`;
type Item = { id: string; kind: string; mime: string; originalName: string };
type Page = { items: Item[]; total: number };

async function start() {
  api = await createApi(undefined, { media: { storage: new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z')), limits: DEFAULT_LIMITS } });
  return api.login('andres');
}
const postFile = (cookie: string, raw: Uint8Array, name: string, contract = true) =>
  api.call('POST', `${BASE}/media?kind=FILE`, { cookie, raw, headers: { 'x-argos-filename': name, 'content-type': 'application/octet-stream' }, contract });

describe('T730 archivos clínicos por la API (REQ-CLI5-001)', () => {
  it('[SC-005-007] los cuatro tipos permitidos se aceptan como FILE y se listan con kind=FILE; con kind=PHOTO la lista está vacía', async () => {
    const cookie = await start();
    for (const [bytes, name] of [[PDF(), 'examen.pdf'], [JPEG(), 'rx.jpg'], [PNG(), 'rx.png'], [WEBP(), 'rx.webp']] as const) {
      const created = await postFile(cookie, bytes, name);
      expect([created.status, (created.json as Item).kind]).toEqual([201, 'FILE']);
    }
    const files = (await api.call('GET', `${BASE}/media?kind=FILE`, { cookie })).json as Page;
    expect([files.total, files.items.map((i) => i.mime).sort()]).toEqual([4, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']]);
    expect(((await api.call('GET', `${BASE}/media?kind=PHOTO`, { cookie })).json as Page).total).toBe(0);
  });

  it('[SC-005-007] un .docx es 415 application/problem+json ERR-MEDIA-TYPE-NOT-ALLOWED y no se lista', async () => {
    const cookie = await start();
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0, 0, 0, 0]);
    const rejected = await postFile(cookie, zip, 'informe.docx');
    expect(problemOf(rejected)).toEqual({ status: 415, code: 'ERR-MEDIA-TYPE-NOT-ALLOWED' });
    expect(rejected.headers['content-type']).toContain('application/problem+json');
    expect(((await api.call('GET', `${BASE}/media?kind=FILE`, { cookie })).json as Page).total).toBe(0);
  });

  it('[SC-005-001] los archivos clínicos no suman al álbum: album/limits sigue en 0 de 10', async () => {
    const cookie = await start();
    await postFile(cookie, PDF(), 'a.pdf');
    await postFile(cookie, PNG(), 'b.png');
    expect((await api.call('GET', `${BASE}/album/limits`, { cookie, contract: false })).json).toEqual({ photoCount: 0, maxPhotosPerPet: 10 });
  });
});
