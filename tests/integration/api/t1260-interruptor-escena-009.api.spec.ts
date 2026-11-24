import { afterEach, describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { HOUSEHOLD, canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { parameterKit, type ParameterKit } from '../../fixtures/parameters-fixtures.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { checkResponse006 } from '../contracts/openapi-contract-006.ts';
import { NEW_PET } from './api-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1260 (Feature 009, Fase 5a, #20; PRUEBAS ROJAS hasta T1266): interruptor `scene.enabled`. Con `false`, ningun POST de generacion (hogar ni propietario sin hogar) inicia
 * un intento: 409 `ERR-SCENE-DISABLED` (catalogo 006 1.1.0) sin fila de intento, sin consumo de cuota, sin trabajo encolado y sin llamada al generador; se evalua DESPUES de
 * autorizar y ANTES de consentimiento, cuota y limites de tasa. La imagen vigente sigue visible, `SceneView.disabled = true` (006 `scene.schema.json` 1.2.0, `canUpdate` y
 * `canRegenerate` en false) y la generacion YA en curso termina (D9-16 = A). Fila ausente o ilegible = defecto `true` (INV-CFG9-003). La caja gris «Función deshabilitada» de
 * la interfaz se prueba en `tests/unit/presentation/t1260-caja-deshabilitada-009.spec.ts`.
 * @implements REQ-CFG9-003, INV-CFG9-003, EDGE-009-019, SC-009-021
 */
const H1 = HOUSEHOLD.id;
const NOW = '2026-11-05T12:00:00.000Z';
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

interface Setup {
  readonly a: Api;
  readonly fixture: SceneFixture;
  readonly params: ParameterKit;
  runLastJob(): Promise<string>;
}

async function setup(scene: Parameters<typeof sceneFixture>[0] = {}, ttlMs?: number): Promise<Setup> {
  const fixture = sceneFixture(scene);
  const params = parameterKit(ttlMs);
  const a = await createApi(canonicalState(), { scene: fixture.services, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS }, platformParameters: params.port });
  api = a;
  params.bind(a);
  return {
    a,
    fixture,
    params,
    async runLastJob() {
      const job = fixture.dispatcher.jobs[fixture.dispatcher.jobs.length - 1]!;
      return new RunSceneGenerationUseCase(a.deps).execute(job, new AbortController().signal);
    },
  };
}

const setEnabled = (s: Setup, value: string | null): void => {
  if (value === null) s.a.db.prepare("DELETE FROM platform_parameters WHERE key = 'scene.enabled'").run();
  else s.a.db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ('scene.enabled', ?, 'fixture', '2026-11-01T00:00:00.000Z', NULL) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(value);
};
/** El interruptor se aplica tras la cache de <= 60 s: la prueba avanza el reloj por encima de la ventana. */
const settle = (s: Setup, seconds = 61): void => s.params.advanceSeconds(s.a, seconds);

const call = async (s: Setup, method: string, url: string, options: Parameters<Api['call']>[2] = {}): Promise<ApiResponse> => {
  const response = await s.a.call(method, url, { ...options, contract: false });
  const check = checkResponse006(method, url, response.status, response.headers['content-type'] as string | undefined, response.json ?? (response.text === '' ? undefined : response.text));
  expect(check.errors, `contrato OpenAPI 006 (3.6.0) de ${method} ${url}`).toEqual([]);
  return response;
};
const generate = (s: Setup, cookie: string, n: number, action: 'UPDATE' | 'REGENERATE' = 'REGENERATE', base = `/api/households/${H1}/scene`): Promise<ApiResponse> =>
  call(s, 'POST', `${base}/generate`, { cookie, body: { action }, headers: { 'idempotency-key': KEY(n) } });
const codeOf = (r: ApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;
const counts = (s: Setup) => ({
  attempts: (s.a.db.prepare('SELECT COUNT(*) AS n FROM scene_attempts').get() as { n: number }).n,
  consumed: (s.a.db.prepare('SELECT COALESCE(SUM(consumed_generations), 0) AS n FROM home_scenes').get() as { n: number }).n,
  jobs: s.fixture.dispatcher.jobs.length,
  providerCalls: s.fixture.generator.calls.length,
});
/** Deja una imagen vigente (con el interruptor habilitado) y devuelve la cookie del propietario. */
async function withImage(s: Setup): Promise<string> {
  const cookie = await s.a.login('andres');
  expect((await generate(s, cookie, 1)).status).toBe(202);
  expect(await s.runLastJob()).toBe('PUBLISHED');
  return cookie;
}

describe('T1260 [REQ-CFG9-003] [EDGE-009-019] [SC-009-021] scene.enabled = false: sin intento, sin cuota, sin llamada', () => {
  it.each(['UPDATE', 'REGENERATE'] as const)('POST generate (%s) del hogar responde 409 ERR-SCENE-DISABLED y no crea intento, consumo, trabajo ni llamada al generador', async (action) => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    const before = counts(s);
    const r = await generate(s, cookie, 2, action);
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect((r.json as { type: string }).type).toBe('urn:argos:error:ERR-SCENE-DISABLED');
    expect(counts(s)).toEqual(before);
  });

  it('la escena del propietario sin hogar (POST /api/me/scene/generate) tambien responde 409 ERR-SCENE-DISABLED sin intento ni cuota', async () => {
    const s = await setup();
    const lucia = await s.a.login('lucia.r');
    expect((await s.a.call('POST', '/api/pets', { cookie: lucia, body: NEW_PET })).status).toBe(201);
    setEnabled(s, 'false');
    const before = counts(s);
    const r = await generate(s, lucia, 3, 'REGENERATE', '/api/me/scene');
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect(counts(s)).toEqual(before);
  });

  it('el detalle no revela la causa ni la configuracion (ni la clave scene.enabled, ni parametros, ni cifras de cuota)', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    const r = await generate(s, cookie, 2);
    const detail = (r.json as { detail: string }).detail;
    expect(detail).toBe('La creación de imágenes del hogar está deshabilitada por ahora. Tu imagen actual sigue disponible.');
    expect(r.text).not.toMatch(/scene\.enabled|platform_parameters|administrador/i);
  });

  it('con la escena deshabilitada desde el principio (nunca hubo imagen) tampoco se inicia nada', async () => {
    const s = await setup();
    setEnabled(s, 'false');
    const cookie = await s.a.login('andres');
    const r = await generate(s, cookie, 1);
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect(counts(s)).toEqual({ attempts: 0, consumed: 0, jobs: 0, providerCalls: 0 });
  });
});

describe('T1260 [REQ-CFG9-003] orden de evaluacion: despues de autorizar, antes de consentimiento, cuota y limites de tasa', () => {
  it('un usuario SIN membresia recibe el 404 ERR-HOUSE-NOT-FOUND (autorizacion primero) y no se entera del interruptor', async () => {
    const s = await setup();
    setEnabled(s, 'false');
    const lucia = await s.a.login('lucia.r');
    const r = await generate(s, lucia, 4);
    expect([r.status, codeOf(r)]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
  });

  it('sin sesion es 401 (no 409): el interruptor no se evalua antes de autenticar', async () => {
    const s = await setup();
    setEnabled(s, 'false');
    const r = await s.a.call('POST', `/api/households/${H1}/scene/generate`, { body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(5) }, contract: false });
    expect(r.status).toBe(401);
  });

  it('con la cuota agotada rige ERR-SCENE-DISABLED (409), no el error de cuota', async () => {
    const s = await setup({ quotaMax: 1 });
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    const r = await generate(s, cookie, 2);
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
  });

  it('dentro del enfriamiento de 60 s rige ERR-SCENE-DISABLED (409), no el 429 de limite de tasa', async () => {
    const s = await setup({}, 1000);
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s, 2);
    const r = await generate(s, cookie, 2);
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect(r.headers['retry-after']).toBeUndefined();
  });

  it('con el driver real y sin consentimiento rige ERR-SCENE-DISABLED (409), no el 403 de consentimiento requerido', async () => {
    const s = await setup({ realDriver: true });
    setEnabled(s, 'false');
    const cookie = await s.a.login('andres');
    const r = await generate(s, cookie, 1);
    expect([r.status, codeOf(r)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect(counts(s)).toEqual({ attempts: 0, consumed: 0, jobs: 0, providerCalls: 0 });
  });
});

describe('T1260 [REQ-CFG9-003] [EDGE-009-019] la imagen existente sigue visible y SceneView.disabled lo indica', () => {
  it('GET scene: 200 con disabled = true, imagen vigente (imageTag) y canUpdate/canRegenerate = false; conforme a scene.schema.json 1.2.0', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    const enabledView = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { disabled?: boolean; imageTag: string | null };
    expect(enabledView.disabled === true).toBe(false);
    setEnabled(s, 'false');
    settle(s);
    const r = await call(s, 'GET', `/api/households/${H1}/scene`, { cookie });
    expect(r.status).toBe(200);
    const view = r.json as { disabled?: boolean; status: string; imageTag: string | null; actions: { canUpdate: boolean; canRegenerate: boolean; blockedReason: string | null } };
    expect(view.disabled).toBe(true);
    expect(view.status).toBe('ready');
    expect(view.imageTag).toBe(enabledView.imageTag);
    expect(typeof view.imageTag).toBe('string');
    expect([view.actions.canUpdate, view.actions.canRegenerate]).toEqual([false, false]);
  });

  it('GET scene/image sigue entregando la imagen vigente (302 firmada) con la escena deshabilitada', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    const r = await call(s, 'GET', `/api/households/${H1}/scene/image`, { cookie });
    expect([r.status, String(r.headers['location']).startsWith('https://')]).toEqual([302, true]);
    expect(r.headers['cache-control']).toContain('no-store');
  });

  it('el indicador no cambia la causa de bloqueo: blockedReason sigue siendo la de siempre (independiente de disabled) y la lectura no escribe nada', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    const before = counts(s);
    const view = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { actions: { blockedReason: string | null } };
    expect(view.actions.blockedReason).not.toBe('DISABLED');
    expect(['NO_CHANGES', 'COOLDOWN', null]).toContain(view.actions.blockedReason);
    expect(counts(s)).toEqual(before);
  });
});

describe('T1260 [REQ-CFG9-003] [D9-16 = A] la generacion en curso termina', () => {
  it('una generacion aceptada (202) antes de deshabilitar PUBLICA su imagen aunque el interruptor pase a false antes de correr el trabajo', async () => {
    const s = await setup();
    const cookie = await s.a.login('andres');
    const accepted = await generate(s, cookie, 1);
    expect(accepted.status).toBe(202);
    expect(s.fixture.dispatcher.jobs).toHaveLength(1);
    setEnabled(s, 'false');
    settle(s);
    expect(await s.runLastJob()).toBe('PUBLISHED');
    const view = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { status: string; imageTag: string | null; disabled?: boolean };
    expect([view.status, view.imageTag !== null, view.disabled]).toEqual(['ready', true, true]);
    expect((s.a.db.prepare('SELECT consumed_generations AS n FROM home_scenes').get() as { n: number }).n).toBe(1);
  });

  it('durante la generacion en curso, la lectura con el interruptor en false muestra generating + disabled, y el POST nuevo es 409 ERR-SCENE-DISABLED', async () => {
    const s = await setup();
    const cookie = await s.a.login('andres');
    expect((await generate(s, cookie, 1)).status).toBe(202);
    setEnabled(s, 'false');
    settle(s);
    const view = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { status: string; disabled?: boolean };
    expect([view.status, view.disabled]).toEqual(['generating', true]);
    const again = await generate(s, cookie, 2);
    expect([again.status, codeOf(again)]).toEqual([409, 'ERR-SCENE-DISABLED']);
    expect(await s.runLastJob()).toBe('PUBLISHED');
  });
});

describe('T1260 [INV-CFG9-003] defecto seguro y rehabilitacion', () => {
  it.each([[null], ['true'], ['TRUE'], ['maybe'], ['1'], [' false'], ['']])('fila scene.enabled = %j: rige el defecto o el valor true y la generacion NO se bloquea', async (value) => {
    const s = await setup();
    setEnabled(s, value);
    const cookie = await s.a.login('andres');
    const view = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { disabled?: boolean };
    expect(view.disabled === true).toBe(false);
    const r = await generate(s, cookie, 1);
    expect(r.status).toBe(202);
  });

  it('volver a habilitar (false -> true) permite generar de nuevo tras la cache de <= 60 s, sin reiniciar', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s);
    expect(codeOf(await generate(s, cookie, 2))).toBe('ERR-SCENE-DISABLED');
    setEnabled(s, 'true');
    settle(s);
    const r = await generate(s, cookie, 3);
    expect(r.status).toBe(202);
    expect(s.fixture.dispatcher.jobs).toHaveLength(2);
  });

  it('el interruptor se lee con la cache de <= 60 s: dentro de la ventana todavia rige el valor anterior', async () => {
    const s = await setup();
    const cookie = await withImage(s);
    setEnabled(s, 'false');
    settle(s, 30);
    const view = (await call(s, 'GET', `/api/households/${H1}/scene`, { cookie })).json as { disabled?: boolean };
    expect(view.disabled === true).toBe(false);
  });
});
