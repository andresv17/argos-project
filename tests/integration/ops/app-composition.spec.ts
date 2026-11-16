import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig, type AppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';

/**
 * Cierre de Fase 2 (REQ-CLD-001, REQ-CLD-003, REQ-CLD-004, REQ-CLD-009, SC-CLD-022): la APLICACIÓN COMPUESTA
 * (createProductionApp con SQLite local) sirve /healthz, /readyz, estáticos de dist/, cabeceras de seguridad y
 * confía en un solo salto de proxy. Decisión de /architect: .specify/memory/audits/architect-H1-composicion-fase2.md.
 * Tercer parámetro de createProductionApp: { staticRoot?, checkReady? } (puntos de inyección; sin process.env).
 */

const INDEX_HTML = '<!doctype html><html><body><div id="root">ARGOS-SPA</div></body></html>';
const ASSET_JS = 'console.log("ARGOS-ASSET");';
const SECRET = 'SECRETO-FUERA-DE-DIST-9f3a';

let sandbox: string;
let staticRoot: string;
let dbPath: string;
let config: AppConfig;
const apps: FastifyInstance[] = [];

async function compose(overrides: Partial<AppConfig> = {}, checkReady?: () => Promise<void>): Promise<FastifyInstance> {
  const app = await createProductionApp({ ...config, ...overrides }, false, { staticRoot, ...(checkReady === undefined ? {} : { checkReady }) });
  apps.push(app);
  return app;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-compose-'));
  staticRoot = join(sandbox, 'dist');
  mkdirSync(join(staticRoot, 'assets'), { recursive: true });
  writeFileSync(join(staticRoot, 'index.html'), INDEX_HTML);
  writeFileSync(join(staticRoot, 'assets', 'x.js'), ASSET_JS);
  writeFileSync(join(sandbox, 'secret.txt'), SECRET);
  dbPath = join(sandbox, 'argos.sqlite');
  config = loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: dbPath });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  rmSync(sandbox, { recursive: true, force: true });
});

function expectSecurityHeaders(headers: Record<string, unknown>): void {
  expect(String(headers['content-security-policy'])).toContain("default-src 'self'");
  expect(String(headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  expect(String(headers['content-security-policy'])).toContain("img-src 'self' data:");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
}

describe('aplicación compuesta: sondas', () => {
  it('[REQ-CLD-004] GET /healthz -> 200 {status:ok}, no-store y cabeceras de seguridad, sin sesión ni CSRF', async () => {
    const app = await compose();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expectSecurityHeaders(response.headers);
  });

  it('[REQ-CLD-004] /healthz no llama a checkReady', async () => {
    const checkReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = await compose({}, checkReady);
    await app.inject({ method: 'GET', url: '/healthz' });
    expect(checkReady).toHaveBeenCalledTimes(0);
  });

  it('[REQ-CLD-004] GET /readyz con la base SQLite activa -> 200 {status:ready}', async () => {
    const app = await compose();
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
    expect(response.headers['cache-control']).toBe('no-store');
    expectSecurityHeaders(response.headers);
  });

  it('[REQ-CLD-004] /readyz con checkReady inyectado que falla -> 503 problem+json sin causa y una sola llamada en 60 s', async () => {
    const checkReady = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('CAUSA-INTERNA-secreta'));
    const app = await compose({}, checkReady);
    const first = await app.inject({ method: 'GET', url: '/readyz' });
    const second = await app.inject({ method: 'GET', url: '/readyz' });
    expect(first.statusCode).toBe(503);
    expect(first.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(first.json()).toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED', status: 503 });
    expect(first.body).not.toContain('CAUSA-INTERNA');
    expect(second.statusCode).toBe(503);
    expect(checkReady).toHaveBeenCalledTimes(1);
    expectSecurityHeaders(first.headers);
  });

  it('[REQ-CLD-004] /readyz con SQLite real: falta una migración aplicada (esperadas no están en aplicadas) -> 503', async () => {
    const first = await compose();
    await first.inject({ method: 'GET', url: '/healthz' });
    const handle = new Database(dbPath);
    handle.prepare('DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)').run();
    handle.close();
    const response = await first.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });
});

describe('aplicación compuesta: estáticos y cabeceras', () => {
  it('[REQ-CLD-001] GET / y una ruta SPA sirven index.html con no-cache', async () => {
    const app = await compose();
    for (const url of ['/', '/pets/123']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(INDEX_HTML);
      expect(response.headers['cache-control']).toBe('no-cache');
      expectSecurityHeaders(response.headers);
    }
  });

  it('[REQ-CLD-001] GET /assets/x.js sirve el archivo con Cache-Control inmutable', async () => {
    const app = await compose();
    const response = await app.inject({ method: 'GET', url: '/assets/x.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(ASSET_JS);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expectSecurityHeaders(response.headers);
  });

  it('[REQ-CLD-001] /api/* inexistente da 404 sin HTML, archivos inexistentes con extensión dan 404 y el traversal no filtra el secreto', async () => {
    const app = await compose();
    const api = await app.inject({ method: 'GET', url: '/api/inexistente' });
    expect(api.statusCode).toBe(404);
    expect(api.body).not.toContain('ARGOS-SPA');
    expectSecurityHeaders(api.headers);
    const icon = await app.inject({ method: 'GET', url: '/favicon.ico' });
    expect(icon.statusCode).toBe(404);
    expect(icon.body).not.toContain('ARGOS-SPA');
    const traversal = await app.inject({ method: 'GET', url: '/assets/..%2f..%2fsecret.txt' });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain(SECRET);
  });

  it('[REQ-CLD-009] un POST sin X-Argos-Request (403 CSRF) también lleva las cabeceras de seguridad', async () => {
    const app = await compose();
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: '{}' });
    expect(response.statusCode).toBe(403);
    expectSecurityHeaders(response.headers);
  });

  it('[REQ-CLD-001] la API sigue respondiendo (la ruta autenticada sin sesión da 401, no el SPA)', async () => {
    const app = await compose();
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('ARGOS-SPA');
  });
});

describe('aplicación compuesta: trustProxy', () => {
  async function observedIp(app: FastifyInstance): Promise<string> {
    let ip = '';
    app.addHook('onRequest', async (request) => {
      ip = request.ip;
    });
    await app.inject({ method: 'GET', url: '/healthz', headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.2' } });
    return ip;
  }

  it('[REQ-CLD-003] con host 0.0.0.0 confía en un solo salto: request.ip es la entrada del proxy inmediato, no la izquierda falsificable', async () => {
    const app = await compose({ host: '0.0.0.0' });
    expect(await observedIp(app)).toBe('198.51.100.2');
  });

  it('[REQ-CLD-003] con host 127.0.0.1 no se confía en X-Forwarded-For', async () => {
    const app = await compose({ host: '127.0.0.1' });
    expect(await observedIp(app)).toBe('127.0.0.1');
  });
});

describe('INV-ARCH-006: process.env solo en src/infrastructure/config/', () => {
  function listSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'generated' ? [] : listSources(path);
      return path.endsWith('.ts') ? [path] : [];
    });
  }

  it('ningún archivo de src/ fuera de config/ referencia process.env en código', () => {
    const root = join(process.cwd(), 'src');
    const offenders = listSources(root)
      .filter((path) => !path.includes(`${join('src', 'infrastructure', 'config')}`))
      .filter((path) => readFileSync(path, 'utf8').split('\n').some((line) => /process\.env/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line)))
      .map((path) => path.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});
