import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEmergencyModule, type RoutesModule, type TokenModule } from '../../fixtures/emergency-modules.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675; `/keymaker`): la ruta pública `GET /api/emergency/:token` y el shell `GET /e/:token` (`src/infrastructure/http/routes/emergency.routes.ts`).
 * El registro en `app.ts` lo coordina `/morpheus` (H-01): aquí se monta el plugin sobre una instancia de Fastify propia. Falla hoy porque el módulo no existe. Firma SUPUESTA:
 * `registerEmergencyPublicRoutes(app, { lookupByTokenHash(hash): Promise<PublicView | null>, ipSecret, clock })`; `lookupByTokenHash` devuelve la vista pública o `null` (guarda, fallecida, aviso, etc.).
 *
 * @implements REQ-QR12-004, REQ-QR12-007, REQ-QR12-008, INV-QR12-002
 * Cubre SC-012-051, SC-012-084, SC-012-087, SC-012-109, SC-012-126.
 */
const routes = await loadEmergencyModule<RoutesModule>('infrastructure/http/routes/emergency.routes');
const tokens = await loadEmergencyModule<TokenModule>('domain/emergency/token');
const hashEmergencyToken = (t: string): string => tokens.hashEmergencyToken(t);
const generateEmergencyToken = (e: Uint8Array): string => tokens.generateEmergencyToken(e);
let TOKEN = '';
beforeEach(() => {
  TOKEN = generateEmergencyToken(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
});
const VIEW = { petName: 'Luna', criticalAllergies: ['Penicilina'], contactPhones: [{ phone: '+573001234567' }] };
let app: FastifyInstance | null = null;
const seen: string[] = [];

async function boot(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await routes.registerEmergencyPublicRoutes(instance, {
    lookupByTokenHash: async (hash: string) => {
      seen.push(hash);
      return hash === hashEmergencyToken(TOKEN) ? VIEW : null;
    },
    ipSecret: 'x'.repeat(32),
    clock: { now: () => new Date('2026-11-27T15:00:00.000Z') },
  });
  await instance.ready();
  app = instance;
  return instance;
}
afterEach(async () => {
  await app?.close();
  app = null;
  seen.length = 0;
});

const publicHeaders = (headers: Record<string, unknown>) => {
  expect(headers['cache-control']).toBe('no-store');
  expect(String(headers['x-robots-tag'])).toContain('noindex');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
};
const noAccessControl = (headers: Record<string, unknown>) => expect(Object.keys(headers).filter((h) => h.toLowerCase().startsWith('access-control-'))).toEqual([]);

describe('T1674 ruta pública: vista mínima y 404 uniforme', () => {
  it('[SC-012-051] token válido: 200 con solo {petName, criticalAllergies, contactPhones} y cabeceras públicas, sin cookies', async () => {
    const res = await (await boot()).inject({ method: 'GET', url: `/api/emergency/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(VIEW);
    publicHeaders(res.headers);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('[SC-012-051][SC-012-084] token inexistente, mal formado, truncado, con sufijo o con barra final: el MISMO 404 (cuerpo y cabeceras) con instance «/emergency» y sin eco del token', async () => {
    const instance = await boot();
    const bodies = new Set<string>();
    const headerSets = new Set<string>();
    const wrong = generateEmergencyToken(Uint8Array.from({ length: 32 }, (_, i) => 200 - i));
    for (const path of [wrong, TOKEN.slice(0, 42), `${TOKEN}x`, `${TOKEN}/`, 'a'.repeat(200), '%00', '..%2f', 'x y']) {
      const res = await instance.inject({ method: 'GET', url: `/api/emergency/${path}` });
      expect(res.statusCode, path).toBe(404);
      publicHeaders(res.headers);
      const body = res.json() as { code: string; instance: string };
      expect(body.code).toBe('ERR-PET-NOT-FOUND');
      expect(body.instance).toBe('/emergency');
      expect(res.body).not.toContain(path === 'x y' ? 'x%20y' : path);
      expect(res.body).not.toContain(TOKEN);
      bodies.add(res.body);
      headerSets.add(JSON.stringify(Object.entries(res.headers).filter(([k]) => !['date', 'content-length'].includes(k)).sort()));
    }
    expect(bodies.size).toBe(1);
    expect(headerSets.size).toBe(1);
  });

  it('[SC-012-084] se calcula y consulta el hash también para tokens mal formados (sin cortocircuito observable) y nunca se pasa el token en claro', async () => {
    const instance = await boot();
    await instance.inject({ method: 'GET', url: `/api/emergency/${TOKEN.slice(0, 10)}` });
    expect(seen).toEqual([hashEmergencyToken(TOKEN.slice(0, 10))]);
    expect(seen.join('|')).not.toContain(TOKEN);
  });

  it('[SC-012-126] HEAD (token válido e inválido) y OPTIONS dan el MISMO 404 uniforme y ninguna cabecera Access-Control-*; un GET con Origin cruzado tampoco', async () => {
    const instance = await boot();
    const reference = await instance.inject({ method: 'GET', url: '/api/emergency/nada' });
    for (const method of ['HEAD', 'OPTIONS'] as const) {
      for (const token of [TOKEN, 'invalido']) {
        const res = await instance.inject({ method, url: `/api/emergency/${token}`, headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
        expect(res.statusCode, `${method} ${token}`).toBe(404);
        noAccessControl(res.headers);
        publicHeaders(res.headers);
        if (method !== 'HEAD') expect(res.body).toBe(reference.body);
      }
    }
    const cross = await instance.inject({ method: 'GET', url: `/api/emergency/${TOKEN}`, headers: { origin: 'https://evil.example' } });
    expect(cross.statusCode).toBe(200);
    noAccessControl(cross.headers);
  });

  it('[SC-012-126] otros métodos y subrutas del prefijo (POST, PUT, DELETE, /api/emergency, /api/emergency/x/y) dan el 404 uniforme', async () => {
    const instance = await boot();
    for (const [method, url] of [['POST', `/api/emergency/${TOKEN}`], ['PUT', `/api/emergency/${TOKEN}`], ['DELETE', `/api/emergency/${TOKEN}`], ['GET', '/api/emergency'], ['GET', '/api/emergency/'], ['GET', `/api/emergency/${TOKEN}/extra`]] as const) {
      const res = await instance.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect((res.json() as { instance: string }).instance).toBe('/emergency');
      expect(res.body).not.toContain(TOKEN);
    }
  });
});

describe('T1674 shell /e/:token y límite de tasa por IP', () => {
  it('[SC-012-126] el shell responde 200 idéntico para cualquier token, con las cabeceras del anexo §5 y sin cookies ni datos en línea', async () => {
    const instance = await boot();
    const a = await instance.inject({ method: 'GET', url: `/e/${TOKEN}` });
    const b = await instance.inject({ method: 'GET', url: `/e/${'z'.repeat(150)}` });
    expect(a.statusCode).toBe(200);
    expect(b.body).toBe(a.body);
    expect(a.headers['referrer-policy']).toBe('no-referrer');
    expect(a.headers['cache-control']).toBe('no-store');
    expect(String(a.headers['x-robots-tag'])).toContain('noindex');
    expect(String(a.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(a.headers['set-cookie']).toBeUndefined();
    expect(a.body).not.toContain(TOKEN);
    expect(a.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>|og:|twitter:/i);
    expect(seen).toEqual([]); // el shell no consulta la ficha
  });

  it('[SC-012-087] más de 30 peticiones por IP y minuto (GET, HEAD y OPTIONS cuentan, también el shell): 429 ERR-RATE-LIMITED uniforme con Retry-After e instance «/emergency»; otra IP no se ve afectada', async () => {
    const instance = await boot();
    const ip = '203.0.113.9';
    const send = (method: 'GET' | 'HEAD' | 'OPTIONS', url: string) => instance.inject({ method, url, remoteAddress: ip });
    for (let i = 0; i < 10; i += 1) expect((await send('GET', `/api/emergency/${TOKEN}`)).statusCode).toBe(200);
    for (let i = 0; i < 10; i += 1) expect((await send('HEAD', `/api/emergency/${TOKEN}`)).statusCode).toBe(404);
    for (let i = 0; i < 5; i += 1) expect((await send('OPTIONS', '/api/emergency/x')).statusCode).toBe(404);
    for (let i = 0; i < 5; i += 1) expect((await send('GET', `/e/${TOKEN}`)).statusCode).toBe(200);
    const limited = await send('GET', `/api/emergency/${TOKEN}`);
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['x-content-type-options']).toBe('nosniff');
    expect(limited.json()).toMatchObject({ code: 'ERR-RATE-LIMITED', instance: '/emergency' });
    expect(limited.body).not.toContain(TOKEN);
    expect((await instance.inject({ method: 'GET', url: `/api/emergency/${TOKEN}`, remoteAddress: '203.0.113.10' })).statusCode).toBe(200);
  });
});
