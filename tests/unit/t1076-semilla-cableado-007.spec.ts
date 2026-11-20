import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { deriveSceneSeed } from '../../src/domain/scene/scene-seed.ts';
import { GeminiApiSceneImageGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { VertexSceneImageGenerator } from '../../src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1076 (007, Bloque G): cableado de la semilla. La solicitud al generador lleva `seed = deriveSceneSeed(attempt.id)`; el cuerpo de `generationConfig` contiene `seed` numérico
 * (Gemini API y Vertex); un reintento del mismo intento repite la semilla y dos intentos la cambian; la semilla no aparece en `inputs_snapshot`, huella ni prompt
 * (REQ-ESC7-007, REQ-ESC7-008, SC-007-042).
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
afterEach(() => vi.restoreAllMocks());

function setup() {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({});
  const storage = new ControlledStorage(() => new Date(NOW));
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = { ...base, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  return { h, fixture, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps) };
}
const key = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('REQ-ESC7-007: la solicitud al generador lleva deriveSceneSeed(attempt.id)', () => {
  it('SC-007-042: el generador (Fake) recibe seed igual a deriveSceneSeed(attempt.id); dos intentos distintos reciben semillas distintas', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(1));
    const first = t.h.uow.snapshot().sceneAttempts![0]!;
    await t.run.execute({ sceneId: first.sceneId, attemptId: first.id }, new AbortController().signal);
    t.h.clock.setClock('2026-11-05', '2026-11-05T12:10:00.000Z'); // pasa el tiempo de espera entre intentos
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(2));
    const second = t.h.uow.snapshot().sceneAttempts!.find((a) => a.id !== first.id)!;
    await t.run.execute({ sceneId: second.sceneId, attemptId: second.id }, new AbortController().signal);
    const seeds = t.fixture.generator.calls.map((c) => c.seed);
    expect(seeds).toEqual([deriveSceneSeed(first.id), deriveSceneSeed(second.id)]);
    expect(seeds[0]).not.toBe(seeds[1]);
    expect(deriveSceneSeed(first.id)).toBe(deriveSceneSeed(first.id)); // reintento del mismo intento: misma semilla
  });

  it('REQ-ESC7-008: la semilla no entra en inputs_snapshot, huella ni prompt, y no se persiste en ninguna fila de la escena', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'REGENERATE' }, key(1));
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal);
    const seed = deriveSceneSeed(attempt.id);
    const stored = JSON.stringify([t.h.uow.snapshot().sceneAttempts, t.h.uow.snapshot().scenes]);
    expect(stored).not.toMatch(/"seed"/i);
    expect(attempt.inputsSnapshot).not.toContain(String(seed));
    expect(attempt.fingerprint).not.toContain(String(seed));
    expect(t.fixture.generator.calls[0]!.prompt).not.toContain(String(seed));
  });
});

describe('REQ-ESC7-007: los adaptadores reales trasladan seed a generationConfig.seed', () => {
  const okBody = (): string => JSON.stringify({ candidates: [] });
  async function bodyOf(make: (fetchDouble: typeof fetch) => { generate(r: { prompt: string; references: []; seed: number; signal: AbortSignal }): Promise<unknown> }, seed: number): Promise<{ generationConfig: Record<string, unknown> }> {
    const bodies: string[] = [];
    const fetchDouble = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('metadata.google.internal')) return new Response(JSON.stringify({ access_token: 'ya29.x', expires_in: 3599 }));
      bodies.push(String(init?.body));
      return new Response(okBody());
    });
    await make(fetchDouble as unknown as typeof fetch).generate({ prompt: 'p', references: [], seed, signal: new AbortController().signal });
    return JSON.parse(bodies[0]!) as { generationConfig: Record<string, unknown> };
  }

  it('Gemini API: generationConfig.seed es el entero recibido, junto a responseModalities', async () => {
    const body = await bodyOf((f) => new GeminiApiSceneImageGenerator({ apiKey: 'AIzaSyTEST-SENTINEL-0000000000000000000', model: 'gemini-2.5-flash-image', timeoutSeconds: 90, fetch: f }), 123456789); // argos-scan:allow clave sintetica
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], seed: 123456789 });
  });

  it('Vertex AI: generationConfig.seed es el entero recibido y un mismo seed da el mismo cuerpo', async () => {
    const make = (f: typeof fetch) => new VertexSceneImageGenerator({ projectId: 'argos-prod-1234', location: 'us-central1', model: 'gemini-2.5-flash-image', timeoutSeconds: 90, fetch: f });
    const a = await bodyOf(make, 2147483647);
    const b = await bodyOf(make, 2147483647);
    expect(a.generationConfig).toEqual({ responseModalities: ['IMAGE'], seed: 2147483647 });
    expect(b).toEqual(a);
    expect((await bodyOf(make, 0)).generationConfig['seed']).toBe(0);
  });
});
