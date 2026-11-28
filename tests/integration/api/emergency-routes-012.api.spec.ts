import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { EmergencyServices } from '../../../src/application/use-cases/use-case-support.ts';
import { cloudLoggerOptions } from '../../../src/infrastructure/http/cloud-logging.ts';
import { ARGOS, canonicalState } from '../../fixtures/application-harness.ts';
import { SequentialEntropy } from '../../fixtures/emergency-012.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

/**
 * T1675 (Feature 012, Bloque D, #32; `/keymaker`): rutas HTTP de la ficha QR sobre la API real y SQLite (`contract: false`: el OpenAPI de la 012 no está cableado en el arnés de la 002/004).
 * Orden CSRF -> sesión -> tope -> autorización; token UNA sola vez con `no-store`; SVG solo con svg/rect/path; el 404 uniforme del prefijo público (incluido POST sin CSRF y URL mal codificada);
 * y ningún token en los registros.
 *
 * @implements REQ-QR12-003, REQ-QR12-004, REQ-QR12-005, REQ-QR12-007, REQ-QR12-008, INV-QR12-001, INV-QR12-002, SC-012-050, SC-012-051, SC-012-052, SC-012-086, SC-012-109, SC-012-125, SC-012-126
 */
let api: Api;
afterEach(async () => api.close());

const NC = { contract: false } as const;
const NOW = '2026-11-26T15:00:00.000Z';
const PET = ARGOS.id;
const NOTICE = '0.1.0';
const config: EmergencyServices = {
  phoneHmacKey: 'phone-hmac-key-A-0123456789abcdef0123456789',
  publicBaseUrl: 'https://argos.example',
  noticeVersion: NOTICE,
  noticeEffectiveAt: '2026-11-01T00:00:00.000Z',
  entropy: new SequentialEntropy(),
};
const ON = { consentAccepted: true, noticeVersion: NOTICE };

async function setup(extra: { logger?: import('fastify').FastifyServerOptions['logger'] } = {}): Promise<{ andres: string; maria: string }> {
  api = await createApi(canonicalState(), { emergency: { ...config, entropy: new SequentialEntropy() }, ...extra });
  api.clock.setClock(NOW.slice(0, 10), NOW);
  return { andres: await api.login('andres'), maria: await api.login('maria.v') };
}

describe('rutas privadas de la ficha QR', () => {
  it('[SC-012-052][SC-012-109] activar devuelve el token UNA vez con no-store y un SVG con solo svg/rect/path; el estado y la desactivación no lo devuelven', async () => {
    const { andres } = await setup();
    const call = (method: string, url: string, body?: unknown, cookie: string | null = andres) => api.call(method, `/api/pets/${PET}${url}`, { cookie, ...(body === undefined ? {} : { body }), ...NC });
    expect((await call('PUT', '/critical-allergies', { criticalAllergies: ['Penicilina'] })).json).toMatchObject({ petId: PET, criticalAllergies: ['Penicilina'] });
    const issued = await call('POST', '/emergency-card/activate', ON);
    expect(issued.status).toBe(201);
    expect(issued.headers['cache-control']).toBe('no-store');
    expect(issued.headers['x-content-type-options']).toBe('nosniff');
    const body = issued.json as { token: string; url: string; qrSvg: string; shownOnce: boolean };
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.url).toBe(`https://argos.example/e/${body.token}`);
    expect(body.shownOnce).toBe(true);
    expect(body.qrSvg).not.toMatch(/<(?!\/?(?:svg|rect|path)[\s>/])[a-z]/i);
    expect(body.qrSvg).not.toMatch(/on\w+=|href|script|foreignObject/i);

    const status = await call('GET', '/emergency-card');
    expect(status.status).toBe(200);
    expect(status.headers['cache-control']).toBe('private, no-store');
    expect(status.text).not.toContain(body.token);
    expect(status.json).toMatchObject({ status: 'ON', guardSatisfied: true, criticalAllergiesCount: 1, noticeVersion: NOTICE });

    expect((await call('POST', '/emergency-card/activate', ON)).status).toBe(409);
    const regenerated = await call('POST', '/emergency-card/regenerate', ON);
    expect(regenerated.status).toBe(201);
    expect((regenerated.json as { token: string }).token).not.toBe(body.token);
    const off = await call('POST', '/emergency-card/deactivate');
    expect([off.status, off.text]).toEqual([204, '']);
    expect((await call('GET', '/emergency-card')).json).toMatchObject({ status: 'OFF', statusReason: 'USER_DEACTIVATED' });
  });

  it('[SC-012-083] orden: sin X-Argos-Request 403, sin sesión 401, ajeno 404 uniforme y cuerpo inválido 422 solo tras autorizar', async () => {
    const { andres } = await setup();
    const url = `/api/pets/${PET}/emergency-card/activate`;
    expect((await api.call('POST', url, { cookie: andres, body: ON, csrf: false, ...NC })).status).toBe(403);
    expect((await api.call('POST', url, { cookie: null, body: ON, ...NC })).status).toBe(401);
    const maria = await api.login('maria.v');
    // MARIA no es titular de ARGOS en el estado canónico (pertenece al hogar): 404 uniforme, también con un cuerpo inválido (la autorización va antes del esquema).
    for (const body of [ON, { basura: true }]) {
      const res = await api.call('POST', url, { cookie: maria, body, ...NC });
      expect([res.status, problemOf(res).code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
    }
    const invalid = await api.call('POST', url, { cookie: andres, body: { basura: true }, ...NC });
    expect([invalid.status, problemOf(invalid).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    const noGuard = await api.call('POST', url, { cookie: andres, body: ON, ...NC });
    expect([noGuard.status, problemOf(noGuard).code]).toEqual([422, 'ERR-QR12-ACTIVATION-REQUIREMENTS']);
  });

  it('[SC-012-106] la 21.ª mutación de ficha en una hora da 429 con Retry-After y no se registra', async () => {
    const { andres } = await setup();
    for (let i = 0; i < 20; i += 1) expect((await api.call('POST', `/api/pets/${PET}/emergency-card/deactivate`, { cookie: andres, ...NC })).status).toBe(204);
    const limited = await api.call('POST', `/api/pets/${PET}/emergency-card/deactivate`, { cookie: andres, ...NC });
    expect([limited.status, problemOf(limited).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // el otro cubo es independiente
    expect((await api.call('PUT', '/api/account/phone', { cookie: andres, body: { phone: '+57 300 111 2233' }, ...NC })).json).toEqual({ phone: '+573001112233' });
  });

  it('[SC-012-106] la 61.ª escritura privada del QR en una hora da 429 con Retry-After y no se registra; el cubo de mutaciones de ficha es independiente', async () => {
    const { andres } = await setup();
    const put = () => api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina'] }, ...NC });
    for (let i = 0; i < 60; i += 1) expect((await put()).status).toBe(200);
    const limited = await put();
    expect([limited.status, problemOf(limited).code]).toEqual([429, 'ERR-RATE-LIMITED']);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await put()).status).toBe(429);
    expect((await api.call('POST', `/api/pets/${PET}/emergency-card/deactivate`, { cookie: andres, ...NC })).status).toBe(204);
  });

  it('[SC-012-047] el teléfono: normaliza, rechaza lo inválido sin eco y solo la cuenta propia lo ve', async () => {
    const { andres, maria } = await setup();
    const bad = await api.call('PUT', '/api/account/phone', { cookie: andres, body: { phone: 'no-es-un-telefono' }, ...NC });
    expect([bad.status, problemOf(bad).code]).toEqual([422, 'ERR-QR12-PHONE-INVALID']);
    expect(bad.text).not.toContain('no-es-un-telefono');
    expect((await api.call('PUT', '/api/account/phone', { cookie: maria, body: { phone: '+573004445566' }, ...NC })).json).toEqual({ phone: '+573004445566' });
    expect((await api.call('GET', '/api/auth/me', { cookie: andres, ...NC })).text).not.toContain('573004445566');
  });
});

describe('superficie pública /api/emergency y /e', () => {
  async function activated(): Promise<{ token: string; andres: string }> {
    const { andres } = await setup();
    await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina'] }, ...NC });
    const issued = await api.call('POST', `/api/pets/${PET}/emergency-card/activate`, { cookie: andres, body: ON, ...NC });
    return { token: (issued.json as { token: string }).token, andres };
  }

  it('[SC-012-051][SC-012-126] token válido: 200 con la vista mínima, sin cookie; HEAD, OPTIONS y POST (sin CSRF) dan el MISMO 404; la URL mal codificada también', async () => {
    const { token } = await activated();
    const ok = await api.call('GET', `/api/emergency/${token}`, { cookie: null, csrf: false, ...NC });
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.json as object).sort()).toEqual(['contactPhones', 'criticalAllergies', 'petName']);
    expect(ok.setCookie).toBeNull();
    expect(ok.headers['cache-control']).toBe('no-store');
    const reference = await api.call('GET', '/api/emergency/nada', { cookie: null, csrf: false, ...NC });
    expect(reference.status).toBe(404);
    for (const [method, url] of [['HEAD', `/api/emergency/${token}`], ['OPTIONS', `/api/emergency/${token}`], ['POST', `/api/emergency/${token}`], ['DELETE', `/api/emergency/${token}`], ['GET', '/api/emergency/%zz'], ['GET', `/api/emergency/${token}/`], ['POST', '/e/abc']] as const) {
      const res = await api.call(method, url, { cookie: null, csrf: false, ...NC });
      expect([res.status, method === 'HEAD' ? 'HEAD' : res.text], `${method} ${url}`).toEqual([404, method === 'HEAD' ? 'HEAD' : reference.text]);
      expect(Object.keys(res.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
    }
    expect(JSON.parse(reference.text)).toMatchObject({ code: 'ERR-PET-NOT-FOUND', instance: '/emergency' });
  });

  it('[SC-012-050] el shell /e/{token} responde 200 con las cabeceras del anexo §5 sin cambiar con el valor del token', async () => {
    const { token } = await activated();
    const a = await api.call('GET', `/e/${token}`, { cookie: null, ...NC });
    const b = await api.call('GET', '/e/cualquier-cosa', { cookie: null, ...NC });
    expect([a.status, b.text]).toEqual([200, a.text]);
    expect(a.headers['referrer-policy']).toBe('no-referrer');
    expect(a.headers['cache-control']).toBe('no-store');
    expect(String(a.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(a.setCookie).toBeNull();
  });

  it('[SC-012-086][SC-012-125] ningún registro de la aplicación contiene el token ni el teléfono, tampoco en los 404 y 429 públicos', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const { andres } = await setup({ logger: { ...cloudLoggerOptions({ databaseUrl: undefined }), stream } });
    await api.call('PUT', '/api/account/phone', { cookie: andres, body: { phone: '+573001112233' }, ...NC });
    await api.call('PUT', `/api/pets/${PET}/critical-allergies`, { cookie: andres, body: { criticalAllergies: ['Penicilina'] }, ...NC });
    const issued = (await api.call('POST', `/api/pets/${PET}/emergency-card/activate`, { cookie: andres, body: { ...ON, showMyPhone: true }, ...NC })).json as { token: string };
    for (const suffix of ['', 'x', '/', '?a=1']) {
      await api.call('GET', `/api/emergency/${issued.token}${suffix}`, { cookie: null, ...NC });
      await api.call('GET', `/e/${issued.token}${suffix}`, { cookie: null, ...NC });
    }
    for (let i = 0; i < 35; i += 1) await api.call('GET', `/api/emergency/${issued.token}`, { cookie: null, ip: '203.0.113.7', ...NC });
    const dump = lines.join('\n');
    expect(dump.length).toBeGreaterThan(0);
    expect(dump).not.toContain(issued.token);
    expect(dump).not.toContain('573001112233');
    expect(dump).not.toContain('Penicilina');
    const audit = api.dump();
    expect(audit).not.toContain(issued.token);
  });

  it('[SC-012-087] la 31.ª petición por IP y minuto da 429 uniforme con Retry-After; otra IP no se ve afectada', async () => {
    const { token } = await activated();
    for (let i = 0; i < 30; i += 1) expect((await api.call('GET', `/api/emergency/${token}`, { cookie: null, ip: '203.0.113.50', ...NC })).status).toBe(200);
    const limited = await api.call('GET', `/api/emergency/${token}`, { cookie: null, ip: '203.0.113.50', ...NC });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(JSON.parse(limited.text)).toMatchObject({ code: 'ERR-RATE-LIMITED', instance: '/emergency' });
    expect((await api.call('GET', `/api/emergency/${token}`, { cookie: null, ip: '203.0.113.51', ...NC })).status).toBe(200);
  });

  it('[SC-012-087] HEAD y OPTIONS agotado el tope por IP también dan 429 con Retry-After', async () => {
    const { token } = await activated();
    for (let i = 0; i < 30; i += 1) expect((await api.call('GET', `/api/emergency/${token}`, { cookie: null, ip: '203.0.113.60', ...NC })).status).toBe(200);
    for (const method of ['HEAD', 'OPTIONS'] as const) {
      const limited = await api.call(method, `/api/emergency/${token}`, { cookie: null, csrf: false, ip: '203.0.113.60', ...NC });
      expect([method, limited.status]).toEqual([method, 429]);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    }
  });
});
