import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';
import type { SceneGenerationRequest } from '../../src/application/ports/scene-image-generator.port.ts';
import { SCENE_ALLOWED_LOCATIONS, isAllowedSceneLocation } from '../../src/domain/scene/provider-parameters.ts';
import * as providerParameters from '../../src/domain/scene/provider-parameters.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { VertexSceneImageGenerator } from '../../src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';
import * as sceneParams from '../../src/infrastructure/config/scene-provider-parameters.ts';

/**
 * T1259 (Feature 009, Fase 5b, #20): PRUEBAS ROJAS de relectura en caliente, anti-SSRF y `global` latente. Sin implementar produccion.
 * REQ-CFG9-002, REQ-CFG9-004, INV-CFG9-001, INV-CFG9-003, EDGE-009-017, EDGE-009-018, EDGE-009-021, EDGE-009-036, EDGE-009-046; SC-009-022, SC-009-023, SC-009-027.
 *
 * Contrato que estas pruebas FIJAN para T1265/T1271 (nombres = propuesta de /keymaker):
 *  - `provider-parameters.ts` exporta `SCENE_GLOBAL_LOCATION_ENABLED` = `false` (constante de CODIGO: no es clave de `platform_parameters` ni del catalogo de /admin).
 *    Con `false`, `global` NO esta en `SCENE_ALLOWED_LOCATIONS` y `isAllowedSceneLocation('global')` es `false` (Enmienda 009-B, condicion (g); EDGE-009-046).
 *  - `scene-provider-parameters.ts` exporta `createSceneProviderParametersReader({ repository, env, now, cacheTtlMs? })` -> `() => Promise<SceneProviderParameters>`:
 *    relee la fila por llamada con cache <= 60 s; una fila ilegible/fuera de lista/`global` NO lanza en caliente: rige el defecto/entorno (INV-CFG9-003), sin el valor.
 *  - `VertexSceneImageGenerator` acepta `getParameters?: () => Promise<{ model, location }>`: la URL se compone EN CADA llamada con la region/modelo validados;
 *    un valor invalido hace fallar la llamada (ERR-SCENE-GENERATION-FAILED) SIN invocar `fetch`.
 *  - El host literal `aiplatform.googleapis.com` de `global` solo puede aparecer en el adaptador detras de `SCENE_GLOBAL_LOCATION_ENABLED`.
 */
const COST_MODULE = '../../src/domain/scene/scene-cost.ts';
const PROJECT = 'argos-prod-1234';
const FIVE_BAD = ['us-central1/../x', 'us-central1?x=1', 'us-central1#f', 'us central1', 'us-central1.evil.example', 'evil.example', '', '..', 'GLOBAL', 'Global', ' global', 'global/'];
const BAD_MODELS = ['gemini-2.5-flash-image/../x', 'gemini-x?y=1', 'gemini-x#f', 'gemini x', '../gemini-x', 'gpt-4o', ''];

const repoOf = (rows: Record<string, string | null>): { repository: PlatformParameterRepositoryPort; rows: Record<string, string | null>; reads: () => number } => {
  let reads = 0;
  const repository: PlatformParameterRepositoryPort = { findValue: async (key) => { reads += 1; return rows[key] ?? null; } };
  return { repository, rows, reads: () => reads };
};
const ENV = { globalQuotaMax: null, model: null, location: null } as const;

describe('T1259 [INV-CFG9-001][EDGE-009-018][EDGE-009-046] global latente y lista cerrada', () => {
  it('SCENE_GLOBAL_LOCATION_ENABLED existe, es exactamente true (D9-27) y es constante de codigo (no clave editable de /admin)', async () => {
    expect('SCENE_GLOBAL_LOCATION_ENABLED' in providerParameters, 'T1265 debe exportar la constante').toBe(true);
    expect((providerParameters as Record<string, unknown>)['SCENE_GLOBAL_LOCATION_ENABLED']).toBe(true);
    const { ADMIN_PARAMETER_KEYS } = await import('../../src/domain/platform/admin-parameter-catalog.ts');
    expect(ADMIN_PARAMETER_KEYS.some((k) => /global_location|GLOBAL_LOCATION/i.test(k))).toBe(false);
  });

  it('[INV-CFG9-001] con la constante en true (D9-27), global se admite solo EXACTO (la lista cerrada no cambia) y se rechaza en cualquier otra caja o forma', () => {
    expect(SCENE_ALLOWED_LOCATIONS).not.toContain('global');
    expect(isAllowedSceneLocation('global')).toBe(true);
    for (const v of ['GLOBAL', 'Global', ' global', 'global ', 'global/']) expect(isAllowedSceneLocation(v), JSON.stringify(v)).toBe(false);
  });

  it.each(FIVE_BAD)('anti-SSRF: la region %j queda fuera de la lista cerrada', (v) => {
    expect(isAllowedSceneLocation(v)).toBe(false);
  });
});

describe('T1259 [REQ-CFG9-002][SC-009-023] relectura en caliente con cache <= 60 s', () => {
  const load = (): typeof sceneParams & { createSceneProviderParametersReader: (o: unknown) => () => Promise<{ globalQuotaMax: number; model: string; location: string }> } =>
    sceneParams as never;

  it('exporta createSceneProviderParametersReader (reemplaza la carga unica de server.ts)', () => {
    expect(typeof load().createSceneProviderParametersReader).toBe('function');
  });

  it('un cambio de modelo y region en la fila rige en la siguiente lectura tras expirar la cache (60 s) y no antes', async () => {
    let now = 1_000_000;
    const b = repoOf({ 'scene.provider_model': 'gemini-2.5-flash-image', 'scene.provider_location': 'us-central1' });
    const read = load().createSceneProviderParametersReader({ repository: b.repository, env: ENV, now: () => now });
    expect(await read()).toMatchObject({ model: 'gemini-2.5-flash-image', location: 'us-central1' });
    b.rows['scene.provider_model'] = 'gemini-3.1-flash-image-preview';
    b.rows['scene.provider_location'] = 'global';
    now += 59_000;
    expect(await read()).toMatchObject({ model: 'gemini-2.5-flash-image', location: 'us-central1' });
    now += 1_001; // 60_001 ms desde la primera lectura
    expect(await read()).toMatchObject({ model: 'gemini-3.1-flash-image-preview', location: 'global' });
  });

  it('la cache no es mayor que 60 s aunque se pida mas (cacheTtlMs 10 min se acota a 60_000)', async () => {
    let now = 5_000;
    const b = repoOf({ 'scene.provider_model': 'gemini-2.5-flash-image' });
    const read = load().createSceneProviderParametersReader({ repository: b.repository, env: ENV, now: () => now, cacheTtlMs: 600_000 });
    await read();
    b.rows['scene.provider_model'] = 'gemini-3.1-flash-image-preview';
    b.rows['scene.provider_location'] = 'global';
    now += 60_001;
    expect((await read()).model).toBe('gemini-3.1-flash-image-preview');
  });

  it.each([
    ['scene.provider_location', 'global'],
    ['scene.provider_location', 'us-central1/../x'],
    ['scene.provider_location', 'evil.example'],
    ['scene.provider_model', 'gemini-x/../y'],
    ['scene.provider_model', 'gpt-4o'],
  ])('fila invalida en caliente (%s = %j): NO lanza; rige el defecto de codigo y el valor no se filtra (INV-CFG9-003)', async (key, bad) => {
    let now = 0;
    const b = repoOf({});
    const read = load().createSceneProviderParametersReader({ repository: b.repository, env: ENV, now: () => now });
    await read();
    b.rows[key as string] = bad as string;
    now += 61_000;
    const params = await read();
    expect(params.location).toBe('us-central1');
    expect(params.model).toBe('gemini-2.5-flash-image');
    // Se comprueban los VALORES (la clave `globalQuotaMax` contiene "global" por contrato y no es un valor filtrado).
    for (const v of Object.values(params)) expect(String(v)).not.toContain(bad as string);
  });
});

describe('T1259 [INV-CFG9-001][SC-009-022] adaptador Vertex: URL compuesta por llamada y anti-SSRF', () => {
  const png = async (): Promise<string> => {
    const r = await new FakeSceneImageGenerator({ mode: 'ok' }).generate({ prompt: 's', references: [], seed: 0, signal: new AbortController().signal });
    if (!r.ok) throw new Error('sin imagen simulada');
    return Buffer.from(r.image.bytes).toString('base64');
  };
  const req = (): SceneGenerationRequest => ({ prompt: 'p', references: [], seed: 0, signal: new AbortController().signal });
  const build = async (getParameters: () => Promise<{ model: string; location: string }>) => {
    const data = await png();
    const urls: string[] = [];
    const fetchDouble = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] }, finishReason: 'STOP' }] }), { status: 200 });
    });
    const options = { projectId: PROJECT, timeoutSeconds: 90, fetch: fetchDouble as unknown as typeof fetch, getAccessToken: async () => 'tok-prueba', getParameters };
    const generator = new VertexSceneImageGenerator(options as unknown as ConstructorParameters<typeof VertexSceneImageGenerator>[0]);
    return { generator, urls, fetchDouble };
  };

  it('compone host, ruta y modelo POR LLAMADA desde la region/modelo vigentes (sin reiniciar)', async () => {
    let current = { model: 'gemini-2.5-flash-image', location: 'us-central1' };
    const t = await build(async () => current);
    expect((await t.generator.generate(req())).ok).toBe(true);
    current = { model: 'gemini-3.1-flash-image-preview', location: 'global' };
    expect((await t.generator.generate(req())).ok).toBe(true);
    expect(t.urls).toEqual([
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent`,
      `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/gemini-3.1-flash-image-preview:generateContent`,
    ]);
  });

  it.each([...FIVE_BAD, 'global'])('region %j devuelta en caliente: la llamada falla cerrada, SIN fetch y sin eco del valor', async (location) => {
    const t = await build(async () => ({ model: 'gemini-2.5-flash-image', location }));
    const r = await t.generator.generate(req());
    expect(r).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(location === '' ? '\u0000' : location);
  });

  it.each(BAD_MODELS)('modelo %j devuelto en caliente: la llamada falla cerrada y sin fetch', async (model) => {
    const t = await build(async () => ({ model, location: 'us-central1' }));
    expect(await t.generator.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
  });

  it('si la lectura de parametros falla, la llamada falla cerrada sin fetch (no se cae a un host por defecto)', async () => {
    const t = await build(async () => { throw new Error('lectura rota'); });
    expect(await t.generator.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
  });

  it('el host literal de global solo aparece en el adaptador detras de SCENE_GLOBAL_LOCATION_ENABLED (D9-27: alcanzable solo con el par preview + global)', () => {
    const src = readFileSync(join(process.cwd(), 'src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts'), 'utf8');
    const guarded = src.includes('SCENE_GLOBAL_LOCATION_ENABLED');
    const literal = /(^|[^-])aiplatform\.googleapis\.com/.test(src.replaceAll('-aiplatform.googleapis.com', ''));
    expect(guarded, 'el adaptador debe leer SCENE_GLOBAL_LOCATION_ENABLED (T1265)').toBe(true);
    if (literal) expect(src.indexOf('SCENE_GLOBAL_LOCATION_ENABLED')).toBeLessThan(src.search(/(^|[^-])aiplatform\.googleapis\.com/m) + 4000);
  });
});

describe('T1259 [REQ-CFG9-004][EDGE-009-036] la regla de coste aplica tambien al guardar modelo y region', () => {
  it('un cambio de region o modelo cuyo coste hace exceder 5_000_000 se rechaza con la misma regla (contrato en scene-cost.ts, T1296)', async () => {
    const m = (await import(/* @vite-ignore */ COST_MODULE)) as { evaluateSceneSpendRule: (i: unknown) => { ok: boolean } };
    const table = { 'm-caro': { 'us-central1': 240_000 }, 'm-barato': { 'us-central1': 40_000, 'us-east4': 60_000 } };
    const attempts = Array.from({ length: 20 }, () => ({ providerModel: 'm-caro', providerLocation: 'us-central1', providerCallStartedAt: '2026-11-10T12:00:00.000Z' }));
    expect(m.evaluateSceneSpendRule({ table, attempts, used: 20, model: 'm-barato', location: 'us-east4', max: 125 }).ok).toBe(false);
  });
});
