import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
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
