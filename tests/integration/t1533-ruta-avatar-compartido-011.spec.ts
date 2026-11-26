/**
 * T1533 [US5, Bloque E, #31] ruta dedicada `GET /api/shared/{token}/pets/{petId}/avatar` (REQ-VET11-002, MER-11-01, D11-09 = A): imagen del avatar de la mascota por
 * el token del enlace, sin cookie, no-store, sin claves de objeto ni EXIF, y un 404 uniforme (mismo cuerpo) si el enlace no existe, venció, fue revocado, no incluye a
 * la mascota o la mascota no tiene avatar. `clinical-summary` NO cambia (sin avatar; INV-005-002; `t750`/`t770`/`t778` intactos).
 *
 * @implements REQ-VET11-002, REQ-HOG11-007, INV-VET11-001, INV-005-002, SC-011-037, SC-011-038
 */
import { afterEach, describe, expect, it } from 'vitest';
import { jpegWithExif, pngWithMetadata, webpWithMetadata, enc, FORBIDDEN_MARKS, hasBytes } from '../fixtures/about-fixtures.ts';
import { ARGOS, LUNA } from '../fixtures/application-harness.ts';
import { createShareApi, type ShareApi, type ShareApiResponse } from '../fixtures/share-api-harness.ts';
import { HOUSEHOLD_ID, KEY } from '../fixtures/share-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const OBJECT_ID = '77777777-7777-4777-8777-777777777701';
const OBJECT_ID_2 = '77777777-7777-4777-8777-777777777702';
const avatarPath = (token: string, petId: string): string => `/api/shared/${token}/pets/${petId}/avatar`;
const tokenOf = (url: unknown): string => String(url).split('/shared/')[1]!;

async function makeLink(body: unknown = {}, url = `/api/pets/${ARGOS.id}/share-links`, n = 1): Promise<{ id: string; token: string; cookie: string }> {
  const cookie = await api.login('andres');
  const response = await api.call('POST', url, { cookie, body, headers: { 'idempotency-key': KEY(n) } });
  expect(response.status).toBe(201);
  const result = response.json as { link: { id: string }; url: string };
  return { id: result.link.id, token: tokenOf(result.url), cookie };
}

async function seedAvatar(petId: string, objectId: string, bytes: Uint8Array, mime: string): Promise<void> {
  await api.storage.put(`pets/${petId}/avatar/${objectId}`, bytes, mime);
  await api.deps.uow.runInTransaction((r) => r.pets.replaceAvatar(petId, objectId));
}

function expectSharedHeaders(r: ShareApiResponse, label: string): void {
  expect(r.headers['cache-control'], `${label} cache-control`).toBe('no-store');
  expect(r.headers['referrer-policy'], `${label} referrer-policy`).toBe('no-referrer');
  expect(r.headers['x-robots-tag'], `${label} x-robots-tag`).toBe('noindex, nofollow, noarchive');
  expect(r.headers['x-content-type-options'], `${label} nosniff`).toBe('nosniff');
  expect(r.headers['set-cookie'], `${label} sin cookie`).toBeUndefined();
}

describe('T1533 ruta del avatar compartido: respuesta correcta (REQ-VET11-002, SC-011-037)', () => {
  it('[REQ-VET11-002][SC-011-037] con un enlace vigente que incluye la mascota responde 200 con la imagen (no 302), el tipo real, no-store, nosniff y sin cookie ni claves', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    const response = await api.publicGet(avatarPath(link.token, ARGOS.id));
    expect(response.status).toBe(200);
    expect(response.headers['location']).toBeUndefined();
    expect(String(response.headers['content-type'])).toMatch(/^image\/(jpeg|png|webp)/);
    expectSharedHeaders(response, '200');
    expect(response.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers['content-disposition'] ?? '').not.toMatch(/filename/i);
    expect(JSON.stringify(response.headers)).not.toContain(OBJECT_ID);
  });

  it('[REQ-VET11-002][INV-VET11-001] el cuerpo sale sin EXIF, GPS, XMP ni comentarios (JPEG y PNG) y sigue siendo una imagen con su firma', async () => {
    api = await createShareApi();
    const link = await makeLink();
    for (const [bytes, mime, signature] of [[jpegWithExif(), 'image/jpeg', [0xff, 0xd8]], [pngWithMetadata(), 'image/png', [0x89, 0x50]]] as const) {
      await seedAvatar(ARGOS.id, mime === 'image/jpeg' ? OBJECT_ID : OBJECT_ID_2, bytes, mime);
      const raw = await api.app.inject({ method: 'GET', url: avatarPath(link.token, ARGOS.id) });
      const body = new Uint8Array(raw.rawPayload);
      expect(raw.statusCode, mime).toBe(200);
      expect([...body.slice(0, 2)], mime).toEqual(signature);
      for (const mark of FORBIDDEN_MARKS) expect(hasBytes(body, mark), `${mime} ${mark}`).toBe(false);
    }
  });

  it('[REQ-VET11-002] un enlace de hogar sirve el avatar de cada mascota de su alcance (petIds) y no el de una ajena; uno de mascota solo el de su mascota', async () => {
    api = await createShareApi();
    const house = await makeLink({}, `/api/households/${HOUSEHOLD_ID}/share-links`, 1);
    const view = (await api.publicGet(`/api/shared/${house.token}/summary`)).json as { petIds?: string[]; summary: { pets: Array<{ profile: { name: string } }> } };
    expect(view.petIds!.length).toBeGreaterThanOrEqual(2);
    expect(view.petIds).toHaveLength(view.summary.pets.length);
    for (const [i, id] of view.petIds!.entries()) await seedAvatar(id, `77777777-7777-4777-8777-7777777777${String(10 + i)}`, i % 2 === 0 ? jpegWithExif() : pngWithMetadata(), i % 2 === 0 ? 'image/jpeg' : 'image/png');
    for (const id of view.petIds!) expect((await api.publicGet(avatarPath(house.token, id))).status).toBe(200);
    await seedAvatar(LUNA.id, OBJECT_ID_2, pngWithMetadata(), 'image/png');
    expect((await api.publicGet(avatarPath(house.token, LUNA.id))).status).toBe(404);
    const single = await makeLink({}, `/api/pets/${ARGOS.id}/share-links`, 2);
    expect((await api.publicGet(avatarPath(single.token, ARGOS.id))).status).toBe(200);
    expect((await api.publicGet(avatarPath(single.token, view.petIds!.find((id) => id !== ARGOS.id)!))).status).toBe(404);
  });

  it('[REQ-VET11-002][INV-005-002] la vista pública y la vista previa (clinical-summary) siguen SIN avatar: ni clave, ni URL, ni identificador de objeto, ni la ruta nueva', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    const pub = await api.publicGet(`/api/shared/${link.token}/summary`);
    const preview = await api.call('GET', `/api/pets/${ARGOS.id}/clinical-summary`, { cookie: link.cookie });
    for (const r of [pub, preview]) {
      expect(r.status).toBe(200);
      expect(r.text).not.toMatch(/avatar/i);
      expect(r.text).not.toContain(OBJECT_ID);
      expect(r.text).not.toContain('/pets/');
    }
  });
});

describe('T1533 ruta del avatar compartido: 404 uniforme (REQ-VET11-002, SC-011-038)', () => {
  it('[REQ-VET11-002][SC-011-038] enlace inexistente, vencido, revocado, mascota fuera del enlace, mascota sin avatar y petId mal formado dan el MISMO 404 (cuerpo, tipo y cabeceras)', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const reference = await api.publicGet(avatarPath('x'.repeat(43), ARGOS.id));
    expect(reference.status).toBe(404);
    expectSharedHeaders(reference, 'referencia');

    const live = await makeLink({}, `/api/pets/${ARGOS.id}/share-links`, 1);
    const revoked = await makeLink({}, `/api/pets/${ARGOS.id}/share-links`, 2);
    expect((await api.call('DELETE', `/api/share-links/${revoked.id}`, { cookie: revoked.cookie })).status).toBe(204);
    const expiring = await makeLink({ expiresInDays: 1 }, `/api/pets/${ARGOS.id}/share-links`, 3);

    const cases: Array<[string, string]> = [
      ['inexistente', avatarPath('y'.repeat(43), ARGOS.id)],
      ['revocado', avatarPath(revoked.token, ARGOS.id)],
      ['mascota fuera del enlace', avatarPath(live.token, LUNA.id)],
      ['petId mal formado', avatarPath(live.token, 'no-es-uuid')],
      ['petId inexistente', avatarPath(live.token, '99999999-9999-4999-8999-999999999999')],
    ];
    for (const [label, path] of cases) {
      api.limiter.reset();
      const r = await api.publicGet(path);
      expect(r.status, label).toBe(404);
      expect(r.text, label).toBe(reference.text);
      expect(r.headers['content-type'], label).toBe(reference.headers['content-type']);
      expectSharedHeaders(r, label);
    }

    api.clock.setClock('2026-11-20', '2026-11-20T12:00:00.000Z');
    api.limiter.reset();
    const expired = await api.publicGet(avatarPath(expiring.token, ARGOS.id));
    expect(expired.status).toBe(404);
    expect(expired.text).toBe(reference.text);
    expectSharedHeaders(expired, 'vencido');
  });

  it('[REQ-VET11-002][SC-011-038] una mascota con enlace vigente pero sin avatar da el mismo 404 que un enlace inexistente (no delata si hay foto)', async () => {
    api = await createShareApi();
    const link = await makeLink();
    const noAvatar = await api.publicGet(avatarPath(link.token, ARGOS.id));
    api.limiter.reset();
    const unknown = await api.publicGet(avatarPath('z'.repeat(43), ARGOS.id));
    expect(noAvatar.status).toBe(404);
    expect(noAvatar.text).toBe(unknown.text);
    expectSharedHeaders(noAvatar, 'sin avatar');
  });

  it('[REQ-VET11-002] el avatar eliminado después de crear el enlace deja de servirse al instante (404) y la ruta es solo GET (otros verbos: el mismo 404)', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    expect((await api.publicGet(avatarPath(link.token, ARGOS.id))).status).toBe(200);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      api.limiter.reset();
      expect((await api.inject(method, avatarPath(link.token, ARGOS.id))).status, method).toBe(404);
    }
    await api.deps.uow.runInTransaction((r) => r.pets.clearAvatar(ARGOS.id));
    api.limiter.reset();
    expect((await api.publicGet(avatarPath(link.token, ARGOS.id))).status).toBe(404);
  });
});

/** WebP mínimo con VP8X (indicadores `flags`) y un VP8L de 2x2; `flags` 0x02 = animación. */
function webpWith(flags: number): Uint8Array {
  const le32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const chunk = (fourcc: string, data: number[]): number[] => [...enc(fourcc), ...le32(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];
  const bits = 1 | (1 << 14);
  const body = [...enc('WEBP'), ...chunk('VP8X', [flags, 0, 0, 0, 1, 0, 0, 1, 0, 0]), ...chunk('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255, 9, 9, 9])];
  return Uint8Array.from([...enc('RIFF'), ...le32(body.length), ...body]);
}

const getsOf = (): string[] => api.storage.operations.filter((o) => o.startsWith('get:'));

describe('T1533 avatar compartido: TR-1 saneado en cada lectura (ENM-005-3.5.0)', () => {
  it('[TR-1] WebP con EXIF y XMP se sirve sin ellos, con su mime real y su firma RIFF/WEBP', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, webpWithMetadata(), 'image/webp');
    const link = await makeLink();
    const r = await api.app.inject({ method: 'GET', url: avatarPath(link.token, ARGOS.id) });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['content-type'])).toMatch(/^image\/webp/);
    const body = new Uint8Array(r.rawPayload);
    expect(Buffer.from(body.slice(0, 4)).toString()).toBe('RIFF');
    expect(Buffer.from(body.slice(8, 12)).toString()).toBe('WEBP');
    for (const mark of FORBIDDEN_MARKS) expect(hasBytes(body, mark), mark).toBe(false);
    expect(hasBytes(body, 'EXIF')).toBe(false);
    expect(hasBytes(body, 'XMP ')).toBe(false);
  });

  it('[TR-1] los bytes tras el marcador EOI no salen, y se sirve el mime del resultado saneado (no el contentType almacenado)', async () => {
    api = await createShareApi();
    const trailer = enc('TRAILER-SECRETO-POST-EOI');
    await seedAvatar(ARGOS.id, OBJECT_ID, Uint8Array.from([...jpegWithExif(), ...trailer]), 'image/jpeg');
    const link = await makeLink();
    const r = await api.app.inject({ method: 'GET', url: avatarPath(link.token, ARGOS.id) });
    expect(r.statusCode).toBe(200);
    expect(hasBytes(new Uint8Array(r.rawPayload), 'TRAILER-SECRETO')).toBe(false);
    expect(new Uint8Array(r.rawPayload).slice(-2)).toEqual(Uint8Array.from([0xff, 0xd9]));
    // contentType almacenado mentiroso (image/png sobre bytes JPEG): manda la firma real del resultado saneado
    await api.deps.uow.runInTransaction((rr) => rr.pets.clearAvatar(ARGOS.id));
    await seedAvatar(ARGOS.id, OBJECT_ID_2, jpegWithExif(), 'image/png');
    const second = await api.app.inject({ method: 'GET', url: avatarPath(link.token, ARGOS.id) });
    expect(second.statusCode).toBe(200);
    expect(String(second.headers['content-type'])).toMatch(/^image\/jpeg/);
  });

  it('[TR-1] un WebP animado, un archivo ilegible y un objeto ausente dan el MISMO 404 y un 404 cuenta para el límite', async () => {
    api = await createShareApi();
    const link = await makeLink();
    const reference = await api.publicGet(avatarPath('x'.repeat(43), ARGOS.id));
    expect(reference.status).toBe(404);
    const variants: Array<[string, () => Promise<void>]> = [
      ['animado', () => seedAvatar(ARGOS.id, OBJECT_ID, webpWith(0x02), 'image/webp')],
      ['ilegible', () => seedAvatar(ARGOS.id, OBJECT_ID_2, Uint8Array.from([0xff, 0xd8, 0x00, 0x01, 0x02]), 'image/jpeg')],
      ['firma que no es imagen (PDF)', () => seedAvatar(ARGOS.id, '77777777-7777-4777-8777-777777777703', Uint8Array.from(enc('%PDF-1.4 secreto')), 'image/jpeg')],
      ['objeto ausente', async () => void (await api.deps.uow.runInTransaction((r) => r.pets.replaceAvatar(ARGOS.id, '77777777-7777-4777-8777-777777777704')))],
    ];
    for (const [label, seed] of variants) {
      await seed();
      api.limiter.reset();
      const r = await api.publicGet(avatarPath(link.token, ARGOS.id));
      expect(r.status, label).toBe(404);
      expect(r.text, label).toBe(reference.text);
      expectSharedHeaders(r, label);
    }
  });

  it('[TR-1] la caída del almacenamiento (MediaStorageUnavailableError) es el mismo 404 uniforme, nunca 500', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    const reference = await api.publicGet(avatarPath('x'.repeat(43), ARGOS.id));
    api.limiter.reset();
    api.storage.down = true;
    const r = await api.publicGet(avatarPath(link.token, ARGOS.id));
    expect(r.status).toBe(404);
    expect(r.text).toBe(reference.text);
    expect(r.headers['content-type']).toBe(reference.headers['content-type']);
    expectSharedHeaders(r, 'almacenamiento caído');
  });
});

describe('T1533 avatar compartido: TR-4 secuencia fija y contador (ENM-005-3.5.0)', () => {
  it('[TR-4] storage.get solo se invoca con token válido, mascota en alcance y avatar presente (espía sobre las operaciones del almacenamiento)', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const live = await makeLink({}, `/api/pets/${ARGOS.id}/share-links`, 1);
    const revoked = await makeLink({}, `/api/pets/${ARGOS.id}/share-links`, 2);
    await api.call('DELETE', `/api/share-links/${revoked.id}`, { cookie: revoked.cookie });
    const before = getsOf().length;
    for (const path of [avatarPath('x'.repeat(43), ARGOS.id), avatarPath(revoked.token, ARGOS.id), avatarPath(live.token, LUNA.id), avatarPath(live.token, 'no-es-uuid'), avatarPath(live.token, '../../etc')]) {
      api.limiter.reset();
      expect((await api.publicGet(path)).status).toBe(404);
    }
    expect(getsOf().length).toBe(before);
    api.limiter.reset();
    expect((await api.publicGet(avatarPath(live.token, ARGOS.id))).status).toBe(200);
    expect(getsOf().length).toBe(before + 1);
    expect(getsOf().at(-1)).toBe(`get:pets/${ARGOS.id}/avatar/${OBJECT_ID}`);
  });

  it('[TR-4] mascota en alcance SIN avatar: 404 sin tocar el almacenamiento', async () => {
    api = await createShareApi();
    const link = await makeLink();
    const before = getsOf().length;
    expect((await api.publicGet(avatarPath(link.token, ARGOS.id))).status).toBe(404);
    expect(getsOf().length).toBe(before);
  });

  it('[TR-4][TR-2] la secuencia de repositorios es la misma con y sin avatar para el fallo (mismo contador): 20 «sin avatar» agotan el límite y el 21.º es 429', async () => {
    api = await createShareApi();
    const link = await makeLink();
    for (let i = 0; i < 20; i += 1) expect((await api.publicGet(avatarPath(link.token, ARGOS.id))).status).toBe(404);
    const limited = await api.publicGet(avatarPath(link.token, ARGOS.id));
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('600');
    expectSharedHeaders(limited, '429');
  });

  it('[REQ-VET-006] HEAD y OPTIONS responden el mismo 404 uniforme sin resolver el token ni leer el almacenamiento', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    const reference = await api.publicGet(avatarPath('x'.repeat(43), ARGOS.id));
    const before = getsOf().length;
    for (const method of ['HEAD', 'OPTIONS']) {
      api.limiter.reset();
      api.calls.length = 0;
      const r = await api.inject(method, avatarPath(link.token, ARGOS.id));
      expect(r.status, method).toBe(404);
      if (method !== 'HEAD') expect(r.text, method).toBe(reference.text);
      expectSharedHeaders(r, method);
      expect(r.headers['content-type'], method).toMatch(/problem\+json/);
    }
    expect(getsOf().length).toBe(before);
  });

  it('[REQ-VET-006] un error interno de la resolución da el MISMO 500 genérico con y sin avatar (no delata la foto)', async () => {
    api = await createShareApi();
    await seedAvatar(ARGOS.id, OBJECT_ID, jpegWithExif(), 'image/jpeg');
    const link = await makeLink();
    const uow = api.deps.uow as { runReadOnly?: unknown; runInTransaction: unknown };
    const original = { runReadOnly: uow.runReadOnly, runInTransaction: uow.runInTransaction };
    const boom = async (): Promise<never> => {
      throw new Error('fallo-interno-simulado');
    };
    const observe = async (): Promise<ShareApiResponse> => {
      api.limiter.reset();
      uow.runReadOnly = boom;
      uow.runInTransaction = boom;
      try {
        return await api.publicGet(avatarPath(link.token, ARGOS.id));
      } finally {
        uow.runReadOnly = original.runReadOnly;
        uow.runInTransaction = original.runInTransaction;
      }
    };
    const withAvatar = await observe();
    await api.deps.uow.runInTransaction((r) => r.pets.clearAvatar(ARGOS.id));
    const withoutAvatar = await observe();
    expect(withAvatar.status).toBe(500);
    expect(withoutAvatar.status).toBe(500);
    expect(withoutAvatar.text).toBe(withAvatar.text);
    expect(withAvatar.text).not.toContain('fallo-interno-simulado');
    expect(withoutAvatar.headers['content-type']).toBe(withAvatar.headers['content-type']);
    expect(withAvatar.headers['set-cookie']).toBeUndefined();
  });
});

describe('T1533 SharedSummaryView.petIds 1.2.0 (opción C)', () => {
  it('[REQ-VET11-002] la vista pública trae petIds (uuid, mismo orden que summary.pets) fuera de clinical-summary; la vista previa autenticada no lo trae', async () => {
    api = await createShareApi();
    const house = await makeLink({}, `/api/households/${HOUSEHOLD_ID}/share-links`, 1);
    const pub = (await api.publicGet(`/api/shared/${house.token}/summary`)).json as { petIds?: string[]; summary: { pets: Array<{ profile: { name: string } }> } };
    expect(pub.petIds!.length).toBe(pub.summary.pets.length);
    for (const id of pub.petIds!) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(new Set(pub.petIds).size).toBe(pub.petIds!.length);
    // el orden coincide con summary.pets: el nombre de la mascota i es el de petIds[i]
    const names = await Promise.all(pub.petIds!.map(async (id) => (await api.deps.uow.runInTransaction((r) => r.pets.findById(id)))?.name));
    expect(names).toEqual(pub.summary.pets.map((p) => p.profile.name));
    const preview = await api.call('GET', `/api/households/${HOUSEHOLD_ID}/clinical-summary`, { cookie: house.cookie });
    expect(preview.status).toBe(200);
    expect((preview.json as { petIds?: unknown }).petIds).toBeUndefined();
    const petPreview = await api.call('GET', `/api/pets/${ARGOS.id}/clinical-summary`, { cookie: house.cookie });
    expect((petPreview.json as { petIds?: unknown }).petIds).toBeUndefined();
    expect(JSON.stringify((pub as unknown as { summary: unknown }).summary)).not.toContain(ARGOS.id);
  });
});
