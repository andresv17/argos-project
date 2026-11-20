import { describe, expect, it } from 'vitest';
import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../src/application/ports/scene-image-generator.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { GetSceneUseCase, RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import { UpdatePetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { buildInputsSnapshot, parseInputsSnapshot, serializeInputsSnapshot } from '../../src/domain/scene/inputs-snapshot.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, ARGOS, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * 007 (REQ-FAL7-006, EDGE-007-014, SC-007-015, SC-007-032): la escena del hogar no dibuja ni cuenta a una mascota DECEASED, marcar el fallecimiento es un cambio
 * de huella y una generación en vuelo se cancela (CANCELLED, sin cuota) si una mascota de la huella pasa a DECEASED.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const KEY = 'b0000000-0000-4000-8000-000000000001';

class HookedGenerator implements SceneImageGeneratorPort {
  during: (() => Promise<void>) | null = null;
  constructor(readonly inner: FakeSceneImageGenerator) {}
  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    if (this.during !== null) await this.during();
    return this.inner.generate(request);
  }
}

function setup() {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({});
  const storage = new ControlledStorage(() => new Date(NOW));
  const hooked = new HookedGenerator(fixture.generator);
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = {
    ...base,
    scene: { ...base.scene!, generator: hooked },
    media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  };
  return { h, hooked, deps, request: new RequestSceneGenerationUseCase(deps), run: new RunSceneGenerationUseCase(deps), get: new GetSceneUseCase(deps) };
}
const markDeceased = (deps: ApplicationDeps, petId: string, version = 1) => new UpdatePetUseCase(deps).execute(ANDRES, petId, { lifeStatus: 'DECEASED', deceasedAt: '2026-11-01' }, version);

describe('REQ-FAL7-006: una mascota DECEASED no se dibuja ni cuenta en pets.shown/total', () => {
  it('REQ-FAL7-006: SC-007-015: marcar el fallecimiento baja shown y total, y cuenta como un cambio de la huella (pending sube)', async () => {
    const t = setup();
    const before = await t.get.execute(ANDRES, HOUSE);
    await markDeceased(t.deps, ARGOS.id);
    const after = await t.get.execute(ANDRES, HOUSE);
    expect([after.pets.total, after.pets.shown]).toEqual([before.pets.total - 1, before.pets.shown - 1]);
    expect(after.pending).toBe(before.pending - 1);
  });

  it('REQ-FAL7-006: SC-007-032: el snapshot de la generación no incluye a la fallecida y un snapshot previo a 007 sigue parseando', async () => {
    const t = setup();
    await markDeceased(t.deps, ARGOS.id);
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    const snapshot = parseInputsSnapshot(attempt.inputsSnapshot);
    expect(snapshot?.pets.length).toBeGreaterThan(0);
    expect(snapshot!.pets.some((p) => p.id === ARGOS.id)).toBe(false);
    expect(Object.keys(snapshot!.pets[0] ?? {}).sort()).toEqual(['breed', 'breedCode', 'id', 'photo', 'sex', 'species', 'speciesOther']);
    const legacy = serializeInputsSnapshot(buildInputsSnapshot({ householdPhoto: null, pets: [{ id: ARGOS.id, species: 'CANINE', speciesOther: null, breed: 'Pastor Alemán', breedCode: null, sex: 'MALE', photo: null }] }));
    expect(parseInputsSnapshot(legacy)?.pets.map((p) => p.id)).toEqual([ARGOS.id]);
  });

  it('REQ-FAL7-006: EDGE-007-014: si una mascota de la huella pasa a DECEASED mientras el proveedor trabaja, la publicación se cancela sin cuota y no queda imagen', async () => {
    const t = setup();
    await t.request.execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
    const attempt = t.h.uow.snapshot().sceneAttempts![0]!;
    t.hooked.during = async () => {
      await markDeceased(t.deps, ARGOS.id);
    };
    expect(await t.run.execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal)).toBe('CANCELLED');
    expect(t.h.uow.snapshot().scenes![0]).toMatchObject({ image: null, consumedGenerations: 0 });
  });
});
