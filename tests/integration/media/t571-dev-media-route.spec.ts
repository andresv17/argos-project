import { afterEach, describe, expect, it } from 'vitest';
import { MemoryMediaStorageAdapter } from '../../../src/infrastructure/adapters/memory-media-storage.adapter.ts';
import { buildApp } from '../../../src/infrastructure/http/app.ts';
import { createApi, username, type Api } from '../api/api-harness.ts';
import { ANDRES } from '../../fixtures/application-harness.ts';

/**
 * T571 (REQ-GCS-003): ruta de desarrollo /__dev/media/<clave> del adaptador de memoria: autenticada, solo con NODE_ENV != production,
 * nosniff y `attachment` salvo imágenes.
 */
const PET = '3f1c0a52-7d3e-4b8a-9a61-0c2f4d5e6a71';
const ID = '8b2d9c10-5e47-4f3a-a1b6-7c9d0e1f2a34';
const KEY = (folder: string): string => `pets/${PET}/${folder}/${ID}`;
let api: Api | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function setup(nodeEnv: string | undefined): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; cookie: string; storage: MemoryMediaStorageAdapter }> {
  api = await createApi();
  const storage = new MemoryMediaStorageAdapter({ now: () => new Date('2026-11-17T12:00:00.000Z') });
  const app = await buildApp({ deps: api.deps, cookieSecure: false, devMedia: { storage, ...(nodeEnv === undefined ? {} : { nodeEnv }) } });
  const cookie = await api.login(username(ANDRES));
  return { app, cookie, storage };
}

describe('GET /__dev/media/<clave> (T571)', () => {
  it('sin sesión responde 401 y no entrega el objeto', async () => {
    const { app, storage } = await setup('test');
    await storage.put(KEY('photos'), Uint8Array.from([1, 2, 3]), 'image/png');
    const res = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('photos')}` });
    expect(res.statusCode).toBe(401);
    expect(Array.from(res.rawPayload)).not.toEqual([1, 2, 3]);
    await app.close();
  });

  it('con sesión sirve una imagen inline con nosniff y su tipo', async () => {
    const { app, cookie, storage } = await setup('development');
    await storage.put(KEY('photos'), Uint8Array.from([1, 2, 3]), 'image/png');
    const res = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('photos')}`, headers: { cookie } });
    expect([res.statusCode, res.headers['content-type'], res.headers['x-content-type-options'], res.headers['cache-control']]).toEqual([200, 'image/png', 'nosniff', 'no-store']);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(Array.from(res.rawPayload)).toEqual([1, 2, 3]);
    await app.close();
  });

  it('un PDF se sirve como attachment', async () => {
    const { app, cookie, storage } = await setup('test');
    await storage.put(KEY('files'), Uint8Array.from([0x25, 0x50]), 'application/pdf');
    const res = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('files')}`, headers: { cookie } });
    expect([res.statusCode, res.headers['content-type'], String(res.headers['content-disposition']).startsWith('attachment')]).toEqual([200, 'application/pdf', true]);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    await app.close();
  });

  it('un objeto inexistente o una clave no válida responden 404 sin revelar la clave', async () => {
    const { app, cookie } = await setup('test');
    const missing = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('files')}`, headers: { cookie } });
    const invalid = await app.inject({ method: 'GET', url: '/__dev/media/pets/../../etc/passwd', headers: { cookie } });
    expect([missing.statusCode, invalid.statusCode]).toEqual([404, 404]);
    expect(missing.body).not.toContain(ID);
    await app.close();
  });

  it('con NODE_ENV=production la ruta no existe (404 aun con sesión y objeto)', async () => {
    const { app, cookie, storage } = await setup('production');
    await storage.put(KEY('photos'), Uint8Array.from([1]), 'image/png');
    const res = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('photos')}`, headers: { cookie } });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).not.toBe('image/png');
    await app.close();
  });

  it('T811 (006): sirve la imagen de la escena y la foto del hogar con sesión, sin sesión 401, y una carpeta ajena responde 404', async () => {
    const { app, cookie, storage } = await setup('test');
    const scene = `scenes/${PET}/images/${ID}`;
    const photo = `households/${PET}/photo/${ID}`;
    await storage.put(scene, Uint8Array.from([4, 5]), 'image/webp');
    await storage.put(photo, Uint8Array.from([6]), 'image/png');
    const withSession = await Promise.all([scene, photo].map((k) => app.inject({ method: 'GET', url: `/__dev/media/${k}`, headers: { cookie } })));
    expect(withSession.map((r) => [r.statusCode, r.headers['content-type'], r.headers['x-content-type-options'], r.headers['content-disposition']])).toEqual([
      [200, 'image/webp', 'nosniff', undefined],
      [200, 'image/png', 'nosniff', undefined],
    ]);
    expect((await app.inject({ method: 'GET', url: `/__dev/media/${scene}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/__dev/media/scenes/${PET}/files/${ID}`, headers: { cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/__dev/media/scenes/../../etc/passwd', headers: { cookie } })).statusCode).toBe(404);
    await app.close();
  });

  it('sin la opción devMedia no se registra nada', async () => {
    api = await createApi();
    const app = await buildApp({ deps: api.deps, cookieSecure: false });
    const res = await app.inject({ method: 'GET', url: `/__dev/media/${KEY('photos')}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
