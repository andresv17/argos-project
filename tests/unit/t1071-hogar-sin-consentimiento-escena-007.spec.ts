import { describe, expect, it } from 'vitest';
import type { SceneImageGeneratorPort, SceneGenerationRequest, SceneGenerationResult } from '../../src/application/ports/scene-image-generator.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { ANDRES, HOUSEHOLD, LUNA, MARIA, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1071 R7 (007; EDGE-007-024, SC-007-037): con el driver REAL y una foto de hogar SIN consentimiento vigente de HOUSEHOLD_PHOTO, el hogar no viaja (no hay `IMG_1` de hogar,
 * ni «inspired by»), las mascotas con foto arrancan en `IMG_1` y el prompt usa el hogar genérico. Ejecuta el caso de uso real (`loadLiveInputs` + `decideMode` + worker).
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const LUNA_AVATAR = 'e1000000-0000-4000-8000-000000000002';
const consent = (userId: string, n: number) => ({ id: `c5000000-0000-4000-8000-00000000003${n}`, userId, scope: 'PET_PHOTOS' as const, providerId: 'vertex-gemini-image', noticeVersion: '1', grantedAt: NOW, revokedAt: null });

class Capturing implements SceneImageGeneratorPort {
  readonly requests: SceneGenerationRequest[] = [];
  constructor(private readonly inner: FakeSceneImageGenerator) {}
  generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    this.requests.push(request);
    return this.inner.generate(request);
  }
}

describe('T1071 R7: driver real, hogar sin consentimiento vigente', () => {
  it('[EDGE-007-024][SC-007-037] la foto del hogar no viaja y la mascota con foto es IMG_1 (sin referencia de hogar en el prompt)', async () => {
    const h = createHarness(canonicalState());
    const fixture = sceneFixture({ realDriver: true });
    const generator = new Capturing(fixture.generator);
    const storage = new ControlledStorage(() => new Date(NOW));
    const base = withScene(h.deps, fixture);
    const deps: ApplicationDeps = {
      ...base,
      scene: { ...base.scene!, generator },
      media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
    };
    const sample = await fixture.generator.generate({ prompt: 'ref', references: [], seed: 0, signal: new AbortController().signal });
    if (!sample.ok) throw new Error('el generador simulado no devolvió imagen');
    await h.uow.runInTransaction(async (r) => {
      await r.sceneConsents.grant(consent(ANDRES, 1));
      await r.sceneConsents.grant(consent(MARIA, 2));
      await r.pets.replaceAvatar(LUNA.id, LUNA_AVATAR);
      await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: 'f1000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 9, uploadedByUserId: ANDRES, createdAt: NOW });
    });
    await storage.put(`pets/${LUNA.id}/avatar/${LUNA_AVATAR}`, sample.image.bytes, 'image/png');
    await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000001');
    const attempt = h.uow.snapshot().sceneAttempts?.[0];
    expect(await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, new AbortController().signal)).toBe('PUBLISHED');
    const call = generator.requests[0];
    expect(call?.references.map((r) => r.ref)).toEqual(['IMG_1']);
    const lines = (call?.prompt ?? '').split('\n');
    expect(lines.filter((l) => /^Pet \d+ \(\w+\): Use IMG_1 as the exact visual reference for this \w+\.$/.test(l))).toHaveLength(1);
    expect(call?.prompt.includes('inspired by the furniture')).toBe(false);
    expect(call?.prompt.includes('IMG_2')).toBe(false);
    expect(call?.prompt.includes('Design a warm, cozy modern living room interior')).toBe(true);
  });
});
