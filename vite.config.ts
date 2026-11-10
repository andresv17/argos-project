import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    globals: false,
    environment: 'node',
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
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 95, branches: 95 },
    },
  },
});
