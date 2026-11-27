import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as configModule from '../../src/infrastructure/config/app-config.ts';
import { AppConfigError, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';

/** Vista de la parte de la 006 de `AppConfig` (T830): hasta entonces `scene` no existe y estas pruebas están rojas, sin romper la compilación. */
interface SceneConfigView {
  readonly driver: 'fake' | 'real';
  readonly maxPets: number;
  readonly quotaMax: number;
  readonly genTimeoutSeconds: number;
  readonly leaseSeconds: number;
  readonly queueWaitSeconds: number;
  readonly model: string | null;
  readonly queue: string;
  readonly tasksServiceAccountEmail: string | null;
  readonly workerUrl: string | null;
  readonly projectId: string | null;
}
interface LoadOptions {
  readonly sceneRealDriverActivated?: boolean;
}
const loadAppConfig = configModule.loadAppConfig as unknown as (env?: EnvironmentSource, options?: LoadOptions) => { readonly scene: SceneConfigView };
const SCENE_QUEUE_WAIT_SECONDS = (configModule as unknown as Record<string, unknown>)['SCENE_QUEUE_WAIT_SECONDS'];
const sceneLeaseSeconds = (configModule as unknown as Record<string, (tGen: number) => number>)['sceneLeaseSeconds'] as (tGen: number) => number;

/**
 * T829 (006, Fase 3): las 9 variables `ARGOS_SCENE_*` de `app-config.ts` y las constantes `T_LEASE = T_GEN + 60` y `T_QUEUE = 600`. Único lector de
 * `ARGOS_SCENE_*` (INV-ARCH-006). Fuera de rango o inválida impide arrancar y el error nombra solo la variable; `real` exige modelo, proyecto y la constante de
 * activación; en producción `fake` se rechaza; `ARGOS_SCENE_WORKER_URL` se valida (INV-ESC6-018); `ARGOS_SCENE_GLOBAL_QUOTA_MAX` y `ARGOS_SCENE_LOCATION` se leen desde la Fase 14 (T948) como respaldo de platform_parameters.
 * INV-ESC6-013, INV-ESC6-018; REQ-ESC6-031, REQ-ESC6-011; SC-ESC6-034, SC-ESC6-092, SC-ESC6-087, SC-ESC6-025.
 */
const SECRET = '1f'.repeat(32);
const PROD_BASE = { NODE_ENV: 'production', ARGOS_ADMIN_EMAILS: 'admin.raiz@example.test', ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet', ARGOS_AUDIT_HMAC_SECRET: SECRET, ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' };
const SCENE_REAL = {
  ARGOS_SCENE_DRIVER: 'real',
  ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image',
  ARGOS_SCENE_LOCATION: 'us-central1',
  ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
  ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com',
  ARGOS_SCENE_WORKER_URL: 'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
};
const ACTIVATED = { sceneRealDriverActivated: true };

const test = (env: EnvironmentSource = {}) => loadAppConfig({ NODE_ENV: 'test', ...env });
const PLAIN = (env: EnvironmentSource = {}): unknown => test(env);
function failing(env: EnvironmentSource, options?: LoadOptions): { variables: readonly string[]; message: string } {
  try {
    loadAppConfig(env, options);
  } catch (error) {
    if (error instanceof AppConfigError) return { variables: error.variables, message: error.message };
    throw error;
  }
  return { variables: ['sin error'], message: '' };
}

describe('valores por defecto de ARGOS_SCENE_* (T829, plan §1.3, REQ-ESC6-031)', () => {
  it('[INV-ESC6-013] sin variables: driver fake, 8 mascotas, cuota 10, T_GEN 90 s, cola argos-scene y lo demás nulo', () => {
    expect(test().scene).toEqual({
      driver: 'fake',
      maxPets: 8,
      quotaMax: 10,
      genTimeoutSeconds: 90,
      leaseSeconds: 150,
      queueWaitSeconds: 600,
      model: null,
      queue: 'argos-scene',
      tasksServiceAccountEmail: null,
      workerUrl: null,
      projectId: null,
      location: null,
      globalQuotaMax: 5,
      geminiModel: null, // T891: campo del driver gemini-api; la clave no es enumerable y por eso no figura aquí
    });
  });

  it('[INV-ESC6-013] las variables vacías toman el valor por defecto', () => {
    expect(test({ ARGOS_SCENE_MAX_PETS: '', ARGOS_SCENE_QUOTA_MAX: '', ARGOS_SCENE_GEN_TIMEOUT_SECONDS: '', ARGOS_SCENE_DRIVER: '' }).scene).toEqual(test().scene);
  });

  it('[INV-ARCH-006] .env.example documenta las 9 variables ARGOS_SCENE_* (las 3 sin valor, comentadas) y no la cuota global', () => {
    const example = readFileSync('.env.example', 'utf8');
    for (const name of ['ARGOS_SCENE_DRIVER', 'ARGOS_SCENE_MAX_PETS', 'ARGOS_SCENE_QUOTA_MAX', 'ARGOS_SCENE_GEN_TIMEOUT_SECONDS', 'ARGOS_SCENE_MODEL', 'ARGOS_SCENE_QUEUE', 'ARGOS_SCENE_TASKS_SA_EMAIL', 'ARGOS_SCENE_WORKER_URL', 'ARGOS_SCENE_PROJECT_ID']) {
      expect(example).toContain(name);
    }
    expect(example).toMatch(/^# ARGOS_SCENE_GLOBAL_QUOTA_MAX=$/m); // Fase 14 (T948): solo comentada, sin valor
    expect(example).toMatch(/^ARGOS_SCENE_DRIVER=fake$/m);
  });
});

describe('rangos de ARGOS_SCENE_* (T829, INV-ESC6-013, SC-ESC6-034, SC-ESC6-092)', () => {
  it.each([
    ['ARGOS_SCENE_MAX_PETS', '0'],
    ['ARGOS_SCENE_MAX_PETS', '33'],
    ['ARGOS_SCENE_MAX_PETS', '1.5'],
    ['ARGOS_SCENE_MAX_PETS', '08'],
    ['ARGOS_SCENE_QUOTA_MAX', '0'],
    ['ARGOS_SCENE_QUOTA_MAX', '51'],
    ['ARGOS_SCENE_GEN_TIMEOUT_SECONDS', '9'],
    ['ARGOS_SCENE_GEN_TIMEOUT_SECONDS', '106'],
    ['ARGOS_SCENE_GEN_TIMEOUT_SECONDS', '-1'],
    ['ARGOS_SCENE_DRIVER', 'otro'],
    ['ARGOS_SCENE_DRIVER', 'FAKE'],
  ])('[SC-ESC6-034][SC-ESC6-092] %s=%s impide arrancar y el error nombra solo la variable', (name, value) => {
    const result = failing({ NODE_ENV: 'test', [name]: value });
    expect(result.variables).toEqual([name]);
    expect(result.message).not.toContain(value === '' ? 'nunca' : `=${value}`);
  });

  it.each([
    ['ARGOS_SCENE_MAX_PETS', '1', 'maxPets', 1],
    ['ARGOS_SCENE_MAX_PETS', '32', 'maxPets', 32],
    ['ARGOS_SCENE_QUOTA_MAX', '1', 'quotaMax', 1],
    ['ARGOS_SCENE_QUOTA_MAX', '50', 'quotaMax', 50],
    ['ARGOS_SCENE_GEN_TIMEOUT_SECONDS', '10', 'genTimeoutSeconds', 10],
    ['ARGOS_SCENE_GEN_TIMEOUT_SECONDS', '105', 'genTimeoutSeconds', 105],
  ] as const)('[INV-ESC6-013] %s=%s (límite válido) se convierte a número en scene.%s', (name, value, field, expected) => {
    expect(test({ [name]: value }).scene[field]).toBe(expected);
  });

  it('[SC-ESC6-034] ARGOS_SCENE_MAX_PETS=0 hace fallar la validación y el servicio no inicia', () => {
    expect(() => test({ ARGOS_SCENE_MAX_PETS: '0' })).toThrow(AppConfigError);
  });

  it('[SC-ESC6-092] con varias variables fuera de rango se listan todas, solo por nombre y en orden estable', () => {
    expect(failing({ NODE_ENV: 'test', ARGOS_SCENE_QUOTA_MAX: '51', ARGOS_SCENE_GEN_TIMEOUT_SECONDS: '106' }).variables).toEqual(['ARGOS_SCENE_QUOTA_MAX', 'ARGOS_SCENE_GEN_TIMEOUT_SECONDS']);
  });
});

describe('constantes de tiempo (T829, INV-ESC6-013, SC-ESC6-092)', () => {
  it('[INV-ESC6-013] T_QUEUE = 600 s y T_LEASE = T_GEN + 60 s (150 s con T_GEN = 90)', () => {
    expect(SCENE_QUEUE_WAIT_SECONDS).toBe(600);
    expect(sceneLeaseSeconds(90)).toBe(150);
    expect([10, 105].map((gen) => sceneLeaseSeconds(gen))).toEqual([70, 165]);
  });

  it('[INV-ESC6-013] scene.leaseSeconds sigue a ARGOS_SCENE_GEN_TIMEOUT_SECONDS y cumple T_LEASE >= T_GEN + 30 s', () => {
    for (const gen of [10, 60, 90, 105]) {
      const scene = test({ ARGOS_SCENE_GEN_TIMEOUT_SECONDS: String(gen) }).scene;
      expect([scene.leaseSeconds, scene.leaseSeconds >= scene.genTimeoutSeconds + 30, scene.queueWaitSeconds]).toEqual([gen + 60, true, 600]);
    }
  });

  it('[SC-ESC6-092] NOTICE_VERSION, PROVIDER_ID y T_LEASE no son variables de entorno: el valor del entorno se ignora', () => {
    const ignored = PLAIN({ NOTICE_VERSION: '9', PROVIDER_ID: 'x', ARGOS_SCENE_LEASE_SECONDS: '1', ARGOS_SCENE_QUEUE_WAIT_SECONDS: '1', ARGOS_SCENE_POLL_SECONDS: '1' });
    expect(ignored).toEqual(PLAIN());
  });
});

describe('driver y producción (T829, SC-ESC6-025, SC-ESC6-092, REQ-ESC6-031)', () => {
  it('[SC-ESC6-025][SC-ESC6-092] NODE_ENV=production con ARGOS_SCENE_DRIVER=fake no arranca y nombra solo ARGOS_SCENE_DRIVER', () => {
    expect(failing({ ...PROD_BASE, ARGOS_SCENE_DRIVER: 'fake' }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[SC-ESC6-025] NODE_ENV=production sin ARGOS_SCENE_DRIVER (defecto fake) tampoco arranca', () => {
    expect(failing({ ...PROD_BASE }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-031] real exige la constante de activación: con el valor del código (true, T885) arranca; con sceneRealDriverActivated: false no arranca aunque todo lo demás sea válido', () => {
    expect(failing({ ...PROD_BASE, ...SCENE_REAL }).variables).toEqual(['sin error']);
    expect(failing({ NODE_ENV: 'test', ...SCENE_REAL }).variables).toEqual(['sin error']);
    expect(failing({ ...PROD_BASE, ...SCENE_REAL }, { sceneRealDriverActivated: false }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
    expect(failing({ NODE_ENV: 'test', ...SCENE_REAL }, { sceneRealDriverActivated: false }).variables).toEqual(['ARGOS_SCENE_DRIVER']);
  });

  it('[REQ-ESC6-031] real con la constante de activación pero sin modelo no arranca y nombra ARGOS_SCENE_MODEL', () => {
    const { ARGOS_SCENE_MODEL: _model, ...withoutModel } = SCENE_REAL;
    expect(failing({ NODE_ENV: 'test', ...withoutModel }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_MODEL']);
  });

  it('[REQ-ESC6-031] real exige también ARGOS_SCENE_PROJECT_ID', () => {
    const { ARGOS_SCENE_PROJECT_ID: _project, ...withoutProject } = SCENE_REAL;
    expect(failing({ NODE_ENV: 'test', ...withoutProject }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_PROJECT_ID']);
  });

  it('[REQ-ESC6-031] real completo con la constante de activación arranca y expone modelo, proyecto, cuenta de Tasks y URL del worker', () => {
    const scene = loadAppConfig({ ...PROD_BASE, ...SCENE_REAL }, ACTIVATED).scene;
    expect([scene.driver, scene.model, scene.projectId, scene.tasksServiceAccountEmail, scene.workerUrl]).toEqual([
      'real',
      'gemini-2.5-flash-image',
      'argos-prod-1234',
      'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com',
      'https://argos-abcdef-uc.a.run.app/internal/scene-worker',
    ]);
  });

  it('[SC-ESC6-025] en producción real sin ARGOS_SCENE_TASKS_SA_EMAIL o sin ARGOS_SCENE_WORKER_URL no arranca', () => {
    const { ARGOS_SCENE_TASKS_SA_EMAIL: _sa, ...withoutSa } = SCENE_REAL;
    const { ARGOS_SCENE_WORKER_URL: _url, ...withoutUrl } = SCENE_REAL;
    expect(failing({ ...PROD_BASE, ...withoutSa }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_TASKS_SA_EMAIL']);
    expect(failing({ ...PROD_BASE, ...withoutUrl }, ACTIVATED).variables).toEqual(['ARGOS_SCENE_WORKER_URL']);
  });
});

describe('ARGOS_SCENE_WORKER_URL, modelo, proyecto, cola y cuenta (T829, INV-ESC6-018, SC-ESC6-087)', () => {
  it.each([
    'http://argos-abcdef-uc.a.run.app/internal/scene-worker',
    'https://evil.example/internal/scene-worker',
    'https://argos-abcdef-uc.a.run.app/internal/maintenance',
    'https://argos-abcdef-uc.a.run.app/internal/scene-worker/',
    'https://argos-abcdef-uc.a.run.app/internal/scene-worker?x=1',
    'https://argos-abcdef-uc.a.run.app/internal/scene-worker#f',
    'https://usuario:clave@argos-abcdef-uc.a.run.app/internal/scene-worker',
    'https://argos-abcdef-uc.a.run.app:8443/internal/scene-worker',
    'https://argos-abcdef-uc.a.run.app',
    'https://run.app/internal/scene-worker',
    'https://x.run.app.evil.example/internal/scene-worker',
    'no es una url',
  ])('[SC-ESC6-087] ARGOS_SCENE_WORKER_URL=%s se rechaza en cualquier entorno y se nombra solo la variable', (url) => {
    const result = failing({ NODE_ENV: 'test', ARGOS_SCENE_WORKER_URL: url });
    expect(result.variables).toEqual(['ARGOS_SCENE_WORKER_URL']);
    expect(result.message).not.toContain(url);
  });

  it('[INV-ESC6-018] una URL https del host *.run.app con la ruta exacta se acepta y se conserva tal cual', () => {
    const url = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
    expect(test({ ARGOS_SCENE_WORKER_URL: url }).scene.workerUrl).toBe(url);
  });

  it.each([
    ['ARGOS_SCENE_MODEL', 'a/b'],
    ['ARGOS_SCENE_MODEL', 'a?b'],
    ['ARGOS_SCENE_MODEL', 'a..b'],
    ['ARGOS_SCENE_MODEL', ' gemini'],
    ['ARGOS_SCENE_PROJECT_ID', 'proyecto/otro'],
    ['ARGOS_SCENE_PROJECT_ID', 'a..b'],
    ['ARGOS_SCENE_PROJECT_ID', 'A-mayuscula-1'],
    ['ARGOS_SCENE_QUEUE', 'cola/otra'],
    ['ARGOS_SCENE_QUEUE', 'cola?x'],
    ['ARGOS_SCENE_QUEUE', '1empieza-con-numero'],
    ['ARGOS_SCENE_TASKS_SA_EMAIL', 'alguien@example.com'],
    ['ARGOS_SCENE_TASKS_SA_EMAIL', 'a b@p.iam.gserviceaccount.com'],
  ])('[SC-ESC6-087] %s=%s (con "/", "?", ".." o forma ajena) impide arrancar y no se copia al error', (name, value) => {
    const result = failing({ NODE_ENV: 'test', [name]: value });
    expect(result.variables).toEqual([name]);
    expect(result.message).not.toContain(value);
  });

  it('[INV-ESC6-018] modelo, proyecto, cola y cuenta válidos se conservan; la cola por defecto es argos-scene', () => {
    const scene = test({
      ARGOS_SCENE_MODEL: 'gemini-2.5-flash-image',
      ARGOS_SCENE_PROJECT_ID: 'argos-prod-1234',
      ARGOS_SCENE_QUEUE: 'argos-scene-2',
      ARGOS_SCENE_TASKS_SA_EMAIL: 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com',
    }).scene;
    expect([scene.model, scene.projectId, scene.queue, scene.tasksServiceAccountEmail]).toEqual(['gemini-2.5-flash-image', 'argos-prod-1234', 'argos-scene-2', 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com']);
    expect(test().scene.queue).toBe('argos-scene');
  });
});

describe('ARGOS_SCENE_GLOBAL_QUOTA_MAX desde la Fase 14 (T948, N2-02 = A; antes no se leía en el tramo fake)', () => {
  it('[REQ-ESC6-011] un valor válido se expone como respaldo de platform_parameters (5 por defecto) y uno inválido impide arrancar nombrando solo la variable', () => {
    expect((PLAIN({ ARGOS_SCENE_GLOBAL_QUOTA_MAX: '8' }) as { scene: { globalQuotaMax: number } }).scene.globalQuotaMax).toBe(8);
    expect((PLAIN() as { scene: { globalQuotaMax: number } }).scene.globalQuotaMax).toBe(5);
    expect(failing({ NODE_ENV: 'test', ARGOS_SCENE_GLOBAL_QUOTA_MAX: 'abc' }).variables).toEqual(['ARGOS_SCENE_GLOBAL_QUOTA_MAX']);
  });
});
