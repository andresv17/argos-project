/**
 * T1269 (009, `[GH:#20]`, subfase 5a) cliente, textos y reglas del editor de parámetros de /admin: forma de las respuestas de `GET /api/admin/parameters`, llamadas exactas de
 * escritura (`If-Match` + `X-Argos-Request`) y de reinicio de cuota, distinción 404 uniforme / 412 / 409 / 422, validación del tope de fotos con el rango del servidor, autor sin ids
 * y aviso de caducidad de sesión a los 25 min. La UI en navegador es el E2E `t1269-editor-parametros.spec.ts`.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006, NFR-009-001; SC-009-017, SC-009-018, SC-009-021, SC-009-026
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParametersPanel } from '../../../src/presentation/admin/ParametersPanel.tsx';
import { fetchParameters, parseParameterCatalog, parseParameterView, resetSceneQuota, updateParameter } from '../../../src/presentation/admin/parameters-api.ts';
import {
  PROPAGATION_NOTICE,
  SESSION_WARNING_TEXT,
  authorLabel,
  formatEditedAt,
  rangeText,
  sessionWarningDelayMs,
  validatePhotoCap,
} from '../../../src/presentation/admin/parameters-view.ts';

const ETAG = '"abcdefgh12345678"';
const ALBUM = {
  key: 'album.max_photos_per_pet',
  valueType: 'INTEGER',
  value: '10',
  default: '10',
  source: 'DATABASE',
  constraints: { min: 1, max: 50 },
  writable: true,
  lastEditedAt: '2026-11-20T15:00:00.000Z',
  lastEditedBy: 'adm-opaque-7f3a',
  etag: ETAG,
};
const ENABLED = { ...ALBUM, key: 'scene.enabled', valueType: 'BOOLEAN', value: 'true', default: 'true', constraints: { allowed: ['true', 'false'] }, lastEditedAt: null, lastEditedBy: null };
const quota = { ...ALBUM, key: 'scene.global_quota_max', value: '5', default: '5', constraints: { min: 1, max: 1000 }, writable: false };
const model = { ...ALBUM, key: 'scene.provider_model', valueType: 'STRING', value: 'gemini-2.5-flash-image', default: 'gemini-2.5-flash-image', constraints: { allowed: ['gemini-2.5-flash-image'] }, writable: false };
const region = { ...model, key: 'scene.provider_location', value: 'us-central1', default: 'us-central1' };
const prompt = { ...ALBUM, key: 'scene.prompt.blocks', valueType: 'JSON_BLOCKS', value: '{"a":"b"}', default: '{"a":"b"}', constraints: { maxBlockLength: 800 }, writable: false };
const CATALOG = { items: [ALBUM, ENABLED, quota, model, region, prompt] };

const json = (body: unknown, status = 200, type = 'application/json'): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}
afterEach(() => vi.unstubAllGlobals());

describe('forma de las respuestas (T1269)', () => {
  it('[REQ-CFG9-001] el catálogo trae las seis claves y cada vista conserva solo los campos del contrato', () => {
    const parsed = parseParameterCatalog({ items: CATALOG.items.map((i) => ({ ...i })) });
    expect(parsed?.map((p) => p.key)).toEqual(['album.max_photos_per_pet', 'scene.enabled', 'scene.global_quota_max', 'scene.provider_model', 'scene.provider_location', 'scene.prompt.blocks']);
    expect(parseParameterView({ ...ALBUM, extra: 'x' })).toEqual(ALBUM);
    expect(parseParameterCatalog({ items: [ALBUM] })).toBeNull();
    expect(parseParameterCatalog(null)).toBeNull();
  });

  it('[REQ-CFG9-001] una vista mal formada se rechaza', () => {
    for (const bad of [
      { ...ALBUM, key: 'otra.clave' },
      { ...ALBUM, valueType: 'FLOAT' },
      { ...ALBUM, value: 10 },
      { ...ALBUM, source: 'CACHE' },
      { ...ALBUM, writable: 'si' },
      { ...ALBUM, etag: 'sin-comillas' },
      { ...ALBUM, lastEditedAt: 'ayer' },
      { ...ALBUM, constraints: 'x' },
      null,
    ]) {
      expect(parseParameterView(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('cliente /api/admin/parameters (T1269)', () => {
  it('[REQ-CFG9-001] la lista se pide por GET con la cookie del mismo origen', async () => {
    const spy = stubFetch(json(CATALOG));
    const result = await fetchParameters();
    expect(result.kind).toBe('OK');
    const [path, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/admin/parameters');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('[REQ-CFG9-007][SC-009-018] la escritura es PUT con If-Match (etag tal cual), X-Argos-Request y cuerpo { value } exacto', async () => {
    const spy = stubFetch(json({ ...ALBUM, value: '12', etag: '"zzzzzzzz99999999"' }));
    const result = await updateParameter('album.max_photos_per_pet', '12', ETAG);
    expect(result).toMatchObject({ kind: 'OK', value: { value: '12', etag: '"zzzzzzzz99999999"' } });
    const [path, init] = spy.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(path).toBe('/api/admin/parameters/album.max_photos_per_pet');
    expect(init.method).toBe('PUT');
    expect(init.headers['If-Match']).toBe(ETAG);
    expect(init.headers['X-Argos-Request']).toBe('1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"value":"12"}');
  });

  it('[EDGE-009-016][EDGE-009-014][NFR-009-001] 412 = PRECONDITION, 422 = INVALID, 404 text/plain = SESSION_LOST, otro = FAILED', async () => {
    stubFetch(json({ code: 'ERR-ADMIN-PARAMETER-PRECONDITION-FAILED' }, 412, 'application/problem+json'));
    expect((await updateParameter('scene.enabled', 'false', ETAG)).kind).toBe('PRECONDITION');
    stubFetch(json({ code: 'ERR-SCHEMA-VALIDATION-FAILED' }, 422, 'application/problem+json'));
    expect((await updateParameter('scene.enabled', 'x', ETAG)).kind).toBe('INVALID');
    stubFetch(new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    expect((await updateParameter('scene.enabled', 'false', ETAG)).kind).toBe('SESSION_LOST');
    stubFetch(json({}, 500, 'application/problem+json'));
    expect((await updateParameter('scene.enabled', 'false', ETAG)).kind).toBe('FAILED');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red'); }));
    expect((await updateParameter('scene.enabled', 'false', ETAG)).kind).toBe('FAILED');
  });

  it('[REQ-CFG9-006][SC-009-026] el reinicio es POST sin cuerpo con X-Argos-Request; 409 = CONFLICT; 404 uniforme = SESSION_LOST', async () => {
    const spy = stubFetch(json({ accountsReset: 1, resetAt: '2026-11-23T12:00:00Z' }));
    expect(await resetSceneQuota()).toEqual({ kind: 'OK', value: { accountsReset: 1, resetAt: '2026-11-23T12:00:00Z' } });
    const [path, init] = spy.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(path).toBe('/api/admin/parameters/scene-quota/reset');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Argos-Request']).toBe('1');
    expect(init.body).toBeUndefined();
    stubFetch(json({ code: 'ERR-ADMIN-QUOTA-RESET-CONFLICT' }, 409, 'application/problem+json'));
    expect((await resetSceneQuota()).kind).toBe('CONFLICT');
    stubFetch(new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    expect((await resetSceneQuota()).kind).toBe('SESSION_LOST');
    stubFetch(json({ accountsReset: -1, resetAt: 'x' }));
    expect((await resetSceneQuota()).kind).toBe('FAILED');
  });
});

describe('textos y reglas (T1269)', () => {
  it('[REQ-CFG9-002] el aviso de propagación es exacto', () => {
    expect(PROPAGATION_NOTICE).toBe('Puede tardar hasta 1 minuto en aplicarse');
  });

  it('[SC-009-018] el tope de fotos exige texto canónico entero dentro del rango del servidor', () => {
    const c = { min: 1, max: 50 };
    expect(validatePhotoCap('12', c)).toBeNull();
    expect(validatePhotoCap('1', c)).toBeNull();
    expect(validatePhotoCap('50', c)).toBeNull();
    for (const bad of ['', '0', '-1', 'abc', ' 12 ', '12.5', '51', '012', '1e1']) expect(validatePhotoCap(bad, c), bad).toBe('Escribe un número entero entre 1 y 50, sin espacios.');
    expect(validatePhotoCap('51', c)).toContain('1 y 50');
  });

  it('[REQ-CFG9-001] el rango se lee de las restricciones del servidor', () => {
    expect(rangeText({ min: 1, max: 50 })).toBe('De 1 a 50');
    expect(rangeText({ allowed: ['true', 'false'] })).toBe('Sí o no');
    expect(rangeText({ allowed: ['a', 'b'] })).toBe('Uno de: a, b');
    expect(rangeText({})).toBe('Sin rango definido');
  });

  it('[NFR-009-001] el autor nunca es un id: «Tú», «Otra persona administradora» o «Sin ediciones»', () => {
    expect(authorLabel('adm-opaque-7f3a', 'adm-opaque-7f3a')).toBe('Tú');
    expect(authorLabel('adm-opaque-0000', 'adm-opaque-7f3a')).toBe('Otra persona administradora');
    expect(authorLabel(null, 'adm-opaque-7f3a')).toBe('Sin ediciones desde este portal');
    expect(formatEditedAt(null)).toBe('Sin ediciones');
    expect(formatEditedAt('2026-11-20T15:00:00.000Z')).toContain('2026');
  });

  it('[LCK-25] el aviso de caducidad se dispara a los 25 min: 5 min antes de expiresAt', () => {
    const now = Date.parse('2030-01-01T00:00:00Z');
    expect(sessionWarningDelayMs('2030-01-01T00:30:00Z', now)).toBe(25 * 60_000);
    expect(sessionWarningDelayMs('2030-01-01T00:03:00Z', now)).toBe(0);
    expect(sessionWarningDelayMs('2029-12-31T23:00:00Z', now)).toBeNull();
    expect(sessionWarningDelayMs('nope', now)).toBeNull();
    expect(SESSION_WARNING_TEXT).toMatch(/5 minutos/);
  });
});

describe('panel (T1269)', () => {
  it('[NFR-009-001] estado inicial renderizable: encabezado y carga, sin ids ni correo', () => {
    const html = renderToStaticMarkup(h(ParametersPanel, { viewerId: 'adm-opaque-7f3a', onSessionLost: () => undefined }));
    expect(html).toContain('Parámetros de la plataforma');
    expect(html).toContain('Cargando');
    expect(html).not.toContain('adm-opaque');
  });
});

describe('T1307 sceneImagesFit en el cliente (contrato 1.5.0)', () => {
  const FIT = [{ model: 'gemini-2.5-flash-image', location: 'us-central1', imagesFit: 111 }, { model: 'gemini-3.1-flash-image', location: 'us-central1', imagesFit: 66 }];

  it('[EDGE-009-036] parseSceneImagesFit conserva solo model, location e imagesFit; lo mal formado o ausente da lista vacia (falla cerrado)', async () => {
    const { parseSceneImagesFit } = await import('../../../src/presentation/admin/parameters-api.ts');
    expect(parseSceneImagesFit({ items: [], sceneImagesFit: FIT.map((f) => ({ ...f, coste: 1 })) })).toEqual(FIT);
    expect(parseSceneImagesFit({ items: [] })).toEqual([]);
    expect(parseSceneImagesFit({ sceneImagesFit: [{ model: 'm', location: 'us-central1', imagesFit: -1 }] })).toEqual([]);
    expect(parseSceneImagesFit({ sceneImagesFit: [{ model: 'm', location: 'us-central1', imagesFit: 1.5 }] })).toEqual([]);
    expect(parseSceneImagesFit({ sceneImagesFit: 'x' })).toEqual([]);
    expect(parseSceneImagesFit(null)).toEqual([]);
  });

  it('fetchParameterCatalog devuelve las seis vistas y las imagenes que caben', async () => {
    const { fetchParameterCatalog } = await import('../../../src/presentation/admin/parameters-api.ts');
    stubFetch(json({ ...CATALOG, sceneImagesFit: FIT }));
    const out = await fetchParameterCatalog();
    expect(out.kind).toBe('OK');
    if (out.kind === 'OK') {
      expect(out.value.params).toHaveLength(6);
      expect(out.value.imagesFit).toEqual(FIT);
    }
  });
});
