import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATION_STEPS as MIGRATION_STEPS_PG, type MigratorClient } from '../../scripts/migrate-postgres.ts';
import type { SceneAttemptRecord, SceneRecord } from '../../src/application/ports/scene-repositories.port.ts';
import { purgeSceneData } from '../../src/application/use-cases/maintenance-use-cases.ts';
import { RunSceneGenerationUseCase } from '../../src/application/use-cases/scene-run-use-case.ts';
import { canonicalJson } from '../../src/domain/audit/canonical-json.ts';
import { sha256Hex } from '../../src/domain/audit/sha256.ts';
import { buildInputsSnapshot, computeFingerprint, countPendingChanges, parseInputsSnapshot, sanitizeStoredSnapshot, serializeInputsSnapshot, type SnapshotPet } from '../../src/domain/scene/inputs-snapshot.ts';
import { SCENE_SPEC_HEADER } from '../../src/domain/scene/scene-spec.ts';
import { DEFAULT_PROMPT_BLOCKS, PROMPT_BLOCK_NAMES, validatePromptBlocks, type PromptBlockName } from '../../src/domain/scene/prompt-blocks.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { GeminiApiSceneImageGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { VertexSceneImageGenerator } from '../../src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';
import { HOUSEHOLD, canonicalState } from '../fixtures/application-harness.ts';
import { ADMIN_EMAIL, adminKit, adminLogin } from '../fixtures/admin-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../fixtures/media-harness.ts';
import { postgresMigrationFiles } from '../fixtures/postgres-migrations.ts';
import { parameterKit } from '../fixtures/parameters-fixtures.ts';
import { sceneFixture, type SceneFixture, type SceneFixtureOptions } from '../fixtures/scene-services-fixtures.ts';
import { createApi, type Api } from '../integration/api/api-harness.ts';
import { ANDRES, createMediaEngines, type MediaEngine } from '../fixtures/media-harness.ts';
import { closePool, createPostgresPool, type PoolLike } from '../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { postgresSceneRepository } from '../../src/infrastructure/persistence/postgres/postgres-scene-repositories.ts';
import { DEFAULT_MIGRATIONS_DIR, MIGRATION_STEPS, openSqliteDatabase, runMigrations, type SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * T1517 (011, Bloque C, #73; PRUEBAS ROJAS hasta T1521; `/keymaker`): el prompt de la escena y los datos de las personas y mascotas que lo componen viven solo en memoria.
 * REQ-IA11-003, INV-IA11-002, EDGE-011-018, D11-08 = A, MIF-011-04; SC-011-015..020. Requisitos P-1, P-2, P-4, P-6 y P-7 del dictamen
 * `.specify/memory/audits/rama-011-T1518-prompt-2026-11-25.md` y superficies S1..S14 del acta `architect-011-prompt-superficies.md`.
 *
 * P-3 y P-5 (decisiones D-1, Q1 y Q3 de Neo, Logos iter 222; REQ-IA11-004, EDGE-011-018): el snapshot v2 conserva solo UUID opacos y enums cerrados; las migraciones SQLite 0030 y PostgreSQL 0026
 * saneán las filas históricas y recalculan la huella; la purga de 30 días y el borrado de la copia de `home_scenes` tienen prueba ejecutable. La parte PostgreSQL de P-3 y P-5 corre con
 * `it.skipIf(!HAS_POSTGRES)` (TEST_DATABASE_URL); la parte PostgreSQL de P-1 queda como `P1_POSTGRES_PENDING`.
 *
 * @implements REQ-IA11-003, REQ-IA11-004, INV-IA11-002, EDGE-011-018
 */
export const P1_POSTGRES_PENDING = 'P-1 en PostgreSQL real (TEST_DATABASE_URL): pendiente de arnés; esta suite cubre SQLite en memoria';

const H1 = HOUSEHOLD.id;
const NOW_ISO = '2026-11-05T12:00:00.000Z';
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CANARY_BIO = 'CANARY-BIO-7731';
const CANARY_NAME = 'CANARY-NOMBRE-5520';
const ROOT = process.cwd();
const stripComments = (code: string): string => code.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const source = (path: string): string => readFileSync(`${ROOT}/${path}`, 'utf8');

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

interface Ctx {
  readonly fixture: SceneFixture;
  readonly storage: ControlledStorage;
  readonly a: Api;
}

type PetOverride = Partial<ReturnType<typeof canonicalState>['pets'][number]>;
async function boot(scene: SceneFixtureOptions = {}, withAdmin = false, petOverride: PetOverride = {}): Promise<Ctx & { readonly adminCookie: string | null }> {
  const state = canonicalState();
  state.pets = state.pets.map((p) => ({ ...p, name: CANARY_NAME, biography: `${CANARY_BIO} duerme sobre el sofa azul`, ...petOverride }));
  const fixture = sceneFixture(scene);
  const storage = new ControlledStorage(() => new Date(NOW_ISO));
  const params = parameterKit();
  const a = await createApi(state, {
    scene: fixture.services,
    media: { storage, limits: { ...DEFAULT_LIMITS, maxBytes: 2_000_000 } },
    ...(withAdmin ? { admin: adminKit([ADMIN_EMAIL]).admin, platformParameters: params.port } : {}),
  });
  api = a;
  params.bind(a);
  const adminCookie = withAdmin ? (await adminLogin(a)).cookie : null;
  return { fixture, storage, a, adminCookie };
}

const generate = (a: Api, cookie: string, n: number) =>
  a.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'UPDATE' }, headers: { 'idempotency-key': KEY(n) }, contract: false });
const runLast = (c: Ctx) => new RunSceneGenerationUseCase(c.a.deps).execute(c.fixture.dispatcher.jobs[c.fixture.dispatcher.jobs.length - 1]!, new AbortController().signal);
const rows = (a: Api, table: string): string => JSON.stringify(a.db.prepare(`SELECT * FROM ${table}`).all());
const PERSISTED = ['scene_attempts', 'home_scenes', 'audit_log', 'admin_audit_entries'] as const;
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

/** Fragmentos que no deben aparecer en ninguna superficie: los canarios y el comienzo del prompt realmente enviado. */
function forbiddenOf(c: Ctx): string[] {
  const prompt = c.fixture.generator.prompts[0] ?? '';
  return [CANARY_BIO, CANARY_NAME, prompt.slice(0, 60), prompt.slice(-60)];
}

describe('P-1 · extremo a extremo (SQLite): el canario no sale de la memoria (REQ-IA11-003, INV-IA11-002, SC-011-015, SC-011-016)', () => {
  it('[SC-011-015] tras un ÉXITO el canario de biografía y nombre NO está en scene_attempts, home_scenes, audit_log, admin_audit_entries, respuestas HTTP ni bytes de la imagen (y SÍ viajó en el prompt en memoria)', async () => {
    const c = await boot();
    const cookie = await c.a.login('andres');
    const posted = await generate(c.a, cookie, 1);
    expect(posted.status).toBe(202);
    expect(await runLast(c)).toBe('PUBLISHED');
    // No vacuidad: la biografía sí entró al prompt (el espía en memoria es la única vía de lectura, D11-08 = A).
    expect(c.fixture.generator.prompts[0]).toContain(CANARY_BIO);
    const forbidden = forbiddenOf(c);
    const view = await c.a.call('GET', `/api/households/${H1}/scene`, { cookie, contract: false });
    const attempt = c.a.db.prepare('SELECT result_object_id AS id, scene_id AS sceneId FROM scene_attempts WHERE result_object_id IS NOT NULL').get() as { id: string; sceneId: string };
    const stored = await c.storage.get(`scenes/${attempt.sceneId}/images/${attempt.id}`);
    const surfaces = [...PERSISTED.map((t) => [t, rows(c.a, t)] as const), ['POST', posted.text] as const, ['GET', view.text] as const, ['IMAGEN', latin1(stored!.bytes)] as const];
    for (const [surface, text] of surfaces) for (const fragment of forbidden) expect([surface, fragment, text.includes(fragment)]).toEqual([surface, fragment, false]);
    for (const chunk of ['tEXt', 'iTXt', 'zTXt', 'eXIf']) expect([chunk, latin1(stored!.bytes).includes(chunk)]).toEqual([chunk, false]);
  });

  it('[SC-011-016] tras un FALLO (proveedor caído) el canario tampoco está en ninguna fila, respuesta ni en stderr', async () => {
    const c = await boot({ mode: 'fail' });
    const cookie = await c.a.login('andres');
    const stderr: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => (stderr.push(String(chunk)), true)) as typeof process.stderr.write;
    try {
      const posted = await generate(c.a, cookie, 1);
      expect(posted.status).toBe(202);
      expect(await runLast(c)).toBe('FAILED');
    } finally {
      process.stderr.write = original;
    }
    expect(c.fixture.generator.prompts[0]).toContain(CANARY_BIO);
    const forbidden = forbiddenOf(c);
    const view = await c.a.call('GET', `/api/households/${H1}/scene`, { cookie, contract: false });
    const surfaces = [...PERSISTED.map((t) => [t, rows(c.a, t)] as const), ['GET', view.text] as const, ['STDERR', stderr.join('')] as const];
    for (const [surface, text] of surfaces) for (const fragment of forbidden) expect([surface, fragment, text.includes(fragment)]).toEqual([surface, fragment, false]);
  });

  it('[SC-011-017][S11][S12] la vista de /admin (parámetros y conteo pendiente) no contiene prompt ni nombres de mascotas de una escena generada, y la plantilla genérica sigue visible (D11-08 = A)', async () => {
    const c = await boot({}, true);
    const cookie = await c.a.login('andres');
    expect((await generate(c.a, cookie, 1)).status).toBe(202);
    expect(await runLast(c)).toBe('PUBLISHED');
    // La plantilla genérica (inicio del prompt) es configuración visible a propósito; lo que no puede verse es lo propio de la escena: canarios y especificación JSON.
    const forbidden = [CANARY_BIO, CANARY_NAME, SCENE_SPEC_HEADER];
    const parameters = await c.a.call('GET', '/api/admin/parameters', { cookie: c.adminCookie, contract: false });
    const pending = await c.a.call('GET', '/api/admin/pending-count', { cookie: c.adminCookie, contract: false });
    expect([parameters.status, pending.status]).toEqual([200, 200]);
    for (const text of [parameters.text, pending.text]) for (const fragment of forbidden) expect([fragment, text.includes(fragment)]).toEqual([fragment, false]);
    // No regresión: la plantilla de estilo (configuración de plataforma, sin datos de personas) sigue legible para el administrador.
    const blocks = (parameters.json as { items: Array<{ key: string; value: string }> }).items.find((i) => i.key === 'scene.prompt.blocks');
    expect(blocks?.key).toBe('scene.prompt.blocks');
  });

  it('[SC-011-020][EDGE-011-018] aviso: la parte PostgreSQL de P-1 queda pendiente de arnés (TEST_DATABASE_URL) y así consta', () => {
    expect(P1_POSTGRES_PENDING).toMatch(/PostgreSQL real.*pendiente de arnés/);
  });
});

describe('P-2 · guarda estática: sin prompt ni hash del prompt fuera de memoria (INV-IA11-002, S2, S3)', () => {
  it('[SC-011-018][S2][OBS-4] las llamadas registradas por el generador simulado (`calls`) no retienen el texto del prompt ni su hash', async () => {
    const fake = new FakeSceneImageGenerator();
    await fake.generate({ prompt: `texto del prompt ${CANARY_BIO}`, references: [], seed: 7, signal: new AbortController().signal });
    const dumped = JSON.stringify(fake.calls);
    expect(dumped.includes(CANARY_BIO)).toBe(false);
    expect(dumped.includes('"prompt"')).toBe(false);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.seed).toBe(7);
  });

  it('[SC-011-018][S2] el espía de prompts es OPT-IN: sin `capturePrompts` el generador no retiene ningún prompt (así se construye en composición)', async () => {
    const fake = new FakeSceneImageGenerator();
    await fake.generate({ prompt: CANARY_BIO, references: [], seed: 0, signal: new AbortController().signal });
    expect(fake.prompts).toEqual([]);
    const spying = new FakeSceneImageGenerator({ capturePrompts: true });
    await spying.generate({ prompt: CANARY_BIO, references: [], seed: 0, signal: new AbortController().signal });
    expect(spying.prompts).toEqual([CANARY_BIO]);
  });

  it('[SC-011-018][S3] el caso de uso solo entrega `prompt` al generador: no llega a repositorios, unidad de trabajo, auditoría ni registro', () => {
    const code = stripComments(source('src/application/use-cases/scene-run-use-case.ts'));
    const uses = code.split('\n').filter((line) => /\bprompt\b/.test(line));
    for (const line of uses) {
      const ok = /let prompt\b|prompt = |generator\.generate\(\{[^}]*\bprompt\b|buildImagePrompt/.test(line);
      expect([line.trim(), ok]).toEqual([line.trim(), true]);
    }
    expect(/promptHash|sha256\([^)]*prompt|createHash\([^)]*\)\.update\(\s*prompt/.test(code)).toBe(false);
  });

  it('[SC-011-018] ningún archivo de persistencia, casos de uso de auditoría ni rutas HTTP de la escena nombra `promptHash`, `prompt_hash` ni calcula un hash del prompt', () => {
    const files = [
      'src/application/use-cases/scene-audit.ts',
      'src/application/use-cases/scene-use-cases.ts',
      'src/domain/scene/inputs-snapshot.ts',
      'src/infrastructure/http/routes/scene.routes.ts',
      'src/infrastructure/http/scene-composition.ts',
      'src/infrastructure/persistence/sqlite/sqlite-scene-repositories.ts',
      'src/infrastructure/persistence/postgres/postgres-scene-repositories.ts',
    ];
    for (const file of files) {
      const code = stripComments(source(file));
      expect([file, /promptHash|prompt_hash|hash\(\s*prompt|update\(\s*(?:request\.)?prompt\b/i.test(code)]).toEqual([file, false]);
      expect([file, /\blog[A-Za-z]*\([^)]*\bprompt\b|console\.[a-z]+\([^)]*\bprompt\b/.test(code)]).toEqual([file, false]);
    }
  });
});

describe('P-4 · sin `echo` en el generador simulado y una sola guarda (MIF-011-04, S1)', () => {
  it('[SC-011-019][S1] el módulo del generador simulado no contiene el modo `echo` ni escribe trozos `tEXt` (la guarda es no tener el modo; no hay segunda guarda de entorno)', () => {
    const code = stripComments(source('src/infrastructure/adapters/fake-scene-image-generator.adapter.ts'));
    expect([/'echo'/.test(code), /tEXt/.test(code), /NODE_ENV|process\.env/.test(code)]).toEqual([false, false, false]);
  });

  it('[SC-011-019][S1] ningún modo del generador simulado, ni uno `echo` forzado, deja el prompt en los bytes del PNG', async () => {
    const prompt = `Place all 2 pets ${CANARY_BIO}`;
    for (const mode of ['ok', 'echo'] as const) {
      const fake = new FakeSceneImageGenerator({ mode: mode as never });
      const out = await fake.generate({ prompt, references: [], seed: 0, signal: new AbortController().signal });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const text = latin1(out.image.bytes);
      expect([mode, text.includes('tEXt'), text.includes(CANARY_BIO), text.includes('Place all 2 pets')]).toEqual([mode, false, false, false]);
    }
  });

  it('[SC-011-019][S3] la composición de producción construye el simulado solo con `mode: ok` y sin espía de prompts', () => {
    const code = stripComments(source('src/infrastructure/http/scene-composition.ts'));
    expect(/new FakeSceneImageGenerator\(\{ mode: 'ok' \}\)/.test(code)).toBe(true);
    expect(/capturePrompts|'echo'/.test(code)).toBe(false);
  });
});

describe('P-6 · plantilla editable `scene.prompt.blocks` sin datos personales (OBS-5, S11)', () => {
  const withText = (name: PromptBlockName, extra: string): string => JSON.stringify({ ...DEFAULT_PROMPT_BLOCKS, [name]: `${DEFAULT_PROMPT_BLOCKS[name]} ${extra}` });
  const rejects: ReadonlyArray<readonly [string, string]> = [
    ['correo', 'escribe a maria.perez@correo.co para detalles'],
    ['arroba', 'sigue a @maria_perez en la red'],
    ['URL con esquema', 'mira https://ejemplo.com/maria'],
    ['URL sin esquema', 'mira www.ejemplo.com'],
    ['7 dígitos seguidos', 'llama al 3001234'],
    ['teléfono de 10 dígitos', 'llama al 3001234567'],
  ];

  it('[SC-011-020][OBS-5] los valores por defecto siguen siendo válidos (no regresión)', () => {
    expect(validatePromptBlocks(JSON.stringify(DEFAULT_PROMPT_BLOCKS), 1000).ok).toBe(true);
  });

  it('[SC-011-020][OBS-5] en CADA bloque se rechazan correos, menciones con «@», URLs y secuencias de 7 o más dígitos con ERR-SCHEMA-VALIDATION-FAILED, sin devolver el valor', () => {
    for (const name of PROMPT_BLOCK_NAMES) {
      for (const [label, extra] of rejects) {
        const verdict = validatePromptBlocks(withText(name, extra), 1000);
        expect([name, label, verdict]).toEqual([name, label, { ok: false, code: 'ERR-SCHEMA-VALIDATION-FAILED' }]);
      }
    }
  });

  it('[SC-011-020][OBS-5] límites documentados de la defensa parcial: hasta 6 dígitos y una cifra aislada se aceptan (no es un detector de nombres ni de números escritos con letras)', () => {
    expect(validatePromptBlocks(withText('STYLE_BASE_TEXT', 'usa 6 colores y 123456 pixeles'), 1000).ok).toBe(true);
    expect(validatePromptBlocks(withText('STYLE_CLOSING', 'ambiente 2026'), 1000).ok).toBe(true);
  });

  it('[SC-011-020][OBS-5][UI] la interfaz de /admin muestra la advertencia fija junto al editor de `scene.prompt.blocks` (PRUEBA SOBRE EL FUENTE; la UI se implementa tras la decisión de Neo)', () => {
    const code = source('src/presentation/admin/ParametersPanel.tsx');
    expect(code).toContain('No escribas datos de personas ni de mascotas en este texto');
  });
});

describe('P-7 · errores y adaptadores sin prompt ni cuerpo del proveedor (INV-ESC6-016, REQ-IA11-003, S5, S6)', () => {
  const PROMPT = `Escena con IMG_1 ${CANARY_BIO} y ${CANARY_NAME}`;
  const PROVIDER_BODY = 'PROVIDER-BODY-SECRET-9911 {"error":{"message":"quota"}}';
  const request = () => ({ prompt: PROMPT, references: [], seed: 0, signal: new AbortController().signal });
  const png = async (): Promise<Uint8Array> => {
    const r = await new FakeSceneImageGenerator().generate(request());
    if (!r.ok) throw new Error('sin imagen');
    return r.image.bytes;
  };
  const jpegAsPng = JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64') } }] } }] });

  it('[SC-011-020][S5] Gemini API: un 500 con cuerpo del proveedor y una imagen inválida devuelven solo códigos estables; el registro y el resultado no contienen prompt, canarios ni el cuerpo', async () => {
    const lines: string[] = [];
    const bodies = [new Response(PROVIDER_BODY, { status: 500 }), new Response(jpegAsPng, { status: 200 })];
    const generator = new GeminiApiSceneImageGenerator({ apiKey: 'AIzaSyTEST-SENTINEL-0000000000000000000', model: 'gemini-2.5-flash-image', timeoutSeconds: 90, log: (l) => lines.push(l), fetch: (async () => bodies.shift()!) as unknown as typeof fetch }); // argos-scan:allow clave sintetica de prueba
    const results = [await generator.generate(request()), await generator.generate(request())];
    expect(results).toEqual([
      { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' },
      { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' },
    ]);
    const everything = JSON.stringify(results) + lines.join('\n');
    for (const fragment of [CANARY_BIO, CANARY_NAME, 'Escena con IMG_1', 'PROVIDER-BODY-SECRET-9911']) expect([fragment, everything.includes(fragment)]).toEqual([fragment, false]);
    expect(lines).toEqual(['scene-generator INVALID_OUTPUT mimeType=image/png']);
  });

  it('[SC-011-020][S5] Vertex (ruta `real`): un 500 con cuerpo del proveedor, un fetch que lanza el prompt en el mensaje y una imagen inválida no filtran prompt, canarios ni el cuerpo', async () => {
    const lines: string[] = [];
    const queue: Array<() => Response> = [
      () => new Response(PROVIDER_BODY, { status: 500 }),
      () => {
        throw new Error(`fallo de red con ${PROMPT}`);
      },
      () => new Response(jpegAsPng, { status: 200 }),
    ];
    const generator = new VertexSceneImageGenerator({
      projectId: 'argos-prod-1234',
      location: 'us-central1',
      model: 'gemini-2.5-flash-image',
      timeoutSeconds: 90,
      log: (l) => lines.push(l),
      getAccessToken: async () => 'tok-de-prueba',
      fetch: (async () => queue.shift()!()) as unknown as typeof fetch,
    });
    const results = [await generator.generate(request()), await generator.generate(request()), await generator.generate(request())];
    expect(results).toEqual([
      { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' },
      { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' },
      { ok: false, code: 'ERR-SCENE-INVALID-IMAGE' },
    ]);
    const everything = JSON.stringify(results) + lines.join('\n');
    for (const fragment of [CANARY_BIO, CANARY_NAME, 'Escena con IMG_1', 'PROVIDER-BODY-SECRET-9911']) expect([fragment, everything.includes(fragment)]).toEqual([fragment, false]);
    expect(await png()).toBeInstanceOf(Uint8Array);
  });

  it('[SC-011-020][S6] el modo `fail` y el modo `invalid` del simulado solo producen códigos estables en la respuesta HTTP: sin prompt, sin canarios', async () => {
    for (const mode of ['fail', 'invalid'] as const) {
      const c = await boot({ mode });
      const cookie = await c.a.login('andres');
      expect((await generate(c.a, cookie, 1)).status).toBe(202);
      await runLast(c);
      const view = await c.a.call('GET', `/api/households/${H1}/scene`, { cookie, contract: false });
      for (const fragment of forbiddenOf(c)) expect([mode, fragment, view.text.includes(fragment)]).toEqual([mode, fragment, false]);
      expect((view.json as { lastError: string | null }).lastError).toBe(mode === 'fail' ? 'ERR-SCENE-GENERATION-FAILED' : 'ERR-SCENE-INVALID-IMAGE');
      await c.a.close();
      api = null;
    }
  });
});


/* ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ */
/* P-3 · snapshot v2 sin texto libre y saneado de filas históricas (REQ-IA11-004, EDGE-011-018; D-1, Q1, Q3 de Neo)                                                            */
/* ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ */

const CANARY_OTHER = 'CANARY-OTRA-4412';
const CANARY_BREED = 'CANARY-RAZA-9981';
const PET_KEYS = ['breedCode', 'id', 'photo', 'sex', 'species'];
const UUID = (n: number): string => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FREE_TEXT_LEFTOVERS = (text: string): boolean => /speciesOther|"breed":|CANARY-OTRA|CANARY-RAZA|CANARY-BIO|CANARY-NOMBRE/.test(text);

/** Snapshot v1 tal como lo escribía 006 (con texto libre) y su huella antigua: SHA-256 del JSON canónico de ese mismo objeto. */
function legacyV1(): { readonly text: string; readonly fingerprint: string } {
  const object = {
    v: 1,
    household: 'household-photo-1',
    pets: [
      { id: UUID(1), species: 'OTHER', speciesOther: CANARY_OTHER, breed: CANARY_BREED, breedCode: null, sex: 'FEMALE', photo: 'avatar-1' },
      { id: UUID(2), species: 'CANINE', speciesOther: null, breed: `${CANARY_BREED}-2`, breedCode: 'DOG_CRIOLLA', sex: 'MALE', photo: null },
    ],
  };
  return { text: canonicalJson(object), fingerprint: sha256Hex(canonicalJson(object)) };
}

describe('P-3 · el snapshot v2 no guarda texto libre y lee v1 ignorándolo (REQ-IA11-004, D-1, Q1)', () => {
  it('[SC-011-015][P-3] el parser lee v1 y v2: de v1 descarta `speciesOther` y `breed`; todo se re-emite en v2 con solo id, species, breedCode, sex y photo', () => {
    const parsed = parseInputsSnapshot(legacyV1().text);
    expect(parsed?.v).toBe(2);
    expect(parsed?.household).toBe('household-photo-1');
    expect(parsed?.pets.map((p) => Object.keys(p).sort())).toEqual([PET_KEYS, PET_KEYS]);
    expect(FREE_TEXT_LEFTOVERS(serializeInputsSnapshot(parsed!))).toBe(false);
    const roundTrip = parseInputsSnapshot(serializeInputsSnapshot(parsed!));
    expect(roundTrip).toEqual(parsed);
    expect(parseInputsSnapshot('{"v":3,"household":null,"pets":[]}')).toBeNull();
    expect(parseInputsSnapshot('no es json')).toBeNull();
  });

  it('[SC-011-015][P-3] `buildInputsSnapshot` copia campo por campo: un objeto con texto libre, nombre o biografía añadidos no los deja pasar al snapshot ni a la huella', () => {
    const dirty = { id: UUID(1), species: 'OTHER', breedCode: null, sex: 'FEMALE', photo: null, speciesOther: CANARY_OTHER, breed: CANARY_BREED, name: CANARY_NAME, biography: CANARY_BIO } as unknown as SnapshotPet;
    const text = serializeInputsSnapshot(buildInputsSnapshot({ householdPhoto: null, pets: [dirty] }));
    expect(FREE_TEXT_LEFTOVERS(text)).toBe(false);
    const clean: SnapshotPet = { id: UUID(1), species: 'OTHER', breedCode: null, sex: 'FEMALE', photo: null };
    expect(computeFingerprint(buildInputsSnapshot({ householdPhoto: null, pets: [dirty] }))).toBe(computeFingerprint(buildInputsSnapshot({ householdPhoto: null, pets: [clean] })));
  });

  it('[SC-011-015][P-3] `sanitizeStoredSnapshot` es idempotente y devuelve la huella del snapshot v2; un texto ilegible no se toca (null)', () => {
    const once = sanitizeStoredSnapshot(legacyV1().text);
    expect(typeof once?.text).toBe('string');
    expect(sanitizeStoredSnapshot(once!.text)).toEqual(once);
    expect(once!.fingerprint).toBe(computeFingerprint(parseInputsSnapshot(once!.text)!));
    expect(once!.fingerprint).not.toBe(legacyV1().fingerprint);
    expect(sanitizeStoredSnapshot('{"v":9}')).toBeNull();
  });

  it('[SC-011-015][P-3] cambiar solo `speciesOther` o `breed` de una mascota ya no cuenta como cambio pendiente (no son entradas del snapshot); cambiar su `breedCode` sí', () => {
    const base: SnapshotPet = { id: UUID(1), species: 'OTHER', breedCode: null, sex: 'FEMALE', photo: null };
    const a = buildInputsSnapshot({ householdPhoto: null, pets: [base] });
    expect(countPendingChanges(a, buildInputsSnapshot({ householdPhoto: null, pets: [{ ...base }] }))).toBe(0);
    expect(countPendingChanges(a, buildInputsSnapshot({ householdPhoto: null, pets: [{ ...base, breedCode: 'DOG_CRIOLLA' }] }))).toBe(1);
  });
});

describe('P-3 · una generación real escribe el snapshot v2 sin texto libre y el prompt sigue llevando el `speciesOther` en memoria (REQ-IA11-004, INV-IA11-002)', () => {
  it('[SC-011-015][P-3] con una mascota de especie OTHER con `speciesOther` y `breed` libres: ninguna fila de scene_attempts ni de home_scenes los contiene, el snapshot es v2 con 5 claves por mascota y el prompt en memoria SÍ usa el `speciesOther`', async () => {
    const c = await boot({}, false, { species: 'OTHER', speciesOther: 'hurón albino', breed: CANARY_BREED, breedCode: null });
    const cookie = await c.a.login('andres');
    expect((await generate(c.a, cookie, 1)).status).toBe(202);
    expect(await runLast(c)).toBe('PUBLISHED');
    expect(c.fixture.generator.prompts[0]).toContain('hurón albino');
    for (const table of ['scene_attempts', 'home_scenes'] as const) {
      const text = rows(c.a, table);
      expect([table, FREE_TEXT_LEFTOVERS(text), text.includes('hurón albino'), text.includes(CANARY_BREED)]).toEqual([table, false, false, false]);
    }
    const stored = c.a.db.prepare('SELECT image_inputs_snapshot AS s, image_fingerprint AS f FROM home_scenes').get() as { s: string; f: string };
    const snapshot = parseInputsSnapshot(stored.s);
    expect(snapshot?.v).toBe(2);
    expect(JSON.parse(stored.s).pets.map((p: Record<string, unknown>) => Object.keys(p).sort())).toEqual(JSON.parse(stored.s).pets.map(() => PET_KEYS));
    expect(stored.f).toBe(computeFingerprint(snapshot!));
  });

  it('[SC-011-015][P-3][OBS-3] una escena SIN cambios reales vuelve «ready» con 0 cambios pendientes tras sanear una escena histórica v1: la huella recalculada coincide con la viva', async () => {
    const c = await boot({}, false, { species: 'OTHER', speciesOther: 'hurón albino', breed: CANARY_BREED, breedCode: null });
    const cookie = await c.a.login('andres');
    expect((await generate(c.a, cookie, 1)).status).toBe(202);
    expect(await runLast(c)).toBe('PUBLISHED');
    const view = async () => (await c.a.call('GET', `/api/households/${H1}/scene`, { cookie, contract: false })).json as { status: string; pending: number; stale: boolean };
    expect(await view()).toMatchObject({ status: 'ready', pending: 0, stale: false });
    // Se reescribe lo guardado como lo dejaba 006 (v1 con texto libre y su huella antigua).
    const stored = c.a.db.prepare('SELECT image_inputs_snapshot AS s FROM home_scenes').get() as { s: string };
    const v2 = JSON.parse(stored.s) as { v: number; household: string | null; pets: Array<Record<string, unknown>> };
    const v1 = { ...v2, v: 1, pets: v2.pets.map((p) => ({ ...p, speciesOther: CANARY_OTHER, breed: CANARY_BREED })) };
    const legacyFingerprint = sha256Hex(canonicalJson(v1));
    c.a.db.prepare('UPDATE home_scenes SET image_inputs_snapshot = ?, image_fingerprint = ?').run(canonicalJson(v1), legacyFingerprint);
    c.a.db.prepare('UPDATE scene_attempts SET inputs_snapshot = ?, fingerprint = ?').run(canonicalJson(v1), legacyFingerprint);
    expect((await view()).status).not.toBe('ready'); // sin recalcular la huella, la escena figuraría desactualizada (OBS-3)
    MIGRATION_STEPS['0030_scene_snapshot_v2.sql']!(c.a.db);
    expect(await view()).toMatchObject({ status: 'ready', pending: 0, stale: false });
    for (const table of ['scene_attempts', 'home_scenes'] as const) expect([table, FREE_TEXT_LEFTOVERS(rows(c.a, table))]).toEqual([table, false]);
  });
});

const migrationDirs: string[] = [];
const migrationDbs: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of migrationDbs.splice(0)) if (db.open) db.close();
  for (const dir of migrationDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('P-3 · la migración SQLite 0030 sanea las filas históricas y recalcula la huella (Q3)', () => {
  const MIGRATION = '0030_scene_snapshot_v2.sql';
  const NOW = '2026-11-25T10:00:00.000Z';
  function previous(): { db: SqliteDatabase; migrationsDir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'argos-snapshot-'));
    migrationDirs.push(dir);
    const migrationsDir = join(dir, 'migraciones');
    mkdirSync(migrationsDir);
    for (const name of readdirSync(DEFAULT_MIGRATIONS_DIR)) if (name !== MIGRATION && /^\d{4}_.+\.sql$/.test(name)) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrationsDir, name));
    const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir });
    migrationDbs.push(db);
    return { db, migrationsDir };
  }
  const SCENE = 'a1000000-0000-4000-8000-0000000000e1';
  const ATTEMPT = 'a2000000-0000-4000-8000-0000000000e1';
  const OTHER_SCENE = 'a1000000-0000-4000-8000-0000000000e2';
  const OTHER_ATTEMPT = 'a2000000-0000-4000-8000-0000000000e2';

  it('[SC-011-015][EDGE-011-018][P-3] tras aplicarla, ninguna fila de home_scenes ni de scene_attempts conserva speciesOther, breed libre ni la biografía; todas son v2 con huella recalculada; la escena sin imagen y un texto ilegible quedan intactos', () => {
    const { db, migrationsDir } = previous();
    const legacy = legacyV1();
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO home_scenes (id, household_id, owner_user_id, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, quota_window, created_at, updated_at) VALUES (?, ?, NULL, ?, 'image/png', 10, ?, ?, ?, '2026-11', ?, ?)").run(SCENE, UUID(500), UUID(501), legacy.fingerprint, legacy.text, NOW, NOW, NOW);
    db.prepare("INSERT INTO home_scenes (id, household_id, owner_user_id, quota_window, created_at, updated_at) VALUES (?, ?, NULL, '2026-11', ?, ?)").run(OTHER_SCENE, UUID(502), NOW, NOW);
    const attempt = db.prepare("INSERT INTO scene_attempts (id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, quota_window, quota_max, outcome, started_at, finished_at) VALUES (?, ?, ?, 'UPDATE', 'FROM_SCRATCH', ?, ?, ?, 'DONE', '2026-11', 10, 'SUCCEEDED', ?, ?)");
    attempt.run(ATTEMPT, SCENE, ANDRES, legacy.fingerprint, legacy.text, UUID(501), NOW, NOW);
    attempt.run(OTHER_ATTEMPT, OTHER_SCENE, ANDRES, 'f'.repeat(64), '{"v":9,"nota":"ilegible"}', UUID(503), NOW, NOW);
    const before = db.prepare('SELECT count(*) AS n FROM scene_attempts').get();
    copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
    expect(runMigrations(db, migrationsDir)).toEqual([MIGRATION]);
    expect(db.prepare('SELECT count(*) AS n FROM scene_attempts').get()).toEqual(before);
    const scene = db.prepare('SELECT image_inputs_snapshot AS s, image_fingerprint AS f FROM home_scenes WHERE id = ?').get(SCENE) as { s: string; f: string };
    const done = db.prepare('SELECT inputs_snapshot AS s, fingerprint AS f FROM scene_attempts WHERE id = ?').get(ATTEMPT) as { s: string; f: string };
    for (const row of [scene, done]) {
      expect(FREE_TEXT_LEFTOVERS(row.s)).toBe(false);
      expect(JSON.parse(row.s).v).toBe(2);
      expect(row.f).toBe(computeFingerprint(parseInputsSnapshot(row.s)!));
      expect(row.f).not.toBe(legacy.fingerprint);
      expect(JSON.parse(row.s).pets.map((p: Record<string, unknown>) => Object.keys(p).sort())).toEqual([PET_KEYS, PET_KEYS]);
    }
    expect(db.prepare('SELECT image_inputs_snapshot AS s FROM home_scenes WHERE id = ?').get(OTHER_SCENE)).toEqual({ s: null });
    expect(db.prepare('SELECT inputs_snapshot AS s, fingerprint AS f FROM scene_attempts WHERE id = ?').get(OTHER_ATTEMPT)).toEqual({ s: '{"v":9,"nota":"ilegible"}', f: 'f'.repeat(64) });
    // La huella migrada es la que calcula la aplicación sobre las mismas mascotas (v2): la escena sin cambios no muestra cambios pendientes.
    const live = buildInputsSnapshot({ householdPhoto: 'household-photo-1', pets: [
      { id: UUID(1), species: 'OTHER', breedCode: null, sex: 'FEMALE', photo: 'avatar-1' },
      { id: UUID(2), species: 'CANINE', breedCode: 'DOG_CRIOLLA', sex: 'MALE', photo: null },
    ] });
    expect(scene.f).toBe(computeFingerprint(live));
    expect(countPendingChanges(parseInputsSnapshot(scene.s), live)).toBe(0);
  });

  it('[SC-011-015][P-3] es la migración 0030, la última de SQLite, no cambia el esquema y la base ya saneada no cambia al repetir el paso', () => {
    expect(readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort().at(-13)).toBe(MIGRATION); // 012: las 0033..0042 (0042 share_link_pets T1692, 0041 emergency_card T1673, 0040 retiro de IU T1658; co_ownership T1613, auditoría T1616, ámbitos rate limit B-4, dispute_evidence T1633, actores admin T1648, metadata H-01, care_mode T1652) son posteriores; 011 T1527: la 0031 (admin_delegates) y la 0032 (user_avatar, T1556) son posteriores
    const { db, migrationsDir } = previous();
    const tables = () => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    const schemaBefore = tables().filter((t) => (t as { name: string }).name !== 'schema_migrations');
    copyFileSync(join(DEFAULT_MIGRATIONS_DIR, MIGRATION), join(migrationsDir, MIGRATION));
    runMigrations(db, migrationsDir);
    expect(tables().filter((t) => (t as { name: string }).name !== 'schema_migrations')).toEqual(schemaBefore);
    MIGRATION_STEPS[MIGRATION]!(db);
    expect(runMigrations(db, migrationsDir)).toEqual([]);
  });
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const HAS_POSTGRES = TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '';

/** Esquema desechable de PostgreSQL: una URL con `search_path` propio, claves foráneas de la escena hacia hogares y usuarios retiradas (se conserva la cascada de intentos a escena) para sembrar filas sueltas y limpieza garantizada. */
async function withPostgresSchema(run: (ctx: { url: string; pool: PoolLike }) => Promise<void>): Promise<void> {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 2 });
  try {
    await run({ url: url.toString(), pool });
  } finally {
    await closePool(pool);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await closePool(admin);
  }
}
const PG_DIR = new URL('../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const PG_VERSION = '0026_scene_snapshot_v2';
/** Aplica las migraciones de PostgreSQL con el SQL real, en el esquema de la prueba (el migrador de producción fija `public`). `before` aplica solo las anteriores a la 0026; `step` solo la 0026 y su paso de datos; `all` todas. */
async function applyPostgresMigrations(pool: PoolLike, which: 'before' | 'step' | 'all'): Promise<void> {
  for (const name of postgresMigrationFiles()) {
    const isStep = name === `${PG_VERSION}.sql`;
    if ((isStep && which === 'before') || (!isStep && which === 'step')) continue;
    if (name === `${PG_VERSION}.sql`) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(readFileSync(new URL(name, PG_DIR), 'utf8'));
        await MIGRATION_STEPS_PG[PG_VERSION]!(client as unknown as MigratorClient); // el mismo paso de datos que ejecuta `scripts/migrate-postgres.ts` en la transacción de la migración
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    } else await pool.query(readFileSync(new URL(name, PG_DIR), 'utf8'));
  }
}
const dropSceneForeignKeys = async (pool: PoolLike): Promise<void> => {
  const found = await pool.query("SELECT conrelid::regclass::text AS t, conname AS c FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('home_scenes', 'scene_attempts') AND confrelid::regclass::text <> 'home_scenes'");
  for (const row of found.rows) await pool.query(`ALTER TABLE ${String(row['t'])} DROP CONSTRAINT ${String(row['c'])}`);
};

describe('P-3 · la migración PostgreSQL 0026 sanea las filas históricas y recalcula la huella (Q3; requiere TEST_DATABASE_URL)', () => {
  it.skipIf(!HAS_POSTGRES)('[SC-011-015][EDGE-011-018][P-3] sobre PostgreSQL real: tras 0026 no queda texto libre ni biografía, todas las filas son v2 y la huella coincide con la de la aplicación', async () => {
    await withPostgresSchema(async ({ pool }) => {
      const legacy = legacyV1();
      expect(postgresMigrationFiles().at(-12)).toBe('0026_scene_snapshot_v2.sql'); // 012: las 0029..0037 (0037 emergency_card T1673, 0036 retiro de IU T1658; co_ownership T1613, auditoría T1616, ámbitos B-4, dispute_evidence T1633, actores admin T1648, metadata H-01, care_mode T1652) son posteriores; 011 T1527: la 0027 (admin_delegates) y la 0028 (user_avatar, T1556) son posteriores
      await applyPostgresMigrations(pool, 'before');
      await dropSceneForeignKeys(pool);
      await pool.query("INSERT INTO home_scenes (id, household_id, owner_user_id, image_id, image_mime, image_size_bytes, image_fingerprint, image_inputs_snapshot, image_created_at, quota_window, created_at, updated_at) VALUES ($1, $2, NULL, $3, 'image/png', 10, $4, $5, $6, '2026-11', $6, $6)", [UUID(900), UUID(500), UUID(501), legacy.fingerprint, legacy.text, '2026-11-25T10:00:00.000Z']);
      await pool.query("INSERT INTO scene_attempts (id, scene_id, actor_user_id, action, mode, fingerprint, inputs_snapshot, result_object_id, phase, quota_window, quota_max, outcome, started_at, finished_at) VALUES ($1, $2, $3, 'UPDATE', 'FROM_SCRATCH', $4, $5, $6, 'DONE', '2026-11', 10, 'SUCCEEDED', $7, $7)", [UUID(901), UUID(900), ANDRES, legacy.fingerprint, legacy.text, UUID(501), '2026-11-25T10:00:00.000Z']);
      await applyPostgresMigrations(pool, 'step');
      const scene = (await pool.query('SELECT image_inputs_snapshot AS s, image_fingerprint AS f FROM home_scenes')).rows[0] as { s: string; f: string };
      const attempt = (await pool.query('SELECT inputs_snapshot AS s, fingerprint AS f FROM scene_attempts')).rows[0] as { s: string; f: string };
      for (const row of [scene, attempt]) {
        expect(FREE_TEXT_LEFTOVERS(row.s)).toBe(false);
        expect(JSON.parse(row.s).v).toBe(2);
        expect(row.f).toBe(computeFingerprint(parseInputsSnapshot(row.s)!));
        expect(row.f).not.toBe(legacy.fingerprint);
      }
      const repeat = await pool.connect();
      try {
        await MIGRATION_STEPS_PG[PG_VERSION]!(repeat as unknown as MigratorClient); // idempotente: repetir el paso no cambia nada
      } finally {
        repeat.release();
      }
      const again = (await pool.query('SELECT image_inputs_snapshot AS s, image_fingerprint AS f FROM home_scenes')).rows[0] as { s: string; f: string };
      expect(again).toEqual(scene);
    });
  }, 120_000);
});

/* ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ */
/* P-5 · purga de scene_attempts.inputs_snapshot a 30 días y borrado de la copia de home_scenes (REQ-IA11-004, EDGE-011-018; N2-11)                                           */
/* ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ */

const P5_NOW = '2026-11-18T12:00:00.000Z';
const DAY = 86_400_000;
const at = (ms: number): string => new Date(Date.parse(P5_NOW) + ms).toISOString();
const SCENE_ID = 'a1000000-0000-4000-8000-0000000000f1';
const p5Attempt = (n: number, over: Partial<SceneAttemptRecord> = {}): SceneAttemptRecord => ({
  id: `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sceneId: SCENE_ID,
  actorUserId: ANDRES,
  action: 'UPDATE',
  mode: 'FROM_SCRATCH',
  fingerprint: 'f'.repeat(64),
  inputsSnapshot: `{"v":2,"household":null,"pets":[],"marca":"SNAP-INTENTO-${n}"}`,
  resultObjectId: `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  phase: 'DONE',
  claimedAt: null,
  providerCallStartedAt: null,
  quotaWindow: '2026-11',
  quotaMax: 10,
  outcome: 'SUCCEEDED',
  errorCode: null,
  degraded: false,
  idempotencyKeyHash: null,
  idempotencyExpiresAt: null,
  startedAt: at(-40 * DAY),
  finishedAt: at(-40 * DAY),
  ...over,
});
const p5Image = (marker: string): NonNullable<SceneRecord['image']> => ({ id: `a4000000-0000-4000-8000-${String(marker.length).padStart(12, '0')}`, mime: 'image/png', sizeBytes: 10, fingerprint: 'a'.repeat(64), inputsSnapshot: `{"v":2,"household":null,"pets":[],"marca":"${marker}"}`, createdAt: P5_NOW });

describe('P-5 · purga de intentos a 30 días y borrado de la copia de home_scenes (memoria y SQLite; REQ-IA11-004, N2-11)', () => {
  const open: MediaEngine[] = [];
  afterEach(() => open.splice(0).forEach((e) => e.close()));
  async function eachEngine(run: (engine: MediaEngine) => Promise<void>): Promise<void> {
    for (const engine of await createMediaEngines(null)) {
      open.push(engine);
      engine.clock.setClock(P5_NOW.slice(0, 10), P5_NOW);
      await run(engine);
    }
  }
  const scene = (over: Partial<SceneRecord> = {}): SceneRecord => ({
    id: SCENE_ID, householdId: HOUSEHOLD.id, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: null, imageDegraded: false,
    consumedGenerations: 0, quotaWindow: '2026-11', createdAt: P5_NOW, updatedAt: P5_NOW, ...over,
  });

  it('[SC-011-015][EDGE-011-018][P-5] a los 30 días la purga borra la fila del intento y con ella su `inputs_snapshot`; el de 29 días y el vigente de la escena se conservan', async () => {
    await eachEngine(async (e) => {
      await e.run((r) => r.scenes.insert(scene()));
      const attempts = [p5Attempt(1, { finishedAt: at(-31 * DAY) }), p5Attempt(2, { finishedAt: at(-29 * DAY) }), p5Attempt(3, { outcome: 'FAILED', finishedAt: at(-45 * DAY) })];
      let n = 0;
      for (const a of attempts) {
        const now = at(-60 * DAY + n * 3_600_000);
        const begun = await e.run((r) => r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: a, now, leaseExpiresAt: at(-60 * DAY + n * 3_600_000 + 600_000) }));
        expect([e.name, a.id, begun]).toEqual([e.name, a.id, true]);
        n += 1;
      }
      expect((await purgeSceneData(e.deps)).attemptsPurged).toBe(1);
      const left = await e.run(async (r) => Promise.all(attempts.map((a) => r.scenes.findAttemptById(a.id))));
      expect([e.name, left.map((a) => a?.inputsSnapshot ?? null)]).toEqual([e.name, [null, attempts[1]!.inputsSnapshot, attempts[2]!.inputsSnapshot]]);
    });
  });

  it('[SC-011-015][EDGE-011-018][P-5] la copia `image_inputs_snapshot` de home_scenes se sobrescribe al reemplazar la imagen y desaparece al retirarla o al eliminar la escena', async () => {
    await eachEngine(async (e) => {
      await e.run((r) => r.scenes.insert(scene({ image: p5Image('COPIA-A') })));
      const attemptB = p5Attempt(7, { outcome: null, phase: 'RUNNING', finishedAt: null, startedAt: at(-1000) });
      expect(await e.run((r) => r.scenes.beginGeneration({ sceneId: SCENE_ID, attempt: attemptB, now: at(-1000), leaseExpiresAt: at(600_000) }))).toBe(true);
      const previous = await e.run((r) => r.scenes.publishImage({ sceneId: SCENE_ID, attemptId: attemptB.id, image: p5Image('COPIA-BB'), degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: P5_NOW }));
      expect([e.name, previous]).toEqual([e.name, p5Image('COPIA-A').id]);
      const replaced = await e.run((r) => r.scenes.findById(SCENE_ID));
      expect([e.name, replaced?.image?.inputsSnapshot.includes('COPIA-A'), replaced?.image?.inputsSnapshot.includes('COPIA-BB')]).toEqual([e.name, false, true]);
      expect(await e.run((r) => r.scenes.retireImage(SCENE_ID, P5_NOW))).toBe(p5Image('COPIA-BB').id);
      expect([e.name, (await e.run((r) => r.scenes.findById(SCENE_ID)))?.image]).toEqual([e.name, null]);
      await e.run((r) => r.scenes.publishImage({ sceneId: SCENE_ID, attemptId: attemptB.id, image: p5Image('COPIA-C'), degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: P5_NOW }));
      await e.run((r) => r.scenes.deleteScene(SCENE_ID));
      expect([e.name, await e.run((r) => r.scenes.findById(SCENE_ID))]).toEqual([e.name, null]);
    });
  });
});

describe('P-5 · lo mismo sobre PostgreSQL real (requiere TEST_DATABASE_URL)', () => {
  it.skipIf(!HAS_POSTGRES)('[SC-011-015][EDGE-011-018][P-5] PostgreSQL: purga de intentos a 30 días, reemplazo de la copia de home_scenes y borrado de la escena', async () => {
    await withPostgresSchema(async ({ pool }) => {
      await applyPostgresMigrations(pool, 'all');
      await dropSceneForeignKeys(pool);
      const client = await pool.connect();
      try {
        const repository = postgresSceneRepository(client);
        const household = UUID(700);
        await repository.insert({ id: SCENE_ID, householdId: household, ownerUserId: null, runState: null, currentAttemptId: null, leaseExpiresAt: null, image: p5Image('COPIA-A'), imageDegraded: false, consumedGenerations: 0, quotaWindow: '2026-11', createdAt: P5_NOW, updatedAt: P5_NOW });
        const attempts = [p5Attempt(1, { finishedAt: at(-31 * DAY) }), p5Attempt(2, { finishedAt: at(-29 * DAY) })];
        let n = 0;
        for (const a of attempts) {
          expect(await repository.beginGeneration({ sceneId: SCENE_ID, attempt: a, now: at(-60 * DAY + n * 3_600_000), leaseExpiresAt: at(-60 * DAY + n * 3_600_000 + 600_000) })).toBe(true);
          n += 1;
        }
        expect(await repository.purgeTerminalAttempts(at(-30 * DAY))).toBe(1);
        expect((await Promise.all(attempts.map((a) => repository.findAttemptById(a.id)))).map((a) => a?.inputsSnapshot ?? null)).toEqual([null, attempts[1]!.inputsSnapshot]);
        const running = p5Attempt(7, { outcome: null, phase: 'RUNNING', finishedAt: null, startedAt: at(-1000) });
        expect(await repository.beginGeneration({ sceneId: SCENE_ID, attempt: running, now: at(-1000), leaseExpiresAt: at(600_000) })).toBe(true);
        await repository.publishImage({ sceneId: SCENE_ID, attemptId: running.id, image: p5Image('COPIA-BB'), degraded: false, consumedGenerations: 1, quotaWindow: '2026-11', ownerUserIds: [ANDRES], now: P5_NOW });
        expect((await repository.findById(SCENE_ID))?.image?.inputsSnapshot.includes('COPIA-A')).toBe(false);
        expect(await repository.retireImage(SCENE_ID, P5_NOW)).toBe(p5Image('COPIA-BB').id);
        expect((await repository.findById(SCENE_ID))?.image).toBeNull();
        await repository.deleteScene(SCENE_ID);
        expect(await repository.findById(SCENE_ID)).toBeNull();
        expect((await pool.query("SELECT count(*)::int AS n FROM scene_attempts WHERE inputs_snapshot LIKE '%SNAP-INTENTO%'")).rows).toEqual([{ n: 0 }]);
      } finally {
        client.release();
      }
    });
  }, 120_000);
});
