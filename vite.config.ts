import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

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
const POSTGRES_SUITES = postgresSuites('tests');

export default defineConfig({
  root: '.',
  plugins: [react()],
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
      thresholds: { lines: 95, branches: 95 },
    },
  },
});
