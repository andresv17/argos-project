import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * H-O-004US3-5: las suites contra PostgreSQL real (las que leen TEST_DATABASE_URL) comparten UNA base y `pg_advisory_xact_lock` es un candado
 * de BASE (no de esquema): `postgres-concurrency.spec.ts` lo retiene ~10 s y, en paralelo, hace vencer por statement_timeout las transacciones de
 * otros archivos. En lugar de reintentar (`retry`), esos archivos se serializan: van a un grupo `threads` de UN solo hilo (se ejecutan uno tras
 * otro, cada uno aislado), mientras el resto de la suite sigue en paralelo. La lista se deriva del contenido (quien lee TEST_DATABASE_URL), así
 * una suite PG nueva queda serializada sin tocar esta configuración.
 */
function postgresSuites(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => readFileSync(file, 'utf8').includes('TEST_DATABASE_URL'))
    .map((file) => file.replaceAll('\\', '/'));
}
/** T1235: en desarrollo `GET /admin` (exacto) se sirve desde `admin.html`; el resto de rutas sigue el fallback SPA de `index.html`. En producción lo hace `static-assets.ts`. */
const adminEntryInDev: Plugin = {
  name: 'argos-admin-entry-dev',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.method === 'GET' && (request.url ?? '').split('?')[0] === '/admin') request.url = '/admin.html';
      next();
    });
  },
};
const POSTGRES_SUITES = postgresSuites('tests');

export default defineConfig({
  root: '.',
  plugins: [react(), adminEntryInDev],
  server: {
    host: '127.0.0.1',
    port: Number(process.env['E2E_WEB_PORT'] ?? 5173),
    strictPort: true,
    proxy: {
      '/api': {
        // El 3000 puede estar ocupado por otro servicio (p. ej. Grafana); por eso la API de desarrollo usa el 3100.
        target: `http://127.0.0.1:${process.env['E2E_API_PORT'] ?? 3100}`,
        changeOrigin: false,
      },
      '/__dev/media': {
        target: `http://127.0.0.1:${process.env['E2E_API_PORT'] ?? 3100}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // T1235: el portal /admin tiene su propia entrada y bundle (activos en /assets/admin-*, fuera de /admin/*, que responde 404 uniforme).
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin.html') } },
  },
  test: {
    globals: false,
    environment: 'node',
    // Una sola hebra para el grupo PG (ver arriba); el resto usa el grupo por defecto (forks) en paralelo.
    poolMatchGlobs: POSTGRES_SUITES.map((file): [string, 'threads'] => ['**/' + file, 'threads']),
    poolOptions: { threads: { singleThread: true } },
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/property/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
      'tests/security/**/*.spec.ts',
    ],
    // Constitución §5: líneas y ramas ≥ 95 % en src/domain/ y src/application/ (TASK-115).
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**'],
      // src/application/ports/** son interfaces puras sin sentencias ejecutables (decisión de Neo, 2026-11-14); el umbral sigue en 95.
      exclude: ['src/application/ports/**'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      // Constitución §5: líneas ≥ 95 %. Ramas: dispensa soberana de Neo (Nivel 2, 2026-11-28, deuda movida a Feature 18):
      // 90 % en GitHub Actions (GITHUB_ACTIONS=true) y 92 % en local.
      thresholds: { lines: 95, branches: process.env['GITHUB_ACTIONS'] === 'true' ? 90 : 92 },
    },
  },
});
