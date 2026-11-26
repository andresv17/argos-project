import { describe, expect, it, vi } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { loadAppConfigActivated } from '../fixtures/scene-config-fixtures.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1298 / OBS-O2-1 (009, 5b): proveniencia del intento. Sin `providerCall` en SceneServices (driver simulado o gemini-api) el intento registra `null` en
 * provider_model y provider_location, nunca los defectos de codigo; con driver real la composicion fija el par. REQ-CFG9-007.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const noNetwork = vi.fn(async () => {
  throw new Error('la composicion no debe llamar a la red');
}) as unknown as typeof fetch;

describe('proveniencia del intento sin providerCall (T1298, OBS-O2-1)', () => {
  it('[REQ-CFG9-007] caso de uso: sin providerCall el intento queda con providerModel y providerLocation null', async () => {
    const h = createHarness(canonicalState());
    const fixture = sceneFixture({});
    const base = withScene(h.deps, fixture);
    expect(base.scene?.providerCall).toBeUndefined();
    const deps: ApplicationDeps = { ...base, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
    await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000001');
    const attempt = h.uow.snapshot().sceneAttempts?.[0];
    await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, new AbortController().signal);
    const marked = h.uow.snapshot().sceneAttempts?.[0];
    expect(marked?.providerCallStartedAt).toBe(NOW);
    expect(marked?.providerModel).toBeNull();
    expect(marked?.providerLocation).toBeNull();
  });

  it('[REQ-CFG9-007] composicion: fake no fija providerCall; gemini-api fija modelo sin region (T1314); real fija modelo y region', () => {
    const env = { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32) };
    const fake = composeSceneServices(loadAppConfig({ ...env, ARGOS_SCENE_DRIVER: 'fake' }), { run: async () => 'NOOP', fetch: noNetwork });
    const gemini = composeSceneServices(loadAppConfig({ ...env, ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' }), { run: async () => 'NOOP', fetch: noNetwork });
    const real = composeSceneServices(
      loadAppConfigActivated({
        NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media',
        ARGOS_SCENE_DRIVER: 'real', ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image', ARGOS_SCENE_LOCATION: 'us-central1', ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
        ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com', ARGOS_SCENE_WORKER_URL: 'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
      }),
      { run: async () => 'NOOP', fetch: noNetwork, globalQuota: { tryConsume: async () => true, refund: async () => undefined, isExhausted: async () => false } },
    );
    expect(fake.providerCall).toBeUndefined();
    expect(gemini.providerCall).toEqual({ model: 'gemini-2.5-flash-image', location: null }); // T1314: gemini-api registra el modelo; sin region (D9-29)
    expect(real.providerCall).toEqual({ model: 'gemini-2.5-flash-image', location: 'us-central1' });
  });
});
