import { describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { decideMode } from '../../src/domain/scene/decide-mode.ts';
import { parseInputsSnapshot } from '../../src/domain/scene/inputs-snapshot.ts';
import { buildScenePayload } from '../../src/domain/scene/scene-payload.ts';
import { buildImagePrompt } from '../../src/domain/scene/build-image-prompt.ts';
import { validateScenePayload } from '../../src/generated/v34/index.ts';
import { ANDRES, ARGOS, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1182 (008, bloque I, `[GH:#21]`): la biografía NO entra en la escena (D8-12 = A). Con y sin biografía, el payload de escena, el prompt (`buildImagePrompt`) y la huella
 * (`REQ-ESC6-004`) son idénticos y `pets[].biography` sigue `null`; ni el texto de la biografía ni la palabra aparecen en el prompt ni en la instantánea guardada (O-3 de `/oracle`).
 * REQ-BIO8-002, REQ-BIO8-003, INV-ESC6-010, INV-ESC6-017, EDGE-008-042, ADR-008-11; SC-008-045, SC-008-046.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const KEY = 'b0000000-0000-4000-8000-000000000001';
const BIOGRAPHY = 'Le tiene miedo a los truenos y adora el queso manchego';

async function generate(biography: string | null) {
  const state = canonicalState();
  if (biography !== null) state.pets = state.pets.map((p) => (p.id === ARGOS.id ? { ...p, biography } : p));
  const h = createHarness(state);
  const fixture = sceneFixture({});
  const storage = new ControlledStorage(() => new Date(NOW));
  const base = withScene(h.deps, fixture);
  const deps: ApplicationDeps = { ...base, media: { storage, limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } } };
  await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, KEY);
  const attempt = h.uow.snapshot().sceneAttempts![0]!;
  const outcome = await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt.sceneId, attemptId: attempt.id }, new AbortController().signal);
  const final = h.uow.snapshot().sceneAttempts![0]!;
  const snapshot = parseInputsSnapshot(final.inputsSnapshot)!;
  const plan = decideMode({ last: null, now: snapshot, hasImage: false, action: 'UPDATE' })!;
  const payload = buildScenePayload({ plan, last: null, now: snapshot, householdId: HOUSEHOLD.id, maxPets: 8, totalPets: snapshot.pets.length });
  return { outcome, prompt: fixture.generator.calls[0]?.prompt ?? '', fingerprint: final.fingerprint, inputsSnapshot: final.inputsSnapshot, payload, storedBiography: h.uow.snapshot().pets.find((p) => p.id === ARGOS.id)?.biography };
}

describe('la biografía no entra en la escena (T1182)', () => {
  it('[GH:#21][REQ-BIO8-003][INV-ESC6-017][SC-008-045] con y sin biografía el payload, el prompt y la huella son idénticos', async () => {
    const without = await generate(null);
    const withBio = await generate(BIOGRAPHY);
    expect(withBio.storedBiography).toBe(BIOGRAPHY); // la mascota sí tiene la biografía guardada
    expect([withBio.outcome, without.outcome, withBio.prompt.length > 0]).toEqual(['PUBLISHED', 'PUBLISHED', true]);
    expect(withBio.payload).toEqual(without.payload);
    expect(withBio.prompt).toBe(without.prompt);
    expect(buildImagePrompt(withBio.payload)).toBe(buildImagePrompt(without.payload));
    expect(withBio.fingerprint).toBe(without.fingerprint);
    expect(withBio.inputsSnapshot).toBe(without.inputsSnapshot);
  });

  it('[GH:#21][REQ-BIO8-003][INV-ESC6-010][INV-ESC6-017][SC-008-046] el payload valida contra el contrato 006, pets[].biography sigue null y el texto no aparece en el prompt ni en la instantánea', async () => {
    const run = await generate(BIOGRAPHY);
    expect(validateScenePayload(run.payload)).toBe(true);
    expect(run.payload.pets.length).toBeGreaterThan(0);
    expect(run.payload.pets.map((p) => p.biography ?? null)).toEqual(run.payload.pets.map(() => null));
    expect(JSON.stringify(run.payload)).not.toContain(BIOGRAPHY);
    for (const text of [run.prompt, run.inputsSnapshot]) {
      expect(text).not.toContain(BIOGRAPHY);
      expect(text.toLowerCase()).not.toContain('truenos');
      expect(text).not.toMatch(/biography/i);
    }
  });
});
