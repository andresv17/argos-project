import { describe, expect, it, vi } from 'vitest';
import { UpdateAdminParameterUseCase, parameterEtag } from '../../src/application/use-cases/admin-parameter-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { ADMIN_PARAMETER_CATALOG } from '../../src/domain/platform/admin-parameter-catalog.ts';
import { SCENE_GLOBAL_LOCATION_ENABLED, isAllowedSceneLocation, resolveSceneProviderParameters, SceneParameterError } from '../../src/domain/scene/provider-parameters.ts';
import { SCENE_COST_TABLE_MICRO_USD, evaluateSceneSpendRule, isSelectableScenePair, sceneUnitCost } from '../../src/domain/scene/scene-cost.ts';
import { VertexSceneImageGenerator } from '../../src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';
import { SystemClockAdapter } from '../../src/infrastructure/adapters/system-clock.adapter.ts';
import { createSceneProviderParametersReader } from '../../src/infrastructure/config/scene-provider-parameters.ts';
import type { MemoryState } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { SELECTABLE_LOCATIONS, SELECTABLE_MODELS } from '../../src/presentation/admin/parameters-view.ts';
import { canonicalState, createHarness } from '../fixtures/application-harness.ts';

/**
 * T1308 (009, Fase 5c, [GH:#20]; D9-27; SC-009-052, SC-009-053): el par `gemini-3.1-flash-image-preview` + `global` (75_000 µUSD) junto a `gemini-2.5-flash-image` + `us-central1`
 * (45_000 µUSD); el par preview + `us-central1` y el nombre sin sufijo son inválidos en /admin, al leer BD y en el adaptador (INV-CFG9-001); endpoint literal de `global` (anti-SSRF, SC-009-022);
 * regla de gasto acumulado con 75_000 µUSD y tope de 5 USD/mes (EDGE-009-036). El texto del aviso con variante global lo firma Neo (D9-27 (5)).
 * @implements REQ-CFG9-004, EDGE-009-036, EDGE-009-046, INV-CFG9-001
 */
const PREVIEW = 'gemini-3.1-flash-image-preview';
const FLASH = 'gemini-2.5-flash-image';
const ADMIN = 'ad000000-0000-4000-8000-000000000001';
const WRITTEN = '2026-11-01T00:00:00.000Z';
const PROJECT = 'argos-prueba';

describe('T1308 [SC-009-052] tabla de pares válidos y región global', () => {
  it('la tabla tiene exactamente los dos pares: 45_000 y 75_000 µUSD; el par preview + us-central1 y el nombre sin sufijo son inválidos', () => {
    expect(SCENE_COST_TABLE_MICRO_USD).toEqual({ [FLASH]: { 'us-central1': 45_000 }, [PREVIEW]: { global: 75_000 } });
    expect(sceneUnitCost(SCENE_COST_TABLE_MICRO_USD, PREVIEW, 'global')).toBe(75_000);
    expect(isSelectableScenePair(FLASH, 'us-central1')).toBe(true);
    expect(isSelectableScenePair(PREVIEW, 'global')).toBe(true);
    for (const [m, l] of [[PREVIEW, 'us-central1'], [FLASH, 'global'], ['gemini-3.1-flash-image', 'us-central1'], ['gemini-3.1-flash-image', 'global']] as const) expect(isSelectableScenePair(m, l), `${m} ${l}`).toBe(false);
  });

  it('SCENE_GLOBAL_LOCATION_ENABLED es true y `global` es una región admitida (solo exacta, sin variantes)', () => {
    expect(SCENE_GLOBAL_LOCATION_ENABLED).toBe(true);
    expect(isAllowedSceneLocation('global')).toBe(true);
    for (const v of ['GLOBAL', 'Global', ' global', 'global/', 'global?x=1']) expect(isAllowedSceneLocation(v), v).toBe(false);
  });

  it('la lista cerrada de modelos del catálogo admite el sufijo preview y deja de admitir el nombre sin sufijo; /admin ofrece solo los pares válidos', () => {
    const allowed = ADMIN_PARAMETER_CATALOG['scene.provider_model'].constraints.allowed ?? [];
    expect(allowed).toContain(PREVIEW);
    expect(allowed).not.toContain('gemini-3.1-flash-image');
    expect(ADMIN_PARAMETER_CATALOG['scene.provider_model'].isCanonical('gemini-3.1-flash-image')).toBe(false);
    expect(ADMIN_PARAMETER_CATALOG['scene.provider_location'].constraints.allowed).toContain('global');
    expect([...SELECTABLE_MODELS]).toEqual([FLASH, PREVIEW]);
    expect([...SELECTABLE_LOCATIONS]).toEqual(['us-central1', 'global']);
  });
});

describe('T1308 [SC-009-052][INV-CFG9-001] leer BD: un par inválido se rechaza', () => {
  const env = { globalQuotaMax: null, model: null, location: null } as const;
  const readerEnv = { globalQuotaMax: 5, model: null, location: null } as never;
  it('resolveSceneProviderParameters: preview + us-central1 lanza SceneParameterError sin eco del valor; preview + global y 2.5 + us-central1 pasan', () => {
    const none = { globalQuotaMax: null, model: null, location: null };
    expect(resolveSceneProviderParameters({ db: { ...none, model: PREVIEW, location: 'global' }, env })).toMatchObject({ model: PREVIEW, location: 'global' });
    expect(resolveSceneProviderParameters({ db: { ...none, model: FLASH, location: 'us-central1' }, env })).toMatchObject({ model: FLASH, location: 'us-central1' });
    let caught: unknown;
    try {
      resolveSceneProviderParameters({ db: { ...none, model: PREVIEW, location: 'us-central1' }, env });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SceneParameterError);
    expect(JSON.stringify((caught as Error).message)).not.toContain(PREVIEW);
  });

  it('lector en caliente: un par inválido en la BD cae al par por defecto (nunca se devuelve ni se registra)', async () => {
    const rows: Record<string, string> = { 'scene.provider_model': PREVIEW, 'scene.provider_location': 'us-central1' };
    const read = createSceneProviderParametersReader({ repository: { findValue: async (k: string) => rows[k] ?? null } as never, env: readerEnv, now: () => 0, cacheTtlMs: 0 });
    expect(await read()).toMatchObject({ model: FLASH, location: 'us-central1' });
    rows['scene.provider_location'] = 'global';
    expect(await read()).toMatchObject({ model: PREVIEW, location: 'global' });
  });
});

describe('T1308 [SC-009-052][SC-009-022] adaptador: endpoint literal de global y fallo cerrado de pares inválidos', () => {
  const build = (params: { model: string; location: string }) => {
    const urls: string[] = [];
    const fetchDouble = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    });
    const generator = new VertexSceneImageGenerator({ projectId: PROJECT, timeoutSeconds: 90, fetch: fetchDouble as unknown as typeof fetch, getAccessToken: async () => 'tok', getParameters: async () => params } as never);
    return { generator, urls, fetchDouble };
  };
  const req = (): never => ({ prompt: 'p', references: [], seed: 0, signal: new AbortController().signal }) as never;

  it('preview + global llama a https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/gemini-3.1-flash-image-preview:generateContent', async () => {
    const t = build({ model: PREVIEW, location: 'global' });
    await t.generator.generate(req());
    expect(t.urls).toEqual([`https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${PREVIEW}:generateContent`]);
  });

  it.each([[PREVIEW, 'us-central1'], [FLASH, 'global'], ['gemini-3.1-flash-image', 'us-central1']])('par inválido %s + %s: falla cerrada SIN fetch', async (model, location) => {
    const t = build({ model, location });
    expect(await t.generator.generate(req())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
  });
});

describe('T1308 [SC-009-053][EDGE-009-036] regla de gasto con 75_000 µUSD', () => {
  it('con global: gasto 4_950_000 cabe; un guardado que supere 5 USD/mes se rechaza (66 de 75_000 caben, 67 no)', () => {
    const base = { table: SCENE_COST_TABLE_MICRO_USD, attempts: [], used: 0, model: PREVIEW, location: 'global' };
    expect(evaluateSceneSpendRule({ ...base, max: 66 }).ok).toBe(true);
    expect(evaluateSceneSpendRule({ ...base, max: 67 })).toMatchObject({ ok: false, reason: 'SPEND_EXCEEDED' });
    expect(evaluateSceneSpendRule({ ...base, model: PREVIEW, location: 'us-central1', max: 1 })).toEqual({ ok: false, reason: 'PAIR_NOT_SELECTABLE' });
  });
});

describe('T1308 [SC-009-052] guardado en /admin: pares válidos, pareja atómica y rechazo de pares inválidos', () => {
  const setup = (rows: Record<string, string> = {}) => {
    const state: MemoryState = canonicalState();
    state.platformParameters = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { value: v, description: 'fixture', updatedAt: WRITTEN }]));
    const h = createHarness(state);
    const deps: ApplicationDeps = { ...h.deps, clock: new SystemClockAdapter('America/Bogota', () => new Date('2026-11-23T12:00:00.000Z')) };
    const rowOf = (key: string) => h.uow.runInTransaction((r) => r.adminParameters.find(key));
    const put = async (key: string, value: string) => new UpdateAdminParameterUseCase(deps).execute({ adminId: ADMIN, key, ifMatch: parameterEtag(key, await rowOf(key)), body: { value } });
    return { put, rowOf, audits: () => h.uow.snapshot().adminAudit ?? [] };
  };
  const codeOf = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'OK';
    } catch (e) {
      return (e as { code?: string }).code ?? 'UNKNOWN';
    }
  };

  it('elegir el modelo preview guarda su pareja global en la misma transacción (dos auditorías, sin valores)', async () => {
    const t = setup();
    expect((await t.put('scene.provider_model', PREVIEW)).value).toBe(PREVIEW);
    expect((await t.rowOf('scene.provider_location'))?.value).toBe('global');
    expect(t.audits().map((a) => a.objectRef).sort()).toEqual(['scene.provider_location', 'scene.provider_model']);
    expect(JSON.stringify(t.audits())).not.toContain('global"');
  });

  it('elegir la región us-central1 desde preview + global devuelve a gemini-2.5-flash-image + us-central1', async () => {
    const t = setup({ 'scene.provider_model': PREVIEW, 'scene.provider_location': 'global' });
    expect((await t.put('scene.provider_location', 'us-central1')).value).toBe('us-central1');
    expect((await t.rowOf('scene.provider_model'))?.value).toBe(FLASH);
  });

  it('el nombre sin sufijo y un modelo sin pareja se rechazan (422) sin escribir', async () => {
    const t = setup();
    expect(await codeOf(t.put('scene.provider_model', 'gemini-3.1-flash-image'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await codeOf(t.put('scene.provider_model', 'gemini-3-pro-image'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf('scene.provider_model')).toBeNull();
    expect(await t.rowOf('scene.provider_location')).toBeNull();
  });

  it('una región fuera de la tabla (us-east4) se rechaza sin pareja única', async () => {
    const t = setup();
    expect(await codeOf(t.put('scene.provider_location', 'us-east4'))).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect(await t.rowOf('scene.provider_location')).toBeNull();
  });

  it('con global y 4_500_000 gastados, un tope que supere 5 USD/mes se rechaza (EDGE-009-036)', async () => {
    const t = setup({ 'scene.provider_model': PREVIEW, 'scene.provider_location': 'global', 'scene.global_quota_used.2026-11': '0' });
    expect((await t.put('scene.global_quota_max', '66')).value).toBe('66');
    expect(await codeOf(t.put('scene.global_quota_max', '67'))).toBe('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
  });
});
