import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';
import { ListAdminParametersUseCase, UpdateAdminParameterUseCase, parameterEtag } from '../../src/application/use-cases/admin-parameter-use-cases.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, currentNoticeVersion, currentProviderId, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps, SceneProviderRouting } from '../../src/application/use-cases/use-case-support.ts';
import { ADMIN_PARAMETER_CATALOG } from '../../src/domain/platform/admin-parameter-catalog.ts';
import { SCENE_GEMINI_API_NOTICE_VERSION, SCENE_GEMINI_API_PROVIDER_ID, SCENE_PROVIDER_ID } from '../../src/domain/scene/notice.ts';
import { deriveLocation, resolveSceneProviderSelection, type SceneProviderDriver, type SceneProviderSelection } from '../../src/domain/scene/provider-parameters.ts';
import { SCENE_COST_TABLE_MICRO_USD, evaluateSceneSpendRule, sceneAccumulatedSpend, sceneImagesFit, sceneUnitCost } from '../../src/domain/scene/scene-cost.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { createGeminiApiSceneGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { PROVIDER_NOT_CONFIGURED_LOG, createSceneProviderRouter } from '../../src/infrastructure/adapters/scene-provider-router.adapter.ts';
import { SystemClockAdapter } from '../../src/infrastructure/adapters/system-clock.adapter.ts';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { createSceneProviderSelectionReader } from '../../src/infrastructure/config/scene-provider-selection.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import type { MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { PROD_SCENE, loadAppConfigActivated } from '../fixtures/scene-config-fixtures.ts';
import { sceneFixture } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1314 (009, Fase 5d, [GH:#20]; D9-30; Enmienda 009-C 3.11.0; SC-009-057, SC-009-058): `scene.provider_driver` (`vertex` | `gemini-api`) en caliente, enrutador sobre `SceneImageGeneratorPort`,
 * FALLA CERRADO sin credenciales (422 en /admin; intento FAILED sin `provider_call_started_at` ni cuota; jamas cae en silencio al otro proveedor), costes `gemini-api` del Anexo A y secreto
 * `GEMINI_API_KEY` por entorno. @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-004, REQ-ESC6-017, REQ-ESC6-026, EDGE-009-036, INV-CFG9-003, INV-LIM9-001
 */
const FLASH = 'gemini-2.5-flash-image';
const G31 = 'gemini-3.1-flash-image';
const PREVIEW = G31;
/** Modelo retirado (404 en Vertex global): invalido en ambos proveedores. */
const RETIRED = 'gemini-3.1-flash-image-preview';
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const ADMIN = 'ad000000-0000-4000-8000-000000000001';
const WRITTEN = '2026-11-01T00:00:00.000Z';
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const sig = (): AbortSignal => new AbortController().signal;
const req = () => ({ prompt: 'p', references: [], seed: 1, signal: sig() });
const OK = { ok: true, image: { mime: 'image/png', bytes: new Uint8Array([1]) } } as const;
const spyGenerator = () => ({ calls: 0, generate: vi.fn(async () => OK) });
const sel = (driver: SceneProviderDriver | null, configured: boolean, model = FLASH): SceneProviderSelection => ({ driver, configured, model, location: driver === 'vertex' ? deriveLocation('vertex', model) : null });

describe('T1314 [SC-009-058] costes gemini-api del Anexo A (sin region)', () => {
  it('gemini-2.5-flash-image 45_000; gemini-3.1-flash-image 75_000 µUSD (el -preview retirado no tiene coste); deriveLocation de gemini-api es null', () => {
    expect(sceneUnitCost(SCENE_COST_TABLE_MICRO_USD, FLASH, 'gemini-api')).toBe(45_000);
    expect(sceneUnitCost(SCENE_COST_TABLE_MICRO_USD, G31, 'gemini-api')).toBe(75_000);
    expect(sceneUnitCost(SCENE_COST_TABLE_MICRO_USD, PREVIEW, 'gemini-api')).toBe(75_000);
    for (const m of [FLASH, G31, PREVIEW]) expect(deriveLocation('gemini-api', m), m).toBeNull();
    expect(sceneUnitCost(SCENE_COST_TABLE_MICRO_USD, RETIRED, 'gemini-api')).toBeNull();
    expect(deriveLocation('vertex', RETIRED)).toBeNull();
    expect(deriveLocation('vertex', FLASH)).toBe('us-central1');
    expect(deriveLocation('vertex', PREVIEW)).toBe('global');
  });

  it('el gasto del mes valora la llamada gemini-api (modelo con region null) con su celda; modelo null = coste maximo; sceneImagesFit lista solo pares Vertex', () => {
    const at = '2026-11-02T00:00:00.000Z';
    const attempts = [
      { providerModel: FLASH, providerLocation: null, providerCallStartedAt: at },
      { providerModel: G31, providerLocation: null, providerCallStartedAt: at },
      { providerModel: null, providerLocation: null, providerCallStartedAt: at },
      { providerModel: PREVIEW, providerLocation: null, providerCallStartedAt: null },
    ];
    expect(sceneAccumulatedSpend(attempts, SCENE_COST_TABLE_MICRO_USD)).toBe(45_000 + 75_000 + 75_000);
    const fit = sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, []);
    expect(fit.map((f) => `${f.model}|${f.location}`)).toEqual([`${FLASH}|us-central1`, `${PREVIEW}|global`]);
  });

  it('la regla de gasto admite el par gemini-api y rechaza un modelo fuera de la tabla', () => {
    const base = { table: SCENE_COST_TABLE_MICRO_USD, attempts: [], used: 0, max: 5 } as const;
    expect(evaluateSceneSpendRule({ ...base, model: G31, location: 'gemini-api' }).ok).toBe(true);
    expect(evaluateSceneSpendRule({ ...base, model: 'gemini-3-pro-image', location: 'gemini-api' })).toEqual({ ok: false, reason: 'PAIR_NOT_SELECTABLE' });
    expect(evaluateSceneSpendRule({ ...base, model: RETIRED, location: 'global' })).toEqual({ ok: false, reason: 'PAIR_NOT_SELECTABLE' });
  });
});

describe('T1314 [SC-009-057] seleccion efectiva (pura): fila valida > defecto; falla cerrado', () => {
  const both: SceneProviderDriver[] = ['vertex', 'gemini-api'];
  it('sin fila rige el defecto del despliegue; una fila ilegible tambien (INV-CFG9-003)', () => {
    expect(resolveSceneProviderSelection({ rowDriver: null, available: both, defaultDriver: 'vertex', model: FLASH })).toMatchObject({ driver: 'vertex', configured: true, location: 'us-central1' });
    expect(resolveSceneProviderSelection({ rowDriver: 'openai', available: both, defaultDriver: 'gemini-api', model: FLASH })).toMatchObject({ driver: 'gemini-api', configured: true, location: null });
  });
  it('sin ningun proveedor, o con el seleccionado sin credenciales, o sin soporte del modelo: configured=false y NUNCA el otro proveedor', () => {
    expect(resolveSceneProviderSelection({ rowDriver: null, available: [], defaultDriver: null, model: FLASH })).toMatchObject({ driver: null, configured: false });
    expect(resolveSceneProviderSelection({ rowDriver: 'gemini-api', available: ['vertex'], defaultDriver: 'vertex', model: FLASH })).toMatchObject({ driver: 'gemini-api', configured: false });
    expect(resolveSceneProviderSelection({ rowDriver: 'vertex', available: both, defaultDriver: 'vertex', model: G31 })).toMatchObject({ driver: 'vertex', configured: true, location: 'global' });
    expect(resolveSceneProviderSelection({ rowDriver: 'vertex', available: both, defaultDriver: 'vertex', model: RETIRED })).toMatchObject({ driver: 'vertex', configured: false });
    expect(resolveSceneProviderSelection({ rowDriver: 'gemini-api', available: both, defaultDriver: 'vertex', model: G31 })).toMatchObject({ driver: 'gemini-api', configured: true, location: null });
    expect(resolveSceneProviderSelection({ rowDriver: 'gemini-api', available: both, defaultDriver: 'vertex', model: RETIRED })).toMatchObject({ driver: 'gemini-api', configured: false });
  });
});

describe('T1314 [SC-009-057] enrutador: delega solo en el proveedor seleccionado y falla cerrado', () => {
  it('vertex llama solo a Vertex; gemini-api llama solo a gemini-api', async () => {
    const vertex = spyGenerator();
    const gem = spyGenerator();
    let current = sel('vertex', true);
    const router = createSceneProviderRouter({ providers: { vertex, 'gemini-api': gem }, resolve: async () => current });
    expect((await router.generate(req())).ok).toBe(true);
    expect([vertex.generate.mock.calls.length, gem.generate.mock.calls.length]).toEqual([1, 0]);
    current = sel('gemini-api', true);
    expect((await router.generate(req())).ok).toBe(true);
    expect([vertex.generate.mock.calls.length, gem.generate.mock.calls.length]).toEqual([1, 1]);
  });

  it('proveedor seleccionado sin credenciales: 0 llamadas a CUALQUIER proveedor (sin caida silenciosa), codigo estable y registro sin secretos', async () => {
    const vertex = spyGenerator();
    const lines: string[] = [];
    const router = createSceneProviderRouter({ providers: { vertex }, resolve: async () => sel('gemini-api', false), log: (l) => lines.push(l) });
    expect(await router.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(vertex.generate).not.toHaveBeenCalled();
    expect(lines).toEqual([PROVIDER_NOT_CONFIGURED_LOG]);
  });

  it('seleccion configured=true pero sin generador compuesto, o lectura que falla: falla cerrado igual y sin llamadas', async () => {
    const vertex = spyGenerator();
    const a = createSceneProviderRouter({ providers: { vertex }, resolve: async () => sel('gemini-api', true) });
    const b = createSceneProviderRouter({ providers: { vertex }, resolve: async () => { throw new Error('bd caida'); } });
    expect((await a.generate(req())).ok).toBe(false);
    expect((await b.generate(req())).ok).toBe(false);
    expect(vertex.generate).not.toHaveBeenCalled();
  });
});

describe('T1314 [REQ-CFG9-002] lectura EN CALIENTE de scene.provider_driver con cache <= 60 s', () => {
  const repo = (rows: Record<string, string>): PlatformParameterRepositoryPort & { reads: number } => {
    const r = { reads: 0, findValue: async (k: string) => { r.reads += 1; return rows[k] ?? null; } };
    return r as never;
  };
  it('cambiar la fila se aplica a la siguiente lectura tras 60 s (no antes); una sola relectura por ventana', async () => {
    const rows: Record<string, string> = {};
    const r = repo(rows);
    let t = 1_000;
    const read = createSceneProviderSelectionReader({ repository: r, available: ['vertex', 'gemini-api'], defaultDriver: 'vertex', now: () => t });
    expect((await read()).driver).toBe('vertex');
    rows['scene.provider_driver'] = 'gemini-api';
    rows['scene.provider_model'] = G31;
    t += 59_999;
    expect((await read()).driver).toBe('vertex');
    t += 1;
    expect(await read()).toMatchObject({ driver: 'gemini-api', configured: true, model: G31, location: null });
  });

  it('un cacheTtlMs mayor de 60 s se acota a 60 s; fila ilegible = defecto; un fallo de lectura es falla cerrado y NO se cachea', async () => {
    const rows: Record<string, string> = { 'scene.provider_driver': 'nope' };
    let fail = true;
    const r = { findValue: async (k: string) => { if (fail) throw new Error('x'); return rows[k] ?? null; } } as unknown as PlatformParameterRepositoryPort;
    let t = 0;
    const read = createSceneProviderSelectionReader({ repository: r, available: ['vertex'], defaultDriver: 'vertex', now: () => t, cacheTtlMs: 600_000 });
    expect((await read()).configured).toBe(false);
    fail = false;
    expect(await read()).toMatchObject({ driver: 'vertex', configured: true }); // sin cachear el fallo; fila 'nope' = defecto
    rows['scene.provider_driver'] = 'gemini-api';
    t = 60_000;
    expect((await read()).driver).toBe('gemini-api'); // TTL acotado a 60 s
  });

  it('gemini-api: el modelo sale de la fila (lista de gemini-api); fuera de lista cae al respaldo de entorno y luego al defecto', async () => {
    const rows: Record<string, string> = { 'scene.provider_driver': 'gemini-api', 'scene.provider_model': 'gemini-9' };
    const read = createSceneProviderSelectionReader({ repository: repo(rows), available: ['gemini-api'], defaultDriver: 'gemini-api', geminiEnvModel: PREVIEW, now: () => 0 });
    expect((await read()).model).toBe(PREVIEW);
  });
});

describe('T1314 [SC-009-058] adaptador gemini-api con modelo en caliente', () => {
  const okFetch = (urls: string[], keys: string[]) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      keys.push(String((init?.headers as Record<string, string>)['x-goog-api-key']));
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

  it('la URL usa el modelo vigente de la lista cerrada, la clave solo en x-goog-api-key y redirect: error', async () => {
    const urls: string[] = [];
    const keys: string[] = [];
    let model = G31;
    const gen = createGeminiApiSceneGenerator({ apiKey: KEY, getModel: async () => model, timeoutSeconds: 10, fetch: okFetch(urls, keys) });
    await gen.generate(req());
    model = PREVIEW;
    await gen.generate(req());
    expect(urls).toEqual([
      `https://generativelanguage.googleapis.com/v1beta/models/${G31}:generateContent`,
      `https://generativelanguage.googleapis.com/v1beta/models/${PREVIEW}:generateContent`,
    ]);
    expect(keys).toEqual([KEY, KEY]);
    expect(urls.join('')).not.toContain(KEY);
  });

  it('un modelo fuera de la lista cerrada o una lectura que falla es ERR-SCENE-GENERATION-FAILED sin llamada de red', async () => {
    const urls: string[] = [];
    for (const getModel of [async () => 'gemini-3-pro-image', async () => '../x', async (): Promise<string> => { throw new Error('x'); }]) {
      const gen = createGeminiApiSceneGenerator({ apiKey: KEY, getModel, timeoutSeconds: 10, fetch: okFetch(urls, []) });
      expect(await gen.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    }
    expect(urls).toEqual([]);
  });
});

describe('T1314 [SC-009-057] /admin: catalogo, vista y 422', () => {
  const setup = (rows: Record<string, string> = {}, routing: Pick<SceneProviderRouting, 'available' | 'defaultDriver'> | null = { available: ['vertex'], defaultDriver: 'vertex' }) => {
    const state: MemoryState = canonicalState();
    state.platformParameters = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { value: v, description: 'fixture', updatedAt: WRITTEN }]));
    const h = createHarness(state);
    const scene = routing === null ? {} : { scene: { ...sceneFixture().services, providerRouting: { ...routing, resolve: async () => sel(routing.defaultDriver, true) } } };
    const deps: ApplicationDeps = { ...h.deps, ...scene, clock: new SystemClockAdapter('America/Bogota', () => new Date('2026-11-23T12:00:00.000Z')) };
    const rowOf = (key: string) => h.uow.runInTransaction((r) => r.adminParameters.find(key));
    const put = async (key: string, value: string) => new UpdateAdminParameterUseCase(deps).execute({ adminId: ADMIN, key, ifMatch: parameterEtag(key, await rowOf(key)), body: { value } });
    return { put, rowOf, list: () => new ListAdminParametersUseCase(deps).execute(), audits: () => h.uow.snapshot().adminAudit ?? [] };
  };
  const codeOf = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'OK';
    } catch (e) {
      return (e as { code?: string }).code ?? 'UNKNOWN';
    }
  };

  it('el catalogo tiene scene.provider_driver (lista cerrada vertex|gemini-api, escribible, defecto vertex) tras scene.provider_model', () => {
    const spec = ADMIN_PARAMETER_CATALOG['scene.provider_driver'];
    expect([spec.valueType, spec.writable, spec.defaultValue, spec.constraints.allowed]).toEqual(['STRING', true, 'vertex', ['vertex', 'gemini-api']]);
    expect(spec.isCanonical('vertex') && spec.isCanonical('gemini-api')).toBe(true);
    for (const bad of ['', 'Vertex', 'openai', 'vertex ', 'gemini']) expect(spec.isCanonical(bad), bad).toBe(false);
  });

  it('la vista lista solo los proveedores CON credenciales como allowed y el defecto del despliegue; sin escena no hay ninguno y el defecto de codigo es vertex', async () => {
    const a = (await setup({}, { available: ['vertex', 'gemini-api'], defaultDriver: 'vertex' }).list()).items.find((i) => i.key === 'scene.provider_driver');
    expect(a).toMatchObject({ value: 'vertex', default: 'vertex', source: 'DEFAULT', writable: true, constraints: { allowed: ['vertex', 'gemini-api'] } });
    const b = (await setup({}, { available: ['gemini-api'], defaultDriver: 'gemini-api' }).list()).items.find((i) => i.key === 'scene.provider_driver');
    expect(b).toMatchObject({ value: 'gemini-api', default: 'gemini-api', constraints: { allowed: ['gemini-api'] } });
    const c = (await setup({}, null).list()).items.find((i) => i.key === 'scene.provider_driver');
    expect(c).toMatchObject({ value: 'vertex', constraints: { allowed: ['vertex'] } });
  });

  it('guardar un proveedor SIN credenciales es 422 sin escribir ni auditar (y no filtra secretos)', async () => {
    const t = setup({}, { available: ['vertex'], defaultDriver: 'vertex' });
    expect(await codeOf(t.put('scene.provider_driver', 'gemini-api'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf('scene.provider_driver')).toBeNull();
    expect(t.audits()).toEqual([]);
    const none = setup({}, null);
    expect(await codeOf(none.put('scene.provider_driver', 'vertex'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await codeOf(none.put('scene.provider_driver', 'openai'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('con credenciales de ambos se guarda UNA clave con UNA auditoria sin valor; ambos proveedores admiten los mismos 2 modelos', async () => {
    const t = setup({}, { available: ['vertex', 'gemini-api'], defaultDriver: 'vertex' });
    expect(await codeOf(t.put('scene.provider_model', RETIRED))).toBe('ERR-SCHEMA-VALIDATION-FAILED'); // retirado: ningun proveedor lo admite
    expect((await t.put('scene.provider_driver', 'gemini-api')).value).toBe('gemini-api');
    expect(t.audits().map((a) => a.objectRef)).toEqual(['scene.provider_driver']);
    expect(JSON.stringify(t.audits())).not.toContain('gemini-api');
    for (const m of [G31, FLASH]) expect((await t.put('scene.provider_model', m)).value).toBe(m);
  });

  it('cambiar de proveedor con el modelo vigente es valido en ambos sentidos', async () => {
    const t = setup({ 'scene.provider_driver': 'gemini-api', 'scene.provider_model': G31 }, { available: ['vertex', 'gemini-api'], defaultDriver: 'vertex' });
    expect((await t.put('scene.provider_driver', 'vertex')).value).toBe('vertex');
  });

  it('un 5b de coste con gemini-api sigue la regla de gasto (tope de 5 USD/mes): modelo de 75_000 con 100 imagenes se rechaza', async () => {
    const t = setup({ 'scene.provider_driver': 'gemini-api', 'scene.provider_model': G31 }, { available: ['gemini-api'], defaultDriver: 'gemini-api' });
    expect(await codeOf(t.put('scene.global_quota_max', '100'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
    expect(await codeOf(t.put('scene.global_quota_max', '66'))).toBe('OK');
  });
});

describe('T1314 [SC-009-057][INV-LIM9-001] intento FAILED sin provider_call_started_at, sin cuota, sin llamada', () => {
  const run = async (resolve: () => Promise<SceneProviderSelection>) => {
    const h = createHarness(canonicalState());
    const quota = { used: 0, tryConsume: vi.fn(async () => true), refund: vi.fn(async () => undefined), isExhausted: async () => false };
    const fixture = sceneFixture({ globalQuota: quota, providerRouting: { available: ['vertex'], defaultDriver: 'vertex', resolve } });
    const deps = { ...h.deps, scene: fixture.services, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } } as unknown as ApplicationDeps;
    await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000001');
    const attempt = h.uow.snapshot().sceneAttempts?.[0];
    const result = await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, sig());
    return { result, quota, fixture, attempt: h.uow.snapshot().sceneAttempts?.[0] };
  };

  it('proveedor sin credenciales: FAILED, sin marca de llamada, 0 cuota global, 0 llamadas al generador', async () => {
    const r = await run(async () => sel('gemini-api', false));
    expect(r.result).toBe('FAILED');
    expect(r.attempt).toMatchObject({ outcome: 'FAILED', providerCallStartedAt: null });
    expect(r.quota.tryConsume).not.toHaveBeenCalled();
    expect(r.fixture.generator.calls).toHaveLength(0);
  });

  it('la lectura de la seleccion que falla tambien cierra FAILED sin llamada ni cuota', async () => {
    const r = await run(async () => { throw new Error('bd'); });
    expect([r.result, r.attempt?.providerCallStartedAt, r.quota.tryConsume.mock.calls.length, r.fixture.generator.calls.length]).toEqual(['FAILED', null, 0, 0]);
  });

  it('control: con el proveedor configurado el intento SI llama y marca', async () => {
    const r = await run(async () => sel('vertex', true));
    expect(r.attempt?.providerCallStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.fixture.generator.calls).toHaveLength(1);
    expect(r.quota.tryConsume).toHaveBeenCalledTimes(1);
  });
});

describe('T1314 [REQ-ESC6-026] el aviso y el proveedor del consentimiento siguen al proveedor efectivo (solo estructura, sin cambiar el texto legal)', () => {
  const svcWith = (selection: SceneProviderSelection) => ({ ...sceneFixture().services, providerRouting: { available: ['vertex', 'gemini-api'] as SceneProviderDriver[], defaultDriver: 'vertex' as const, resolve: async () => selection } });
  it('gemini-api => providerId gemini-api y noticeVersion propia; vertex => la de Vertex; vertex+global => variante 3-global; lectura que falla => Vertex', async () => {
    const g = svcWith(sel('gemini-api', true));
    expect([await currentProviderId(g), await currentNoticeVersion(g)]).toEqual([SCENE_GEMINI_API_PROVIDER_ID, SCENE_GEMINI_API_NOTICE_VERSION]);
    const v = svcWith(sel('vertex', true));
    expect([await currentProviderId(v), await currentNoticeVersion(v)]).toEqual([SCENE_PROVIDER_ID, v.noticeVersion]);
    expect(await currentNoticeVersion(svcWith(sel('vertex', true, PREVIEW)))).toBe('3-global');
    const broken = { ...v, providerRouting: { ...v.providerRouting, resolve: async (): Promise<SceneProviderSelection> => { throw new Error('x'); } } };
    expect([await currentProviderId(broken), await currentNoticeVersion(broken)]).toEqual([SCENE_PROVIDER_ID, v.noticeVersion]);
  });
});

describe('T1314 [D9-30] composicion: proveedores con credenciales, defecto y lectura en caliente', () => {
  const REAL = { NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media', ...PROD_SCENE };
  let png = '';
  beforeAll(async () => {
    const fake = await new FakeSceneImageGenerator().generate(req());
    if (!fake.ok) throw new Error('sin imagen simulada');
    png = Buffer.from(fake.image.bytes).toString('base64');
  });
  const quota = { tryConsume: async () => true, refund: async () => undefined, isExhausted: async () => false };
  const repo = (rows: Record<string, string>): PlatformParameterRepositoryPort => ({ findValue: async (k: string) => rows[k] ?? null }) as never;
  const harnessFetch = (urls: string[]) =>
    (async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).startsWith('http://metadata.google.internal/')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3000 }));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] }));
    }) as typeof fetch;

  it('real sin clave: solo vertex disponible y defecto vertex; real con GEMINI_API_KEY: ambos; gemini-api local: solo gemini-api (defecto gemini-api)', () => {
    const noKey = composeSceneServices(loadAppConfigActivated(REAL), { run: async () => 'NOOP', globalQuota: quota });
    expect([noKey.providerRouting?.available, noKey.providerRouting?.defaultDriver]).toEqual([['vertex'], 'vertex']);
    const both = composeSceneServices(loadAppConfigActivated({ ...REAL, GEMINI_API_KEY: KEY }), { run: async () => 'NOOP', globalQuota: quota });
    expect([both.providerRouting?.available, both.providerRouting?.defaultDriver]).toEqual([['vertex', 'gemini-api'], 'vertex']);
    const local = composeSceneServices(loadAppConfig({ NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: FLASH }), { run: async () => 'NOOP' });
    expect([local.providerRouting?.available, local.providerRouting?.defaultDriver]).toEqual([['gemini-api'], 'gemini-api']);
    expect(composeSceneServices(loadAppConfig({ NODE_ENV: 'test' }), { run: async () => 'NOOP' }).providerRouting).toBeUndefined();
  });

  it('cambiar la fila scene.provider_driver cambia el proveedor llamado SIN reiniciar (tras la cache de 60 s); la clave solo viaja al host de gemini-api', async () => {
    const urls: string[] = [];
    const rows: Record<string, string> = { 'scene.provider_model': PREVIEW };
    let t = 0;
    const services = composeSceneServices(loadAppConfigActivated({ ...REAL, GEMINI_API_KEY: KEY }), {
      run: async () => 'NOOP',
      fetch: harnessFetch(urls),
      getAccessToken: async () => 'tok',
      globalQuota: quota,
      selectionSource: { repository: repo(rows), now: () => t },
    });
    expect((await services.generator.generate(req())).ok).toBe(true);
    expect(urls[0]).toContain('aiplatform.googleapis.com');
    rows['scene.provider_driver'] = 'gemini-api';
    t = 60_000;
    expect((await services.generator.generate(req())).ok).toBe(true);
    expect(urls[1]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${PREVIEW}:generateContent`);
    expect(await (services.providerCall as () => Promise<unknown>)()).toEqual({ model: PREVIEW, location: null });
  });

  it('FALLA CERRADO: la fila apunta a gemini-api sin GEMINI_API_KEY => 0 llamadas de red, FAILED, sin recurrir a Vertex', async () => {
    const urls: string[] = [];
    const services = composeSceneServices(loadAppConfigActivated(REAL), {
      run: async () => 'NOOP',
      fetch: harnessFetch(urls),
      getAccessToken: async () => 'tok',
      globalQuota: quota,
      selectionSource: { repository: repo({ 'scene.provider_driver': 'gemini-api' }), now: () => 0 },
    });
    expect(await services.generator.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(urls).toEqual([]);
    expect((await services.providerRouting!.resolve()).configured).toBe(false);
  });

  it('GEMINI_API_KEY invalida con real rechaza el arranque nombrando solo la variable; el modelo del proveedor Vertex no cambia (2.5 us-central1, preview global)', () => {
    let names: readonly string[] = [];
    try {
      loadAppConfigActivated({ ...REAL, GEMINI_API_KEY: 'corta' });
    } catch (e) {
      names = (e as { variables: readonly string[] }).variables;
      expect(String((e as Error).message)).not.toContain('corta');
    }
    expect(names).toEqual(['GEMINI_API_KEY']);
    expect([deriveLocation('vertex', FLASH), deriveLocation('vertex', PREVIEW)]).toEqual(['us-central1', 'global']);
  });
});

describe('T1314 el generador simulado (fake) sigue sin enrutador', () => {
  it('fake no compone providerRouting ni exige credenciales', () => {
    const services = composeSceneServices(loadAppConfig({ NODE_ENV: 'test' }), { run: async () => 'NOOP' });
    expect([services.generator instanceof FakeSceneImageGenerator, services.providerRouting, services.realDriver]).toEqual([true, undefined, false]);
  });
});
