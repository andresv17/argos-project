import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright: E2E, visual y accesibilidad contra la app real (TASK-114). `webServer` arranca la API Fastify en
 * 127.0.0.1:3000 y la SPA Vite en 127.0.0.1:5173 (proxy `/api`) sobre una base SQLite nueva en cada ejecución:
 * la ruta se fija una vez en el proceso principal (directorio temporal único con `mkdtemp`, no el PID, que puede
 * repetirse entre ejecuciones) y los workers la heredan por entorno.
 * Cada servidor tiene su URL y `reuseExistingServer: false`: si el puerto 3000 o el 5173 ya responde (por ejemplo,
 * un `npm run dev` previo con otra base), Playwright se detiene antes de ejecutar pruebas (H-114-4, TASK-115).
 * La API se espera en `/api/auth/me` directo (401) y la SPA en el mismo recurso a través del proxy.
 */
process.env['ARGOS_E2E_DATABASE'] ??= join(mkdtempSync(join(tmpdir(), 'argos-e2e-')), 'argos.sqlite');

export const E2E_BASE_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000';

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
  webServer: [
    {
      command: 'npx tsx src/infrastructure/http/server.ts',
      url: `${API_BASE_URL}/api/auth/me`,
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
    {
      command: 'npx vite',
      url: `${E2E_BASE_URL}/api/auth/me`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
