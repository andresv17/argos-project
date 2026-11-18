/**
 * T756 / T758 / T759 / T761 / T762 / T763 [US4] rutas HTTP del enlace veterinario sobre SQLite (REQ-VET-001, REQ-VET-005, REQ-VET-006, REQ-VET-007,
 * REQ-VET-008, REQ-VET-009; SC-005-015, SC-005-020, SC-005-022, SC-005-023, SC-005-025, SC-005-050, SC-005-051): creación y listado autenticados con
 * `Idempotency-Key`, revocación, vista previa, rutas públicas `GET /api/shared/{token}/summary` y `/files/{mediaId}` con cabeceras en toda respuesta,
 * 404 uniforme (también para los errores de Fastify) y registros sin el token.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateCreateShareLinkReplay, validateCreateShareLinkResult, validateShareLinkList, validateSharedSummaryView } from '../../../src/generated/v33/index.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { ARGOS } from '../../fixtures/application-harness.ts';
import { PDF } from '../../fixtures/media-harness.ts';
import { createShareApi, type ShareApi, type ShareApiResponse } from '../../fixtures/share-api-harness.ts';
import { HOUSEHOLD_ID, KEY } from '../../fixtures/share-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const PET_LINKS = `/api/pets/${ARGOS.id}/share-links`;
const HOUSE_LINKS = `/api/households/${HOUSEHOLD_ID}/share-links`;
const WITH_KEY = (n: number) => ({ 'idempotency-key': KEY(n) });
const tokenOf = (url: unknown): string => String(url).split('/shared/')[1]!;
const code = (r: ShareApiResponse) => (r.json as { code?: string } | undefined)?.code;

/** Cabeceras obligatorias de REQ-VET-006 en TODA respuesta de las rutas públicas. */
function expectSharedHeaders(r: ShareApiResponse, label = ''): void {
  expect(r.headers['cache-control'], `${label} cache-control`).toBe('no-store');
  expect(r.headers['referrer-policy'], `${label} referrer-policy`).toBe('no-referrer');
  expect(r.headers['x-robots-tag'], `${label} x-robots-tag`).toBe('noindex, nofollow, noarchive');
  expect(r.headers['x-content-type-options'], `${label} nosniff`).toBe('nosniff');
  expect(r.headers['content-security-policy'], `${label} csp`).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(r.headers['set-cookie'], `${label} sin cookie`).toBeUndefined();
}

async function makeLink(cookie: string, n = 1, body: unknown = {}, url = PET_LINKS) {
  const response = await api.call('POST', url, { cookie, body, headers: WITH_KEY(n) });
  expect(response.status).toBe(201);
  const result = response.json as { link: { id: string }; url: string };
  return { id: result.link.id, token: tokenOf(result.url), response };
}

describe('T756 rutas autenticadas de creación y listado (REQ-VET-001, SC-005-015, SC-005-025, SC-005-051)', () => {
  it('[SC-005-015] POST crea el enlace con 201: CreateShareLinkResult válido, URL con el token una sola vez y Cache-Control: no-store; en BD solo el hash', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const response = await api.call('POST', PET_LINKS, { cookie, body: { expiresInDays: 30 }, headers: WITH_KEY(1) });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(validateCreateShareLinkResult(response.json)).toBe(true);
    const token = tokenOf((response.json as { url: string }).url);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(api.dump()).not.toContain(token);
    expect(api.db.prepare('SELECT token_hash FROM share_links').pluck().all()).toEqual([hashToken(token)]);
    expect(api.logLines.join('\n')).not.toContain(token);
  });

  it('[SC-005-051] el reintento con la misma Idempotency-Key responde 200 CreateShareLinkReplay sin URL, con no-store y sin fila nueva', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    await api.call('POST', PET_LINKS, { cookie, body: {}, headers: WITH_KEY(1) });
    const replay = await api.call('POST', PET_LINKS, { cookie, body: {}, headers: WITH_KEY(1) });
    expect(replay.status).toBe(200);
    expect(replay.headers['cache-control']).toBe('no-store');
    expect(validateCreateShareLinkReplay(replay.json)).toBe(true);
    expect(JSON.stringify(replay.json)).not.toMatch(/"url"|token/i);
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(1);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_link_audit WHERE event_type = 'CREATED'").pluck().get()).toBe(1);
  });

  it('[SC-005-051] sin Idempotency-Key, con una clave que no es UUID v4 o repetida con otras opciones: 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    expect(code(await api.call('POST', PET_LINKS, { cookie, body: {} }))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect((await api.call('POST', PET_LINKS, { cookie, body: {} })).status).toBe(422);
    expect((await api.call('POST', PET_LINKS, { cookie, body: {}, headers: { 'idempotency-key': 'abc' } })).status).toBe(422);
    await api.call('POST', PET_LINKS, { cookie, body: {}, headers: WITH_KEY(1) });
    expect((await api.call('POST', PET_LINKS, { cookie, body: { includeMicrochip: true }, headers: WITH_KEY(1) })).status).toBe(422);
    expect((await api.call('POST', HOUSE_LINKS, { cookie, body: {}, headers: WITH_KEY(1) })).status).toBe(422);
  });

  it('[REQ-VET-004] expiresInDays distinto de 1, 7 o 30 y campos extra (tokenHash, expiresAt) se rechazan con 422', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    let n = 0;
    for (const body of [{ expiresInDays: 2 }, { expiresInDays: 90 }, { expiresAt: '2026-12-01T00:00:00.000Z' }, { tokenHash: 'x' }, { includeMicrochip: 'true' }]) {
      n += 1;
      expect((await api.call('POST', PET_LINKS, { cookie, body, headers: WITH_KEY(n) })).status, JSON.stringify(body)).toBe(422);
    }
  });

  it('[SC-005-025][D5-10] CAREGIVER y READER reciben 403 ERR-ACC-FORBIDDEN; quien no ve la mascota 404; sin sesión 401; sin CSRF 403 ERR-AUTH-CSRF-REJECTED', async () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      api = await createShareApi({ role });
      const maria = await api.login('maria');
      const forbidden = await api.call('POST', PET_LINKS, { cookie: maria, body: {}, headers: WITH_KEY(1) });
      expect([forbidden.status, code(forbidden)]).toEqual([403, 'ERR-ACC-FORBIDDEN']);
      expect((await api.call('GET', PET_LINKS, { cookie: maria })).status).toBe(403);
      await api.close();
    }
    api = await createShareApi();
    const lucia = await api.login('lucia');
    expect((await api.call('POST', PET_LINKS, { cookie: lucia, body: {}, headers: WITH_KEY(1) })).status).toBe(404);
    expect((await api.call('POST', HOUSE_LINKS, { cookie: lucia, body: {}, headers: WITH_KEY(1) })).status).toBe(404);
    expect((await api.call('POST', PET_LINKS, { body: {}, headers: WITH_KEY(1) })).status).toBe(401);
    const andres = await api.login('andres');
    expect(code(await api.call('POST', PET_LINKS, { cookie: andres, body: {}, headers: WITH_KEY(1), csrf: false }))).toBe('ERR-AUTH-CSRF-REJECTED');
  });

  it('[SC-005-038] el 21.º enlace activo de la mascota es 409 ERR-SHARE-LINK-LIMIT', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    for (let n = 1; n <= 20; n += 1) await makeLink(cookie, n);
    const over = await api.call('POST', PET_LINKS, { cookie, body: {}, headers: WITH_KEY(21) });
    expect([over.status, code(over)]).toEqual([409, 'ERR-SHARE-LINK-LIMIT']);
    expect((over.json as { instance: string }).instance).toBe(PET_LINKS);
  });

  it('[REQ-VET-001] GET lista solo metadatos con activeCount/maxActiveLinks y no-store; nunca el token ni su hash', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const a = await makeLink(cookie, 1);
    const house = await makeLink(cookie, 2, {}, HOUSE_LINKS);
    const petList = await api.call('GET', PET_LINKS, { cookie });
    expect(petList.status).toBe(200);
    expect(petList.headers['cache-control']).toBe('no-store');
    expect(validateShareLinkList(petList.json)).toBe(true);
    expect((petList.json as { items: unknown[] }).items).toHaveLength(1);
    const houseList = await api.call('GET', HOUSE_LINKS, { cookie });
    expect(validateShareLinkList(houseList.json)).toBe(true);
    for (const text of [petList.text, houseList.text]) for (const secret of [a.token, house.token, hashToken(a.token), 'tokenHash']) expect(text).not.toContain(secret);
  });

  it('[SC-005-046] DELETE /share-links/{id} revoca con 204, es idempotente, el enlace deja de resolver al instante y uno ajeno o inexistente es 404 ERR-SHARE-NOT-FOUND', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const link = await makeLink(cookie);
    expect((await api.publicGet(`/api/shared/${link.token}/summary`)).status).toBe(200);
    const revoked = await api.call('DELETE', `/api/share-links/${link.id}`, { cookie });
    expect(revoked.status).toBe(204);
    expect((await api.call('DELETE', `/api/share-links/${link.id}`, { cookie })).status).toBe(204);
    expect((await api.publicGet(`/api/shared/${link.token}/summary`)).status).toBe(404);
    const lucia = await api.login('lucia');
    const foreign = await api.call('DELETE', `/api/share-links/${link.id}`, { cookie: lucia });
    const missing = await api.call('DELETE', '/api/share-links/99999999-9999-4999-8999-999999999999', { cookie: lucia });
    expect([foreign.status, code(foreign)]).toEqual([404, 'ERR-SHARE-NOT-FOUND']);
    expect({ ...(foreign.json as object), instance: null }).toEqual({ ...(missing.json as object), instance: null });
  });

  it('[SC-005-015] HOUSEHOLD: creación, listado y vista previa de Casa Vallejo; sin permisos 403; y la vista previa no crea token ni fila', async () => {
    api = await createShareApi({ role: 'CAREGIVER' });
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    const link = await makeLink(andres, 1, {}, HOUSE_LINKS);
    expect((await api.call('POST', HOUSE_LINKS, { cookie: maria, body: {}, headers: WITH_KEY(2) })).status).toBe(403);
    const view = await api.publicGet(`/api/shared/${link.token}/summary`);
    expect((view.json as { summary: { scope: string; pets: unknown[] } }).summary).toMatchObject({ scope: 'HOUSEHOLD' });
    expect((view.json as { summary: { pets: unknown[] } }).summary.pets).toHaveLength(5);
    const rowsBefore = api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get();
    const preview = await api.call('GET', `/api/households/${HOUSEHOLD_ID}/clinical-summary?includeMicrochip=true`, { cookie: andres });
    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(validateSharedSummaryView(preview.json)).toBe(true);
    expect((preview.json as { validUntil: unknown }).validUntil).toBeNull();
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(rowsBefore);
    expect((await api.call('GET', `/api/pets/${ARGOS.id}/clinical-summary`, { cookie: maria })).status).toBe(403);
    expect((await api.call('GET', `/api/pets/${ARGOS.id}/clinical-summary?includeMicrochip=maybe`, { cookie: andres })).status).toBe(422);
  });
});

describe('T758 / T759 ruta pública GET /api/shared/{token}/summary (REQ-VET-006, SC-005-020)', () => {
  it('[SC-005-020] sirve el SharedSummaryView sin cookie ni CSRF con las cabeceras de REQ-VET-006 (no-store, no-referrer, noindex, nosniff, CSP restrictiva)', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    const response = await api.publicGet(`/api/shared/${link.token}/summary`);
    expect(response.status).toBe(200);
    expectSharedHeaders(response, '200');
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(validateSharedSummaryView(response.json)).toBe(true);
    expect((response.json as { summary: { pets: Array<{ profile: { name: string } }> } }).summary.pets.map((p) => p.profile.name)).toEqual(['Argos']);
  });

  it('[REQ-VET-006] la ruta es solo GET: HEAD, POST, PUT, PATCH, DELETE y OPTIONS responden el mismo 404 uniforme sin resolver el token', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    api.calls.length = 0;
    const reference = await api.publicGet(`/api/shared/${'x'.repeat(43)}/summary`);
    api.calls.length = 0;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const response = await api.inject(method, `/api/shared/${link.token}/summary`, method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE' ? { 'x-argos-request': '1' } : {});
      expect(response.status, method).toBe(404);
      if (method !== 'HEAD') expect(response.json, method).toEqual(reference.json);
      expectSharedHeaders(response, method);
    }
    expect(api.calls.filter((c) => c === 'shareLinks.findByTokenHash')).toEqual([]);
    const withoutCsrf = await api.inject('POST', `/api/shared/${link.token}/summary`);
    expect([withoutCsrf.status, code(withoutCsrf)]).toEqual([404, 'ERR-SHARE-NOT-FOUND']);
  });

  it('[INV-005-002] la lectura pública usa una transacción de solo lectura y una única escritura de auditoría; no escribe nada más', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    const before = new Map(JSON.parse(api.dump()) as Array<[string, unknown[]]>);
    api.calls.length = 0;
    expect((await api.publicGet(`/api/shared/${link.token}/summary`)).status).toBe(200);
    expect(api.calls.filter((c) => c.startsWith('uow.'))).toEqual(['uow.read', 'uow.write']);
    const after = new Map(JSON.parse(api.dump()) as Array<[string, unknown[]]>);
    for (const [table, rows] of before) if (table !== 'share_link_audit') expect(after.get(table), table).toEqual(rows);
    expect(after.get('share_link_audit')).toHaveLength(2);
  });

  it('[REQ-VET-006] la cookie de sesión no activa ninguna rama: con sesión válida, un token inexistente sigue siendo el mismo 404', async () => {
    api = await createShareApi();
    const cookie = await api.login('andres');
    const withCookie = await api.publicGet(`/api/shared/${'q'.repeat(43)}/summary`, { cookie });
    const withoutCookie = await api.publicGet(`/api/shared/${'q'.repeat(43)}/summary`);
    expect(withCookie.status).toBe(404);
    expect(withCookie.json).toEqual(withoutCookie.json);
    expect(withCookie.headers['set-cookie']).toBeUndefined();
  });

  it('[REQ-VET-006] toda respuesta (200, 404, 429 y 500) lleva las mismas cabeceras, también con la auditoría caída (fail-closed, 500 genérico con instance /shared)', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    api.deps.auditIds.nextId = () => {
      throw new Error('auditoría caída con SECRETO-INTERNO');
    };
    const failure = await api.publicGet(`/api/shared/${link.token}/summary`);
    expect([failure.status, code(failure)]).toEqual([500, 'ERR-INTERNAL-UNEXPECTED']);
    expectSharedHeaders(failure, '500');
    expect((failure.json as { instance: string }).instance).toBe('/shared');
    expect(failure.text).not.toMatch(/SECRETO-INTERNO|auditoría caída/);
    expect(api.logLines.join('\n')).not.toContain(link.token);
  });
});

describe('T761 uniformidad y normalización de Fastify (REQ-VET-007, INV-005-007, SC-005-041, SC-005-050, EDGE-005-25)', () => {
  const HOSTILE_PATHS = (live: string): Record<string, string> => ({
    inexistente: `/api/shared/${'x'.repeat(43)}/summary`,
    corto: '/api/shared/abc/summary',
    'alfabeto inválido': `/api/shared/${'!'.repeat(43)}/summary`,
    'cien caracteres': `/api/shared/${'a'.repeat(100)}/summary`,
    'más de cien': `/api/shared/${'a'.repeat(101)}/summary`,
    'varios KB': `/api/shared/${'a'.repeat(5000)}/summary`,
    'URL mal codificada': '/api/shared/%E0%A4%A/summary',
    'byte nulo': '/api/shared/%00/summary',
    'punto punto': '/api/shared/%2e%2e/summary',
    'barra final': `/api/shared/${live}/summary/`,
    'ruta sin definir': `/api/shared/${live}`,
    'ruta con extra': `/api/shared/${live}/summary/extra`,
    'sin token': '/api/shared//summary',
    'raíz del prefijo': '/api/shared/',
    'otra ruta': `/api/shared/${live}/otra`,
    'archivo sin mediaId': `/api/shared/${live}/files`,
  });

  it('[SC-005-050] todo fallo es el mismo 404 ERR-SHARE-NOT-FOUND: cuerpo idéntico, instance /shared, cabeceras de REQ-VET-006; nunca 400 ni el cuerpo de Fastify, ni eco del token o de la ruta', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    const reference = await api.rawGet(`/api/shared/${'x'.repeat(43)}/summary`);
    expect(reference.status).toBe(404);
    expect(reference.json).toMatchObject({ code: 'ERR-SHARE-NOT-FOUND', status: 404, instance: '/shared', type: 'urn:argos:error:ERR-SHARE-NOT-FOUND' });
    for (const [label, path] of Object.entries(HOSTILE_PATHS(link.token))) {
      api.limiter.reset();
      const response = await api.rawGet(path);
      expect(response.status, label).toBe(404);
      expect(response.json, label).toEqual(reference.json);
      expect(response.headers['content-type'], label).toMatch(/^application\/problem\+json/);
      expectSharedHeaders(response, label);
      expect(response.text, label).not.toMatch(/Route (GET|POST)|FST_ERR|Bad Request|statusCode/);
      expect(response.text, label).not.toContain(link.token);
      expect(JSON.stringify(response.headers), label).not.toContain(link.token);
    }
  });

  it('[SC-005-050] cada uno de esos fallos cuenta para la tasa: tras 20 el 21.º es 429 ERR-SHARE-RATE-LIMITED con Retry-After 600 y las mismas cabeceras, sin escribir en la base', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    const paths = Object.values(HOSTILE_PATHS(link.token));
    for (let n = 0; n < 20; n += 1) expect((await api.rawGet(paths[n % paths.length]!)).status).toBe(404);
    const writesBefore = api.db.prepare('SELECT COUNT(*) FROM share_link_audit').pluck().get();
    api.calls.length = 0;
    const limited = await api.rawGet(`/api/shared/${link.token}/summary`);
    expect([limited.status, code(limited)]).toEqual([429, 'ERR-SHARE-RATE-LIMITED']);
    expect(limited.headers['retry-after']).toBe('600');
    expectSharedHeaders(limited, '429');
    expect((limited.json as { instance: string }).instance).toBe('/shared');
    expect(api.calls).toEqual([]);
    expect(api.db.prepare('SELECT COUNT(*) FROM share_link_audit').pluck().get()).toBe(writesBefore);
    for (const path of ['/api/shared/zzz/summary', '/api/shared/%E0%A4%A/summary', `/api/shared/${'a'.repeat(300)}/summary`]) expect((await api.rawGet(path)).status).toBe(429);
  });

  it('[SC-005-021][SC-005-041] el 429 vale también para un token válido de la misma IP (sin exención, PN-11); otra IP sigue sirviendo', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    for (let n = 0; n < 20; n += 1) await api.publicGet(`/api/shared/${n}${'x'.repeat(42)}/summary`);
    expect((await api.publicGet(`/api/shared/${link.token}/summary`)).status).toBe(429);
    const otherIp = await api.app.inject({ method: 'GET', url: `/api/shared/${link.token}/summary`, remoteAddress: '198.51.100.20' });
    expect(otherIp.statusCode).toBe(200);
  });
});

describe('T762 registros sin secretos (REQ-VET-008, INV-005-009, SC-005-022)', () => {
  it('[SC-005-022] el registro de aplicación nunca contiene el token, la URL de la ruta, el hash, la IP ni el nombre del archivo, en éxito, fallo y 429', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'), 1, { includeClinicalFiles: true });
    await api.app.inject({ method: 'GET', url: `/api/shared/${link.token}/summary` });
    await api.app.inject({ method: 'GET', url: `/api/shared/${link.token.slice(0, 40)}XYZ/summary`, remoteAddress: '203.0.113.200' });
    await api.app.inject({ method: 'GET', url: '/api/shared/%E0%A4%A/summary' });
    for (let n = 0; n < 22; n += 1) await api.app.inject({ method: 'GET', url: `/api/shared/${link.token.slice(0, 20)}${n}${'z'.repeat(22)}/summary`, remoteAddress: '203.0.113.201' });
    const logs = api.logLines.join('\n');
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [link.token, link.token.slice(0, 40), hashToken(link.token), '203.0.113.200', '203.0.113.201']) expect(logs).not.toContain(secret);
    expect(logs).not.toMatch(/\/api\/shared\/[A-Za-z0-9_%-]{20,}/);
  });
});

describe('T763 ruta GET /api/shared/{token}/files/{mediaId} (REQ-VET-009, SC-005-023, SC-005-036)', () => {
  const FILE_ID = '88888888-8888-4888-8888-888888888801';

  async function withFile(includeClinicalFiles = true) {
    api = await createShareApi();
    await api.deps.uow.runInTransaction(async (r) => {
      await r.media.insert({ id: FILE_ID, petId: ARGOS.id, kind: 'FILE', mime: 'application/pdf', sizeBytes: 64, originalName: 'Análisis Luna.pdf', createdAt: '2026-11-10T10:00:00.000Z' });
    });
    await api.storage.put(`pets/${ARGOS.id}/files/${FILE_ID}`, PDF(64), 'application/pdf');
    return makeLink(await api.login('andres'), 1, { includeClinicalFiles });
  }

  it('[SC-005-023] responde 302 con Location a una URL firmada de TTL 300 s, cuerpo vacío, sin la clave ni el nombre y con las cabeceras de REQ-VET-006', async () => {
    const link = await withFile();
    const response = await api.publicGet(`/api/shared/${link.token}/files/${FILE_ID}`);
    expect(response.status).toBe(302);
    expect(response.text).toBe('');
    expect(response.headers['location']).toMatch(/^https:\/\/.+X-Goog-Expires=300$/);
    expect(String(response.headers['location'])).not.toMatch(/Análisis|Luna|pets\/[0-9a-f-]{36}\/files\/[0-9a-f-]{36}\/?$/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(api.logLines.join('\n')).not.toMatch(/X-Goog|Análisis|files\/88888888/);
  });

  it('[SC-005-036][INV-005-001] enlace sin la casilla, mediaId ajeno, de otra mascota o mal formado: el mismo 404 uniforme', async () => {
    const link = await withFile(false);
    const reference = await api.publicGet(`/api/shared/${'x'.repeat(43)}/files/${FILE_ID}`);
    for (const path of [`/api/shared/${link.token}/files/${FILE_ID}`, `/api/shared/${link.token}/files/99999999-9999-4999-8999-999999999999`, `/api/shared/${link.token}/files/no-es-uuid`, `/api/shared/${link.token}/files/${'a'.repeat(300)}`]) {
      api.limiter.reset();
      const response = await api.publicGet(path);
      expect(response.status, path).toBe(404);
      expect(response.json, path).toEqual(reference.json);
      expectSharedHeaders(response, path);
    }
  });

  it('[REQ-VET-006] la página HTML /shared/{token} es la SPA sin datos con la CSP de la página y las cabeceras de REQ-VET-006; no resuelve el token', async () => {
    api = await createShareApi();
    const link = await makeLink(await api.login('andres'));
    api.calls.length = 0;
    const page = await api.publicGet(`/shared/${link.token}`);
    expect(api.calls.filter((c) => c === 'shareLinks.findByTokenHash')).toEqual([]);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    if (page.status === 200) expect(page.headers['content-security-policy']).toBe("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  });
});
