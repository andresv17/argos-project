import { describe, expect, it, vi } from 'vitest';
import type { PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { createSceneProviderParametersReader } from '../../src/infrastructure/config/scene-provider-parameters.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { loadAppConfigActivated } from '../fixtures/scene-config-fixtures.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1296 (h) (009, 5b): proveniencia DINAMICA. El par registrado por intento es el par EFECTIVO de la llamada (la misma lectura en caliente que usa el adaptador),
 * no el de arranque. NFR-009-003, EDGE-009-036, REQ-CFG9-007.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const noNetwork = vi.fn(async () => { throw new Error('sin red'); }) as unknown as typeof fetch;

const runWith = async (providerCall: unknown) => {
  const h = createHarness(canonicalState());
  const base = withScene(h.deps, sceneFixture({}));
  const deps = {
    ...base,
    scene: { ...base.scene!, providerCall },
    media: { storage: new ControlledStorage(() => new Date(NOW)), limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  } as unknown as ApplicationDeps;
  await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000001');
  const attempt = h.uow.snapshot().sceneAttempts?.[0];
  await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, new AbortController().signal);
  return h.uow.snapshot().sceneAttempts?.[0];
};

describe('T1296 (h) providerCall dinamico', () => {
  it('caso de uso: providerCall como funcion async; el intento registra el par que devuelve en ese momento', async () => {
    const marked = await runWith(async () => ({ model: 'gemini-3.1-flash-image', location: 'us-east4' }));
    expect(marked?.providerModel).toBe('gemini-3.1-flash-image');
    expect(marked?.providerLocation).toBe('us-east4');
  });

  it('caso de uso: si la lectura del par falla, el intento registra null/null (se valora con el coste maximo), sin propagar el error', async () => {
    const marked = await runWith(async () => { throw new Error('lectura rota'); });
    expect(marked?.providerCallStartedAt).toBe(NOW);
    expect(marked?.providerModel).toBeNull();
    expect(marked?.providerLocation).toBeNull();
  });

  it('caso de uso: el par estatico (compatibilidad) sigue funcionando', async () => {
    const marked = await runWith({ model: 'gemini-2.5-flash-image', location: 'us-central1' });
    expect(marked?.providerModel).toBe('gemini-2.5-flash-image');
  });

  it('composicion real: cambiar scene.provider_model y scene.provider_location en la BD SIN reiniciar cambia el par registrado tras la cache (<= 60 s), con la MISMA lectura que el adaptador', async () => {
    let now = 1_000_000;
    const rows: Record<string, string | null> = { 'scene.provider_model': 'gemini-2.5-flash-image', 'scene.provider_location': 'us-central1' };
    const repository: PlatformParameterRepositoryPort = { findValue: async (k) => rows[k] ?? null };
    const config = loadAppConfigActivated({
      NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media',
      ARGOS_SCENE_DRIVER: 'real', ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image', ARGOS_SCENE_LOCATION: 'us-central1', ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
      ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com', ARGOS_SCENE_WORKER_URL: 'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
    });
    const read = createSceneProviderParametersReader({ repository, env: config.scene, now: () => now });
    const services = composeSceneServices(config, { run: async () => 'NOOP', fetch: noNetwork, readProviderParameters: read, globalQuota: { tryConsume: async () => true, refund: async () => undefined } });
    const call = services.providerCall as unknown as () => Promise<{ model: string; location: string }>;
    expect(typeof call).toBe('function');
    expect(await call()).toEqual({ model: 'gemini-2.5-flash-image', location: 'us-central1' });
    rows['scene.provider_model'] = 'gemini-3.1-flash-image';
    rows['scene.provider_location'] = 'us-east4';
    now += 59_000;
    expect(await call()).toEqual({ model: 'gemini-2.5-flash-image', location: 'us-central1' }); // dentro de la cache
    now += 1_001;
    expect(await call()).toEqual({ model: 'gemini-3.1-flash-image', location: 'us-east4' });
  });
});
