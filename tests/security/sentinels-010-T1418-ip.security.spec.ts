import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAppConfig, type AppConfig } from '../../src/infrastructure/config/app-config.ts';
import { ipLimitKey, INVALID_IP_KEY } from '../../src/domain/sharing/ip-limit-key.ts';
import { AdminAccessLimiter } from '../../src/infrastructure/http/admin-rate-limit.ts';
import { RegistrationRateLimiter } from '../../src/infrastructure/http/registration-rate-limit.ts';
import { DEFAULT_MAX_TRACKED } from '../../src/infrastructure/http/bounded-map.ts';
import { createProductionApp } from '../../src/infrastructure/http/server.ts';

/**
 * Sentinels T1418 (Feature 010, Bloque C, [GH:#66]): vectores SEN-IP-01..09 sobre la resolución de IP real (`request.ip` con
 * `ARGOS_TRUST_PROXY_HOPS = 2`), la clave de limitadores `ipLimitKey` y el tope duro de los mapas (`setBounded`, 5 limitadores).
 * Fuente: .specify/memory/audits/trinity-010-T1418-ip-xff-2026-11-24.md; enmienda REQ-EDG10-003 / SC-010-016 en spec.md (H-T1418-01/02 APPROVED).
 * Un fallo es un HALLAZGO con evidencia: no se corrige código de src/ desde esta suite.
 * EDGE-010-008 (acceso directo *.run.app con XFF rotado) queda DOCUMENTAL: se ejecuta solo con ARGOS_DOC_DIRECT_RUN_APP=1, nunca verde por defecto.
 *
 * @implements REQ-EDG10-001, REQ-EDG10-002, REQ-EDG10-003, EDGE-010-002, EDGE-010-008, SC-010-014, SC-010-015, SC-010-016, H-T1418-01, H-T1418-02
 */

const CLIENT = '203.0.113.7';
const EDGE = '198.51.100.2';
const PROXY_PEER = '10.0.0.1';
const NOW = 1_800_000_000_000;
const ONE_PER_DAY = { maxNewAccounts: 1, windowMinutes: 1440 };

let sandbox: string;
let base: AppConfig;
const apps: FastifyInstance[] = [];

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-sen-t1418-'));
  base = loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(sandbox, 'argos.sqlite') });
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  rmSync(sandbox, { recursive: true, force: true });
});

/** App real con 2 saltos de confianza; registra el `request.ip` visto por cada petición que llega a la aplicación. */
async function instance() {
  const app = await createProductionApp({ ...base, host: '0.0.0.0', trustProxyHops: 2 } as AppConfig, false, { staticRoot: sandbox });
  apps.push(app);
  const seen: string[] = [];
  app.addHook('onRequest', async (request) => {
    seen.push(request.ip);
  });
  return { app, seen };
}

/** Petición HTTP por inject con el par de socket de un proxy de confianza (10.0.0.1), como en Cloud Run. */
function get(app: FastifyInstance, headers: Record<string, string | string[]>) {
  return app.inject({ method: 'GET', url: '/healthz', remoteAddress: PROXY_PEER, headers });
}

describe('SEN-IP-01 spoofing de X-Forwarded-For con 2 saltos (REQ-EDG10-002)', () => {
  it('el elemento inyectado por la izquierda se ignora; request.ip = IP real del cliente', async () => {
    const { app, seen } = await instance();
    const response = await get(app, { 'x-forwarded-for': `6.6.6.6, ${CLIENT}, ${EDGE}` });
    expect(response.statusCode).toBe(200);
    expect(seen).toEqual([CLIENT]);
    expect(ipLimitKey(seen[0]!)).toBe(CLIENT);
  });
});

describe('SEN-IP-02 dos cabeceras X-Forwarded-For (REQ-EDG10-002)', () => {
  it('Node une las líneas con coma; el atacante de la primera línea no ocupa el salto de confianza', async () => {
    const { app, seen } = await instance();
    const response = await get(app, { 'x-forwarded-for': ['6.6.6.6', `${CLIENT}, ${EDGE}`] });
    expect(response.statusCode).toBe(200);
    expect(seen).toEqual([CLIENT]);
  });
});

describe('SEN-IP-03 cabeceras no confiables (X-Real-IP, Forwarded) (REQ-EDG10-002)', () => {
  it('X-Real-IP y Forwarded con un XFF válido se ignoran; request.ip = cliente', async () => {
    const { app, seen } = await instance();
    const response = await get(app, {
      'x-forwarded-for': `${CLIENT}, ${EDGE}`,
      'x-real-ip': '6.6.6.6',
      forwarded: 'for=6.6.6.6;proto=https',
    });
    expect(response.statusCode).toBe(200);
    expect(seen).toEqual([CLIENT]);
  });
});

describe('SEN-IP-04 misma IP con puerto distinto comparte contador (H-T1418-02, SC-010-016)', () => {
  it('request.ip crudo varía por puerto, pero ipLimitKey y el limitador de registro coinciden', async () => {
    const { app, seen } = await instance();
    const a = await get(app, { 'x-forwarded-for': `${CLIENT}:5555, ${EDGE}` });
    const b = await get(app, { 'x-forwarded-for': `${CLIENT}:6666, ${EDGE}` });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(ipLimitKey(seen[0]!)).toBe(CLIENT);
    expect(ipLimitKey(seen[1]!)).toBe(CLIENT);
    const limiter = new RegistrationRateLimiter(() => NOW, ONE_PER_DAY);
    limiter.recordCreated(seen[0]!);
    expect(() => limiter.assertAllowed(seen[1]!)).toThrow();
  });
});

describe('SEN-IP-05 XFF gigante y ráfagas de valores distintos (H-T1418-02, SC-010-016)', () => {
  it('un elemento de 8000 caracteres responde 200 y se convierte en la clave única invalid', async () => {
    const { app, seen } = await instance();
    const huge = `${'a'.repeat(8000)}`;
    const response = await get(app, { 'x-forwarded-for': `${huge}, ${EDGE}` });
    expect(response.statusCode).toBe(200);
    expect(ipLimitKey(seen[0]!)).toBe(INVALID_IP_KEY);
  });

  it('10.000 peticiones con valores distintos: 200 en todas y el mapa no crece más allá de la clave invalid', async () => {
    const { app, seen } = await instance();
    for (let i = 0; i < 10_000; i += 1) {
      const pad = 'x'.repeat(200 + (i % 500));
      const response = await get(app, { 'x-forwarded-for': `${pad}${i}, ${EDGE}` });
      expect(response.statusCode).toBe(200);
    }
    const limiter = new RegistrationRateLimiter(() => NOW, ONE_PER_DAY);
    for (const ip of seen) limiter.recordCreated(ip);
    const created = (limiter as unknown as { created: Map<string, number[]> }).created;
    expect(created.size).toBe(1);
    expect([...created.keys()]).toEqual([INVALID_IP_KEY]);
  }, 120_000);

  it('ráfaga de 10.000 IPv4 distintas: el mapa nunca supera el tope duro DEFAULT_MAX_TRACKED', () => {
    const limiter = new RegistrationRateLimiter(() => NOW, ONE_PER_DAY);
    for (let i = 0; i < 10_000 + 500; i += 1) {
      const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
      limiter.recordCreated(ip);
    }
    const created = (limiter as unknown as { created: Map<string, number[]> }).created;
    expect(DEFAULT_MAX_TRACKED).toBe(10_000);
    expect(created.size).toBeLessThanOrEqual(DEFAULT_MAX_TRACKED);
  });

  it('los tres mapas de AdminAccessLimiter también se acotan al escribir claves distintas', () => {
    const limiter = new AdminAccessLimiter(() => NOW, undefined, undefined, 50);
    for (let i = 0; i < 200; i += 1) {
      const ip = `10.0.${(i >> 8) & 255}.${i & 255}`;
      limiter.recordFailure(ip);
      limiter.consumeStart(ip);
    }
    const internals = limiter as unknown as { failures: Map<string, number[]>; starts: Map<string, number[]> };
    expect(internals.failures.size).toBeLessThanOrEqual(50);
    expect(internals.starts.size).toBeLessThanOrEqual(50);
  });
});

describe('SEN-IP-06 IPv6 y forma IPv4-mapeada (H-T1418-01, REQ-EDG10-003)', () => {
  it('[2001:db8::1]:443, 2001:DB8:0:0:0:0:0:1 y 2001:db8::1 producen la misma clave /64', () => {
    const k1 = ipLimitKey('[2001:db8::1]:443');
    const k2 = ipLimitKey('2001:DB8:0:0:0:0:0:1');
    const k3 = ipLimitKey('2001:db8::1');
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
    expect(k1).toBe('v6:2001:0db8:0000:0000');
  });

  it('::ffff:203.0.113.7 y 203.0.113.7 producen la misma clave', () => {
    expect(ipLimitKey('::ffff:203.0.113.7')).toBe(ipLimitKey(CLIENT));
    expect(ipLimitKey(CLIENT)).toBe(CLIENT);
  });

  it('::ffff:cb00:7107 (forma hexadecimal de IPv4 mapeada) también colapsa a IPv4', () => {
    expect(ipLimitKey('::ffff:cb00:7107')).toBe(CLIENT);
  });
});

describe('SEN-IP-07 mismo /64 comparte tope de registro (H-T1418-01, REQ-EDG10-003)', () => {
  it('dos direcciones del mismo /64 generan la misma clave y consumen el mismo cupo', async () => {
    const { app, seen } = await instance();
    await get(app, { 'x-forwarded-for': `2001:db8:1:2::1, ${EDGE}` });
    await get(app, { 'x-forwarded-for': `2001:db8:1:2:ffff:ffff:ffff:fffe, ${EDGE}` });
    expect(ipLimitKey(seen[0]!)).toBe(ipLimitKey(seen[1]!));
    const limiter = new RegistrationRateLimiter(() => NOW, ONE_PER_DAY);
    limiter.recordCreated(seen[0]!);
    expect(() => limiter.assertAllowed(seen[1]!)).toThrow();
  });

  it('dos /64 distintos no se comparten', () => {
    expect(ipLimitKey('2001:db8:1:2::1')).not.toBe(ipLimitKey('2001:db8:1:3::1'));
    const limiter = new RegistrationRateLimiter(() => NOW, ONE_PER_DAY);
    limiter.recordCreated('2001:db8:1:2::1');
    expect(() => limiter.assertAllowed('2001:db8:1:3::1')).not.toThrow();
  });
});

describe('SEN-IP-08 IPv6 e IPv4 mal formados (REQ-EDG10-002, sin 5xx)', () => {
  const MALFORMED = ['2001:db8::1::2', 'fe80::1%eth0', '0x7f.1', '203.0.113.007', 'garbage'];

  it('ipLimitKey devuelve invalid o una forma canónica, nunca el valor crudo', () => {
    expect(ipLimitKey('2001:db8::1::2')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('0x7f.1')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('203.0.113.007')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('garbage')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('fe80::1%eth0')).toBe('v6:fe80:0000:0000:0000');
  });

  it('en la app real ningún elemento mal formado produce 5xx', async () => {
    const { app, seen } = await instance();
    for (const bad of MALFORMED) {
      const response = await get(app, { 'x-forwarded-for': `${bad}, ${EDGE}` });
      expect(response.statusCode, bad).toBeLessThan(500);
      if (response.statusCode === 200) expect(ipLimitKey(seen.at(-1)!)).toMatch(/^(invalid|v6:[0-9a-f:]+|\d+\.\d+\.\d+\.\d+)$/);
    }
  });
});

describe('SEN-IP-09 CRLF y NUL en X-Forwarded-For (REQ-EDG10-002, sin log del valor)', () => {
  it('ipLimitKey sobre CRLF / NUL / CR suelto devuelve invalid (inyección vía inject, sin parser real)', () => {
    expect(ipLimitKey('1.1.1.1\r\nX-Evil: 1')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('1.1.1.1\u0000')).toBe(INVALID_IP_KEY);
    expect(ipLimitKey('1.1.1.1\r')).toBe(INVALID_IP_KEY);
  });

  it('con socket TCP real, el parser de Node rechaza CR/NUL en la cabecera: 400 y la aplicación no ve la petición', async () => {
    const { app, seen } = await instance();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);
    const attacks = [
      `X-Forwarded-For: 1.1.1.1\u0000, ${EDGE}\r\n`,
      `X-Forwarded-For: 1.1.1.1\r, ${EDGE}\r\n`,
      `X-Forwarded-For: 1.1.1.1\u0001, ${EDGE}\r\n`,
    ];
    for (const header of attacks) {
      const raw = await rawGet(port, header);
      expect(raw.status === null || raw.status === 400, JSON.stringify(header)).toBe(true);
    }
    expect(seen.filter((ip) => /[\r\n\u0000]/.test(ip))).toEqual([]);
  });

  it('CRLF con obs-fold (continuación de línea) jamás deja \\r ni \\n en request.ip', async () => {
    const { app, seen } = await instance();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await rawGet(port, `X-Forwarded-For: 1.1.1.1\r\n 6.6.6.6, ${EDGE}\r\n`);
    for (const ip of seen) {
      expect(/[\r\n]/.test(ip)).toBe(false);
      expect(ipLimitKey(ip)).toMatch(/^(invalid|v6:[0-9a-f:]+|\d+\.\d+\.\d+\.\d+)$/);
    }
  });
});

describe('EDGE-010-008 acceso directo *.run.app con XFF rotado (DOCUMENTAL, no verde por defecto)', () => {
  it.skipIf(process.env.ARGOS_DOC_DIRECT_RUN_APP !== '1')('sin Cloudflare, el atacante fija request.ip: riesgo aceptado H-01 A, documentado', async () => {
    const { app, seen } = await instance();
    await get(app, { 'x-forwarded-for': `6.6.6.6, 1.1.1.1` });
    // Riesgo residual aceptado (H-01 A): aquí request.ip sí es controlable por el cliente.
    expect(seen).toEqual(['6.6.6.6']);
  });
});

/** Petición cruda por TCP; devuelve el código de estado o null si el socket se cierra sin respuesta HTTP. */
function rawGet(port: number, extraHeader: string): Promise<{ status: number | null; raw: string }> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    let data = '';
    const finish = () => {
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(data);
      resolve({ status: match ? Number(match[1]) : null, raw: data.slice(0, 200) });
    };
    socket.on('data', (chunk) => {
      data += chunk.toString('latin1');
    });
    socket.on('end', finish);
    socket.on('close', finish);
    socket.on('error', finish);
    socket.setTimeout(5_000, () => {
      socket.destroy();
      finish();
    });
    socket.write(Buffer.from(`GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n${extraHeader}Connection: close\r\n\r\n`, 'latin1'));
  });
}
