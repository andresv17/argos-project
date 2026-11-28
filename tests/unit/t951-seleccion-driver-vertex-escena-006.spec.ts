import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneGlobalQuotaPort } from '../../src/application/ports/scene-global-quota.port.ts';
import { SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../src/domain/scene/notice.ts';
import { SCENE_PARAM_MODEL_KEY, SceneParameterError } from '../../src/domain/scene/provider-parameters.ts';
import { CloudTasksSceneDispatcher } from '../../src/infrastructure/adapters/cloud-tasks-scene-dispatcher.adapter.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { InProcessSceneDispatcher } from '../../src/infrastructure/adapters/in-process-scene-dispatcher.adapter.ts';
import { SceneProviderRouter } from '../../src/infrastructure/adapters/scene-provider-router.adapter.ts';
import { AppConfigError, SCENE_REAL_DRIVER_ACTIVATED, loadAppConfig, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';
import { createProductionApp } from '../../src/infrastructure/http/server.ts';
import { openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { loadAppConfigActivated } from '../fixtures/scene-config-fixtures.ts';

/**
 * T951 (006, Fase 14, D6-22): selección del driver. `app-config.ts` y `scene-composition.ts` aceptan `real`, `fake` y `gemini-api`; producción rechaza `fake` y `gemini-api`;
 * `real` sin modelo, región o constante de activación falla en el arranque; CI y pruebas fijan `fake` y no hacen red; el workflow define `ARGOS_SCENE_DRIVER=real`,
 * `ARGOS_SCENE_MODEL=gemini-2.5-flash-image` y `ARGOS_SCENE_LOCATION=us-central1` sin ningún secreto de API. REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001.
 */
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const PROD_BASE = { NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' };
const REAL = {
  ARGOS_SCENE_DRIVER: 'real',
  ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image',
  ARGOS_SCENE_LOCATION: 'us-central1',
  ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
  ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com',
  ARGOS_SCENE_WORKER_URL: 'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
};
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const failing = (env: EnvironmentSource, activated: boolean | null = true): readonly string[] => {
  try {
    if (activated === null) loadAppConfig(env);
    else loadAppConfig(env, { sceneRealDriverActivated: activated });
  } catch (error) {
    if (error instanceof AppConfigError) return error.variables;
    throw error;
  }
  return ['sin error'];
};
const DEV = { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32) };
const grantingQuota = (): SceneGlobalQuotaPort => ({ tryConsume: async () => true, refund: async () => undefined, isExhausted: async () => false });

describe('selección en app-config.ts (REQ-ESC6-031)', () => {
  it.each(['fake', 'real', 'gemini-api'])('[REQ-ESC6-031] el driver %s es un valor admitido por el esquema (fuera de producción)', (driver) => {
    const env = driver === 'gemini-api' ? { ...DEV, ARGOS_SCENE_DRIVER: driver, GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' } : driver === 'real' ? { NODE_ENV: 'test', ...REAL } : { NODE_ENV: 'test', ARGOS_SCENE_DRIVER: driver };
    expect(loadAppConfig(env, { sceneRealDriverActivated: true }).scene.driver).toBe(driver);
  });

  it('[REQ-ESC6-031] producción rechaza fake y gemini-api y solo nombra ARGOS_SCENE_DRIVER; real activado arranca', () => {
    expect(failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'fake' })).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' })).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ ...PROD_BASE, ...REAL })).toEqual(['sin error']);
  });

  it('[REQ-ESC6-031] real sin modelo, sin región o sin proyecto no arranca y nombra solo esa variable', () => {
    const { ARGOS_SCENE_MODEL: _m, ...sinModelo } = REAL;
    const { ARGOS_SCENE_LOCATION: _l, ...sinRegion } = REAL;
    const { ARGOS_SCENE_PROJECT_ID: _p, ...sinProyecto } = REAL;
    expect(failing({ NODE_ENV: 'test', ...sinModelo })).toEqual(['ARGOS_SCENE_MODEL']);
    expect(failing({ NODE_ENV: 'test', ...sinRegion })).toEqual(['ARGOS_SCENE_LOCATION']);
    expect(failing({ NODE_ENV: 'test', ...sinProyecto })).toEqual(['ARGOS_SCENE_PROJECT_ID']);
  });

  it('[REQ-ESC6-031] con la constante de activación del código en true (T885) real arranca por defecto; con sceneRealDriverActivated: false no arranca', () => {
    expect(SCENE_REAL_DRIVER_ACTIVATED).toBe(true);
    expect(failing({ ...PROD_BASE, ...REAL }, null)).toEqual(['sin error']);
    expect(failing({ ...PROD_BASE, ...REAL }, false)).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ NODE_ENV: 'test', ...REAL }, false)).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-031][NFR-ESC6-001][D9-30] con real el entorno no necesita ninguna clave de API (Vertex usa la cuenta de servicio); GEMINI_API_KEY es opcional (proveedor gemini-api seleccionable) y nunca entra en JSON', () => {
    expect(loadAppConfig({ NODE_ENV: 'test', ...REAL }, { sceneRealDriverActivated: true }).scene.geminiApiKey).toBeNull();
    const config = loadAppConfig({ NODE_ENV: 'test', ...REAL, GEMINI_API_KEY: KEY }, { sceneRealDriverActivated: true });
    expect(config.scene.geminiApiKey).toBe(KEY);
    expect(JSON.stringify(config).includes(KEY)).toBe(false);
  });

  it('[REQ-ESC6-031] CI y pruebas fijan fake: sin variable el driver es fake y el entorno de vitest no define real', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).scene.driver).toBe('fake');
    expect(process.env['ARGOS_SCENE_DRIVER'] === undefined || process.env['ARGOS_SCENE_DRIVER'] === 'fake').toBe(true);
    const ci = [read('.github/workflows/test-gate.yml'), read('.github/workflows/code-quality.yml'), read('.github/workflows/auto-pr.yml')].join('\n');
    expect(/ARGOS_SCENE_DRIVER\s*[:=]\s*['"]?real/.test(ci)).toBe(false);
  });
});

describe('composición del driver real en scene-composition.ts (REQ-ESC6-017, REQ-ESC6-031)', () => {
  const config = () => loadAppConfigActivated({ ...PROD_BASE, ...REAL });
  const noNetwork = vi.fn(async () => {
    throw new Error('la composición no debe llamar a la red');
  }) as unknown as typeof fetch;

  it('[REQ-ESC6-017] real compone VertexSceneImageGenerator, despachador de Cloud Tasks, realDriver true y el aviso final de Vertex; sin llamadas de red al componer', () => {
    const quota = grantingQuota();
    const services = composeSceneServices(config(), { run: async () => 'NOOP', fetch: noNetwork, globalQuota: quota });
    expect(services.generator).toBeInstanceOf(SceneProviderRouter); // T1314: el enrutador compone Vertex (y gemini-api si hay clave)
    expect(services.generator).not.toBeInstanceOf(FakeSceneImageGenerator);
    expect(services.dispatcher).toBeInstanceOf(CloudTasksSceneDispatcher);
    expect(services.realDriver).toBe(true);
    expect([services.providerId, services.noticeVersion]).toEqual([SCENE_PROVIDER_ID, SCENE_NOTICE_VERSION]);
    expect(services.globalQuota).toBe(quota);
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it('[REQ-ESC6-017] el generador usa el modelo y la región de los parámetros resueltos (platform_parameters) y el proyecto de la configuración, con el token de metadata simulado', async () => {
    const urls: string[] = [];
    const png = await new FakeSceneImageGenerator().generate({ prompt: 'x', references: [], seed: 0, signal: new AbortController().signal });
    if (!png.ok) throw new Error('sin imagen simulada');
    const fetchDouble = (async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).startsWith('http://metadata.google.internal/')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3000 }));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(png.image.bytes).toString('base64') } }] } }] }));
    }) as typeof fetch;
    const services = composeSceneServices(config(), {
      run: async () => 'NOOP',
      fetch: fetchDouble,
      globalQuota: grantingQuota(),
      providerParameters: { model: 'gemini-3.1-flash-image', location: 'global', globalQuotaMax: 5 },
    });
    const result = await services.generator.generate({ prompt: 'p', references: [], seed: 0, signal: new AbortController().signal });
    expect(result.ok).toBe(true);
    expect(urls[1]).toBe('https://aiplatform.googleapis.com/v1/projects/argos-prod-1234/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent');
  });

  it('[REQ-ESC6-017] sin parámetros resueltos rige el respaldo de la configuración (modelo y región del entorno)', async () => {
    const urls: string[] = [];
    const fetchDouble = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    const services = composeSceneServices(config(), { run: async () => 'NOOP', fetch: fetchDouble, getAccessToken: async () => 'tok', globalQuota: grantingQuota() });
    await services.generator.generate({ prompt: 'p', references: [], seed: 0, signal: new AbortController().signal });
    expect(urls).toEqual(['https://us-central1-aiplatform.googleapis.com/v1/projects/argos-prod-1234/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent']);
  });

  it('[REQ-ESC6-031] real sin puerto de cuota global falla la composición (no se arranca sin tope de gasto)', () => {
    expect(() => composeSceneServices(config(), { run: async () => 'NOOP', fetch: noNetwork })).toThrow('Configuración del driver real incompleta');
  });

  it('[REQ-ESC6-031] la composición de real no recibe ni lee clave de API alguna (el campo geminiApiKey no interviene)', () => {
    const source = read('src/infrastructure/http/scene-composition.ts');
    expect(/process\.env|GEMINI_API_KEY|x-goog-api-key/.test(source.replace(/\/\*\*[\s\S]*?\*\//g, ''))).toBe(false);
  });

  it('[REQ-ESC6-031] fake y gemini-api siguen componiéndose como antes y no reciben cuota global', () => {
    const fake = composeSceneServices(loadAppConfig({ NODE_ENV: 'test' }), { run: async () => 'NOOP' });
    expect([fake.generator instanceof FakeSceneImageGenerator, fake.realDriver, fake.globalQuota, fake.dispatcher instanceof InProcessSceneDispatcher]).toEqual([true, false, undefined, true]);
    const gemini = composeSceneServices(loadAppConfig({ ...DEV, ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: 'gemini-2.5-flash-image' }), { run: async () => 'NOOP', fetch: noNetwork });
    expect([gemini.realDriver, gemini.globalQuota]).toEqual([true, undefined]);
  });
});

describe('arranque con real: parámetros de platform_parameters (createProductionApp)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const start = async (rows: Record<string, string> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t951-'));
    dirs.push(dir);
    const databasePath = join(dir, 'argos.sqlite');
    const db = openSqliteDatabase(databasePath);
    for (const [key, value] of Object.entries(rows)) db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES (?, ?, 'prueba', '2026-11-20T00:00:00.000Z')").run(key, value);
    db.close();
    const cfg = loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: databasePath, ...REAL }, { sceneRealDriverActivated: true });
    return createProductionApp(cfg, false, {});
  };

  it('[REQ-ESC6-031] una fila de modelo sin par con coste de fuente (D9-29: la región se deriva) rechaza el arranque con la clave y sin el valor', async () => {
    const error = await start({ [SCENE_PARAM_MODEL_KEY]: 'gemini-evil-example' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SceneParameterError);
    expect(String((error as Error).message)).toContain(SCENE_PARAM_MODEL_KEY);
    expect(String((error as Error).message).includes('gemini-evil-example')).toBe(false);
  });

  it('[REQ-ESC6-017] con filas válidas (o sin ellas) la aplicación arranca con el driver real y cierra limpia', async () => {
    const app = await start({ [SCENE_PARAM_MODEL_KEY]: 'gemini-2.5-flash-image' }); // D9-29: la region se deriva del modelo
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    await app.close();
    const app2 = await start();
    expect((await app2.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    await app2.close();
  });
});

describe('workflow de despliegue (deploy-argos.yml, REQ-ESC6-031, NFR-ESC6-001)', () => {
  const wf = read('.github/workflows/deploy-argos.yml');
  const envVars = /--set-env-vars\s+"([^"]+)"/.exec(wf)?.[1] ?? '';
  const val = (name: string): string | undefined => new RegExp(`(?:^|,)${name}=([^,]*)`).exec(envVars)?.[1];

  it('[REQ-ESC6-031] fija ARGOS_SCENE_DRIVER=real, ARGOS_SCENE_MODEL=gemini-2.5-flash-image y ARGOS_SCENE_LOCATION=us-central1', () => {
    expect(val('ARGOS_SCENE_DRIVER')).toBe('real');
    expect(val('ARGOS_SCENE_MODEL')).toBe('gemini-2.5-flash-image');
    expect(val('ARGOS_SCENE_LOCATION')).toBe('us-central1');
    expect(val('ARGOS_SCENE_PROJECT_ID')).toBe('${PROJECT_ID}');
  });

  it('[NFR-ESC6-001] no define ningún secreto ni variable de API de Gemini: ni GEMINI_API_KEY, ni x-goog-api-key, ni Secret Manager para el proveedor', () => {
    // D9-30 (8) / T1316: GEMINI_API_KEY se inyecta solo como secreto opcional por versión numérica (GEMINI_SECRET_FLAG); nunca valor, x-goog-api-key ni latest.
    expect(/x-goog-api-key|GOOGLE_API_KEY|generativelanguage/i.test(wf)).toBe(false);
    expect(wf).not.toMatch(/argos-gemini-api-key:latest/);
    expect(wf).toMatch(/GEMINI_SECRET_FLAG=""/);
    expect(wf).toMatch(/GEMINI_SECRET_FLAG=",GEMINI_API_KEY=argos-gemini-api-key:\$\{GEMINI_API_KEY_VERSION\}"/);
    const secrets = /--set-secrets\s+"([^"]+)"/.exec(wf)?.[1] ?? '';
    // Feature 012, Bloque D: la clave de la ficha QR (PHONE_HMAC_KEY) también es opcional por versión; va después de la de Gemini.
    // H-01: ARGOS_ORIGIN_VERIFY_SECRET (opcional por versión numérica) va después de la de la ficha QR.
    expect(secrets.endsWith('${GEMINI_SECRET_FLAG}${PHONE_SECRET_FLAG}${ORIGIN_VERIFY_SECRET_FLAG}')).toBe(true);
    expect(secrets.replace('${GEMINI_SECRET_FLAG}${PHONE_SECRET_FLAG}${ORIGIN_VERIFY_SECRET_FLAG}', '').split(',').map((s) => s.split('=')[0])).toEqual(['DATABASE_URL', 'ARGOS_AUDIT_HMAC_SECRET', 'ARGOS_SHARE_IP_HMAC_SECRET', 'GOOGLE_OAUTH_CLIENT_SECRET', 'ARGOS_ADMIN_EMAILS']);
  });

  it('[REQ-ESC6-031] sigue sin variables de otros drivers: ni gemini-api ni fake en el despliegue', () => {
    expect(/ARGOS_SCENE_DRIVER=(fake|gemini-api)/.test(wf)).toBe(false);
    expect(/ARGOS_SCENE_GEMINI_MODEL/.test(wf)).toBe(false);
  });

  it('[NFR-ESC6-001] la activación efectiva queda atada a la fusión: el workflow de despliegue conserva el entorno produccion y los demás workflows no fijan real', () => {
    expect(wf).toMatch(/environment:\s*produccion/);
    for (const file of readdirSync(join(root, '.github/workflows')).filter((f) => f.endsWith('.yml') && f !== 'deploy-argos.yml')) expect(/ARGOS_SCENE_DRIVER\s*[=:]\s*['"]?real/.test(read(`.github/workflows/${file}`))).toBe(false);
  });
});
