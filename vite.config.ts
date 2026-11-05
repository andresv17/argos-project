export default {
  root: '.',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
};
