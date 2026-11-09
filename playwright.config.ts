import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright: E2E, visual y accesibilidad contra la app real (TASK-114). `webServer` arranca `npm run dev`
 * (API Fastify en 127.0.0.1:3000 y SPA Vite en 127.0.0.1:5173 con proxy `/api`) sobre una base SQLite nueva
 * en cada ejecución: la ruta se fija una vez en el proceso principal y los workers la heredan por entorno.
 * Se espera a `/api/auth/me` a través del proxy: responde 401 solo cuando la SPA y la API están levantadas.
 */
process.env['ARGOS_E2E_DATABASE'] ??= join(tmpdir(), `argos-e2e-${process.pid}.sqlite`);

export const E2E_BASE_URL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `${E2E_BASE_URL}/api/auth/me`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_PATH: process.env['ARGOS_E2E_DATABASE'],
      PORT: '3000',
      HOST: '127.0.0.1',
      APP_TIMEZONE: 'America/Bogota',
      COOKIE_SECURE: 'false',
    },
  },
});
