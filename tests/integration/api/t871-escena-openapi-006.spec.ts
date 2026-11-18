import { afterEach, describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { FakeSceneImageGenerator } from '../../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { HOUSEHOLD, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { checkResponse006, OPERATIONS_006 } from '../contracts/openapi-contract-006.ts';
import { createApi, type Api, type ApiResponse, type CallOptions } from './api-harness.ts';
import { NEW_PET } from './api-fixtures.ts';

/**
 * T871 (006, Fase 6, pruebas rojas hasta T872): conformidad de la API de la escena con `home-scene.openapi.yaml` (13 operaciones; las 12 de `/api` aquí y
 * `runSceneWorker` en T873). `202` en <= 1 s, `404` sin revelar y antes que `403`, `429` con `Retry-After`, `422` por acción distinta con la misma clave, `302`
 * firmadas con `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y `X-Content-Type-Options: nosniff`, CSRF en toda mutación y sesión en todas.
 * REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-012, REQ-ESC6-034; INV-ESC6-007, INV-ESC6-019; NFR-ESC6-003; SC-ESC6-026, SC-ESC6-030, SC-ESC6-079, SC-ESC6-081, SC-ESC6-093.
 */
const H1 = HOUSEHOLD.id;
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW_ISO = '2026-11-05T12:00:00.000Z';

let api: Api;
afterEach(async () => api?.close());

interface Setup {
  readonly api: Api;
  readonly fixture: SceneFixture;
  readonly storage: ControlledStorage;
  /** Ejecuta el trabajo encolado más reciente como lo haría el worker. */
  runLastJob(): Promise<string>;
  /** Llamada con la comprobación contra el OpenAPI de la 006. */
  call(method: string, url: string, options?: CallOptions): Promise<ApiResponse & { operationId: string | null }>;
}

async function setup(mariaRole: 'ADMIN' | 'CAREGIVER' | 'READER' | null = null, scene: Parameters<typeof sceneFixture>[0] = {}): Promise<Setup> {
  const state = canonicalState();
  if (mariaRole !== null) (state.memberships.find((m) => m.userId === MARIA)! as { role: string }).role = mariaRole;
  const fixture = sceneFixture(scene);
  const storage = new ControlledStorage(() => new Date(NOW_ISO));
  api = await createApi(state, { scene: fixture.services, media: { storage, limits: DEFAULT_LIMITS } });
  return {
    api,
    fixture,
    storage,
    async runLastJob() {
      const job = fixture.dispatcher.jobs[fixture.dispatcher.jobs.length - 1]!;
      return new RunSceneGenerationUseCase(api.deps).execute(job, new AbortController().signal);
    },
    async call(method, url, options = {}) {
      const response = await api.call(method, url, { ...options, contract: false });
      const check = checkResponse006(method, url, response.status, response.headers['content-type'] as string | undefined, response.json ?? (response.text === '' ? undefined : response.text));
      expect(check.errors, `contrato OpenAPI 006 de ${method} ${url}`).toEqual([]);
      return { ...response, operationId: check.operationId };
    },
  };
}

/** Lucía no pertenece a ningún hogar: su mascota (sin asignar) alimenta la escena del propietario sin hogar (D6-09). */
async function luciaWithPet(): Promise<string> {
  const cookie = await api.login('lucia.r');
  const created = await api.call('POST', '/api/pets', { cookie, body: NEW_PET });
  expect(created.status).toBe(201);
  return cookie;
}

async function png(): Promise<Uint8Array> {
  const result = await new FakeSceneImageGenerator().generate({ prompt: 'x', references: [], signal: new AbortController().signal });
  if (!result.ok) throw new Error('sin imagen');
  return result.image.bytes;
}

const generate = (s: Setup, cookie: string, n: number, action: 'UPDATE' | 'REGENERATE' = 'UPDATE', base = `/api/households/${H1}/scene`) =>
  s.call('POST', `${base}/generate`, { cookie, body: { action }, headers: { 'idempotency-key': KEY(n) } });

describe('inventario de operaciones (T871)', () => {
  it('[REQ-ESC6-003] el OpenAPI de la 006 declara 13 operaciones y las 12 de /api tienen su ruta en Fastify', async () => {
    const s = await setup();
    const missing = OPERATIONS_006.filter((op) => op.path.startsWith('/api')).filter((op) => !s.api.app.hasRoute({ method: op.method as 'GET', url: op.path.replace(/\{([^}]+)\}/g, ':$1') }));
    expect([OPERATIONS_006.length, OPERATIONS_006.filter((op) => op.path.startsWith('/api')).length, missing.map((op) => op.operationId)]).toEqual([13, 12, []]);
  });
});

describe('recorrido feliz con conformidad de contrato (T871)', () => {
  it('[REQ-ESC6-003][REQ-ESC6-005][SC-ESC6-026] las 12 operaciones de /api responden lo que declara el OpenAPI, la generación acepta en <= 1 s con 202 y la imagen se entrega por 302 firmada', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const seen = new Set<string>();
    const note = <T extends { operationId: string | null }>(r: T): T => {
      seen.add(r.operationId!);
      return r;
    };
    expect(note(await s.call('GET', '/api/scene-consent/notice', { cookie })).status).toBe(200);
    expect(note(await s.call('POST', '/api/scene-consent', { cookie, body: { noticeVersion: '1', providerId: 'vertex-gemini-image', scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] } })).status).toBe(204);
    const before = note(await s.call('GET', `/api/households/${H1}/scene`, { cookie }));
    expect([before.status, (before.json as { owner: string }).owner]).toEqual([200, 'HOUSEHOLD']);
    expect(note(await s.call('PUT', `/api/households/${H1}/photo`, { cookie, raw: await png(), headers: { 'content-type': 'image/png' } })).status).toBe(200);
    expect(note(await s.call('GET', `/api/households/${H1}/photo`, { cookie })).status).toBe(302);
    const started = Date.now();
    const accepted = note(await generate(s, cookie, 1));
    expect([accepted.status, Date.now() - started <= 1000, (accepted.json as { status: string }).status]).toEqual([202, true, 'generating']);
    expect(s.fixture.dispatcher.jobs).toHaveLength(1);
    expect(await s.runLastJob()).toBe('PUBLISHED');
    const ready = note(await s.call('GET', `/api/households/${H1}/scene`, { cookie }));
    expect((ready.json as { status: string }).status).toBe('ready');
    const image = note(await s.call('GET', `/api/households/${H1}/scene/image`, { cookie }));
    expect([image.status, String(image.headers['location']).startsWith('https://')]).toEqual([302, true]);
    // Escena del propietario sin hogar (D6-09): mismas tres operaciones espejo.
    const lucia = await luciaWithPet();
    expect(note(await s.call('GET', '/api/me/scene', { cookie: lucia })).status).toBe(200);
    expect(note(await generate(s, lucia, 2, 'UPDATE', '/api/me/scene')).status).toBe(202);
    expect(await s.runLastJob()).toBe('PUBLISHED');
    expect(note(await s.call('GET', '/api/me/scene/image', { cookie: lucia })).status).toBe(302);
    expect(note(await s.call('DELETE', `/api/households/${H1}/photo`, { cookie })).status).toBe(204);
    expect(note(await s.call('DELETE', '/api/scene-consent', { cookie })).status).toBe(204);
    const api12 = OPERATIONS_006.filter((op) => op.path.startsWith('/api')).map((op) => op.operationId).sort();
    expect([...seen].sort()).toEqual(api12);
  });

  it('[SC-ESC6-081][NFR-ESC6-003] toda 302 de imagen o foto lleva Cache-Control no-store, Referrer-Policy no-referrer, X-Content-Type-Options nosniff, Location https y cuerpo vacío', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    await s.call('PUT', `/api/households/${H1}/photo`, { cookie, raw: await png() });
    await generate(s, cookie, 1);
    await s.runLastJob();
    const lucia = await luciaWithPet();
    await generate(s, lucia, 2, 'UPDATE', '/api/me/scene');
    await s.runLastJob();
    for (const [url, who] of [[`/api/households/${H1}/photo`, cookie], [`/api/households/${H1}/scene/image`, cookie], ['/api/me/scene/image', lucia]] as const) {
      const r = await s.call('GET', url, { cookie: who });
      expect([url, r.status, r.text, String(r.headers['location']).startsWith('https://'), r.headers['cache-control'], r.headers['referrer-policy'], r.headers['x-content-type-options']]).toEqual([
        url, 302, '', true, 'no-store', 'no-referrer', 'nosniff',
      ]);
    }
  });

  it('[REQ-ESC6-019][SC-ESC6-081] GET de la escena, 202 y los errores de las rutas de escena llevan Cache-Control no-store', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const view = await s.call('GET', `/api/households/${H1}/scene`, { cookie });
    const accepted = await generate(s, cookie, 1);
    const missing = await s.call('GET', `/api/households/${KEY(77)}/scene`, { cookie });
    expect([view.headers['cache-control'], accepted.headers['cache-control'], missing.status, missing.headers['cache-control']]).toEqual(['no-store', 'no-store', 404, 'no-store']);
  });

  it('[INV-ESC6-019][SC-ESC6-081] v es solo una etiqueta de caché: un v ajeno, antiguo o mal formado entrega la misma imagen vigente (302), nunca otra', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    await generate(s, cookie, 1);
    await s.runLastJob();
    const plain = await s.call('GET', `/api/households/${H1}/scene/image`, { cookie });
    const stale = await s.call('GET', `/api/households/${H1}/scene/image?v=${KEY(5)}`, { cookie });
    const malformed = await s.call('GET', `/api/households/${H1}/scene/image?v=no-es-uuid`, { cookie });
    expect([stale.status, stale.headers['location'], malformed.status, malformed.headers['location']]).toEqual([302, plain.headers['location'], 302, plain.headers['location']]);
  });

  it('[REQ-ESC6-019] sin imagen vigente GET image es 404 sin revelar nada más', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const r = await s.call('GET', `/api/households/${H1}/scene/image`, { cookie });
    expect([r.status, (r.json as { code: string }).code]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
  });
});

describe('404 sin revelar y antes que 403 (T871, INV-ESC6-007, INV-ESC6-019)', () => {
  it('[SC-ESC6-093][INV-ESC6-007] quien no es miembro ACTIVE recibe el mismo 404 que un hogar inexistente en las 8 operaciones del hogar, y no se escribe ninguna fila', async () => {
    const s = await setup();
    const lucia = await api.login('lucia.r');
    const carlos = await api.login('carlos_88');
    const dumpBefore = api.dump();
    const png1 = await png();
    const calls: Array<[string, string, CallOptions]> = [
      ['GET', `/scene`, {}],
      ['POST', `/scene/generate`, { body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(1) } }],
      ['GET', `/scene/image`, {}],
      ['PUT', `/photo`, { raw: png1 }],
      ['GET', `/photo`, {}],
      ['DELETE', `/photo`, {}],
    ];
    const observed: unknown[] = [];
    for (const target of [H1, KEY(99)]) {
      for (const cookie of [lucia, carlos]) {
        for (const [method, path, options] of calls) {
          const r = await s.call(method, `/api/households/${target}${path}`, { ...options, cookie });
          observed.push([r.status, (r.json as { code: string }).code]);
        }
      }
    }
    expect(observed.every((o) => JSON.stringify(o) === JSON.stringify([404, 'ERR-HOUSE-NOT-FOUND']))).toBe(true);
    expect(observed).toHaveLength(24);
    // Lecturas y rechazos sin acceso no crean escena ni consumen nada del hogar.
    expect(api.dump()).toBe(dumpBefore);
  });

  it('[INV-ESC6-007] sin acceso el 404 llega antes que el 403 de rol y que el 429: Lucía (sin hogar) no ve 403 ni siquiera al generar', async () => {
    const s = await setup();
    const lucia = await api.login('lucia.r');
    const r = await generate(s, lucia, 1);
    expect([r.status, (r.json as { code: string }).code]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
  });
});

describe('autorización D6-10 (T871, REQ-ESC6-020)', () => {
  it('[REQ-ESC6-020][D6-10] CAREGIVER y READER leen la escena pero reciben 403 ERR-ACC-FORBIDDEN al generar, subir o borrar la foto', async () => {
    for (const role of ['CAREGIVER', 'READER'] as const) {
      const s = await setup(role);
      const maria = await api.login('maria.v');
      const read = await s.call('GET', `/api/households/${H1}/scene`, { cookie: maria });
      const gen = await generate(s, maria, 1);
      const put = await s.call('PUT', `/api/households/${H1}/photo`, { cookie: maria, raw: await png() });
      const del = await s.call('DELETE', `/api/households/${H1}/photo`, { cookie: maria });
      expect([role, read.status, gen.status, put.status, del.status, [gen, put, del].map((r) => (r.json as { code: string }).code)]).toEqual([
        role, 200, 403, 403, 403, ['ERR-ACC-FORBIDDEN', 'ERR-ACC-FORBIDDEN', 'ERR-ACC-FORBIDDEN'],
      ]);
      expect(s.fixture.dispatcher.jobs).toEqual([]);
      await api.close();
    }
  });

  it('[REQ-ESC6-020][D6-10] un ADMIN del hogar puede generar y subir la foto', async () => {
    const s = await setup('ADMIN');
    const maria = await api.login('maria.v');
    const put = await s.call('PUT', `/api/households/${H1}/photo`, { cookie: maria, raw: await png() });
    const gen = await generate(s, maria, 1);
    expect([put.status, gen.status]).toEqual([200, 202]);
  });
});

describe('sesión y CSRF (T871, REQ-ESC6-020)', () => {
  const MUTATIONS: Array<[string, string]> = [
    ['POST', `/api/households/${H1}/scene/generate`],
    ['PUT', `/api/households/${H1}/photo`],
    ['DELETE', `/api/households/${H1}/photo`],
    ['POST', '/api/me/scene/generate'],
    ['POST', '/api/scene-consent'],
    ['DELETE', '/api/scene-consent'],
  ];
  const READS = [`/api/households/${H1}/scene`, `/api/households/${H1}/scene/image`, `/api/households/${H1}/photo`, '/api/me/scene', '/api/me/scene/image', '/api/scene-consent/notice'];

  it('[REQ-ESC6-020] las 6 mutaciones sin X-Argos-Request responden 403 ERR-AUTH-CSRF-REJECTED antes de la sesión y no tocan nada', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const dumpBefore = api.dump();
    for (const [method, url] of MUTATIONS) {
      const r = await api.call(method, url, { cookie, csrf: false, contract: false, body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(1) } });
      expect([method, url, r.status, (r.json as { code: string }).code]).toEqual([method, url, 403, 'ERR-AUTH-CSRF-REJECTED']);
    }
    expect([api.dump(), s.fixture.dispatcher.jobs]).toEqual([dumpBefore, []]);
  });

  it('[REQ-ESC6-020] las 12 operaciones sin sesión responden 401 ERR-AUTH-UNAUTHENTICATED', async () => {
    const s = await setup();
    const all: Array<[string, string]> = [...MUTATIONS, ...READS.map((url): [string, string] => ['GET', url])];
    for (const [method, url] of all) {
      const r = await s.call(method, url, { body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(1) } });
      expect([method, url, r.status, (r.json as { code: string }).code]).toEqual([method, url, 401, 'ERR-AUTH-UNAUTHENTICATED']);
    }
  });
});

describe('Idempotency-Key y 422 (T871, REQ-ESC6-012)', () => {
  it('[REQ-ESC6-012][SC-ESC6-030] la misma clave con otra acción es 422 ERR-SCHEMA-VALIDATION-FAILED; la misma clave y acción repite la respuesta (200) sin segundo intento', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const first = await generate(s, cookie, 1, 'UPDATE');
    const other = await generate(s, cookie, 1, 'REGENERATE');
    const repeat = await generate(s, cookie, 1, 'UPDATE');
    expect([first.status, other.status, (other.json as { code: string }).code, repeat.status, s.fixture.dispatcher.jobs]).toEqual([
      202, 422, 'ERR-SCHEMA-VALIDATION-FAILED', 200, [{ sceneId: (first.json as { sceneId: string }).sceneId, attemptId: s.fixture.dispatcher.jobs[0]!.attemptId }],
    ]);
  });

  it('[REQ-ESC6-012] sin Idempotency-Key, con una clave mal formada o con una acción inválida la respuesta es 422 y no se encola nada', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    const missing = await s.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'UPDATE' } });
    const malformed = await s.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'UPDATE' }, headers: { 'idempotency-key': 'no-es-uuid' } });
    const badAction = await s.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'FORCE' }, headers: { 'idempotency-key': KEY(1) } });
    const noBody = await s.call('POST', `/api/households/${H1}/scene/generate`, { cookie, headers: { 'idempotency-key': KEY(2) } });
    expect([missing.status, malformed.status, badAction.status, noBody.status, s.fixture.dispatcher.jobs]).toEqual([422, 422, 422, 422, []]);
  });
});

describe('429 con Retry-After (T871, REQ-ESC6-034, SC-ESC6-079)', () => {
  it('[REQ-ESC6-034] el enfriamiento de 60 s entre intentos responde 429 ERR-RATE-LIMITED con Retry-After entero >= 1', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    expect((await generate(s, cookie, 1)).status).toBe(202);
    expect(await s.runLastJob()).toBe('PUBLISHED');
    const blocked = await generate(s, cookie, 2, 'REGENERATE');
    const retryAfter = Number(blocked.headers['retry-after']);
    expect([blocked.status, (blocked.json as { code: string }).code, Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60]).toEqual([429, 'ERR-RATE-LIMITED', true]);
  });

  it('[SC-ESC6-079] el límite de tasa por usuario de la generación es de 6 por hora y la séptima petición responde 429 con Retry-After de 3600 s; pasada la hora vuelve a aceptar', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    for (let n = 1; n <= 6; n += 1) expect([n, (await generate(s, cookie, n)).status < 429]).toEqual([n, true]);
    const seventh = await s.call('POST', '/api/me/scene/generate', { cookie, body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(7) } });
    expect([seventh.status, (seventh.json as { code: string }).code, seventh.headers['retry-after']]).toEqual([429, 'ERR-RATE-LIMITED', '3600']);
    api.clock.setClock('2026-11-05', '2026-11-05T13:00:01.000Z');
    const later = await generate(s, cookie, 8);
    expect(later.status).toBeLessThan(429);
  });

  it('[SC-ESC6-079] foto: 10 por hora entre subir y borrar; la undécima responde 429 con Retry-After', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    for (let n = 1; n <= 10; n += 1) expect([n, (await s.call('DELETE', `/api/households/${H1}/photo`, { cookie })).status]).toEqual([n, 204]);
    const eleventh = await s.call('PUT', `/api/households/${H1}/photo`, { cookie, raw: await png() });
    expect([eleventh.status, (eleventh.json as { code: string }).code, eleventh.headers['retry-after']]).toEqual([429, 'ERR-RATE-LIMITED', '3600']);
  });

  it('[SC-ESC6-079] consentimiento: 10 por hora entre consentir y retirar; la undécima responde 429 con Retry-After', async () => {
    const s = await setup();
    const cookie = await api.login('andres');
    for (let n = 1; n <= 10; n += 1) expect([n, (await s.call('DELETE', '/api/scene-consent', { cookie })).status]).toEqual([n, 204]);
    const eleventh = await s.call('POST', '/api/scene-consent', { cookie, body: { noticeVersion: '1', providerId: 'vertex-gemini-image', scopes: ['PET_PHOTOS'] } });
    expect([eleventh.status, (eleventh.json as { code: string }).code, eleventh.headers['retry-after']]).toEqual([429, 'ERR-RATE-LIMITED', '3600']);
  });

  it('[REQ-ESC6-034] el límite es por usuario: agotar el de Andrés no afecta a María (ADMIN)', async () => {
    const s = await setup('ADMIN');
    const andres = await api.login('andres');
    const maria = await api.login('maria.v');
    for (let n = 1; n <= 10; n += 1) await s.call('DELETE', `/api/households/${H1}/photo`, { cookie: andres });
    const blocked = await s.call('DELETE', `/api/households/${H1}/photo`, { cookie: andres });
    const free = await s.call('DELETE', `/api/households/${H1}/photo`, { cookie: maria });
    expect([blocked.status, free.status]).toEqual([429, 204]);
  });

  it('[REQ-ESC6-034] el contrato declara 429 en las seis operaciones que cambian estado o cuestan', () => {
    const six = ['generateHouseholdScene', 'generateOwnerScene', 'putHouseholdPhoto', 'deleteHouseholdPhoto', 'grantSceneConsent', 'revokeSceneConsent'];
    const declared = OPERATIONS_006.filter((op) => six.includes(op.operationId)).map((op) => [op.operationId, op.statuses.includes('429')]);
    expect(declared.sort()).toEqual(six.map((id) => [id, true]).sort());
  });
});
