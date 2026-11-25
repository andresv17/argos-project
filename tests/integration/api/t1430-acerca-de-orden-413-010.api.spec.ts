/**
 * T1430 (Feature 010, Bloque E, [GH:#33]): orden y códigos de los rechazos de `/api/admin/about*` que la batería T1428 no fija (H-ARCH-ACE-413, H-ARCH-ACE-VERSION).
 * - Un cuerpo JSON mayor que el límite de lectura es 413 `ERR-ACE10-BODY-TOO-LARGE` SOLO en `PUT /api/admin/about`; la foto cruda sigue con `ERR-MEDIA-TOO-LARGE`.
 * - Orden CSRF -> sesión (404 uniforme) -> origen (403) -> cuerpo (413): sin sesión, un cuerpo gigante recibe el MISMO 404 que una ruta inexistente de /api/admin, no el 413.
 * - Un 413 no escribe ni audita; un rechazo por tope (422) y uno por peso (413) no confunden los códigos.
 * - La foto pública se sirve con el tipo detectado, sin cookie y con la cabecera de seguridad; sin foto, 404 de problema.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-003, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-011, SC-010-029, SC-010-031, SC-010-033
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adminKit, adminLogin, observable, staticRootWithAdmin, OWN_ORIGIN } from '../../fixtures/admin-fixtures.ts';
import { jpegWithExif } from '../../fixtures/about-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const NOW = '2026-11-25T12:00:00.000Z';
const problem = (r: ApiResponse): { status: number; code: string } => ({ status: r.status, code: (r.json as { code: string }).code });

async function boot(maxBytes: number = DEFAULT_LIMITS.maxBytes) {
  const kit = adminKit();
  const storage = new ControlledStorage(() => new Date(NOW));
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithAdmin(), media: { storage, limits: { ...DEFAULT_LIMITS, maxBytes } } });
  api = a;
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  return { a, cookie: cookie! };
}
const huge = JSON.stringify({ bodyMarkdown: 'a'.repeat(5 * 1024 * 1024), photoAlt: '' });
const putHuge = (a: Api, cookie: string | null, extra: Record<string, string> = {}) =>
  a.call('PUT', '/api/admin/about', { cookie, raw: huge, contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"', 'content-type': 'application/json', ...extra } });
const rows = (a: Api) => a.db.prepare('SELECT COUNT(*) AS n FROM about_content').get() as { n: number };
const audits = (a: Api) => a.db.prepare("SELECT COUNT(*) AS n FROM admin_audit_entries WHERE action LIKE 'ABOUT_%'").get() as { n: number };

describe('T1430 413 de /api/admin/about* (H-ARCH-ACE-413)', () => {
  it('texto: el JSON gigante es 413 ERR-ACE10-BODY-TOO-LARGE application/problem+json, sin escribir ni auditar', async () => {
    const { a, cookie } = await boot();
    const r = await putHuge(a, cookie);
    expect(problem(r)).toEqual({ status: 413, code: 'ERR-ACE10-BODY-TOO-LARGE' });
    expect(String(r.headers['content-type'])).toMatch(/^application\/problem\+json/);
    expect([rows(a).n, audits(a).n]).toEqual([0, 0]);
  });

  it('el 422 del tope de 20 000 caracteres y el 413 del límite de lectura no se confunden: 20 001 caracteres que caben en la lectura son 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', '/api/admin/about', { cookie, body: { bodyMarkdown: 'ñ'.repeat(20_001), photoAlt: '' }, contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"' } });
    expect(problem(r)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });

  it('foto: el cuerpo que supera el límite de lectura sigue siendo ERR-MEDIA-TOO-LARGE (heredado), no el código de Acerca de', async () => {
    const { a, cookie } = await boot(600);
    const jpeg = jpegWithExif();
    const r = await a.call('PUT', '/api/admin/about/photo', { cookie, raw: Uint8Array.from([...jpeg, ...new Array(5000).fill(0)]), contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"', 'content-type': 'image/jpeg' } });
    expect(problem(r)).toEqual({ status: 413, code: 'ERR-MEDIA-TOO-LARGE' });
    expect([rows(a).n, audits(a).n]).toEqual([0, 0]);
  });

  it('otras rutas no heredan el código: PUT /api/admin/no-existe con cuerpo gigante no devuelve ERR-ACE10-BODY-TOO-LARGE', async () => {
    const { a, cookie } = await boot();
    const r = await a.call('PUT', '/api/admin/no-existe', { cookie, raw: huge, contract: false, headers: { origin: OWN_ORIGIN, 'content-type': 'application/json' } });
    expect(r.text).not.toContain('ERR-ACE10-BODY-TOO-LARGE');
  });

  it('[SC-010-029] orden: sin sesión (o con cookie de usuario) un cuerpo gigante recibe el MISMO 404 uniforme que una ruta inexistente de /api/admin; sin X-Argos-Request, 403 antes que la sesión', async () => {
    const { a } = await boot();
    const user = await a.login('andres');
    const baseline = observable(await a.call('PUT', '/api/admin/no-existe', { cookie: null, body: {}, contract: false, headers: { origin: OWN_ORIGIN } }));
    for (const cookie of [null, user]) expect(observable(await putHuge(a, cookie))).toEqual(baseline);
    const noCsrf = await a.call('PUT', '/api/admin/about', { cookie: null, raw: huge, csrf: false, contract: false, headers: { origin: OWN_ORIGIN, 'content-type': 'application/json' } });
    expect(problem(noCsrf).code).toBe('ERR-AUTH-CSRF-REJECTED');
    expect([rows(a).n, audits(a).n]).toEqual([0, 0]);
  });

  it('origen ajeno con sesión: 403 ERR-AUTH-CSRF-REJECTED antes de leer un cuerpo gigante', async () => {
    const { a, cookie } = await boot();
    const r = await putHuge(a, cookie, { origin: 'https://evil.example' });
    expect(problem(r)).toEqual({ status: 403, code: 'ERR-AUTH-CSRF-REJECTED' });
  });
});

describe('T1430 foto pública GET /api/about/photo (REQ-ACE10-001, INV-ACE10-001)', () => {
  it('sin foto: 404 application/problem+json; con foto: 200 con el tipo detectado, sin Set-Cookie, sin metadatos y sin la clave en la URL', async () => {
    const { a, cookie } = await boot();
    const none = await a.call('GET', '/api/about/photo', { csrf: false, contract: false });
    expect(problem(none)).toEqual({ status: 404, code: 'ERR-MEDIA-NOT-FOUND' });
    const saved = await a.call('PUT', '/api/admin/about/photo', { cookie, raw: jpegWithExif(), contract: false, headers: { origin: OWN_ORIGIN, 'if-match': '"0"', 'content-type': 'text/plain' } });
    expect(saved.status).toBe(200);
    const view = (await a.call('GET', '/api/about', { csrf: false, contract: false })).json as { photoUrl: string };
    expect(view.photoUrl).toBe('/api/about/photo?v=1');
    const photo = await a.call('GET', view.photoUrl, { csrf: false, contract: false });
    expect([photo.status, photo.headers['content-type']]).toEqual([200, 'image/jpeg']);
    expect(photo.headers['set-cookie']).toBeUndefined();
    expect(String(photo.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(photo.text).not.toContain('GPSLatitude');
  });
});
