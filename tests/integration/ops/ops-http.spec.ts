import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T411 (pruebas primero; las implementa T412 y T479): /healthz, /readyz, estáticos de dist/, fallback SPA,
 * cabeceras de seguridad y path traversal codificado. REQ-CLD-001, REQ-CLD-004, REQ-CLD-009, SC-CLD-022.
 *
 * Contrato de módulos que T412 debe crear (rutas bajo src/infrastructure/http/):
 * - plugins/security-headers.ts  -> registerSecurityHeaders(app): Promise<void> | void
 * - routes/ops-routes.ts         -> registerOpsRoutes(app, { checkReady: () => Promise<void> }): Promise<void> | void
 *   (checkReady rechaza si la base no responde o faltan migraciones; /readyz no revela la causa)
 * - plugins/static-assets.ts     -> registerStaticAssets(app, { root: string }): Promise<void>
 * Los módulos se cargan en cada prueba con import dinámico para que, mientras no existan, fallen las pruebas
 * una por una por ausencia de implementación y no el archivo entero.
 */

const SRC_HTTP = join(process.cwd(), 'src', 'infrastructure', 'http');
interface ModuleLoaders {
  registerSecurityHeaders(app: FastifyInstance): Promise<void> | void;
  registerOpsRoutes(app: FastifyInstance, options: { readonly checkReady: () => Promise<void> }): Promise<void> | void;
  registerStaticAssets(app: FastifyInstance, options: { readonly root: string }): Promise<void> | void;
}
async function load<K extends keyof ModuleLoaders>(file: string, name: K): Promise<ModuleLoaders[K]> {
  const mod = (await import(/* @vite-ignore */ join(SRC_HTTP, file))) as Record<string, unknown>;
  return mod[name] as ModuleLoaders[K];
}

const SECRET = 'SECRETO-FUERA-DE-DIST-9f3a';
const INDEX_HTML = '<!doctype html><html><body><div id="root">ARGOS-SPA</div></body></html>';
const ASSET_JS = 'console.log("ARGOS-ASSET");';

let sandbox: string;
let app: FastifyInstance;
let checkReady: ReturnType<typeof vi.fn<() => Promise<void>>>;

async function buildOpsApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  const registerSecurityHeaders = await load('plugins/security-headers.ts', 'registerSecurityHeaders');
  const registerOpsRoutes = await load('routes/ops-routes.ts', 'registerOpsRoutes');
  const registerStaticAssets = await load('plugins/static-assets.ts', 'registerStaticAssets');
  await registerSecurityHeaders(instance);
  await registerOpsRoutes(instance, { checkReady });
  instance.get('/api/ping', async () => ({ pong: true }));
  await registerStaticAssets(instance, { root: join(sandbox, 'dist') });
  await instance.ready();
  return instance;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-ops-'));
  mkdirSync(join(sandbox, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(sandbox, 'dist', 'index.html'), INDEX_HTML);
  writeFileSync(join(sandbox, 'dist', 'assets', 'app-abc123.js'), ASSET_JS);
  writeFileSync(join(sandbox, 'dist', '.env'), 'DOTFILE=1');
  writeFileSync(join(sandbox, 'secret.txt'), SECRET);
  checkReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('/healthz (REQ-CLD-004)', () => {
  it('responde 200 {status:"ok"} sin tocar la base y con Cache-Control no-store', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(checkReady).not.toHaveBeenCalled();
  });

  it('sigue en 200 aunque la comprobación de disponibilidad falle', async () => {
    checkReady.mockRejectedValue(new Error('neon caído'));
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });
});

describe('/readyz (REQ-CLD-004)', () => {
  it('responde 200 {status:"ready"} con Cache-Control no-store sin cookie ni CSRF', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('responde 503 RFC 9457 con ERR-INTERNAL-UNEXPECTED y sin revelar la causa', async () => {
    checkReady.mockRejectedValue(new Error('password=hunter2 host=ep-secret.neon.tech'));
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json<Record<string, unknown>>();
    expect(body.code).toBe('ERR-INTERNAL-UNEXPECTED');
    expect(body.type).toBe('urn:argos:error:ERR-INTERNAL-UNEXPECTED');
    expect(body.status).toBe(503);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
    expect(body.invariantRef).toBe('INV-ARCH-003');
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('neon.tech');
    expect(res.body).not.toContain('password');
  });

  it('corta a los 5 s una comprobación colgada y responde 503', async () => {
    vi.useFakeTimers();
    checkReady.mockImplementation(() => new Promise<void>(() => undefined));
    app = await buildOpsApp();
    const pending = app.inject({ method: 'GET', url: '/readyz' });
    await vi.advanceTimersByTimeAsync(4_900);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    const res = await pending;
    expect(res.statusCode).toBe(503);
    expect(res.json<{ code: string }>().code).toBe('ERR-INTERNAL-UNEXPECTED');
  });
});

describe('estáticos y fallback SPA (REQ-CLD-001)', () => {
  it('sirve / e /index.html con el contenido de dist/', async () => {
    app = await buildOpsApp();
    for (const url of ['/', '/index.html']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(INDEX_HTML);
    }
  });

  it('sirve /assets/app-abc123.js', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(ASSET_JS);
    expect(String(res.headers['content-type'])).toContain('javascript');
  });

  it('devuelve index.html con 200 para rutas de SPA no /api y no estáticas', async () => {
    app = await buildOpsApp();
    for (const url of ['/pets/123', '/households/abc/members', '/login?next=%2Fpets']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(INDEX_HTML);
    }
  });

  it('no aplica el fallback a /api/*: una ruta desconocida da 404 sin HTML', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/api/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('ARGOS-SPA');
  });

  it('no aplica el fallback a archivos de /assets/ inexistentes (404 sin HTML)', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/assets/no-existe.js' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('ARGOS-SPA');
  });

  it('no aplica el fallback a métodos distintos de GET/HEAD', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'POST', url: '/pets/123', payload: 'x' });
    expect([404, 405]).toContain(res.statusCode);
    expect(res.body).not.toContain('ARGOS-SPA');
  });

  it('niega los dotfiles de dist/ sin filtrar su contenido', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/.env' });
    expect([403, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain('DOTFILE');
  });

  it('no lista directorios (/assets/ no devuelve un índice con nombres de archivo)', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/assets/' });
    expect(res.body).not.toContain('app-abc123.js');
  });

  it('las respuestas de las sondas y de index.html no contienen datos sensibles', async () => {
    app = await buildOpsApp();
    for (const url of ['/healthz', '/readyz', '/', '/pets/1']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.body).not.toMatch(/DATABASE_URL|postgres(ql)?:\/\/|password|SECRETO|process\.env/i);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });
});

describe('cabeceras de seguridad por ruta (REQ-CLD-009, SC-CLD-022, T479)', () => {
  const PAGES = ['/index.html', '/', '/pets/123', '/assets/app-abc123.js'];

  it('Content-Security-Policy con default-src \'self\' y frame-ancestors \'none\' en HTML y estáticos', async () => {
    app = await buildOpsApp();
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url });
      const csp = String(res.headers['content-security-policy']);
      expect(csp, url).toContain("default-src 'self'");
      expect(csp, url).toContain("frame-ancestors 'none'");
      expect(csp, url).toContain("img-src 'self' data:");
    }
  });

  it('X-Content-Type-Options: nosniff en HTML y estáticos', async () => {
    app = await buildOpsApp();
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
    }
  });

  it('Referrer-Policy restrictiva en HTML y estáticos', async () => {
    app = await buildOpsApp();
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url });
      expect(String(res.headers['referrer-policy']), url).toMatch(/^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/);
    }
  });

  it('las cabeceras también salen en 404 y en respuestas de la API', async () => {
    app = await buildOpsApp();
    for (const url of ['/api/ping', '/api/no-existe', '/healthz']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(String(res.headers['content-security-policy']), url).toContain("frame-ancestors 'none'");
    }
  });

  it('Cache-Control inmutable de un año para /assets/*', async () => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    const cc = String(res.headers['cache-control']);
    expect(cc).toContain('immutable');
    expect(cc).toContain('public');
    expect(cc).toMatch(/max-age=31536000/);
  });

  it('index.html y el fallback SPA salen sin caché (no-cache o no-store, nunca inmutable)', async () => {
    app = await buildOpsApp();
    for (const url of ['/', '/index.html', '/pets/123']) {
      const res = await app.inject({ method: 'GET', url });
      const cc = String(res.headers['cache-control']);
      expect(cc, url).toMatch(/no-cache|no-store/);
      expect(cc, url).not.toContain('immutable');
      expect(cc, url).not.toMatch(/max-age=[1-9]/);
    }
  });
});

describe('path traversal codificado sobre estáticos y fallback SPA (REQ-CLD-009, SC-CLD-022)', () => {
  const ATTACKS: readonly (readonly [string, string])[] = [
    ['%2e%2e minúsculas', '/assets/%2e%2e/%2e%2e/secret.txt'],
    ['%2E%2E mayúsculas', '/assets/%2E%2E/%2E%2E/secret.txt'],
    ['%2e%2e al inicio', '/%2e%2e/secret.txt'],
    ['%2f codificado', '/assets/..%2f..%2fsecret.txt'],
    ['%2F mayúscula', '/assets/..%2F..%2Fsecret.txt'],
    ['%2e%2e%2f junto', '/assets/%2e%2e%2f%2e%2e%2fsecret.txt'],
    ['doble codificación', '/assets/%252e%252e%252f%252e%252e%252fsecret.txt'],
    ['barra doble inicial', '//secret.txt'],
    ['barra doble con subida', '//assets/../../secret.txt'],
    ['barra doble en medio', '/assets//..//..//secret.txt'],
    ['barra invertida', '/assets\\..\\..\\secret.txt'],
    ['barra invertida codificada', '/assets/..%5c..%5csecret.txt'],
    ['barra invertida mayúscula', '/assets/..%5C..%5Csecret.txt'],
    ['byte nulo', '/assets/app-abc123.js%00/../../secret.txt'],
    ['absoluta codificada', '/%2fsecret.txt'],
  ];

  it.each(ATTACKS)('rechaza %s (400/404) sin contenido fuera de dist/ (ruta estática)', async (_name, url) => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url });
    expect([400, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain(SECRET);
    expect(res.body).not.toContain('ARGOS-SPA');
  });

  it.each(ATTACKS)('rechaza %s (400/404) también bajo una ruta de SPA', async (_name, url) => {
    app = await buildOpsApp();
    const res = await app.inject({ method: 'GET', url: `/pets/123${url}` });
    expect([400, 404]).toContain(res.statusCode);
    expect(res.body).not.toContain(SECRET);
  });

  it('el fallback SPA con segmentos ".." codificados nunca sirve un archivo fuera de dist/', async () => {
    app = await buildOpsApp();
    for (const url of ['/%2e%2e%2fsecret.txt', '/pets/%2e%2e%2f%2e%2e%2fsecret.txt', '/pets/..%2f..%2fsecret.txt']) {
      const res = await app.inject({ method: 'GET', url });
      expect([400, 404], url).toContain(res.statusCode);
      expect(res.body, url).not.toContain(SECRET);
    }
  });
});
