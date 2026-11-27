import { describe, expect, it } from 'vitest';
import type { PlatformParameterRepositoryPort } from '../../src/application/ports/platform-parameter.port.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { RequestSceneGenerationUseCase, type SceneTarget } from '../../src/application/use-cases/scene-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { DEFAULT_PROMPT_BLOCKS, PROMPT_BLOCK_NAMES } from '../../src/domain/scene/prompt-blocks.ts';
import { createScenePromptBlocksReader } from '../../src/infrastructure/config/scene-provider-parameters.ts';
import { ANDRES, HOUSEHOLD, canonicalState, createHarness } from '../fixtures/application-harness.ts';
import { ControlledStorage } from '../fixtures/media-harness.ts';
import { sceneFixture, withScene } from '../fixtures/scene-services-fixtures.ts';

/**
 * T1306 (009, 5b): el bloque de prompt editado en /admin rige en la SIGUIENTE generacion tras la cache (<= 60 s); valor invalido o lectura rota = bloques de codigo.
 * REQ-CFG9-002, REQ-CFG9-005, INV-CFG9-003; SC-009-024.
 */
const HOUSE: SceneTarget = { kind: 'HOUSEHOLD', householdId: HOUSEHOLD.id };
const NOW = '2026-11-05T12:00:00.000Z';
const EDITED = 'Texto de cierre editado por el administrador.';
const KEY = 'scene.prompt.blocks';
const edited = JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, STYLE_CLOSING: EDITED });

const runWith = async (promptBlocks: unknown): Promise<string> => {
  const h = createHarness(canonicalState());
  const fixture = sceneFixture({});
  const base = withScene(h.deps, fixture);
  const deps = {
    ...base,
    scene: { ...base.scene!, ...(promptBlocks === undefined ? {} : { promptBlocks }) },
    media: { storage: new ControlledStorage(() => new Date(NOW)), limits: { maxBytes: 10_485_760, maxBytesPerOwner: 1_073_741_824, maxConcurrentUploads: 4, signedUrlTtlSeconds: 300 } },
  } as unknown as ApplicationDeps;
  await new RequestSceneGenerationUseCase(deps).execute(ANDRES, HOUSE, { action: 'UPDATE' }, 'b0000000-0000-4000-8000-000000000001');
  const attempt = h.uow.snapshot().sceneAttempts?.[0];
  await new RunSceneGenerationUseCase(deps).execute({ sceneId: attempt?.sceneId ?? '', attemptId: attempt?.id ?? '' }, new AbortController().signal);
  return fixture.generator.prompts[0] ?? '';
};

describe('T1306 prompt editable en la generacion', () => {
  it('sin lector rige el prompt de codigo', async () => {
    expect(await runWith(undefined)).toContain(DEFAULT_PROMPT_BLOCKS.STYLE_BASE_TEXT);
  });

  it('con lector, el bloque editado entra en el prompt enviado al proveedor', async () => {
    const prompt = await runWith(async () => ({ ...DEFAULT_PROMPT_BLOCKS, STYLE_BASE_TEXT: EDITED }));
    expect(prompt).toContain(EDITED);
    expect(prompt).not.toContain(DEFAULT_PROMPT_BLOCKS.STYLE_BASE_TEXT);
  });

  it('si el lector falla, rige el prompt de codigo y la generacion continua', async () => {
    const prompt = await runWith(async () => { throw new Error('lectura rota'); });
    expect(prompt).toContain(DEFAULT_PROMPT_BLOCKS.STYLE_BASE_TEXT);
  });
});

describe('T1306 lector con cache <= 60 s', () => {
  const repo = (rows: Record<string, string | null>): PlatformParameterRepositoryPort => ({ findValue: async (k) => rows[k] ?? null });

  it('la edicion rige tras 60 s y no antes; fila invalida o ausente = bloques de codigo sin lanzar', async () => {
    let now = 1_000_000;
    const rows: Record<string, string | null> = {};
    const read = createScenePromptBlocksReader({ repository: repo(rows), now: () => now });
    expect((await read()).STYLE_CLOSING).toBe(DEFAULT_PROMPT_BLOCKS.STYLE_CLOSING);
    rows[KEY] = edited;
    now += 59_000;
    expect((await read()).STYLE_CLOSING).toBe(DEFAULT_PROMPT_BLOCKS.STYLE_CLOSING);
    now += 1_001;
    expect((await read()).STYLE_CLOSING).toBe(EDITED);
    rows[KEY] = JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, STYLE_CLOSING: 'Hola {petName}' });
    now += 61_000;
    const fallback = await read();
    expect(PROMPT_BLOCK_NAMES.map((n) => fallback[n])).toEqual(PROMPT_BLOCK_NAMES.map((n) => DEFAULT_PROMPT_BLOCKS[n]));
  });
});
