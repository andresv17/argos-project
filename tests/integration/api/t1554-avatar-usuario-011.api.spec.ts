/**
 * T1554 [US8, Bloque I, #78] rutas HTTP de la foto de perfil de usuario (`PUT/GET/DELETE /api/account/avatar` y `GET /api/account/avatar/meta`, contrato
 * `user-avatar.openapi.yaml` 3.2.0), PRUEBAS ROJAS sobre la API real y SQLite (D11-13 = C: solo subida propia; sin descarga de Google). El id de usuario sale SIEMPRE de la
 * sesión (ninguna ruta lo recibe); Content-Type + firma (415), tamaño (413), dimensiones (422), Cache-Control `private, max-age=300` + `Vary: Cookie` (decisión 1A de Neo), nosniff, sin claves de objeto en ninguna respuesta,
 * DELETE idempotente (204), límite de 10 subidas por hora (429), no visible a otras cuentas ni en la vista pública y borrado del objeto al eliminar la cuenta.
 * La respuesta no se valida contra el OpenAPI compilado de 004 (`contract: false`): las rutas nuevas llegan con la compilación de T1556.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, SC-011-057, SC-011-058, SC-011-059, SC-011-060, SC-011-061, SC-011-062, EDGE-011-007
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ANA, BRUNO, DIEGO, ELENA, HOUSEHOLD_ANA, IDENTITY_PASSWORDS } from '../../fixtures/identity-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { hasMark, jpegOf, jpegTwoSof, metadataLeft, paddedJpeg, pngOf, webpCanvasFrame, webpOf } from '../../fixtures/user-avatar-011.ts';
import { createIdentityApi, type Api, type ApiResponse } from './api-harness.ts';

let api: Api;
let storage: ControlledStorage;
afterEach(async () => api.close());

const PATH = '/api/account/avatar';
const MEDIA_UNAVAILABLE = 'ERR-MEDIA-STORAGE-UNAVAILABLE';
async function start(): Promise<void> {
  storage = new ControlledStorage(() => new Date('2026-11-11T12:00:00.000Z'));
  api = await createIdentityApi({ media: { storage, limits: DEFAULT_LIMITS } });
}
const putAvatar = (cookie: string | null, bytes: Uint8Array, type = 'image/jpeg', extra: Record<string, string> = {}, csrf = true): Promise<ApiResponse> =>
  api.call('PUT', PATH, { ...(cookie === null ? {} : { cookie }), raw: bytes, headers: { 'content-type': type, ...extra }, csrf, contract: false });
const getAvatar = (cookie: string | null, query = ''): Promise<ApiResponse> => api.call('GET', `${PATH}${query}`, { ...(cookie === null ? {} : { cookie }), contract: false });
const getMeta = (cookie: string | null): Promise<ApiResponse> => api.call('GET', `${PATH}/meta`, { ...(cookie === null ? {} : { cookie }), contract: false });
const delAvatar = (cookie: string | null): Promise<ApiResponse> => api.call('DELETE', PATH, { ...(cookie === null ? {} : { cookie }), contract: false });
const codeOf = (r: ApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;
const keys = (prefix = 'users/') => storage.keys(prefix);

describe('T1554 subir, ver, reemplazar y quitar la propia foto (REQ-PRF11-001, SC-011-057, SC-011-058)', () => {
  it('[REQ-PRF11-001][SC-011-057][SC-011-062] PUT 200 {avatarVersion}, no-store, y lo guardado sale sin EXIF, GPS, XMP ni comentarios bajo users/<uuid>/avatar/<uuid>', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    const result = await putAvatar(cookie, jpegOf(512, 512));
    expect([result.status, result.json]).toEqual([200, { avatarVersion: 1 }]);
    expect(result.headers['cache-control']).toBe('no-store');
    const stored = await keys();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(new RegExp(`^users/${ELENA}/avatar/[0-9a-f-]{36}$`));
    expect(hasMark((await storage.inner.get(stored[0]!))!.bytes)).toBe(false);
    expect(metadataLeft((await storage.inner.get(stored[0]!))!.bytes)).toEqual([]);
    // La clave del objeto no se filtra en ninguna respuesta.
    const objectId = stored[0]!.split('/')[3]!;
    for (const r of [result, await getMeta(cookie), await getAvatar(cookie, '?v=1')]) {
      expect(r.text.includes(objectId)).toBe(false);
      expect(JSON.stringify(r.headers).includes(objectId)).toBe(false);
      expect(JSON.stringify(r.headers).includes('users/')).toBe(false);
    }
  });

  it('[REQ-PRF11-001][SC-011-057] GET /meta devuelve solo {avatarVersion}: null sin foto, N con foto; GET sirve la imagen por proxy (nunca 302) con Cache-Control private y nosniff', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    expect(await getMeta(cookie)).toMatchObject({ status: 200, json: { avatarVersion: null } });
    expect(Object.keys((await getMeta(cookie)).json as object)).toEqual(['avatarVersion']);
    await putAvatar(cookie, pngOf(256, 256), 'image/png');
    const meta = await getMeta(cookie);
    expect([meta.status, meta.json]).toEqual([200, { avatarVersion: 1 }]);
    expect(meta.headers['cache-control']).toMatch(/private/);
    expect(meta.headers['cache-control']).toMatch(/no-store/);
    const immutable = await getAvatar(cookie, '?v=1');
    expect(immutable.status).toBe(200);
    expect(immutable.headers['location']).toBeUndefined();
    expect(String(immutable.headers['content-type'])).toMatch(/^image\/png/);
    expect(String(immutable.headers['cache-control'])).toMatch(/private/);
    // Decisión de Neo 1A (Logos iter 248): caducidad corta de 5 minutos y sin `immutable`.
    expect(String(immutable.headers['cache-control'])).toMatch(/max-age=300(?!\d)/);
    expect(String(immutable.headers['cache-control'])).not.toMatch(/immutable|31536000|public/);
    expect(String(immutable.headers['vary'] ?? '')).toMatch(/cookie/i);
    expect(immutable.headers['x-content-type-options']).toBe('nosniff');
    const unversioned = await getAvatar(cookie);
    expect(String(unversioned.headers['cache-control'])).toMatch(/private/);
    expect(String(unversioned.headers['cache-control'])).toMatch(/no-cache/);
    expect(String(unversioned.headers['cache-control'])).not.toMatch(/max-age=300|immutable/);
    expect(String((await getAvatar(cookie, '?v=9')).headers['cache-control'])).toMatch(/private.*no-cache|no-cache.*private/);
    expect(codeOf(await getAvatar(cookie, '?v=abc'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('[REQ-PRF11-001] el Content-Type del GET sale de la firma de los bytes saneados, nunca del tipo almacenado (Trinity H-5), y el cuerpo conserva su firma sin metadatos', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    await putAvatar(cookie, pngOf(256, 256), 'image/png');
    const key = (await keys())[0]!;
    const body = (await storage.inner.get(key))!.bytes;
    await storage.inner.put(key, body, 'text/html');
    const r = await getAvatar(cookie, '?v=1');
    expect([r.status, String(r.headers['content-type'])]).toEqual([200, expect.stringMatching(/^image\/png/)]);
    const raw = await api.app.inject({ method: 'GET', url: `${PATH}?v=1`, headers: { cookie } });
    expect(metadataLeft(new Uint8Array(raw.rawPayload))).toEqual([]);
    expect([...new Uint8Array(raw.rawPayload).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('[SC-011-058][EDGE-011-007] sin foto GET responde 404 ERR-PRF11-AVATAR-NOT-FOUND con no-store; objeto ausente o almacén caído (404/502) dejan a la interfaz con iniciales', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    const missing = await getAvatar(cookie);
    expect([missing.status, codeOf(missing)]).toEqual([404, 'ERR-PRF11-AVATAR-NOT-FOUND']);
    expect(missing.headers['cache-control']).toBe('no-store');
    expect(((missing.headers['content-type'] as string) ?? '')).toMatch(/application\/problem\+json/);
    await putAvatar(cookie, jpegOf(512, 512));
    await storage.inner.delete((await keys())[0]!);
    expect([(await getAvatar(cookie, '?v=1')).status, codeOf(await getAvatar(cookie, '?v=1'))]).toEqual([404, 'ERR-PRF11-AVATAR-NOT-FOUND']);
    await putAvatar(cookie, jpegOf(512, 512));
    storage.down = true;
    const down = await getAvatar(cookie, '?v=2');
    storage.down = false;
    expect([down.status, codeOf(down)]).toEqual([502, MEDIA_UNAVAILABLE]);
    expect(down.headers['cache-control']).toBe('no-store');
  });

  it('[REQ-PRF11-001][SC-011-057] reemplazar sube la versión y purga el objeto anterior; quitar es 204 idempotente, borra el objeto y la versión no se reinicia', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    await putAvatar(cookie, jpegOf(512, 512));
    const first = await keys();
    expect((await putAvatar(cookie, webpOf(128, 128), 'image/webp')).json).toEqual({ avatarVersion: 2 });
    const second = await keys();
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    const removed = await delAvatar(cookie);
    expect([removed.status, removed.text]).toEqual([204, '']);
    expect(await keys()).toEqual([]);
    expect(await delAvatar(cookie)).toMatchObject({ status: 204 });
    expect((await getMeta(cookie)).json).toEqual({ avatarVersion: null });
    expect((await getAvatar(cookie)).status).toBe(404);
    expect((await putAvatar(cookie, pngOf(512, 512), 'image/png')).json).toEqual({ avatarVersion: 3 });
  });
});

describe('T1554 PUT: sesión, CSRF, tamaño, tipo por firma y dimensiones (SC-011-061)', () => {
  it('[REQ-PRF11-001][INV-AUTH-007] sin sesión 401 y sin cabecera CSRF 403 en PUT y DELETE; GET y /meta sin sesión 401', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    expect((await putAvatar(null, jpegOf(512, 512))).status).toBe(401);
    expect((await putAvatar(cookie, jpegOf(512, 512), 'image/jpeg', {}, false)).status).toBe(403);
    expect((await api.call('DELETE', PATH, { cookie, csrf: false, contract: false })).status).toBe(403);
    expect((await delAvatar(null)).status).toBe(401);
    expect((await getAvatar(null)).status).toBe(401);
    expect((await getMeta(null)).status).toBe(401);
    expect(await keys()).toEqual([]);
  });

  it('[REQ-PRF11-001][SC-011-061] 413 ERR-MEDIA-TOO-LARGE sobre 524 288 bytes y 415 ERR-MEDIA-TYPE-NOT-ALLOWED por tipo o por firma que no coincide; no se guarda nada', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    const tooBig = await putAvatar(cookie, paddedJpeg(512, 512, 524_289));
    expect([tooBig.status, codeOf(tooBig)]).toEqual([413, 'ERR-MEDIA-TOO-LARGE']);
    expect(await putAvatar(cookie, paddedJpeg(512, 512, 524_288))).toMatchObject({ status: 200 });
    const cases: Array<[string, Uint8Array, string]> = [
      ['SVG declarado image/png', Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), 'image/png'],
      ['JPEG con Content-Type image/png (firma distinta)', jpegOf(512, 512), 'image/png'],
      ['PNG con Content-Type image/jpeg (firma distinta)', pngOf(512, 512), 'image/jpeg'],
      ['GIF declarado image/gif', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]), 'image/gif'],
      ['JPEG con Content-Type text/html', jpegOf(512, 512), 'text/html'],
      ['texto plano image/jpeg', Uint8Array.from(Buffer.from('no soy una imagen')), 'image/jpeg'],
    ];
    const before = await keys();
    for (const [name, bytes, type] of cases) {
      const r = await putAvatar(cookie, bytes, type);
      expect([name, r.status, codeOf(r)]).toEqual([name, 415, 'ERR-MEDIA-TYPE-NOT-ALLOWED']);
    }
    expect(await keys()).toEqual(before);
    expect(((await getMeta(cookie)).json as { avatarVersion: number }).avatarVersion).toBe(1);
  });

  it('[REQ-PRF11-001][SC-011-061] 422 ERR-PRF11-AVATAR-INVALID-IMAGE: no cuadrada, lado fuera de 64..1024 o corrupta; 64 y 1024 se aceptan; el detalle no repite dimensiones ni bytes', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    const bad: Array<[string, Uint8Array, string]> = [
      ['no cuadrada', jpegOf(512, 256), 'image/jpeg'],
      ['lado 63', pngOf(63, 63), 'image/png'],
      ['lado 1025', pngOf(1025, 1025), 'image/png'],
      ['WebP 2048', webpOf(2048, 2048), 'image/webp'],
      ['PNG corrupto', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    ];
    for (const [name, bytes, type] of bad) {
      const r = await putAvatar(cookie, bytes, type);
      expect([name, r.status, codeOf(r)]).toEqual([name, 422, 'ERR-PRF11-AVATAR-INVALID-IMAGE']);
      expect(r.text).not.toMatch(/\b(63|1025|2048|512)\b/);
    }
    expect(await keys()).toEqual([]);
    expect((await getMeta(cookie)).json).toEqual({ avatarVersion: null });
    expect((await putAvatar(cookie, pngOf(64, 64), 'image/png')).status).toBe(200);
    expect((await putAvatar(cookie, pngOf(1024, 1024), 'image/png')).status).toBe(200);
  });

  it('[REQ-PRF11-001] almacén caído en PUT: 502 ERR-MEDIA-STORAGE-UNAVAILABLE con no-store y la versión no cambia', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    await putAvatar(cookie, jpegOf(512, 512));
    storage.failing.add('put');
    const r = await putAvatar(cookie, jpegOf(512, 512));
    storage.failing.delete('put');
    expect([r.status, codeOf(r), r.headers['cache-control']]).toEqual([502, MEDIA_UNAVAILABLE, 'no-store']);
    expect((await getMeta(cookie)).json).toEqual({ avatarVersion: 1 });
  });

  it('[REQ-PRF11-001] dimensiones sobre todas las cabeceras (dos SOF de JPEG; canvas y marco de WebP) y sobre lo saneado: cualquiera fuera de 64..1024 es 422 (Trinity H-3)', async () => {
    await start();
    const cookie = await api.login('elena.solo');
    for (const [name, bytes, type] of [
      ['JPEG segundo SOF 2048', jpegTwoSof(512, 2048), 'image/jpeg'],
      ['WebP canvas 512 y marco 2048', webpCanvasFrame(512, 2048), 'image/webp'],
    ] as const) {
      const r = await putAvatar(cookie, bytes, type);
      expect([name, r.status, codeOf(r)]).toEqual([name, 422, 'ERR-PRF11-AVATAR-INVALID-IMAGE']);
    }
    expect(await keys()).toEqual([]);
  });

  it('[REQ-PRF11-001] límite de 10 subidas por hora (USER_AVATAR_PUT_MAX_PER_WINDOW): cuentan éxitos y fallos 413/415/422 con CSRF y sesión válidos; el intento 11 es 429 ERR-RATE-LIMITED antes de leer el cuerpo; GET y DELETE no consumen; otra cuenta no se ve afectada; la ventana vence a los 60 minutos', async () => {
    await start();
    const elena = await api.login('elena.solo');
    // GET, /meta y DELETE no consumen intentos.
    for (let i = 0; i < 12; i += 1) {
      await getAvatar(elena);
      await getMeta(elena);
      await delAvatar(elena);
    }
    // Sin sesión o sin CSRF no se consume (se rechaza antes).
    for (let i = 0; i < 12; i += 1) {
      await putAvatar(null, jpegOf(64, 64));
      await putAvatar(elena, jpegOf(64, 64), 'image/jpeg', {}, false);
    }
    const attempts: Array<[Uint8Array, string, number]> = [
      [jpegOf(64, 64), 'image/jpeg', 200],
      [jpegOf(64, 64), 'image/jpeg', 200],
      [paddedJpeg(64, 64, 524_289), 'image/jpeg', 413],
      [Uint8Array.from(Buffer.from('no soy imagen')), 'image/png', 415],
      [jpegOf(63, 63), 'image/jpeg', 422],
      [jpegOf(64, 64), 'image/jpeg', 200],
      [pngOf(64, 64), 'image/png', 200],
      [jpegOf(512, 256), 'image/jpeg', 422],
      [webpOf(64, 64), 'image/webp', 200],
      [jpegOf(64, 64), 'image/jpeg', 200],
    ];
    for (const [i, [bytes, type, status]] of attempts.entries()) expect((await putAvatar(elena, bytes, type)).status, `intento ${i + 1}`).toBe(status);
    const blocked = await putAvatar(elena, jpegOf(64, 64));
    expect([blocked.status, codeOf(blocked)]).toEqual([429, 'ERR-RATE-LIMITED']);
    const blockedBad = await putAvatar(elena, Uint8Array.from(Buffer.from('no soy imagen')), 'text/plain');
    expect([blockedBad.status, codeOf(blockedBad)]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(((await getMeta(elena)).json as { avatarVersion: number }).avatarVersion).toBe(6);
    expect((await putAvatar(await api.login('diego.lector'), jpegOf(64, 64))).status).toBe(200);
    const next = new Date(Date.parse(api.clock.nowIsoTimestamp()) + 61 * 60_000).toISOString();
    api.clock.setClock(next.slice(0, 10), next);
    expect((await putAvatar(await api.login('elena.solo'), jpegOf(64, 64))).status).toBe(200);
  });
});

describe('T1554 solo la propia cuenta: sin id de usuario en la ruta y sin exposición a otros ni a la vista pública (REQ-PRF11-002, INV-PRF11-001, SC-011-059)', () => {
  it('[REQ-PRF11-002][SC-011-059] el id sale de la sesión: ?userId=, cabeceras o rutas con id de otro usuario no leen ni escriben la foto ajena', async () => {
    await start();
    const ana = await api.login('ana.duena');
    const bruno = await api.login('bruno.admin');
    await putAvatar(ana, jpegOf(512, 512));
    // Bruno (miembro del hogar de Ana) no ve nada de Ana por ninguna vía.
    expect((await getMeta(bruno)).json).toEqual({ avatarVersion: null });
    for (const query of ['', `?userId=${ANA}`, `?v=1&userId=${ANA}`, `?user=${ANA}`]) {
      const r = await api.call('GET', `${PATH}${query}`, { cookie: bruno, headers: { 'x-user-id': ANA }, contract: false });
      expect([query, r.status, codeOf(r)]).toEqual([query, 404, 'ERR-PRF11-AVATAR-NOT-FOUND']);
    }
    for (const route of [`/api/users/${ANA}/avatar`, `/api/account/avatar/${ANA}`, `/api/households/${HOUSEHOLD_ANA.id}/members/${ANA}/avatar`]) {
      const r = await api.call('GET', route, { cookie: bruno, contract: false });
      expect([route, r.status === 404 || r.status === 405 || r.status === 400]).toEqual([route, true]);
      expect(r.headers['content-type']).not.toMatch(/^image\//);
    }
    // Un PUT/DELETE de Bruno no toca la foto de Ana.
    await putAvatar(bruno, pngOf(256, 256), 'image/png');
    await delAvatar(bruno);
    expect((await getMeta(ana)).json).toEqual({ avatarVersion: 1 });
    expect((await getAvatar(ana, '?v=1')).status).toBe(200);
    expect((await keys()).filter((k) => k.startsWith(`users/${ANA}/`))).toHaveLength(1);
    expect((await keys()).filter((k) => k.startsWith(`users/${BRUNO}/`))).toHaveLength(0);
  });

  it('[REQ-PRF11-002][SC-011-059] la foto no aparece en perfil propio (/auth/me), listados de hogares, miembros ni invitaciones, ni en la vista pública del veterinario', async () => {
    await start();
    const ana = await api.login('ana.duena');
    const bruno = await api.login('bruno.admin');
    await putAvatar(ana, jpegOf(512, 512));
    const objectId = (await keys())[0]!.split('/')[3]!;
    for (const [cookie, url] of [[ana, '/api/auth/me'], [bruno, '/api/auth/me'], [bruno, '/api/households'], [bruno, '/api/account/profile'], [bruno, '/api/invitations']] as const) {
      const r = await api.call('GET', url, { cookie, contract: false });
      expect(r.text.includes(objectId), `${url} sin id de objeto`).toBe(false);
      expect(r.text.includes('users/'), `${url} sin clave`).toBe(false);
      expect(r.text, `${url} sin avatar_object_id`).not.toMatch(/avatar_?object|avatarObject/i);
    }
    // Vista pública del veterinario: un enlace del hogar de Ana nunca lleva la foto de ninguna cuenta.
    const link = await api.call('POST', `/api/households/${HOUSEHOLD_ANA.id}/share-links`, { cookie: ana, body: {}, headers: { 'idempotency-key': '55555555-5555-4555-8555-555555555501' }, contract: false });
    if (link.status === 201) {
      const token = String((link.json as { url: string }).url).split('/shared/')[1]!;
      const pub = await api.call('GET', `/api/shared/${token}/summary`, { csrf: false, contract: false });
      expect(pub.text.includes(objectId)).toBe(false);
      expect(pub.text).not.toMatch(/users\/|avatar_?object/i);
    }
  });

  it('[REQ-PRF11-002] ninguna ruta pública ni de otra cuenta sirve /account/avatar: sin sesión 401 aunque exista foto', async () => {
    await start();
    await putAvatar(await api.login('ana.duena'), jpegOf(512, 512));
    const anonymous = await getAvatar(null, '?v=1');
    expect([anonymous.status, anonymous.headers['content-type']]).toEqual([401, expect.stringMatching(/problem\+json/)]);
  });
});

describe('T1554 eliminar la cuenta borra la foto (INV-PRF11-001, SC-011-060)', () => {
  it('[INV-PRF11-001][SC-011-060] al eliminar la cuenta no queda objeto en users/<uuid>/ ni fila en la cola ni columna de foto, y los demás usuarios conservan la suya', async () => {
    await start();
    const elena = await api.login('elena.solo');
    const diego = await api.login('diego.lector');
    await putAvatar(elena, jpegOf(512, 512));
    await putAvatar(elena, pngOf(256, 256), 'image/png');
    await putAvatar(diego, jpegOf(128, 128));
    expect(await keys(`users/${ELENA}/`)).toHaveLength(1);
    const token = await api.issueConfirmationToken(ELENA);
    const done = await api.call('POST', '/api/account/deletion', { cookie: elena, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    expect(done.status).toBe(204);
    expect(await keys(`users/${ELENA}/`)).toEqual([]);
    expect(await keys(`users/${DIEGO}/`)).toHaveLength(1);
    const queued = (api.db.prepare('SELECT object_key AS k FROM media_deletion_queue').all() as Array<{ k: string }>).map((r) => r.k);
    expect(queued.filter((k) => k.startsWith(`users/${ELENA}/`))).toEqual([]);
    expect(api.dump().includes(ELENA)).toBe(false);
    expect((await getMeta(diego)).json).toEqual({ avatarVersion: 1 });
  });

  it('[INV-PRF11-001][SC-011-060] el borrado inmediato falla (almacén caído): la clave queda en la cola con DELETE y la cuenta se elimina igual; el refuerzo por prefijo barre users/<uuid>/ sobrante', async () => {
    await start();
    const elena = await api.login('elena.solo');
    await putAvatar(elena, jpegOf(512, 512));
    // Un objeto sobrante del mismo usuario (subida a medias) también debe barrerse por el prefijo.
    await storage.inner.put(`users/${ELENA}/avatar/99999999-9999-4999-8999-999999999902`, jpegOf(128, 128), 'image/jpeg');
    const token = await api.issueConfirmationToken(ELENA);
    storage.failing.add('delete');
    const done = await api.call('POST', '/api/account/deletion', { cookie: elena, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
    storage.failing.delete('delete');
    expect(done.status).toBe(204);
    const rows = api.db.prepare("SELECT object_key AS k, reason FROM media_deletion_queue WHERE object_key LIKE ?").all(`users/${ELENA}/%`) as Array<{ k: string; reason: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.reason === 'DELETE')).toBe(true);
  });

  it('[INV-PRF11-001][SC-011-060] carrera PUT frente a eliminación de la cuenta (Trinity H-9): si la cuenta se elimina mientras el objeto sube, no queda objeto huérfano (borrado o en la cola con DELETE) y el PUT no responde 200', async () => {
    await start();
    const elena = await api.login('elena.solo');
    let deleted = false;
    storage.beforePut = async (key) => {
      if (deleted || !key.startsWith(`users/${ELENA}/`)) return;
      deleted = true;
      const token = await api.issueConfirmationToken(ELENA);
      const r = await api.call('POST', '/api/account/deletion', { cookie: elena, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: IDENTITY_PASSWORDS['elena.solo'], backupConfirmationToken: token } });
      expect(r.status).toBe(204);
    };
    const result = await putAvatar(elena, jpegOf(512, 512));
    storage.beforePut = null;
    expect(deleted).toBe(true);
    expect(result.status).not.toBe(200);
    expect(api.dump().includes(ELENA)).toBe(false);
    const queued = new Set((api.db.prepare("SELECT object_key AS k FROM media_deletion_queue WHERE reason IN ('DELETE', 'INTENT')").all() as Array<{ k: string }>).map((r) => r.k));
    for (const key of await keys(`users/${ELENA}/`)) expect(queued.has(key), `huérfano ${key}`).toBe(true);
  });
});
