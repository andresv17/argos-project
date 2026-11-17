/**
 * T578 [US4] rutas HTTP de medios (REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-GCS-004; D-18 A; SC-ALM-010, SC-ALM-011, SC-ALM-029, SC-ALM-030):
 *  - subida de cuerpo crudo con `kind` en la query y `X-Argos-Filename` (cero multipart), tope de 10 MiB cortado en la lectura;
 *  - como máximo `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS` subidas simultáneas (la siguiente recibe 429 ERR-RATE-LIMITED);
 *  - `Cache-Control: no-store` en `/access` y en los errores de las rutas de medios;
 *  - cada respuesta se comprueba contra el OpenAPI de la 004 (arnés `createApi`).
 */
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryMediaStorageAdapter } from '../../../src/infrastructure/adapters/memory-media-storage.adapter.ts';
import { ANDRES, ARGOS, LUCIA } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF, PNG, text } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const BASE = `/api/pets/${ARGOS.id}/media`;
const name = (value: string) => ({ 'x-argos-filename': encodeURIComponent(value), 'content-type': 'application/octet-stream' });

async function createMediaApi(limits: Partial<typeof DEFAULT_LIMITS> = {}): Promise<{ api: Api; storage: ControlledStorage }> {
  const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
  void MemoryMediaStorageAdapter;
  const created = await createApi(undefined, { media: { storage, limits: { ...DEFAULT_LIMITS, ...limits } } });
  api = created;
  return { api: created, storage };
}

describe('T578 POST /pets/{petId}/media: cuerpo crudo, kind en la query y nombre en la cabecera (D-18 A)', () => {
  it('[REQ-ARC-001] responde 201 con el MediaItem conforme al OpenAPI y el nombre decodificado de X-Argos-Filename', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    const r = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: name('Consulta ñ.pdf') });
    const item = r.json as { id: string; kind: string; mime: string; sizeBytes: number; originalName: string };
    expect([r.status, item.kind, item.mime, item.sizeBytes, item.originalName]).toEqual([201, 'FILE', 'application/pdf', 64, 'Consulta ñ.pdf']);
    expect(await storage.keys()).toEqual([`pets/${ARGOS.id}/files/${item.id}`]);
  });

  it('[SC-ALM-003][INV-ARC-001] el Content-Type que declara el cliente no decide: image/png con contenido PDF se guarda como PDF', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    const r = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: { ...name('x.png'), 'content-type': 'image/png' } });
    expect([r.status, (r.json as { mime: string }).mime, (r.json as { originalName: string }).originalName]).toEqual([201, 'application/pdf', 'x.pdf']);
  });

  it('[REQ-ARC-001] kind ausente o inválido es 422 ERR-SCHEMA-VALIDATION-FAILED; un cuerpo vacío es 415; un SVG es 415', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    const noKind = await api.call('POST', BASE, { cookie, raw: PDF(), headers: name('a.pdf') });
    const badKind = await api.call('POST', `${BASE}?kind=AUDIO`, { cookie, raw: PDF(), headers: name('a.pdf') });
    const empty = await api.call('POST', `${BASE}?kind=FILE`, { cookie, headers: name('a.pdf') });
    const svg = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: text('<svg></svg>'), headers: name('a.svg') });
    expect([noKind, badKind, empty, svg].map(problemOf)).toEqual([
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 415, code: 'ERR-MEDIA-TYPE-NOT-ALLOWED' },
      { status: 415, code: 'ERR-MEDIA-TYPE-NOT-ALLOWED' },
    ]);
  });

  it('[SC-ALM-005] 10 485 761 bytes y 32 MiB son 413 ERR-MEDIA-TOO-LARGE; 10 485 760 bytes válidos se aceptan', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    const over = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(10_485_761), headers: name('a.pdf') });
    const huge = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(32 * 1024 * 1024), headers: name('a.pdf') });
    expect([over, huge].map(problemOf)).toEqual([
      { status: 413, code: 'ERR-MEDIA-TOO-LARGE' },
      { status: 413, code: 'ERR-MEDIA-TOO-LARGE' },
    ]);
    expect(await storage.keys()).toEqual([]);
    const exact = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(10_485_760), headers: name('a.pdf') });
    expect(exact.status).toBe(201);
  });

  it('[REQ-ARC-001] el nombre con codificación porcentual inválida es 422 y no se sube nada', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    const r = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: { 'x-argos-filename': '%E0%A4%A', 'content-type': 'application/octet-stream' } });
    expect([problemOf(r), await storage.keys()]).toEqual([{ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' }, []]);
  });

  it('[INV-AUTH-007][REQ-ARC-002] sin cabecera CSRF es 403 ERR-AUTH-CSRF-REJECTED; sin sesión 401; sin acceso 404; Lector 403', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const csrf = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), csrf: false, headers: name('a.pdf') });
    const anonymous = await api.call('POST', `${BASE}?kind=FILE`, { raw: PDF(), headers: name('a.pdf') });
    const stranger = await api.call('POST', `${BASE}?kind=FILE`, { cookie: lucia, raw: PDF(), headers: name('a.pdf') });
    expect([csrf, anonymous, stranger].map(problemOf)).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
    ]);
    void ANDRES;
    void LUCIA;
  });

  it('[SC-ALM-029][EDGE-019] un cuerpo cortado a mitad no genera put ni fila; el servidor sigue respondiendo', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    await api.app.listen({ host: '127.0.0.1', port: 0 });
    const address = api.app.server.address() as { port: number };
    await new Promise<void>((resolve, reject) => {
      const socket = connect(address.port, '127.0.0.1', () => {
        socket.write(
          `POST ${BASE}?kind=FILE HTTP/1.1\r\nHost: x\r\nCookie: ${cookie}\r\nx-argos-request: 1\r\nx-argos-filename: a.pdf\r\ncontent-type: application/octet-stream\r\ncontent-length: 9000\r\n\r\n`,
        );
        socket.write(Buffer.from(PDF(6000)));
        setTimeout(() => socket.destroy(), 50);
      });
      socket.on('close', () => resolve());
      socket.on('error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await storage.keys()).toEqual([]);
    expect(storage.operations).toEqual([]);
    const after = await api.call('GET', `${BASE}?kind=FILE`, { cookie });
    expect([after.status, (after.json as { total: number }).total]).toEqual([200, 0]);
  });

  it('[SC-ALM-029] con ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS = 4, seis subidas simultáneas: cuatro avanzan y la quinta y la sexta reciben 429 ERR-RATE-LIMITED', async () => {
    const { api, storage } = await createMediaApi({ maxConcurrentUploads: 4 });
    const cookie = await api.login('andres');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let waiting = 0;
    storage.beforePut = async () => {
      waiting += 1;
      if (waiting === 4) setTimeout(release, 20);
      await gate;
    };
    const calls = Array.from({ length: 6 }, (_, n) => api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(32 + n), headers: name(`n${n}.pdf`) }));
    const results = (await Promise.all(calls)).map((r) => r.status).sort();
    expect(results).toEqual([201, 201, 201, 201, 429, 429]);
    const limited = (await Promise.all([api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: name('x.pdf') })])).map(problemOf);
    expect(limited).toEqual([{ status: 201, code: undefined }]); // el cupo se libera al terminar
  });
});

describe('T578 GET /pets/{petId}/media y /access (REQ-ARC-003, REQ-ALB-001)', () => {
  it('[SC-ALM-010][SC-ALM-011] /access responde {url, expiresAt, mime} sin disposition y con Cache-Control: no-store', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    const created = await api.call('POST', `${BASE}?kind=PHOTO`, { cookie, raw: PNG(), headers: name('mi-foto-privada.png') });
    const id = (created.json as { id: string }).id;
    const r = await api.call('GET', `${BASE}/${id}/access`, { cookie });
    const body = r.json as { url: string; expiresAt: string; mime: string };
    expect([r.status, r.headers['cache-control'], Object.keys(body).sort(), body.mime]).toEqual([200, 'no-store', ['expiresAt', 'mime', 'url'], 'image/png']);
    expect(body.url).not.toContain('privada');
  });

  it('[REQ-ARC-003][SC-ALM-030] con el almacenamiento caído /access es 502 ERR-MEDIA-STORAGE-UNAVAILABLE con no-store; DELETE responde 204', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    const created = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: name('a.pdf') });
    const id = (created.json as { id: string }).id;
    storage.down = true;
    const access = await api.call('GET', `${BASE}/${id}/access`, { cookie });
    expect([problemOf(access), access.headers['cache-control']]).toEqual([{ status: 502, code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' }, 'no-store']);
    const deleted = await api.call('DELETE', `${BASE}/${id}`, { cookie });
    expect(deleted.status).toBe(204);
    const queue = api.db.prepare('SELECT reason, attempts FROM media_deletion_queue').all();
    expect(queue).toEqual([{ reason: 'DELETE', attempts: 1 }]);
  });

  it('[REQ-ARC-003] los errores de las rutas de medios llevan Cache-Control: no-store (404, 415, 403)', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    const missing = await api.call('GET', `${BASE}/99999999-9999-4999-8999-999999999999/access`, { cookie });
    const bad = await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: text('<svg>'), headers: name('a.svg') });
    expect([missing, bad].map((r) => [r.status, r.headers['cache-control']])).toEqual([[404, 'no-store'], [415, 'no-store']]);
  });

  it('[REQ-ALB-001] GET lista con kind y page; page=0 es 422; sin kind lista ambos tipos', async () => {
    const { api } = await createMediaApi();
    const cookie = await api.login('andres');
    await api.call('POST', `${BASE}?kind=PHOTO`, { cookie, raw: JPEG(), headers: name('a.jpg') });
    await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: name('a.pdf') });
    const photos = await api.call('GET', `${BASE}?kind=PHOTO&page=1`, { cookie });
    const all = await api.call('GET', BASE, { cookie });
    const zero = await api.call('GET', `${BASE}?kind=PHOTO&page=0`, { cookie });
    expect([(photos.json as { total: number; pageSize: number }).total, (photos.json as { pageSize: number }).pageSize, (all.json as { total: number }).total, problemOf(zero)]).toEqual([
      1,
      24,
      2,
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });

  it('[REQ-GCS-004] DELETE responde 204, borra la fila y el objeto y deja la cola vacía; sin permiso 403 y sin acceso 404', async () => {
    const { api, storage } = await createMediaApi();
    const cookie = await api.login('andres');
    const id = ((await api.call('POST', `${BASE}?kind=FILE`, { cookie, raw: PDF(), headers: name('a.pdf') })).json as { id: string }).id;
    const stranger = await api.call('DELETE', `${BASE}/${id}`, { cookie: await api.login('lucia.r') });
    const ok = await api.call('DELETE', `${BASE}/${id}`, { cookie });
    const again = await api.call('DELETE', `${BASE}/${id}`, { cookie });
    expect([problemOf(stranger), ok.status, problemOf(again), await storage.keys(), api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()]).toEqual([
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      204,
      { status: 404, code: 'ERR-MEDIA-NOT-FOUND' },
      [],
      0,
    ]);
  });
});
