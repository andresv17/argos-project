import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig, type AppConfig } from '../../src/infrastructure/config/app-config.ts';

/**
 * O-4 sobre la aplicación de producción real (H-O-O4-1, H-O-O4-2): se usa `createProductionApp`, que compone `buildApp`
 * (cookie, parser, problem-details, cabeceras, CSRF, sondas, estáticos) y la ruta de mantenimiento. Solo se sustituyen
 * el pool de PostgreSQL (doble, sin red) y la sonda /readyz; el verificador OIDC es el real (jose), de modo que un token
 * sintético se rechaza sin salir a Internet. Cubre además la guarda de server.ts: la ruta POST /internal/maintenance solo
 * existe con driver postgres Y schedulerEmail Y oidcAudience; en cualquier otro caso responde 404 (REQ-SEC-007, SC-CLD-009).
 */
const mocks = vi.hoisted(() => ({
  pool: { on: vi.fn(), end: vi.fn(), connect: vi.fn(), query: vi.fn() },
}));
vi.mock('../../src/infrastructure/persistence/postgres/postgres-database.ts', () => ({
  createPostgresPool: () => mocks.pool,
  closePool: vi.fn(),
}));

const PG_ENV = {
  NODE_ENV: 'test',
  ARGOS_DB_DRIVER: 'postgres',
  DATABASE_URL: 'postgres://argos:clave-prueba@db.example.internal:5432/argos?sslmode=require', // argos-scan:allow
  ARGOS_SCHEDULER_EMAIL: 'argos-scheduler@argos-prod-1234.iam.gserviceaccount.com',
  ARGOS_OIDC_AUDIENCE: 'https://argos-abcdef-uc.a.run.app',
};
const INDEX_HTML = '<!doctype html><html><body><div id="root">ARGOS-SPA</div></body></html>';
const CSRF = { 'x-argos-request': '1' };
const BEARER = { authorization: 'Bearer token-sintetico-FAKE.aaa.bbb' };

// Timeout de ejecución propio (15000 ms) por test: cada test levanta createProductionApp real (arranque completo con 18 migraciones y
// validadores), lo que roza el default de 5000 ms bajo carga paralela. Medición: .specify/memory/audits/keymaker-009-timeouts-composicion.md.
// No se relaja ninguna aserción ni se sube el testTimeout global.
const COMPOSITION_TIMEOUT_MS = 15_000;

let sandbox: string;
const open: FastifyInstance[] = [];

async function production(config: AppConfig): Promise<FastifyInstance> {
  const { createProductionApp } = await import('../../src/infrastructure/http/server.ts');
  const app = await createProductionApp(config, false, { staticRoot: join(sandbox, 'dist'), checkReady: async () => undefined });
  open.push(app);
  return app;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-ops-prod-'));
  mkdirSync(join(sandbox, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(sandbox, 'dist', 'index.html'), INDEX_HTML);
  writeFileSync(join(sandbox, 'dist', 'assets', 'app-abc123.js'), 'console.log("ARGOS-ASSET");');
});

afterEach(async () => {
  while (open.length > 0) await open.pop()!.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('H-O-O4-1: superficie operativa sobre createProductionApp (composición real)', () => {
  it('sondas y estáticos responden con las cabeceras de seguridad de buildApp', async () => {
    const app = await production(loadAppConfig(PG_ENV));
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ method: 'GET', url: '/readyz' })).json()).toEqual({ status: 'ready' });
    for (const url of ['/healthz', '/readyz', '/', '/assets/app-abc123.js', '/assets/no-existe.js']) {
      const res = await app.inject({ method: 'GET', url });
      expect(String(res.headers['content-security-policy']), url).toContain("default-src 'self'");
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
    }
  }, COMPOSITION_TIMEOUT_MS);

  it('el mantenimiento gana a los estáticos: sin Authorization 401 (no la SPA ni 404) y con identidad ajena 401 sin purga', async () => {
    const app = await production(loadAppConfig(PG_ENV));
    const anon = await app.inject({ method: 'POST', url: '/internal/maintenance' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json<{ code: string }>().code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(anon.body).not.toContain('ARGOS-SPA');
    const forged = await app.inject({ method: 'POST', url: '/internal/maintenance', headers: BEARER });
    expect(forged.statusCode).toBe(401);
    expect(mocks.pool.query).not.toHaveBeenCalled();
  }, COMPOSITION_TIMEOUT_MS);

  it('CSRF sigue activo: POST a una sonda sin X-Argos-Request es 403 y con él 404; GET a la ruta de purga no ejecuta mantenimiento', async () => {
    const app = await production(loadAppConfig(PG_ENV));
    const noHeader = await app.inject({ method: 'POST', url: '/readyz', payload: 'x' });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json<{ code: string }>().code).toBe('ERR-AUTH-CSRF-REJECTED');
    expect((await app.inject({ method: 'POST', url: '/readyz', headers: CSRF })).statusCode).toBe(404);
    const get = await app.inject({ method: 'GET', url: '/internal/maintenance', headers: BEARER });
    // GET no es la purga: cae al fallback SPA (200 con index.html) y no ejecuta mantenimiento.
    expect(get.statusCode).toBeLessThan(500);
    expect(get.body).not.toContain('sessionsPurged');
    expect(mocks.pool.query).not.toHaveBeenCalled();
  }, COMPOSITION_TIMEOUT_MS);

  it('traversal y dotfiles no filtran contenido fuera de dist/', async () => {
    writeFileSync(join(sandbox, 'secret.txt'), 'SECRETO-PROD-9d2f');
    const app = await production(loadAppConfig(PG_ENV));
    for (const url of ['/assets/%2e%2e/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '//secret.txt', '/.env', '/.git/config']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBeLessThan(500);
      expect(res.body, url).not.toContain('SECRETO-PROD-9d2f');
    }
  }, COMPOSITION_TIMEOUT_MS);
});

describe('H-O-O4-2: guarda de server.ts para POST /internal/maintenance (REQ-SEC-007)', () => {
  const MAINT = { method: 'POST', url: '/internal/maintenance', headers: { ...BEARER, ...CSRF } } as const;

  it('postgres con schedulerEmail y oidcAudience: la ruta existe (401 sin identidad válida, no 404)', async () => {
    const app = await production(loadAppConfig(PG_ENV));
    expect((await app.inject(MAINT)).statusCode).toBe(401);
  }, COMPOSITION_TIMEOUT_MS);

  it.each([
    ['postgres sin schedulerEmail', { schedulerEmail: null }],
    ['postgres sin oidcAudience', { oidcAudience: null }],
    ['postgres sin ninguna de las dos', { schedulerEmail: null, oidcAudience: null }],
  ])('%s: la ruta no existe (404 y sin purga)', async (_name, override) => {
    const app = await production({ ...loadAppConfig(PG_ENV), ...override });
    const res = await app.inject(MAINT);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('ARGOS-SPA');
    expect(mocks.pool.query).not.toHaveBeenCalled();
  }, COMPOSITION_TIMEOUT_MS);

  it('driver sqlite aunque schedulerEmail y oidcAudience estén presentes: 404', async () => {
    const config: AppConfig = {
      ...loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(sandbox, 'argos.sqlite') }),
      schedulerEmail: PG_ENV.ARGOS_SCHEDULER_EMAIL,
      oidcAudience: PG_ENV.ARGOS_OIDC_AUDIENCE,
    };
    const app = await production(config);
    expect((await app.inject(MAINT)).statusCode).toBe(404);
  }, COMPOSITION_TIMEOUT_MS);
});
