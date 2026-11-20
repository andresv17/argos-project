import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import * as oidc from '../../src/infrastructure/http/oidc-verify.ts';
import { AppConfigError, loadAppConfig, type EnvironmentSource } from '../../src/infrastructure/config/app-config.ts';

/**
 * T869 (006, Fase 6, N2-07 = A): verificación OIDC por ruta. `jose` 6.2.17 (versión exacta, sin versión nueva) amplía su ámbito SOLO a `/internal/scene-worker`
 * con audiencia (la URL de `ARGOS_SCENE_WORKER_URL`) y correo (`ARGOS_SCENE_TASKS_SA_EMAIL`) propios: el token del Planificador no sirve en la ruta de la cola
 * y el de la cola no sirve en `/internal/maintenance`. REQ-ESC6-033; INV-ESC6-018; SC-ESC6-077, SC-ESC6-087.
 * JWKS efímero generado en la prueba: ninguna clave ni token reales.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const MAINTENANCE_AUDIENCE = 'https://argos-abcdef-uc.a.run.app';
const WORKER_URL = 'https://argos-abcdef-uc.a.run.app/internal/scene-worker';
const SCHEDULER_EMAIL = 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com';
const TASKS_EMAIL = 'argos-scene-tasks@argos-prod-1234.iam.gserviceaccount.com';
const KID = 'ruta-key-1';

type RouteVerifier = (token: string) => Promise<{ readonly email: string; readonly sub: string }>;
type CreateRouteVerifier = (route: string, options: { readonly audience: string; readonly jwks: { keys: JWK[] } }) => RouteVerifier;
const createRouteOidcVerifier = (oidc as unknown as Record<string, CreateRouteVerifier>)['createRouteOidcVerifier'] as CreateRouteVerifier;
const OIDC_ROUTES = (oidc as unknown as Record<string, unknown>)['OIDC_ROUTES'];

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});

const sign = (audience: string, email: string): Promise<string> =>
  new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setSubject('sub-0001')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

const rejects = async (promise: Promise<unknown>): Promise<boolean> => {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('jose 6.2.17 sin versión nueva y con ámbito acotado (T869, N2-07 = A)', () => {
  it('[REQ-ESC6-033][SC-ESC6-087] package.json fija jose en 6.2.17 exacta (sin ^ ni ~) y el lock resuelve esa misma versión', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
    expect([pkg.dependencies?.['jose'], lock.packages['node_modules/jose']?.version]).toEqual(['6.2.17', '6.2.17']);
  });

  it('[REQ-ESC6-033] solo oidc-verify.ts importa jose: nada de src/domain, src/application, rutas ni adaptadores lo toca', () => {
    const importers = walk(join(ROOT, 'src'))
      .filter((file) => /from ['"]jose['"]|require\(['"]jose['"]\)|import\(['"]jose['"]\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(importers).toEqual(['src/infrastructure/http/oidc-verify.ts']);
  });

  it('[REQ-ESC6-033] el ámbito de jose son exactamente las dos rutas internas: /internal/maintenance y /internal/scene-worker', () => {
    expect(OIDC_ROUTES).toEqual(['/internal/maintenance', '/internal/scene-worker']);
  });
});

describe('createRouteOidcVerifier: audiencia propia por ruta (T869, REQ-ESC6-033)', () => {
  it('[SC-ESC6-077] la ruta del worker acepta el token de la cola (audiencia = URL del worker) y devuelve el correo exacto de la cuenta', async () => {
    const verify = createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks });
    await expect(verify(await sign(WORKER_URL, TASKS_EMAIL))).resolves.toEqual({ email: TASKS_EMAIL, sub: 'sub-0001' });
  });

  it('[SC-ESC6-077] el token del Planificador (audiencia de mantenimiento) NO sirve en /internal/scene-worker', async () => {
    const verify = createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks });
    expect(await rejects(verify(await sign(MAINTENANCE_AUDIENCE, SCHEDULER_EMAIL)))).toBe(true);
  });

  it('[SC-ESC6-077] el token de la cola (audiencia del worker) NO sirve en /internal/maintenance', async () => {
    const verify = createRouteOidcVerifier('/internal/maintenance', { audience: MAINTENANCE_AUDIENCE, jwks });
    expect(await rejects(verify(await sign(WORKER_URL, TASKS_EMAIL)))).toBe(true);
    await expect(verify(await sign(MAINTENANCE_AUDIENCE, SCHEDULER_EMAIL))).resolves.toMatchObject({ email: SCHEDULER_EMAIL });
  });

  it('[REQ-ESC6-033] la audiencia es exacta: ni el origen sin ruta, ni la ruta con barra final, ni otro servicio, ni otra ruta del mismo host', async () => {
    const verify = createRouteOidcVerifier('/internal/scene-worker', { audience: WORKER_URL, jwks });
    for (const audience of [MAINTENANCE_AUDIENCE, `${WORKER_URL}/`, `${WORKER_URL}?x=1`, 'https://otro-abcdef-uc.a.run.app/internal/scene-worker', `${MAINTENANCE_AUDIENCE}/internal/maintenance`]) {
      expect([audience, await rejects(verify(await sign(audience, TASKS_EMAIL)))]).toEqual([audience, true]);
    }
  });

  it('[INV-ESC6-018] una ruta fuera de la lista (p. ej. una ruta /api) no admite verificador: el ámbito de jose no se amplía', () => {
    for (const route of ['/api/auth/login', '/internal/other', '/internal/scene-worker/', '']) {
      expect(() => createRouteOidcVerifier(route, { audience: WORKER_URL, jwks })).toThrow(Error);
    }
  });

  it('[REQ-ESC6-033] falla cerrado: audiencia vacía o solo espacios rechaza todo token', async () => {
    for (const audience of ['', '   ']) {
      const verify = createRouteOidcVerifier('/internal/scene-worker', { audience, jwks });
      expect(await rejects(verify(await sign(WORKER_URL, TASKS_EMAIL)))).toBe(true);
    }
  });
});

describe('app-config: audiencia y correo distintos por ruta (T869, SC-ESC6-087)', () => {
  const POSTGRES = { NODE_ENV: 'test', ARGOS_DB_DRIVER: 'postgres', DATABASE_URL: 'postgres://argos:clave@db.example.internal:5432/argos?sslmode=require' };
  const BASE: EnvironmentSource = { ...POSTGRES, ARGOS_SCHEDULER_EMAIL: SCHEDULER_EMAIL, ARGOS_OIDC_AUDIENCE: MAINTENANCE_AUDIENCE, ARGOS_SCENE_TASKS_SA_EMAIL: TASKS_EMAIL, ARGOS_SCENE_WORKER_URL: WORKER_URL };
  const failing = (env: EnvironmentSource): readonly string[] => {
    try {
      loadAppConfig(env);
    } catch (error) {
      if (error instanceof AppConfigError) return error.variables;
      throw error;
    }
    return ['sin error'];
  };

  it('[INV-ESC6-018] con las dos identidades distintas arranca y la configuración conserva cada correo y cada URL por separado', () => {
    const config = loadAppConfig(BASE);
    expect([config.schedulerEmail, config.oidcAudience, config.scene.tasksServiceAccountEmail, config.scene.workerUrl]).toEqual([SCHEDULER_EMAIL, MAINTENANCE_AUDIENCE, TASKS_EMAIL, WORKER_URL]);
  });

  it('[SC-ESC6-087] la cuenta de la cola no puede ser la del Planificador (mismo correo): impide arrancar y nombra solo la variable', () => {
    expect(failing({ ...BASE, ARGOS_SCENE_TASKS_SA_EMAIL: SCHEDULER_EMAIL })).toEqual(['ARGOS_SCENE_TASKS_SA_EMAIL']);
  });

  it('[SC-ESC6-087] la URL del worker no puede coincidir con la audiencia de mantenimiento (ni con barra final): impide arrancar y nombra solo la variable', () => {
    expect(failing({ ...BASE, ARGOS_OIDC_AUDIENCE: WORKER_URL })).toEqual(['ARGOS_SCENE_WORKER_URL']);
    expect(failing({ ...BASE, ARGOS_OIDC_AUDIENCE: `${WORKER_URL}/` })).toEqual(['ARGOS_SCENE_WORKER_URL']);
  });

  it('[INV-ESC6-018] el mensaje de error nunca repite los valores configurados', () => {
    try {
      loadAppConfig({ ...BASE, ARGOS_SCENE_TASKS_SA_EMAIL: SCHEDULER_EMAIL });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(SCHEDULER_EMAIL);
      return;
    }
    throw new Error('se esperaba un rechazo');
  });
});
