import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig, type AppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { EmergencyConfigError } from '../../../src/infrastructure/config/emergency-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';

/**
 * H-D2 (a), Bloque D (#32): `createProductionApp` compone `deps.emergency` con `loadEmergencyServices(process.env, config.publicBaseUrl)`. Sin `PHONE_HMAC_KEY` las rutas no se registran;
 * con una clave o una URL pública inválidas el arranque falla cerrado.
 * @implements REQ-QR12-003, REQ-QR12-006, INV-ARCH-006
 */
const KEY = 'phone-hmac-key-A-0123456789abcdef0123456789';
const TOKEN = 'A'.repeat(43);
let sandbox: string;
let base: AppConfig;
const apps: FastifyInstance[] = [];

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-d2-'));
  base = loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(sandbox, 'argos.sqlite') });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  rmSync(sandbox, { recursive: true, force: true });
});

async function build(config: AppConfig): Promise<FastifyInstance> {
  const app = await createProductionApp(config, false, { staticRoot: sandbox });
  apps.push(app);
  return app;
}
const hasRoute = (app: FastifyInstance) => app.hasRoute({ method: 'GET', url: '/api/pets/:petId/emergency-card' });

describe('H-D2 composición de la ficha QR en el servidor de producción', () => {
  it('sin PHONE_HMAC_KEY no se registra ninguna ruta de la ficha', async () => {
    vi.stubEnv('PHONE_HMAC_KEY', '');
    expect(hasRoute(await build(base))).toBe(false);
  });

  it('con PHONE_HMAC_KEY válida y ARGOS_PUBLIC_BASE_URL https se registran las rutas de la ficha', async () => {
    vi.stubEnv('PHONE_HMAC_KEY', KEY);
    const app = await build({ ...base, publicBaseUrl: 'https://argos.example' });
    expect(hasRoute(app)).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/api/emergency/${TOKEN}` })).statusCode).toBe(404);
  });

  it('con la clave pero sin URL pública válida, el arranque falla cerrado nombrando solo la variable', async () => {
    vi.stubEnv('PHONE_HMAC_KEY', KEY);
    const error = await build({ ...base, publicBaseUrl: null }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmergencyConfigError);
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it('con una clave demasiado corta, el arranque falla cerrado', async () => {
    vi.stubEnv('PHONE_HMAC_KEY', 'corta');
    await expect(build({ ...base, publicBaseUrl: 'https://argos.example' })).rejects.toBeInstanceOf(EmergencyConfigError);
  });
});
