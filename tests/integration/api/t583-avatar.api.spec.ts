/**
 * T583 [US5] avatar de la mascota (REQ-AVA-001, INV-AVA-001, REQ-GCS-004, REQ-GCS-006; SC-ALM-016, SC-ALM-017, SC-ALM-027, SC-ALM-030):
 * `PUT`/`GET`/`DELETE /pets/{petId}/avatar` con proxy autenticado, `avatar_version` monótono (nunca reiniciado), UUID de objeto por versión, caché
 * inmutable solo con `v` actual y `no-cache` en otro caso, 404 sin avatar, tercero sin acceso y `avatarVersion` en las respuestas de mascota.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runMediaQueueMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF, PNG, WEBP, text } from '../../fixtures/media-harness.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const AVATAR = `/api/pets/${ARGOS.id}/avatar`;
const image = { 'content-type': 'image/jpeg' };

async function createAvatarApi() {
  const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
  api = await createApi(undefined, { media: { storage, limits: DEFAULT_LIMITS } });
  return { api, storage, cookie: await api.login('andres') };
}
const put = (cookie: string, bytes: Uint8Array = JPEG(1024), headers: Record<string, string> = image) => api.call('PUT', AVATAR, { cookie, raw: bytes, headers });
const avatarKeys = (storage: ControlledStorage) => storage.keys(`pets/${ARGOS.id}/avatar/`);

describe('T583 PUT /pets/{petId}/avatar (REQ-AVA-001, INV-AVA-001)', () => {
  it('[SC-ALM-016] JPEG, PNG y WebP de hasta 512 KiB: avatarVersion 1, 2 y 3; solo queda referenciado el último objeto y los anteriores se borran', async () => {
    const { storage, cookie } = await createAvatarApi();
    const first = await put(cookie, JPEG(1024));
    expect([first.status, first.json]).toEqual([200, { avatarVersion: 1 }]);
    const firstKeys = await avatarKeys(storage);
    expect(firstKeys).toHaveLength(1);
    expect(firstKeys[0]).toMatch(new RegExp(`^pets/${ARGOS.id}/avatar/[0-9a-f-]{36}$`));
    const second = await put(cookie, PNG(2048), { 'content-type': 'image/png' });
    const third = await put(cookie, WEBP(512), { 'content-type': 'image/webp' });
    expect([second.json, third.json]).toEqual([{ avatarVersion: 2 }, { avatarVersion: 3 }]);
    const keys = await avatarKeys(storage);
    const row = api.db.prepare('SELECT avatar_version, avatar_object_id FROM pets WHERE id = ?').get(ARGOS.id) as { avatar_version: number; avatar_object_id: string };
    expect([keys, row.avatar_version]).toEqual([[`pets/${ARGOS.id}/avatar/${row.avatar_object_id}`], 3]);
    expect(keys[0]).not.toBe(firstKeys[0]);
    expect(api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()).toBe(0);
  });

  it('[SC-ALM-016][INV-AVA-001] DELETE y una nueva subida dan avatarVersion 3 (nunca vuelve a 1)', async () => {
    const { storage, cookie } = await createAvatarApi();
    await put(cookie);
    await put(cookie);
    const deleted = await api.call('DELETE', AVATAR, { cookie });
    const again = await put(cookie);
    expect([deleted.status, again.json, (await avatarKeys(storage)).length]).toEqual([204, { avatarVersion: 3 }, 1]);
  });

  it('[SC-ALM-016] un archivo de 600 KiB es 413, el de 524 288 bytes se acepta, el de 524 289 es 413; SVG, PDF y vacío son 415; el servidor no valida dimensiones', async () => {
    const { cookie, storage } = await createAvatarApi();
    const big = await put(cookie, JPEG(600 * 1024));
    const over = await put(cookie, JPEG(524_289));
    const exact = await put(cookie, JPEG(524_288));
    const svg = await put(cookie, text('<svg xmlns="http://www.w3.org/2000/svg"/>'), { 'content-type': 'image/svg+xml' });
    const pdf = await put(cookie, PDF(), { 'content-type': 'application/pdf' });
    const empty = await api.call('PUT', AVATAR, { cookie, headers: image });
    expect([big, over, exact, svg, pdf, empty].map((r) => r.status)).toEqual([413, 413, 200, 415, 415, 415]);
    expect(problemOf(big).code).toBe('ERR-MEDIA-TOO-LARGE');
    expect(problemOf(svg).code).toBe('ERR-MEDIA-TYPE-NOT-ALLOWED');
    expect(await avatarKeys(storage)).toHaveLength(1);
  });

  it('[REQ-AVA-001][INV-ARC-001] el Content-Type declarado no decide: una imagen PNG enviada como image/jpeg se guarda con el tipo detectado', async () => {
    const { cookie, storage } = await createAvatarApi();
    await put(cookie, PNG(512), { 'content-type': 'image/jpeg' });
    const key = (await avatarKeys(storage))[0]!;
    expect((await storage.inner.get(key))?.contentType).toBe('image/png');
  });

  it('[REQ-AVA-001][ERR-ACC-FORBIDDEN] sin sesión 401; sin acceso a la mascota 404; sin cabecera CSRF 403', async () => {
    const { cookie } = await createAvatarApi();
    const anonymous = await api.call('PUT', AVATAR, { raw: JPEG(), headers: image });
    const stranger = await put(await api.login('lucia.r'));
    const csrf = await api.call('PUT', AVATAR, { cookie, raw: JPEG(), headers: image, csrf: false });
    expect([problemOf(anonymous), problemOf(stranger), problemOf(csrf)]).toEqual([
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
    ]);
  });
});

describe('T583 GET /pets/{petId}/avatar (SC-ALM-017)', () => {
  it('[SC-ALM-017] con v igual a la versión actual: imagen con Cache-Control private, max-age=31536000, immutable y Vary: Cookie; con v distinto o ausente: no-cache', async () => {
    const { cookie } = await createAvatarApi();
    await put(cookie, JPEG(300));
    await put(cookie, PNG(300), { 'content-type': 'image/png' });
    const current = await api.call('GET', `${AVATAR}?v=2`, { cookie });
    const stale = await api.call('GET', `${AVATAR}?v=1`, { cookie });
    const bare = await api.call('GET', AVATAR, { cookie });
    expect([current, stale, bare].map((r) => [r.status, r.headers['content-type'], r.headers['cache-control']])).toEqual([
      [200, 'image/png', 'private, max-age=31536000, immutable'],
      [200, 'image/png', 'no-cache'],
      [200, 'image/png', 'no-cache'],
    ]);
    expect(current.headers['vary']).toContain('Cookie');
  });

  it('[SC-ALM-017] sin avatar es 404 ERR-MEDIA-NOT-FOUND con no-store; un tercero recibe ERR-PET-NOT-FOUND; v inválido es 422', async () => {
    const { cookie } = await createAvatarApi();
    const none = await api.call('GET', AVATAR, { cookie });
    await put(cookie);
    const stranger = await api.call('GET', AVATAR, { cookie: await api.login('lucia.r') });
    const bad = await api.call('GET', `${AVATAR}?v=0`, { cookie, contract: false });
    expect([problemOf(none), none.headers['cache-control'], problemOf(stranger), stranger.headers['cache-control'], bad.status]).toEqual([
      { status: 404, code: 'ERR-MEDIA-NOT-FOUND' },
      'no-store',
      { status: 404, code: 'ERR-PET-NOT-FOUND' },
      'no-store',
      422,
    ]);
  });

  it('[SC-ALM-030] con el almacenamiento caído PUT y GET responden 502 ERR-MEDIA-STORAGE-UNAVAILABLE con no-store; DELETE responde 204 y deja la clave en la cola', async () => {
    const { cookie, storage } = await createAvatarApi();
    await put(cookie);
    storage.down = true;
    const getting = await api.call('GET', AVATAR, { cookie });
    const putting = await put(cookie);
    const deleting = await api.call('DELETE', AVATAR, { cookie });
    expect([getting, putting].map((r) => [problemOf(r), r.headers['cache-control']])).toEqual([
      [{ status: 502, code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' }, 'no-store'],
      [{ status: 502, code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' }, 'no-store'],
    ]);
    expect(deleting.status).toBe(204);
    // El PUT fallido deja su fila INTENT (el objeto pudo llegar al bucket); el DELETE deja la clave del avatar vigente con attempts = 1.
    expect(api.db.prepare('SELECT reason, attempts FROM media_deletion_queue ORDER BY reason').all()).toEqual([
      { reason: 'DELETE', attempts: 1 },
      { reason: 'INTENT', attempts: 0 },
    ]);
  });
});

describe('T583 consistencia del avatar (SC-ALM-027, INV-AVA-001)', () => {
  it('[SC-ALM-027] un PATCH de la mascota concurrente con un PUT de avatar deja avatar_version y avatar_object_id del PUT', async () => {
    const { cookie, storage } = await createAvatarApi();
    const [patch, avatar] = await Promise.all([api.call('PATCH', `/api/pets/${ARGOS.id}`, { cookie, body: { name: 'Argos Nuevo' } }), put(cookie)]);
    const row = api.db.prepare('SELECT avatar_version, avatar_object_id FROM pets WHERE id = ?').get(ARGOS.id) as { avatar_version: number; avatar_object_id: string };
    expect([patch.status, avatar.json, row.avatar_version, `pets/${ARGOS.id}/avatar/${row.avatar_object_id}`]).toEqual([200, { avatarVersion: 1 }, 1, (await avatarKeys(storage))[0]]);
  });

  it('[SC-ALM-027] una secuencia pseudoaleatoria de 60 PUT y DELETE nunca repite una versión y a lo sumo un objeto queda referenciado', async () => {
    const { cookie, storage } = await createAvatarApi();
    let seed = 20261117;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const seen = new Set<number>();
    let last = 0;
    for (let n = 0; n < 60; n += 1) {
      if (next() < 0.65) {
        const version = ((await put(cookie)).json as { avatarVersion: number }).avatarVersion;
        expect(seen.has(version)).toBe(false);
        seen.add(version);
        expect(version).toBeGreaterThan(last);
        last = version;
      } else {
        await api.call('DELETE', AVATAR, { cookie });
      }
      expect((await avatarKeys(storage)).length).toBeLessThanOrEqual(1);
    }
  });

  it('[SC-ALM-027] un DELETE con el almacenamiento caído seguido de un PUT no destruye el avatar nuevo cuando el mantenimiento reintenta', async () => {
    const { cookie, storage } = await createAvatarApi();
    await put(cookie);
    storage.down = true;
    await api.call('DELETE', AVATAR, { cookie });
    storage.down = false;
    const fresh = await put(cookie);
    const newKey = (await avatarKeys(storage)).find((k) => k.includes('/avatar/') && api.db.prepare('SELECT 1 FROM media_deletion_queue WHERE object_key = ?').get(k) === undefined)!;
    await runMediaQueueMaintenance(api.deps);
    expect([fresh.json, await avatarKeys(storage), api.db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()]).toEqual([{ avatarVersion: 2 }, [newKey], 0]);
    expect((await api.call('GET', `${AVATAR}?v=2`, { cookie })).status).toBe(200);
  });

  it('[SC-ALM-027] el avatar no cuenta para la cuota del propietario', async () => {
    const { cookie } = await createAvatarApi();
    await put(cookie, JPEG(400_000));
    expect(api.db.prepare('SELECT count(*) FROM pet_media').pluck().get()).toBe(0);
  });
});

describe('T583 avatarVersion en las respuestas de mascota (REQ-AVA-001, H-O-004A-1)', () => {
  it('[REQ-AVA-001] avatarVersion es null sin avatar, la versión con avatar y null tras quitarlo en el listado, el tablero y el PATCH', async () => {
    const { cookie } = await createAvatarApi();
    const version = async () => {
      const list = (await api.call('GET', '/api/pets', { cookie })).json as Array<{ profile: { id: string; avatarVersion: number | null } }>;
      const dash = (await api.call('GET', `/api/pets/${ARGOS.id}/dashboard`, { cookie })).json as { profile: { avatarVersion: number | null } };
      const patched = (await api.call('PATCH', `/api/pets/${ARGOS.id}`, { cookie, body: { name: 'Argos' } })).json as { avatarVersion: number | null };
      return [list.find((c) => c.profile.id === ARGOS.id)!.profile.avatarVersion, dash.profile.avatarVersion, patched.avatarVersion];
    };
    expect(await version()).toEqual([null, null, null]);
    await put(cookie);
    expect(await version()).toEqual([1, 1, 1]);
    await api.call('DELETE', AVATAR, { cookie });
    expect(await version()).toEqual([null, null, null]);
    await put(cookie);
    expect(await version()).toEqual([2, 2, 2]);
  });

  it('[REQ-AVA-001] una mascota recién creada responde avatarVersion null', async () => {
    const { cookie } = await createAvatarApi();
    const created = await api.call('POST', '/api/pets', { cookie, body: { name: 'Nueva', species: 'CANINE', breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE', avatarUrl: null } });
    expect([created.status, (created.json as { avatarVersion: number | null }).avatarVersion]).toEqual([201, null]);
  });
});
