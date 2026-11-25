import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, adminKit, adminLogin, observable, staticRootWithAdmin, OWN_ORIGIN } from '../../fixtures/admin-fixtures.ts';
import { FORBIDDEN_MARKS, HOSTILE_MARKDOWN, HOSTILE_PAYLOADS, hasBytes, jpegWithExif, markdownOfLength } from '../../fixtures/about-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1428 (pruebas rojas, Feature 010, Bloque E, [GH:#33]): capa HTTP de «Acerca de» (D10-07) sobre SQLite en memoria; la batería de memoria/SQLite/PostgreSQL de los casos de uso vive en
 * `tests/integration/persistence/t1428-acerca-de-010.spec.ts`. Rutas PROPUESTAS (T1429 las fija en el contrato): público `GET /api/about` y `GET /api/about/photo`; administración
 * `GET /api/admin/about`, `PUT /api/admin/about` (JSON `{ bodyMarkdown, photoAlt }`, If-Match) y `PUT /api/admin/about/photo` (cuerpo crudo, If-Match). Las respuestas se comprueban con
 * `contract: false`: el OpenAPI compilado vigente aún no declara estas operaciones (T1429 lo compila; T1430 las implementa). ROJO esperado hasta T1430.
 * Orden de las mutaciones (patrón 009): `X-Argos-Request` (403, antes de la sesión) -> sesión de administración (404 uniforme) -> origen (403) -> esquema (422) -> precondición (412).
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-007, EDGE-010-011, SC-010-027, SC-010-028, SC-010-029, SC-010-030, SC-010-031, SC-010-032, SC-010-033, SC-010-034
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const NOW = '2026-11-23T12:00:00.000Z';
const problem = (r: ApiResponse): { status: number; code: string } => ({ status: r.status, code: (r.json as { code: string }).code });
const PHOTO_URL = /^\/api\/about\/photo(\?v=\d+)?$/;

async function boot(maxBytes: number = DEFAULT_LIMITS.maxBytes) {
  const kit = adminKit();
  const storage = new ControlledStorage(() => new Date(NOW));
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithAdmin(), media: { storage, limits: { ...DEFAULT_LIMITS, maxBytes } } });
  api = a;
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  const adminId = (a.db.prepare('SELECT admin_id AS id FROM admin_identities').get() as { id: string }).id;
  return { a, kit, storage, cookie: cookie!, adminId };
}

const readPublic = (a: Api, headers: Record<string, string> = {}) => a.call('GET', '/api/about', { csrf: false, contract: false, headers });
const readAdmin = (a: Api, cookie: string | null) => a.call('GET', '/api/admin/about', { cookie, contract: false });
const putText = (a: Api, cookie: string | null, body: unknown, ifMatch?: string, extra: Record<string, string> = {}) =>
  a.call('PUT', '/api/admin/about', { cookie, body, contract: false, headers: { origin: OWN_ORIGIN, ...(ifMatch === undefined ? {} : { 'if-match': ifMatch }), ...extra } });
const putPhoto = (a: Api, cookie: string | null, raw: Uint8Array, ifMatch?: string, contentType = 'image/jpeg') =>
  a.call('PUT', '/api/admin/about/photo', { cookie, raw, contract: false, headers: { origin: OWN_ORIGIN, 'content-type': contentType, ...(ifMatch === undefined ? {} : { 'if-match': ifMatch }) } });
const rowOf = (a: Api) => a.db.prepare('SELECT * FROM about_content').get() as { body_markdown: string; photo_object_key: string | null; photo_alt: string; version: number; updated_at: string; updated_by: string } | undefined;
const auditRows = (a: Api) => a.db.prepare('SELECT admin_id, action, object_ref, occurred_at FROM admin_audit_entries WHERE action LIKE ? ORDER BY occurred_at, action').all('ABOUT_%') as Array<{ admin_id: string; action: string; object_ref: string | null; occurred_at: string }>;
const text = (bodyMarkdown: string, photoAlt = 'Foto del equipo') => ({ bodyMarkdown, photoAlt });

describe('T1428 GET /api/about (público) [REQ-ACE10-001] [SC-010-027] [EDGE-010-004]', () => {
  it('sin datos: 200 application/json con el estado vacío limpio, sin Set-Cookie y sin exigir sesión ni cabecera X-Argos-Request', async () => {
    const { a } = await boot();
    const r = await readPublic(a);
    expect([r.status, r.json]).toEqual([200, { bodyMarkdown: '', photoUrl: null, photoAlt: '', updatedAt: null }]);
    expect(String(r.headers['content-type'])).toMatch(/^application\/json/);
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('[EDGE-010-004] con cookie de sesión caducada, ajena o sin ella el resultado es el mismo 200 (no redirige ni responde 401)', async () => {
    const { a } = await boot();
    const anonymous = await readPublic(a);
    for (const cookie of ['argos_session=caducada', 'argos_session=' + 'x'.repeat(43), 'argos_admin_session=' + 'y'.repeat(43)]) {
      const r = await readPublic(a, { cookie });
      expect([r.status, r.json]).toEqual([200, anonymous.json]);
      expect(r.headers['location']).toBeUndefined();
    }
  });

  it('[SC-010-028] con datos: la publicación es inmediata y la respuesta pública lleva solo bodyMarkdown, photoAlt, photoUrl y updatedAt', async () => {
    const { a, cookie } = await boot();
    const saved = await putText(a, cookie, text('# Hola\n\nTexto.', 'Equipo'), '"0"');
    expect(saved.status).toBe(200);
    const r = await readPublic(a);
    expect(r.json).toEqual({ bodyMarkdown: '# Hola\n\nTexto.', photoUrl: null, photoAlt: 'Equipo', updatedAt: NOW });
    expect(r.text).not.toMatch(/photo_object_key|photoObjectKey|updated_by|updatedBy|version|googleapis|gs:\/\//);
  });
});

describe('T1428 /api/admin/about sin sesión de administración [REQ-ACE10-003] [SC-010-029]', () => {
  it('GET, PUT texto y PUT foto sin sesión, con cookie de usuario o con cookie de admin inventada: el MISMO 404 uniforme que una ruta inexistente de /api/admin', async () => {
    const { a } = await boot();
    const user = await a.login('andres');
    const baseline = {
      GET: observable(await a.call('GET', '/api/admin/no-existe', { cookie: null, contract: false })),
      PUT: observable(await a.call('PUT', '/api/admin/no-existe', { cookie: null, body: {}, contract: false, headers: { origin: OWN_ORIGIN } })),
    };
    for (const cookie of [null, user, 'argos_admin_session=' + 'z'.repeat(43)]) {
      expect(observable(await readAdmin(a, cookie)), 'GET').toEqual(baseline.GET);
      expect(observable(await putText(a, cookie, text('intruso'), '"0"')), 'PUT texto').toEqual(baseline.PUT);
      expect(observable(await putPhoto(a, cookie, jpegWithExif(), '"0"')), 'PUT foto').toEqual(baseline.PUT);
    }
    expect(rowOf(a)).toBeUndefined();
    expect(auditRows(a)).toEqual([]);
  });

  it('una mutación SIN X-Argos-Request responde 403 ERR-AUTH-CSRF-REJECTED antes de resolver la sesión (con o sin ella) y no escribe', async () => {
    const { a, cookie } = await boot();
    for (const session of [cookie, null]) {
      const r = await a.call('PUT', '/api/admin/about', { cookie: session, body: text('x'), csrf: false, contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"' } });
      expect(problem(r)).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
    }
    expect(rowOf(a)).toBeUndefined();
  });

  it('con sesión de administración pero origen ajeno: 403 ERR-AUTH-CSRF-REJECTED sin escribir', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', '/api/admin/about', { cookie, body: text('x'), contract: false, headers: { origin: 'https://evil.example', 'if-match': '"0"' } });
    expect(problem(r)).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
    expect(rowOf(a)).toBeUndefined();
  });
});

describe('T1428 PUT /api/admin/about (texto) [REQ-ACE10-002] [REQ-ACE10-003] [SC-010-028] [SC-010-031]', () => {
  it('GET con sesión: 200 con ETag "0" y la vista vacía; PUT con If-Match "0": 200 con ETag "1", versión 1, autor y fecha del servidor; la respuesta no incluye el correo del administrador', async () => {
    const { a, cookie, adminId } = await boot();
    const before = await readAdmin(a, cookie);
    expect([before.status, before.headers['etag']]).toEqual([200, '"0"']);
    expect(before.json).toMatchObject({ bodyMarkdown: '', photoAlt: '', version: 0 });
    const saved = await putText(a, cookie, text('Primera versión', 'Alt uno'), '"0"');
    expect([saved.status, saved.headers['etag']]).toEqual([200, '"1"']);
    expect(saved.json).toMatchObject({ bodyMarkdown: 'Primera versión', photoAlt: 'Alt uno', version: 1 });
    expect(rowOf(a)).toMatchObject({ body_markdown: 'Primera versión', photo_alt: 'Alt uno', version: 1, updated_at: NOW, updated_by: adminId });
    expect(saved.text).not.toContain(ADMIN_EMAIL);
    expect(String(saved.headers['cache-control'])).toContain('no-store');
  });

  it('If-Match obsoleto: 412 ERR-ACE10-PRECONDITION-FAILED application/problem+json sin escribir; ausente o mal formado: 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const { a, cookie } = await boot();
    await putText(a, cookie, text('uno'), '"0"');
    const stale = await putText(a, cookie, text('dos'), '"0"');
    expect(problem(stale)).toEqual({ status: 412, code: 'ERR-ACE10-PRECONDITION-FAILED' });
    expect(String(stale.headers['content-type'])).toMatch(/^application\/problem\+json/);
    expect(stale.text).not.toContain('uno');
    for (const ifMatch of [undefined, 'abc', '"x"', '*']) {
      expect(problem(await putText(a, cookie, text('tres'), ifMatch)), String(ifMatch)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    }
    expect(rowOf(a)).toMatchObject({ body_markdown: 'uno', version: 1 });
  });

  it('dos escrituras simultáneas con el mismo If-Match: una 200 y una 412; la versión final es 2', async () => {
    const { a, cookie } = await boot();
    await putText(a, cookie, text('base'), '"0"');
    const [one, two] = await Promise.all([putText(a, cookie, text('uno'), '"1"'), putText(a, cookie, text('dos'), '"1"')]);
    expect([one.status, two.status].sort()).toEqual([200, 412]);
    expect(rowOf(a)?.version).toBe(2);
  });

  it('[EDGE-010-007][SC-010-030] Markdown hostil: se guarda sanitizado (sin HTML, esquemas ejecutables ni imágenes remotas) y la lectura pública también', async () => {
    const { a, cookie } = await boot();
    let version = 0;
    for (const { name, source } of HOSTILE_MARKDOWN) {
      const r = await putText(a, cookie, text(source), `"${version}"`);
      expect(r.status, name).toBe(200);
      version += 1;
      for (const out of [rowOf(a)!.body_markdown, (await readPublic(a)).json as { bodyMarkdown: string }].map((v) => (typeof v === 'string' ? v : v.bodyMarkdown))) {
        expect(out, name).not.toMatch(/<\s*\/?\s*[a-z!?]/i);
        expect(out, name).not.toMatch(/(java|vb)\s*script\s*:/i);
        expect(out, name).not.toContain('![');
        expect(out, name).not.toContain('tracker.example');
      }
    }
  });

  it('[EDGE-010-011][SC-010-031] 20 000 caracteres: 200 y se publican completos; 20 001: 422 ERR-SCHEMA-VALIDATION-FAILED sin escribir ni auditar', async () => {
    const { a, cookie } = await boot();
    expect((await putText(a, cookie, text(markdownOfLength(20_000)), '"0"')).status).toBe(200);
    expect(((await readPublic(a)).json as { bodyMarkdown: string }).bodyMarkdown).toHaveLength(20_000);
    const auditBefore = auditRows(a).length;
    const over = await putText(a, cookie, text(markdownOfLength(20_001)), '"1"');
    expect(problem(over)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    expect(rowOf(a)).toMatchObject({ version: 1 });
    expect(rowOf(a)!.body_markdown).toHaveLength(20_000);
    expect(auditRows(a)).toHaveLength(auditBefore);
  });

  it('[EDGE-010-011] un cuerpo de varios MB (payload gigante) se rechaza con 413 antes de procesarse y no escribe', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', '/api/admin/about', { cookie, raw: JSON.stringify(text('a'.repeat(5 * 1024 * 1024))), contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"', 'content-type': 'application/json' } });
    expect(r.status).toBe(413);
    expect(rowOf(a)).toBeUndefined();
  });

  it('[SC-010-034] la auditoría guarda administrador, acción ABOUT_UPDATE, objeto about y marca del reloj; nada del texto ni del alt; un intento rechazado no audita', async () => {
    const { a, cookie, adminId } = await boot();
    await putText(a, cookie, text('contenido muy secreto', 'alt muy secreto'), '"0"');
    await putText(a, cookie, text('rechazado'), '"0"');
    expect(auditRows(a)).toEqual([{ admin_id: adminId, action: 'ABOUT_UPDATE', object_ref: 'about', occurred_at: NOW }]);
    const dump = JSON.stringify(a.db.prepare('SELECT * FROM admin_audit_entries').all());
    for (const secret of ['contenido muy secreto', 'alt muy secreto']) expect(dump).not.toContain(secret);
  });
});

describe('T1428 PUT /api/admin/about/photo [REQ-ACE10-002] [INV-ACE10-001] [SC-010-032] [SC-010-033] [EDGE-010-006]', () => {
  it('foto JPEG con EXIF/GPS/XMP/comentario: 200 versión +1, el objeto guardado NO conserva metadatos, la URL pública es /api/about/photo y nada expone la clave de almacenamiento', async () => {
    const { a, cookie, storage } = await boot();
    const sent = jpegWithExif();
    for (const mark of FORBIDDEN_MARKS) expect(hasBytes(sent, mark)).toBe(true);
    const r = await putPhoto(a, cookie, sent, '"0"');
    expect([r.status, r.headers['etag']]).toEqual([200, '"1"']);
    const key = rowOf(a)!.photo_object_key!;
    expect(key).toMatch(/^[A-Za-z0-9/_.-]{10,}$/);
    const stored = await storage.inner.get(key);
    expect(stored?.contentType).toBe('image/jpeg');
    for (const mark of FORBIDDEN_MARKS) expect(hasBytes(stored!.bytes, mark), `conserva ${mark}`).toBe(false);
    const pub = await readPublic(a);
    expect((pub.json as { photoUrl: string }).photoUrl).toMatch(PHOTO_URL);
    for (const response of [pub, r, await readAdmin(a, cookie)]) {
      expect(response.text).not.toContain(key);
      expect(response.text).not.toMatch(/photo_object_key|photoObjectKey|googleapis|gs:\/\//);
    }
  });

  it('el tipo lo decide la firma, no el Content-Type: un JPEG enviado como text/plain se acepta y un SVG enviado como image/png se rechaza', async () => {
    const { a, cookie } = await boot();
    expect((await putPhoto(a, cookie, jpegWithExif(), '"0"', 'text/plain')).status).toBe(200);
    const svg = HOSTILE_PAYLOADS[0]!.bytes;
    expect(problem(await putPhoto(a, cookie, svg, '"1"', 'image/png'))).toEqual({ status: 422, code: 'ERR-ACE10-PHOTO-INVALID' });
  });

  it('[EDGE-010-007][SC-010-033] SVG, HTML, XML, PDF, texto, vacío y PNG truncado: 422 ERR-ACE10-PHOTO-INVALID application/problem+json; no se guarda objeto, fila ni auditoría', async () => {
    const { a, cookie, storage } = await boot();
    for (const { name, bytes } of HOSTILE_PAYLOADS) {
      const r = await putPhoto(a, cookie, bytes, '"0"');
      expect(problem(r), name).toEqual({ status: 422, code: 'ERR-ACE10-PHOTO-INVALID' });
      expect(String(r.headers['content-type']), name).toMatch(/^application\/problem\+json/);
    }
    expect(storage.operations.filter((o) => o.startsWith('put:'))).toEqual([]);
    expect(rowOf(a)).toBeUndefined();
    expect(auditRows(a)).toEqual([]);
  });

  it('[SC-010-033] peso: justo dentro del tope se acepta; un byte por encima del tope (aún dentro del límite de lectura) es 422 ERR-ACE10-PHOTO-INVALID; muy por encima, 413', async () => {
    const jpeg = jpegWithExif();
    const pad = (n: number): Uint8Array => Uint8Array.from([...jpeg, ...new Array(n - jpeg.length).fill(0)]);
    const { a, cookie } = await boot(600);
    expect(problem(await putPhoto(a, cookie, pad(601), '"0"'))).toEqual({ status: 422, code: 'ERR-ACE10-PHOTO-INVALID' });
    expect((await putPhoto(a, cookie, pad(600), '"0"')).status).toBe(200);
    expect((await putPhoto(a, cookie, pad(5000), '"1"')).status).toBe(413);
    expect(rowOf(a)?.version).toBe(1);
  });

  it('[EDGE-010-006] la foto incrementa version y exige If-Match: obsoleto = 412 sin dejar objeto huérfano; ausente = 422; el texto guardado antes no se pierde', async () => {
    const { a, cookie, storage } = await boot();
    await putText(a, cookie, text('texto vigente', 'alt'), '"0"');
    const stale = await putPhoto(a, cookie, jpegWithExif(), '"0"');
    expect(problem(stale)).toEqual({ status: 412, code: 'ERR-ACE10-PRECONDITION-FAILED' });
    expect(problem(await putPhoto(a, cookie, jpegWithExif()))).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
    expect(rowOf(a)).toMatchObject({ body_markdown: 'texto vigente', photo_object_key: null, version: 1 });
    const live: string[] = [];
    for (const key of new Set(storage.operations.filter((o) => o.startsWith('put:')).map((o) => o.slice(4)))) if ((await storage.inner.get(key)) !== null) live.push(key);
    const queued = a.db.prepare('SELECT object_key FROM media_deletion_queue').all() as Array<{ object_key: string }>;
    expect(live.filter((k) => !queued.some((q) => q.object_key === k))).toEqual([]);
    const ok = await putPhoto(a, cookie, jpegWithExif(), '"1"');
    expect(ok.status).toBe(200);
    expect(rowOf(a)).toMatchObject({ body_markdown: 'texto vigente', version: 2 });
  });

  it('[EDGE-010-006] red caída durante la subida a GCS: 502 ERR-MEDIA-STORAGE-UNAVAILABLE y el público no ve estado mixto (ni foto ni cambio de texto); reintentar con la misma versión funciona', async () => {
    const { a, cookie, storage } = await boot();
    await putText(a, cookie, text('solo texto'), '"0"');
    const publicBefore = (await readPublic(a)).json;
    storage.down = true;
    const down = await putPhoto(a, cookie, jpegWithExif(), '"1"');
    storage.down = false;
    expect(problem(down)).toEqual({ status: 502, code: 'ERR-MEDIA-STORAGE-UNAVAILABLE' });
    expect((await readPublic(a)).json).toEqual(publicBefore);
    expect(rowOf(a)).toMatchObject({ photo_object_key: null, version: 1 });
    expect((await putPhoto(a, cookie, jpegWithExif(), '"1"')).status).toBe(200);
  });

  it('[SC-010-034] la foto audita ABOUT_PHOTO_UPDATE sobre el objeto about, sin clave ni bytes', async () => {
    const { a, cookie, adminId } = await boot();
    await putPhoto(a, cookie, jpegWithExif(), '"0"');
    expect(auditRows(a)).toEqual([{ admin_id: adminId, action: 'ABOUT_PHOTO_UPDATE', object_ref: 'about', occurred_at: NOW }]);
    expect(JSON.stringify(a.db.prepare('SELECT * FROM admin_audit_entries').all())).not.toContain(rowOf(a)!.photo_object_key!);
  });
});

describe('T1428 GET /api/about/photo (público) [REQ-ACE10-001] [REQ-ACE10-003]', () => {
  it('sin foto: 404 problem/uniforme; con foto: se sirve sin sesión (200 con tipo image/* o 302 a URL firmada) y con cookie caducada igual', async () => {
    const { a, cookie } = await boot();
    expect((await a.call('GET', '/api/about/photo', { csrf: false, contract: false })).status).toBe(404);
    await putPhoto(a, cookie, jpegWithExif(), '"0"');
    for (const headers of [{}, { cookie: 'argos_session=caducada' }]) {
      const r = await a.call('GET', '/api/about/photo', { csrf: false, contract: false, headers });
      expect([200, 302]).toContain(r.status);
      if (r.status === 200) expect(String(r.headers['content-type'])).toMatch(/^image\/(jpeg|png|webp)/);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
  });
});
