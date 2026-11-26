import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig, SCENE_REAL_DRIVER_ACTIVATED, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { loadAppConfigActivated, PROD_SCENE } from '../fixtures/scene-config-fixtures.ts';

/**
 * T879 de la Fase 8 (006): guarda del driver real. Es distinta de `t879-escena-sati-correcciones.spec.ts` (correcciones de /sati): aquí el arranque de producción
 * rechaza `fake`; `real` sin constante de activación, sin modelo o sin datos del proveedor no arranca; `VertexSceneImageGenerator` solo existe en su archivo (Fase 14); la
 * activación efectiva sigue bloqueada por T885; la suite no hace llamadas de red de IA.
 * REQ-ESC6-028, REQ-ESC6-031, REQ-ESC6-017; NFR-ESC6-001; SC-ESC6-025, SC-ESC6-043, SC-ESC6-050, SC-ESC6-060, SC-ESC6-061.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const SRC = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/generated'));
/**
 * T889 (tramo `gemini-api`, REQ-ESC6-037, INV-ESC6-020; SC-ESC6-101): lista blanca ESTRICTA por ruta. Solo estos dos archivos pueden contener el literal del host de la
 * Developer API y declarar la clase `GeminiApiSceneImageGenerator`; nada más se relaja (Vertex, SDK de IA, `google-auth-library` y producción siguen prohibidos).
 */
const GEMINI_API_ALLOWED = [
  'src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts',
  'src/infrastructure/adapters/gemini-api-wire.ts',
] as const;
const GEMINI_API_ADAPTER = GEMINI_API_ALLOWED[0];
/** Fase 14 (T946, D6-22): el adaptador Vertex es el ÚNICO archivo que declara su clase y nombra el host `aiplatform.googleapis.com`. */
const VERTEX_ADAPTER = 'src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';
const outsideAllowlist = (f: string): boolean => !(GEMINI_API_ALLOWED as readonly string[]).includes(f);
const PROD_BASE = { NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' };

function failingVariables(env: EnvironmentSource, activated?: boolean): readonly string[] {
  try {
    if (activated === undefined) loadAppConfig(env);
    else loadAppConfig(env, { sceneRealDriverActivated: activated });
  } catch (error) {
    if (error instanceof AppConfigError) return error.variables;
    throw error;
  }
  return ['sin error'];
}

describe('arranque: guarda del driver real, activado por T885 (REQ-ESC6-028, REQ-ESC6-031, SC-ESC6-025)', () => {
  it('[REQ-ESC6-031] la constante de activación del código es true (T885)', () => {
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(true);
  });

  it('[SC-ESC6-025] producción con driver fake o sin variable no arranca y solo nombra ARGOS_SCENE_DRIVER', () => {
    expect(failingVariables({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'fake' }, true)).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failingVariables({ ...PROD_BASE }, true)).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-031] real con todos los datos y la constante real del código (true) arranca; con sceneRealDriverActivated: false no arranca, ni en producción ni en pruebas', () => {
    expect(failingVariables({ ...PROD_BASE, ...PROD_SCENE })).toEqual(['sin error']);
    expect(failingVariables({ NODE_ENV: 'test', ...PROD_SCENE })).toEqual(['sin error']);
    expect(failingVariables({ ...PROD_BASE, ...PROD_SCENE }, false)).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failingVariables({ NODE_ENV: 'test', ...PROD_SCENE }, false)).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-028] real activado solo en el doble de prueba, pero sin modelo o sin proyecto del proveedor, no arranca y nombra solo esa variable', () => {
    const { ARGOS_SCENE_MODEL: _m, ...sinModelo } = PROD_SCENE;
    const { ARGOS_SCENE_PROJECT_ID: _p, ...sinProyecto } = PROD_SCENE;
    expect(failingVariables({ NODE_ENV: 'test', ...sinModelo }, true)).toEqual(['ARGOS_SCENE_MODEL']);
    expect(failingVariables({ NODE_ENV: 'test', ...sinProyecto }, true)).toEqual(['ARGOS_SCENE_PROJECT_ID']);
  });

  it('[REQ-ESC6-028][SC-ESC6-043] con la configuración activada en el doble la composición exige el tope global (T952): sin él no se compone; la activación efectiva es la constante del código (true)', () => {
    const config = loadAppConfigActivated({ ...PROD_BASE, ...PROD_SCENE });
    expect(config.scene.driver).toBe('real');
    expect(() => composeSceneServices(config, { run: async () => 'NOOP' })).toThrow('Configuración del driver real incompleta');
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(true);
  });
});

describe('código: VertexSceneImageGenerator solo en su archivo y no hay SDK de IA (SC-ESC6-050, SC-ESC6-061, REQ-ESC6-017)', () => {
  it('[SC-ESC6-050][SC-ESC6-101] ninguna clase Vertex ni Gemini en src/ salvo GeminiApiSceneImageGenerator y VertexSceneImageGenerator cada una en su archivo; los implementadores del puerto son el simulado, el nulo y esos dos adaptadores', () => {
    const declaraProveedor = SRC.filter((f) => /\bclass\s+\w*(Vertex|Gemini)\w*/.test(read(f))).sort();
    expect(declaraProveedor).toEqual([GEMINI_API_ADAPTER, VERTEX_ADAPTER].filter((f) => SRC.includes(f)).sort());
    expect(read(GEMINI_API_ADAPTER).match(/\bclass\s+\w*(?:Vertex|Gemini)\w*/g)).toEqual(['class GeminiApiSceneImageGenerator']);
    expect(read(VERTEX_ADAPTER).match(/\bclass\s+\w*(?:Vertex|Gemini)\w*/g)).toEqual(['class VertexSceneImageGenerator']);
    expect(SRC.filter((f) => /\bGeminiApiSceneImageGenerator\b/.test(read(f)) && outsideAllowlist(f))).toEqual([]);
    expect(SRC.filter((f) => /import[^;]*\bVertexSceneImageGenerator\b|new\s+VertexSceneImageGenerator/.test(read(f)) && f !== VERTEX_ADAPTER)).toEqual([]); // la composición solo importa la fábrica
    const implementadores = SRC.filter((f) => /implements\s+SceneImageGeneratorPort\b/.test(read(f))).sort();
    expect(implementadores).toEqual(
      [
        'src/infrastructure/adapters/fake-scene-image-generator.adapter.ts',
        'src/infrastructure/adapters/null-scene-adapters.ts',
        'src/infrastructure/adapters/scene-provider-router.adapter.ts', // T1314: enrutador por proveedor (no declara clase Vertex ni Gemini)
        ...(SRC.includes(GEMINI_API_ADAPTER) ? [GEMINI_API_ADAPTER] : []),
        VERTEX_ADAPTER,
      ].sort(),
    );
  });

  it('[REQ-ESC6-017][SC-ESC6-061] src/ no importa SDK de IA ni google-auth-library, y aiplatform.googleapis.com solo aparece en el adaptador Vertex (T946, fetch nativo)', () => {
    const sdk = /from\s+['"](@google\/(genai|generative-ai)|@google-cloud\/(vertexai|aiplatform)|google-auth-library|openai|@anthropic-ai\/sdk)['"]/;
    expect(SRC.filter((f) => sdk.test(read(f)))).toEqual([]);
    expect(SRC.filter((f) => /aiplatform\.googleapis\.com/.test(read(f)))).toEqual([VERTEX_ADAPTER]);
  });

  it('[SC-ESC6-101][INV-ESC6-020] el literal generativelanguage.googleapis.com solo aparece en los archivos de la lista blanca del adaptador gemini-api', () => {
    expect(SRC.filter((f) => /generativelanguage\.googleapis\.com/.test(read(f)) && outsideAllowlist(f))).toEqual([]);
  });

  it('[SC-ESC6-050] package.json no declara ningún SDK de IA ni google-auth-library como dependencia directa', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const nombres = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(nombres.filter((n) => /vertex|genai|generative-ai|aiplatform|openai|anthropic|google-auth-library/.test(n))).toEqual([]);
  });

  it('[SC-ESC6-061] el despliegue fija el driver en real (T952, D6-22) y la activación efectiva (true, T885) está atada a la constante del código', () => {
    const wf = read('.github/workflows/deploy-argos.yml');
    expect(/ARGOS_SCENE_DRIVER=real/.test(wf)).toBe(true);
    expect(/ARGOS_SCENE_DRIVER=fake/.test(wf)).toBe(false);
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(true);
  });

  it('[SC-ESC6-043][SC-ESC6-060] el plan declara el adaptador real como no activable hasta tener los datos del proveedor con fuente', () => {
    const plan = read('specs/006-escena-hogar-pixel-art/spec.md');
    expect(/REQ-ESC6-028/.test(plan) && /no activable/.test(plan)).toBe(true);
  });
});
