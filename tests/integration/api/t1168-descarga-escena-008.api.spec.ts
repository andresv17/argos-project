import { afterEach, describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { HOUSEHOLD, canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { checkResponse006 } from '../contracts/openapi-contract-006.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';

/**
 * T1168 (008, mitad servidor; `[GH:#54]`): `download=1` en `getHouseholdSceneImage` y `getOwnerSceneImage` (contrato 006 3.5.0). La URL firmada lleva
 * `response-content-disposition: attachment` con `argos-hogar-AAAA-MM-DD.png`; con un driver sin URL firmada la ruta responde `200` con `Content-Disposition: attachment`
 * y el cuerpo; cualquier `download` distinto de `1` es `422`; sin `download` nada cambia (302 inline). `download` no elige imagen (INV-ESC6-019).
 * REQ-UX8-002, REQ-ESC6-019, INV-ESC6-007, INV-ESC6-019, NFR-ESC6-003; SC-008-035, SC-008-036, SC-008-037.
 */
const H1 = HOUSEHOLD.id;
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW_ISO = '2026-11-05T12:00:00.000Z';
const FILE_NAME = /^attachment; filename="argos-hogar-2026-11-05\.png"$/;

let api: Api;
afterEach(async () => api?.close());

interface Setup {
  readonly storage: ControlledStorage;
  readonly fixture: SceneFixture;
  runLastJob(): Promise<string>;
  call(method: string, url: string, cookie?: string): Promise<ApiResponse>;
}

async function setup(): Promise<Setup> {
  const fixture = sceneFixture({});
  const storage = new ControlledStorage(() => new Date(NOW_ISO));
  api = await createApi(canonicalState(), { scene: fixture.services, media: { storage, limits: DEFAULT_LIMITS } });
  return {
    storage,
    fixture,
    async runLastJob() {
      const job = fixture.dispatcher.jobs[fixture.dispatcher.jobs.length - 1]!;
      return new RunSceneGenerationUseCase(api.deps).execute(job, new AbortController().signal);
    },
    async call(method, url, cookie) {
      const response = await api.call(method, url, { ...(cookie === undefined ? {} : { cookie }), contract: false });
      const check = checkResponse006(method, url, response.status, response.headers['content-type'] as string | undefined, response.json ?? (response.text === '' ? undefined : response.text));
      expect(check.errors, `contrato OpenAPI 006 de ${method} ${url}`).toEqual([]);
      return response;
    },
  };
}

async function withImages(s: Setup): Promise<{ andres: string; lucia: string }> {
  const andres = await api.login('andres');
  const lucia = await api.login('lucia.r');
  expect((await api.call('POST', '/api/pets', { cookie: lucia, body: NEW_PET })).status).toBe(201);
  const headers = { 'idempotency-key': KEY(1) };
  expect((await api.call('POST', `/api/households/${H1}/scene/generate`, { cookie: andres, body: { action: 'UPDATE' }, headers, contract: false })).status).toBe(202);
  expect(await s.runLastJob()).toBe('PUBLISHED');
  expect((await api.call('POST', '/api/me/scene/generate', { cookie: lucia, body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(2) }, contract: false })).status).toBe(202);
  expect(await s.runLastJob()).toBe('PUBLISHED');
  return { andres, lucia };
}

const ROUTES = (who: { andres: string; lucia: string }): ReadonlyArray<readonly [string, string]> => [
  [`/api/households/${H1}/scene/image`, who.andres],
  ['/api/me/scene/image', who.lucia],
];

describe('download=1 con URL firmada (T1168)', () => {
  it('[REQ-UX8-002][SC-008-036][SC-008-037] la 302 fija response-content-disposition attachment con argos-hogar-AAAA-MM-DD.png (fecha en APP_TIMEZONE) en las dos rutas, con las cabeceras de seguridad', async () => {
    const s = await setup();
    const who = await withImages(s);
    for (const [url, cookie] of ROUTES(who)) {
      const r = await s.call('GET', `${url}?download=1`, cookie);
      const location = new URL(String(r.headers['location']));
      expect([url, r.status, r.text, location.protocol, location.searchParams.get('response-content-disposition')?.replace(/^(attachment; filename="argos-hogar-)\d{4}-\d{2}-\d{2}/, '$1AAAA-MM-DD')]).toEqual([
        url, 302, '', 'https:', 'attachment; filename="argos-hogar-AAAA-MM-DD.png"',
      ]);
      expect([r.headers['cache-control'], r.headers['referrer-policy'], r.headers['x-content-type-options']]).toEqual(['no-store', 'no-referrer', 'nosniff']);
    }
  });

  it('[REQ-UX8-002][SC-008-036] el nombre usa la fecha de generación de la imagen en America/Bogota y no lleva PII (ni mascota ni hogar)', async () => {
    const s = await setup();
    const who = await withImages(s);
    const r = await s.call('GET', `/api/households/${H1}/scene/image?download=1`, who.andres);
    const disposition = new URL(String(r.headers['location'])).searchParams.get('response-content-disposition') ?? '';
    expect(disposition).toMatch(FILE_NAME);
    expect(disposition).not.toMatch(/Luna|Maria|Andres/);
    expect(s.storage.readUrlRequests.at(-1)).toMatchObject({ disposition: 'attachment', filename: 'argos-hogar-2026-11-05.png', contentType: 'image/png', ttlSeconds: 300 });
  });

  it('[REQ-UX8-002][SC-008-035] sin download la 302 es la de siempre: inline, sin response-content-disposition attachment y nombre escena.png', async () => {
    const s = await setup();
    const who = await withImages(s);
    for (const [url, cookie] of ROUTES(who)) {
      const r = await s.call('GET', url, cookie);
      expect([url, r.status, String(r.headers['location']).includes('response-content-disposition')]).toEqual([url, 302, false]);
      expect(s.storage.readUrlRequests.at(-1)).toMatchObject({ filename: 'escena.png' });
      expect(s.storage.readUrlRequests.at(-1)?.disposition).toBeUndefined();
    }
  });

  it('[INV-ESC6-019][REQ-UX8-002] download no elige imagen: v ajeno o antiguo con download=1 entrega la misma clave vigente', async () => {
    const s = await setup();
    const who = await withImages(s);
    const plain = await s.call('GET', `/api/households/${H1}/scene/image?download=1`, who.andres);
    const stale = await s.call('GET', `/api/households/${H1}/scene/image?download=1&v=${KEY(5)}`, who.andres);
    expect([stale.status, stale.headers['location']]).toEqual([302, plain.headers['location']]);
  });
});

describe('download distinto de 1 (T1168)', () => {
  it.each(['0', '2', 'true', '', '%201', '01', '1&download=1'])('[REQ-UX8-002][SC-008-037] download=%j es 422 ERR-SCHEMA-VALIDATION-FAILED y no genera ninguna URL', async (value) => {
    const s = await setup();
    const who = await withImages(s);
    const before = s.storage.readUrlRequests.length;
    for (const [url, cookie] of ROUTES(who)) {
      const r = await s.call('GET', `${url}?download=${value}`, cookie);
      expect([url, r.status, (r.json as { code: string }).code]).toEqual([url, 422, 'ERR-SCHEMA-VALIDATION-FAILED']);
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(s.storage.readUrlRequests.length).toBe(before);
  });

  it('[REQ-UX8-002] download repetido (download=1&download=1) es 422', async () => {
    const s = await setup();
    const who = await withImages(s);
    const r = await s.call('GET', `/api/households/${H1}/scene/image?download=1&download=1`, who.andres);
    expect([r.status, (r.json as { code: string }).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });
});

describe('download=1 con un driver sin URL firmada (T1168)', () => {
  it('[REQ-UX8-002][SC-008-037] responde 200 con el cuerpo de la imagen, Content-Disposition attachment con el nombre fijo y las cabeceras de seguridad; sin redirección', async () => {
    const s = await setup();
    const who = await withImages(s);
    s.storage.unsigned = true;
    for (const [url, cookie] of ROUTES(who)) {
      const stored = await s.storage.inner.get(url.startsWith('/api/me') ? (await s.storage.inner.list('scenes/')).at(-1)!.key : (await s.storage.inner.list('scenes/'))[0]!.key);
      const r = await api.app.inject({ method: 'GET', url: `${url}?download=1`, headers: { cookie } });
      expect([url, r.statusCode, r.headers['location']]).toEqual([url, 200, undefined]);
      expect([r.headers['content-type'], r.headers['content-disposition'], r.headers['cache-control'], r.headers['referrer-policy'], r.headers['x-content-type-options']]).toEqual([
        'image/png', 'attachment; filename="argos-hogar-2026-11-05.png"', 'no-store', 'no-referrer', 'nosniff',
      ]);
      expect(r.rawPayload.byteLength).toBeGreaterThan(0);
      expect(stored?.contentType).toBe('image/png');
      expect(Array.from(r.rawPayload.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
  });

  it('[REQ-UX8-002][SC-008-035] sin download, incluso con un driver sin firma, se mantiene la 302 (no se usa 200 sin download)', async () => {
    const s = await setup();
    const who = await withImages(s);
    s.storage.unsigned = true;
    const r = await s.call('GET', `/api/households/${H1}/scene/image`, who.andres);
    expect([r.status, String(r.headers['location']).startsWith('/__dev/media/scenes/')]).toEqual([302, true]);
  });
});

describe('download=1 sin imagen o sin acceso (T1168)', () => {
  it('[INV-ESC6-007][REQ-UX8-002] sin sesión es 401; sin imagen vigente y sin acceso dan el mismo 404 con download=1 que sin él, y no se firma nada', async () => {
    const s = await setup();
    const andres = await api.login('andres');
    const lucia = await api.login('lucia.r');
    const anon = await api.call('GET', `/api/households/${H1}/scene/image?download=1`, { contract: false });
    const noImage = await s.call('GET', `/api/households/${H1}/scene/image?download=1`, andres);
    const noAccess = await s.call('GET', `/api/households/${H1}/scene/image?download=1`, lucia);
    const plain = await s.call('GET', `/api/households/${H1}/scene/image`, andres);
    expect([anon.status, noImage.status, noAccess.status, noImage.json, noAccess.json]).toEqual([401, 404, 404, plain.json, plain.json]);
    expect(s.storage.readUrlRequests).toEqual([]);
  });
});
