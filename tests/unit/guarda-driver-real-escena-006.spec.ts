import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig, SCENE_REAL_DRIVER_ACTIVATED, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { loadAppConfigActivated, PROD_SCENE } from '../fixtures/scene-config-fixtures.ts';

/**
 * T879 de la Fase 8 (006): guarda del driver real. Es distinta de `t879-escena-sati-correcciones.spec.ts` (correcciones de /sati): aquí el arranque de producción
 * rechaza `fake`; `real` sin constante de activación, sin modelo o sin datos del proveedor no arranca; `VertexSceneImageGenerator` no existe como código
 * seleccionable (su implementación es la compuerta bloqueada T885); la suite no hace llamadas de red de IA.
 * REQ-ESC6-028, REQ-ESC6-031, REQ-ESC6-017; NFR-ESC6-001; SC-ESC6-025, SC-ESC6-043, SC-ESC6-050, SC-ESC6-060, SC-ESC6-061.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const SRC = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/generated'));
const PROD_BASE = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' };

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

describe('arranque: el driver real no se activa (REQ-ESC6-028, REQ-ESC6-031, SC-ESC6-025)', () => {
  it('[REQ-ESC6-031] la constante de activación del código es false', () => {
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(false);
  });

  it('[SC-ESC6-025] producción con driver fake o sin variable no arranca y solo nombra ARGOS_SCENE_DRIVER', () => {
    expect(failingVariables({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'fake' }, true)).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failingVariables({ ...PROD_BASE }, true)).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-031] real con todos los datos pero con la constante real del código (false) no arranca, ni en producción ni en pruebas', () => {
    expect(failingVariables({ ...PROD_BASE, ...PROD_SCENE })).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failingVariables({ NODE_ENV: 'test', ...PROD_SCENE })).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-028] real activado solo en el doble de prueba, pero sin modelo o sin proyecto del proveedor, no arranca y nombra solo esa variable', () => {
    const { ARGOS_SCENE_MODEL: _m, ...sinModelo } = PROD_SCENE;
    const { ARGOS_SCENE_PROJECT_ID: _p, ...sinProyecto } = PROD_SCENE;
    expect(failingVariables({ NODE_ENV: 'test', ...sinModelo }, true)).toEqual(['ARGOS_SCENE_MODEL']);
    expect(failingVariables({ NODE_ENV: 'test', ...sinProyecto }, true)).toEqual(['ARGOS_SCENE_PROJECT_ID']);
  });

  it('[REQ-ESC6-028][SC-ESC6-043] aun con la configuración activada en el doble, la composición se niega: no hay adaptador del proveedor que seleccionar', () => {
    const config = loadAppConfigActivated({ ...PROD_BASE, ...PROD_SCENE });
    expect(config.scene.driver).toBe('real');
    expect(() => composeSceneServices(config, { run: async () => 'NOOP' })).toThrow('ARGOS_SCENE_DRIVER=real no está disponible');
  });
});

describe('código: VertexSceneImageGenerator no existe seleccionable y no hay red de IA (SC-ESC6-050, SC-ESC6-061, REQ-ESC6-017)', () => {
  it('[SC-ESC6-050] ningún archivo de src/ declara una clase de generador del proveedor; el único implementador del puerto con comportamiento es el simulado', () => {
    const declaraProveedor = SRC.filter((f) => /\bclass\s+\w*(Vertex|Gemini)\w*/.test(read(f)));
    expect(declaraProveedor).toEqual([]);
    const implementadores = SRC.filter((f) => /implements\s+SceneImageGeneratorPort\b/.test(read(f))).sort();
    expect(implementadores).toEqual([
      'src/infrastructure/adapters/fake-scene-image-generator.adapter.ts',
      'src/infrastructure/adapters/null-scene-adapters.ts',
    ]);
  });

  it('[REQ-ESC6-017][SC-ESC6-061] src/ no importa SDK de IA ni google-auth-library ni nombra el endpoint de generación de imágenes del proveedor', () => {
    const prohibido = /from\s+['"](@google\/(genai|generative-ai)|@google-cloud\/(vertexai|aiplatform)|google-auth-library|openai|@anthropic-ai\/sdk)['"]|aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/;
    expect(SRC.filter((f) => prohibido.test(read(f)))).toEqual([]);
  });

  it('[SC-ESC6-050] package.json no declara ningún SDK de IA ni google-auth-library como dependencia directa', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const nombres = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(nombres.filter((n) => /vertex|genai|generative-ai|aiplatform|openai|anthropic|google-auth-library/.test(n))).toEqual([]);
  });

  it('[SC-ESC6-061] el despliegue fija el driver en fake y nunca lo pone en real', () => {
    const wf = read('.github/workflows/deploy-argos.yml');
    expect(/ARGOS_SCENE_DRIVER=real|ARGOS_SCENE_DRIVER:\s*['"]?real/.test(wf)).toBe(false);
  });

  it('[SC-ESC6-043][SC-ESC6-060] el plan declara el adaptador real como no activable hasta tener los datos del proveedor con fuente', () => {
    const plan = read('specs/006-escena-hogar-pixel-art/spec.md');
    expect(/REQ-ESC6-028/.test(plan) && /no activable/.test(plan)).toBe(true);
  });
});
