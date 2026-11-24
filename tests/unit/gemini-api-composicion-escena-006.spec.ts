import { describe, expect, it, vi } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { SCENE_GEMINI_API_NOTICE_VERSION, SCENE_GEMINI_API_PROVIDER_ID, SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../src/domain/scene/notice.ts';
import { CloudTasksSceneDispatcher } from '../../src/infrastructure/adapters/cloud-tasks-scene-dispatcher.adapter.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { GeminiApiSceneImageGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { InProcessSceneDispatcher } from '../../src/infrastructure/adapters/in-process-scene-dispatcher.adapter.ts';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { NOTICE_GEMINI_API_PROVIDER_ID, NOTICE_GEMINI_API_VERSION, NOTICE_PROVIDER_ID, NOTICE_VERSION, consentBody, consentStep, noticeSectionsFor, NOTICE_SECTIONS } from '../../src/presentation/web/scene-notice.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { loadAppConfigActivated, PROD_SCENE } from '../fixtures/scene-config-fixtures.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T894 (006, tramo `gemini-api`): composición y consentimiento. `gemini-api` fija `realDriver: true`, despachador EN PROCESO, `providerId = 'gemini-api'` y una
 * `noticeVersion` propia, de modo que `INV-ESC6-014` exija consentimiento vigente antes de cualquier llamada. Sin consentimiento, o con proveedor o versión antiguos, el
 * generador recibe 0 llamadas; la revocación en vuelo cancela (EDGE-ESC6-025). Clave SINTÉTICA, `fetch` simulado, 0 red. REQ-ESC6-037; INV-ESC6-014, INV-ESC6-020; SC-ESC6-098.
 */
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const ENV = { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' };
const noNetwork = vi.fn(async () => {
  throw new Error('la composición no debe llamar a la red');
}) as unknown as typeof fetch;
const compose = (env: Record<string, string> = ENV) => composeSceneServices(loadAppConfig(env), { run: async () => 'NOOP', fetch: noNetwork });

describe('composición gemini-api (T894, SC-ESC6-098)', () => {
  it('[SC-ESC6-098] compone GeminiApiSceneImageGenerator, realDriver true, despachador en proceso, providerId gemini-api y noticeVersion distinta de la de Vertex', () => {
    const services = compose();
    expect(services.generator).toBeInstanceOf(GeminiApiSceneImageGenerator);
    expect(services.realDriver).toBe(true);
    expect(services.dispatcher).toBeInstanceOf(InProcessSceneDispatcher);
    expect(services.dispatcher).not.toBeInstanceOf(CloudTasksSceneDispatcher);
    expect(services.providerId).toBe('gemini-api');
    expect(services.providerId).toBe(SCENE_GEMINI_API_PROVIDER_ID);
    expect(services.noticeVersion).toBe(SCENE_GEMINI_API_NOTICE_VERSION);
    expect(services.noticeVersion).not.toBe(SCENE_NOTICE_VERSION);
    expect(services.providerId).not.toBe(SCENE_PROVIDER_ID);
    expect(services.noticeVersion.length).toBeLessThanOrEqual(32);
  });

  it('[SC-ESC6-134][REQ-ESC6-025][REQ-ESC6-026][EDGE-ESC6-025] M1: la composición nunca une un generador que no es el simulado con realDriver=false (el filtro de consentimiento de fotos depende de ese flag)', () => {
    const { ARGOS_SCENE_DRIVER: _driver, GEMINI_API_KEY: _key, ARGOS_SCENE_GEMINI_MODEL: _model, ...base } = ENV;
    const fake = compose({ ...base, ARGOS_SCENE_DRIVER: 'fake' });
    const gemini = compose();
    for (const services of [fake, gemini]) {
      expect(services.generator instanceof FakeSceneImageGenerator).toBe(!services.realDriver);
    }
    expect([fake.realDriver, gemini.realDriver]).toEqual([false, true]);
    expect(gemini.generator).toBeInstanceOf(GeminiApiSceneImageGenerator);
  });

  it('[REQ-ESC6-037] el tiempo de T_GEN de la configuración llega al servicio y la composición no hace ninguna llamada de red', () => {
    const services = compose({ ...ENV, ARGOS_SCENE_GEN_TIMEOUT_SECONDS: '45' });
    expect(services.genTimeoutSeconds).toBe(45);
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it('[SC-ESC6-098] el aviso del cliente y el servidor coinciden en versión y proveedor de gemini-api, y difieren de los de Vertex', () => {
    expect([NOTICE_GEMINI_API_VERSION, NOTICE_GEMINI_API_PROVIDER_ID]).toEqual([SCENE_GEMINI_API_NOTICE_VERSION, SCENE_GEMINI_API_PROVIDER_ID]);
    expect([NOTICE_VERSION, NOTICE_PROVIDER_ID]).toEqual([SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID]);
    expect(consentBody('gemini-api')).toEqual({ noticeVersion: SCENE_GEMINI_API_NOTICE_VERSION, providerId: 'gemini-api', scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
    expect(consentBody()).toEqual({ noticeVersion: SCENE_NOTICE_VERSION, providerId: SCENE_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
  });

  it('[REQ-ESC6-026] el aviso de gemini-api nombra a la Gemini Developer API, no a Vertex, y el texto de Vertex no cambia', () => {
    const text = noticeSectionsFor('gemini-api').map((s) => `${s.title} ${s.paragraphs.join(' ')}`).join(' ');
    expect(/Gemini/.test(text) && /Developer API/.test(text)).toBe(true);
    expect(/Vertex/.test(text)).toBe(false);
    expect(noticeSectionsFor('vertex-gemini-image')).toBe(NOTICE_SECTIONS);
    expect(noticeSectionsFor('desconocido')).toBe(NOTICE_SECTIONS);
  });

  it('[EDGE-ESC6-018] consentStep acepta solo pares versión+proveedor conocidos: gemini-api con su versión es ASK/GRANTED y el cruce de pares es OUTDATED', () => {
    const consent = (noticeVersion: string, providerId: string, granted = false) => ({ required: !granted, noticeVersion, providerId, householdPhotoGranted: granted, petPhotosGranted: granted });
    expect(consentStep(consent(SCENE_GEMINI_API_NOTICE_VERSION, 'gemini-api'))).toBe('ASK');
    expect(consentStep(consent(SCENE_GEMINI_API_NOTICE_VERSION, 'gemini-api', true))).toBe('GRANTED');
    expect(consentStep(consent(SCENE_NOTICE_VERSION, 'gemini-api'))).toBe('OUTDATED');
    expect(consentStep(consent(SCENE_GEMINI_API_NOTICE_VERSION, SCENE_PROVIDER_ID))).toBe('OUTDATED');
    expect(consentStep(consent('9', 'gemini-api'))).toBe('OUTDATED');
  });

  it('[SC-ESC6-098] con fake la composición no cambia: realDriver false, proveedor y versión de Vertex, generador simulado', () => {
    const services = compose({ NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: ENV.ARGOS_AUDIT_HMAC_SECRET, GEMINI_API_KEY: KEY });
    expect(services.generator).toBeInstanceOf(FakeSceneImageGenerator);
    expect([services.realDriver, services.providerId, services.noticeVersion]).toEqual([false, SCENE_PROVIDER_ID, SCENE_NOTICE_VERSION]);
  });

  it('[REQ-ESC6-028][SC-ESC6-043] real no usa las variables de gemini-api (T952): sin cuota global no compone y, con ella, compone Vertex sin clave; la constante de activación no cambia', () => {
    const config = loadAppConfigActivated({ NODE_ENV: 'test', ...PROD_SCENE, GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' });
    expect(() => composeSceneServices(config, { run: async () => 'NOOP' })).toThrow('Configuración del driver real incompleta');
    const services = composeSceneServices(config, { run: async () => 'NOOP', fetch: noNetwork, globalQuota: { tryConsume: async () => true, refund: async () => undefined } });
    expect([services.providerId, services.noticeVersion, services.generator instanceof GeminiApiSceneImageGenerator]).toEqual([SCENE_PROVIDER_ID, SCENE_NOTICE_VERSION, false]);
  });
});

describe('consentimiento con el driver gemini-api (INV-ESC6-014, EDGE-ESC6-025)', () => {
  const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
  const NOW = '2026-11-05T12:00:00.000Z';
  const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const grantRecord = (providerId: string, noticeVersion: string, scope: 'PET_PHOTOS' | 'HOUSEHOLD_PHOTO' = 'PET_PHOTOS', id = 'c5000000-0000-4000-8000-000000000001') => ({ id, userId: ANDRES, scope, providerId, noticeVersion, grantedAt: NOW, revokedAt: null });

  function setup() {
    const composed = compose();
    const h = createHarness(canonicalState());
    const fixture = sceneFixture({ realDriver: composed.realDriver, providerId: composed.providerId, noticeVersion: composed.noticeVersion });
    const storage = new ControlledStorage(() => new Date(NOW));
    const base = withScene(h.deps, fixture);
    const deps: ApplicationDeps = { ...base, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
    return { h, fixture, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps) };
  }
  const grant = (t: ReturnType<typeof setup>, ...args: Parameters<typeof grantRecord>) => t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.grant(grantRecord(...args)); });
  const jobOf = (t: ReturnType<typeof setup>) => ({ sceneId: t.h.uow.snapshot().sceneAttempts?.[0]?.sceneId ?? '', attemptId: t.h.uow.snapshot().sceneAttempts?.[0]?.id ?? '' });

  it('[INV-ESC6-014][SC-ESC6-098] sin consentimiento vigente se exige consentimiento y el generador recibe 0 llamadas', async () => {
    const t = setup();
    await expect(t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1))).rejects.toMatchObject({ code: 'ERR-SCENE-CONSENT-REQUIRED' });
    expect(t.fixture.generator.calls).toHaveLength(0);
    expect(await t.get.execute(ANDRES, HOUSE)).toMatchObject({ consent: { required: true, providerId: 'gemini-api', noticeVersion: SCENE_GEMINI_API_NOTICE_VERSION } });
  });

  it('[INV-ESC6-014][SC-ESC6-098] el consentimiento dado al proveedor Vertex o a la versión de Vertex NO sirve para gemini-api: 0 llamadas', async () => {
    for (const [providerId, noticeVersion] of [[SCENE_PROVIDER_ID, SCENE_NOTICE_VERSION], [SCENE_PROVIDER_ID, SCENE_GEMINI_API_NOTICE_VERSION], ['gemini-api', SCENE_NOTICE_VERSION], ['gemini-api', 'antigua']] as const) {
      const t = setup();
      await grant(t, providerId, noticeVersion);
      await expect(t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1))).rejects.toMatchObject({ code: 'ERR-SCENE-CONSENT-REQUIRED' });
      expect(t.fixture.generator.calls).toHaveLength(0);
    }
  });

  it('[INV-ESC6-014] con consentimiento vigente de gemini-api (versión y proveedor propios) la generación corre y el generador recibe 1 llamada', async () => {
    const t = setup();
    await grant(t, 'gemini-api', SCENE_GEMINI_API_NOTICE_VERSION);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    expect(await t.run.execute(jobOf(t), new AbortController().signal)).toBe('PUBLISHED');
    expect(t.fixture.generator.calls).toHaveLength(1);
  });

  it('[EDGE-ESC6-025][SC-ESC6-053] la revocación MIENTRAS el proveedor trabaja cancela: T2 no publica y no queda imagen', async () => {
    const t = setup();
    await grant(t, 'gemini-api', SCENE_GEMINI_API_NOTICE_VERSION);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    const inner = t.fixture.generator;
    const revoking = { generate: async (req: Parameters<FakeSceneImageGenerator['generate']>[0]) => {
      await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.revoke(grantRecord('gemini-api', SCENE_GEMINI_API_NOTICE_VERSION).id, NOW); });
      return inner.generate(req);
    } };
    const run = new RunSceneGenerationUseCase({ ...t.deps, scene: { ...t.deps.scene!, generator: revoking } });
    expect(await run.execute(jobOf(t), new AbortController().signal)).toBe('CANCELLED');
    expect(t.h.uow.snapshot().scenes?.[0]).toMatchObject({ image: null, consumedGenerations: 0 });
  });

  it('[EDGE-ESC6-025][REQ-ESC6-036] el consentimiento retirado antes del claim cancela el intento con 0 llamadas', async () => {
    const t = setup();
    await grant(t, 'gemini-api', SCENE_GEMINI_API_NOTICE_VERSION);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, key(1));
    await t.h.uow.runInTransaction(async (r) => { await r.sceneConsents.revoke(grantRecord('gemini-api', SCENE_GEMINI_API_NOTICE_VERSION).id, NOW); });
    expect(await t.run.execute(jobOf(t), new AbortController().signal)).toBe('CANCELLED');
    expect(t.fixture.generator.calls).toHaveLength(0);
  });
});
