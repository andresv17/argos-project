/**
 * T1533 [US5, Bloque E, #31] seguridad del avatar en la vista pública (D11-09 = A, MER-11-01, INV-VET11-001, INV-005-002): la ruta dedicada es la ÚNICA excepción al
 * invariante de privacidad de 005; no filtra claves de objeto, URLs firmadas, EXIF/GPS, token en registros ni existencia de la foto, cuenta para la tasa, no
 * acepta cookie ni la devuelve, y el cliente la pide sin credenciales. `clinical-summary` y `t750`/`t770`/`t778` NO se relajan.
 *
 * @implements REQ-VET11-002, INV-VET11-001, INV-005-002, REQ-HOG11-007, SC-011-037, SC-011-038
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FORBIDDEN_MARKS, hasBytes, jpegWithExif, pngWithMetadata } from '../fixtures/about-fixtures.ts';
import { ARGOS } from '../fixtures/application-harness.ts';
import { createShareApi, type ShareApi } from '../fixtures/share-api-harness.ts';
import { KEY } from '../fixtures/share-harness.ts';
import { createShareApi as createClient } from '../../src/presentation/web/share-api.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const OBJECT_ID = '77777777-7777-4777-8777-777777777701';
const path = (token: string, petId: string): string => `/api/shared/${token}/pets/${petId}/avatar`;

async function setup(bytes: Uint8Array = jpegWithExif(), mime = 'image/jpeg'): Promise<{ token: string; cookie: string }> {
  api = await createShareApi();
  await api.storage.put(`pets/${ARGOS.id}/avatar/${OBJECT_ID}`, bytes, mime);
  await api.deps.uow.runInTransaction((r) => r.pets.replaceAvatar(ARGOS.id, OBJECT_ID));
  const cookie = await api.login('andres');
  const created = await api.call('POST', `/api/pets/${ARGOS.id}/share-links`, { cookie, body: {}, headers: { 'idempotency-key': KEY(1) } });
  return { token: String((created.json as { url: string }).url).split('/shared/')[1]!, cookie };
}

describe('T1533 seguridad del avatar público (REQ-VET11-002, INV-VET11-001)', () => {
  it('[INV-VET11-001] ni cuerpo ni cabeceras ni registros contienen la clave del objeto, su UUID, una URL firmada, el nombre de archivo o el token; sin metadatos EXIF/GPS/XMP', async () => {
    for (const [bytes, mime] of [[jpegWithExif(), 'image/jpeg'], [pngWithMetadata(), 'image/png']] as const) {
      if (api !== undefined) await api.close();
      const { token } = await setup(bytes, mime);
      const raw = await api.app.inject({ method: 'GET', url: path(token, ARGOS.id) });
      expect(raw.statusCode, mime).toBe(200);
      const body = new Uint8Array(raw.rawPayload);
      for (const mark of [...FORBIDDEN_MARKS, OBJECT_ID, 'X-Goog', 'storage.googleapis', `pets/${ARGOS.id}`]) {
        expect(hasBytes(body, mark), `${mime} cuerpo ${mark}`).toBe(false);
        expect(JSON.stringify(raw.headers), `${mime} cabeceras ${mark}`).not.toContain(mark);
      }
      expect(raw.headers['location']).toBeUndefined();
      expect(api.logLines.join('\n'), mime).not.toContain(token);
      expect(api.logLines.join('\n'), mime).not.toContain(OBJECT_ID);
    }
  });

  it('[REQ-VET11-002] la respuesta ignora la cookie de sesión del propietario (resultado idéntico con y sin cookie), no emite Set-Cookie y no es cacheable ni reenviable', async () => {
    const { token, cookie } = await setup();
    const anonymous = await api.app.inject({ method: 'GET', url: path(token, ARGOS.id) });
    const withCookie = await api.app.inject({ method: 'GET', url: path(token, ARGOS.id), headers: { cookie } });
    expect(withCookie.statusCode).toBe(200);
    expect(withCookie.rawPayload.equals(anonymous.rawPayload)).toBe(true);
    for (const r of [anonymous, withCookie]) {
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('[REQ-VET11-002][INV-005-002] la excepción no abre la API autenticada: con el token no se llega a /api/pets/{id}/avatar ni a ninguna ruta de medios, y sin sesión esas rutas siguen 401', async () => {
    const { token } = await setup();
    for (const url of [`/api/pets/${ARGOS.id}/avatar`, `/api/pets/${ARGOS.id}/media`, `/api/shared/${token}/pets/${ARGOS.id}/media`, `/api/shared/${token}/pets/${ARGOS.id}/album`, `/api/shared/${token}/pets/${ARGOS.id}/avatar/extra`]) {
      api.limiter.reset();
      const r = await api.publicGet(url);
      expect([401, 404], url).toContain(r.status);
      expect(r.headers['content-type'] ?? '', url).not.toMatch(/^image\//);
    }
  });

  it('[REQ-VET11-002][SC-011-038] cada fallo de la ruta cuenta para el límite de tasa: tras 20 fallos el siguiente es 429 con Retry-After, sin delatar si el avatar existe', async () => {
    const { token } = await setup();
    for (let i = 0; i < 20; i += 1) expect((await api.publicGet(path(`${String(i).padStart(2, '0')}${'q'.repeat(41)}`, ARGOS.id))).status).toBe(404);
    const limited = await api.publicGet(path(token, ARGOS.id));
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('600');
  });

  it('[REQ-VET11-002] el cliente pide el resumen y el avatar SIN credenciales ni referente: credentials omit, no-store y sin cookie en la petición', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fake = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as typeof fetch;
    const client = createClient(fake) as unknown as { getSharedAvatar?: (token: string, petId: string) => Promise<unknown> };
    expect(typeof client.getSharedAvatar).toBe('function');
    await client.getSharedAvatar!('T'.repeat(43), ARGOS.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(path('T'.repeat(43), ARGOS.id));
    expect(calls[0]!.init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  });

  it('[INV-005-002] el contrato del clinical-summary sigue cerrado: sin avatar, y las pruebas t750, t770 y t778 existen sin .skip ni .todo ni umbrales relajados', () => {
    const schema = readFileSync(new URL('../../specs/005-album-archivos-clinicos/contracts/schemas/clinical-summary.schema.json', import.meta.url), 'utf8');
    expect(schema).not.toMatch(/"avatar[A-Za-z]*"\s*:\s*\{/);
    for (const file of ['security/t750-enlace-publico.security.spec.ts', 'unit/summary/t770-t774-resumen-clinico.spec.ts', 'unit/summary/t778-contrato-entrada-ia.spec.ts']) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\b(it|test|describe)\.(skip|todo)\b/);
    }
  });
});
