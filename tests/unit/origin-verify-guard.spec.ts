import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { ORIGIN_VERIFY_HEADER, registerOriginVerifyGuard } from '../../src/infrastructure/http/plugins/origin-verify.ts';

const TEST_ORIGIN_SECRET = 'ab'.repeat(32);

describe('ARGOS_ORIGIN_VERIFY_SECRET (app-config)', () => {
  it('es null cuando la variable no esta definida o esta vacia', () => {
    const missing = loadAppConfig({ NODE_ENV: 'test' });
    expect(missing.originVerifySecret).toBeNull();

    const empty = loadAppConfig({ NODE_ENV: 'test', ARGOS_ORIGIN_VERIFY_SECRET: '' });
    expect(empty.originVerifySecret).toBeNull();
  });

  it('acepta un secreto valido y lo expone como propiedad no enumerable', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', ARGOS_ORIGIN_VERIFY_SECRET: TEST_ORIGIN_SECRET });
    expect(config.originVerifySecret).toBe(TEST_ORIGIN_SECRET);
    expect(Object.keys(config)).not.toContain('originVerifySecret');
    expect(JSON.stringify(config)).not.toContain(TEST_ORIGIN_SECRET);
  });

  it.each([
    ['demasiado corto', 'short-secret-123'],
    ['con espacios', `${'a'.repeat(20)} ${'b'.repeat(20)}`],
    ['con coma', `${'a'.repeat(20)},${'b'.repeat(20)}`],
  ])('rechaza secreto invalido (%s) nombrando solo la variable', (_label, badValue) => {
    try {
      loadAppConfig({ NODE_ENV: 'test', ARGOS_ORIGIN_VERIFY_SECRET: badValue });
      expect.unreachable('Debio lanzar AppConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppConfigError);
      const configError = error as AppConfigError;
      expect(configError.variables).toContain('ARGOS_ORIGIN_VERIFY_SECRET');
      expect(configError.message).not.toContain(badValue);
    }
  });
});

describe('registerOriginVerifyGuard', () => {
  async function createTestApp() {
    const app = Fastify();
    registerOriginVerifyGuard(app, TEST_ORIGIN_SECRET);
    app.get('/', async () => ({ ok: true }));
    app.get('/api/about', async () => ({ ok: true }));
    app.get('/healthz', async () => ({ status: 'ok' }));
    app.get('/readyz', async () => ({ status: 'ready' }));
    app.post('/internal/maintenance', async () => ({ ok: true }));
    app.post('/internal/scene-worker', async () => ({ ok: true }));
    app.get('/healthz/extra', async () => ({ ok: true }));
    return app;
  }

  it('rechaza con 403 rutas publicas y API sin cabecera X-Origin-Verify', async () => {
    const app = await createTestApp();
    try {
      const rootRes = await app.inject({ method: 'GET', url: '/' });
      expect(rootRes.statusCode).toBe(403);
      expect(rootRes.headers['cache-control']).toBe('no-store');

      const apiRes = await app.inject({ method: 'GET', url: '/api/about' });
      expect(apiRes.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('rechaza con 403 cabeceras incorrectas (misma longitud, distinta longitud y duplicada)', async () => {
    const app = await createTestApp();
    try {
      const wrongSameLen = await app.inject({
        method: 'GET',
        url: '/',
        headers: { [ORIGIN_VERIFY_HEADER]: 'cd'.repeat(32) },
      });
      expect(wrongSameLen.statusCode).toBe(403);

      const wrongShort = await app.inject({
        method: 'GET',
        url: '/',
        headers: { [ORIGIN_VERIFY_HEADER]: 'wrong' },
      });
      expect(wrongShort.statusCode).toBe(403);

      const duplicate = await app.inject({
        method: 'GET',
        url: '/',
        headers: { [ORIGIN_VERIFY_HEADER]: [TEST_ORIGIN_SECRET, TEST_ORIGIN_SECRET] as unknown as string },
      });
      expect(duplicate.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('permite peticiones con la cabecera X-Origin-Verify exacta', async () => {
    const app = await createTestApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/about',
        headers: { 'X-Origin-Verify': TEST_ORIGIN_SECRET },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('permite sondas y rutas internas OIDC sin cabecera, pero bloquea prefijos falsos', async () => {
    const app = await createTestApp();
    try {
      for (const req of [
        { method: 'GET' as const, url: '/healthz' },
        { method: 'GET' as const, url: '/readyz?probe=1' },
        { method: 'POST' as const, url: '/internal/maintenance' },
        { method: 'POST' as const, url: '/internal/scene-worker' },
      ]) {
        const res = await app.inject(req);
        expect(res.statusCode).toBe(200);
      }

      const fakePrefix = await app.inject({ method: 'GET', url: '/healthz/extra' });
      expect(fakePrefix.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
