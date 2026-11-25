import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppConfigError, loadAppConfig, type AppConfig } from '../../src/infrastructure/config/app-config.ts';
import { AdminAccessLimiter } from '../../src/infrastructure/http/admin-rate-limit.ts';
import { RegistrationRateLimiter } from '../../src/infrastructure/http/registration-rate-limit.ts';
import { createProductionApp } from '../../src/infrastructure/http/server.ts';

/**
 * T1416 (Feature 010, Bloque C, [GH:#66]) PRUEBAS ROJAS: IP real detrás de Cloudflare con `ARGOS_TRUST_PROXY_HOPS` (D10-03, REQ-EDG10-001..003).
 * Rojas a propósito hasta T1417: la variable aún no existe, así que `loadAppConfig` la ignora, `AppConfig` no expone `trustProxyHops` y `server.ts:241` fija 1 salto.
 * Contrato PROPUESTO por Keymaker (confirmar en T1417): `AppConfig.trustProxyHops: 0|1|2|3` (defecto 1) leído de `ARGOS_TRUST_PROXY_HOPS`; `createProductionApp`
 * lo pasa a `trustProxy` (semántica `hop < N`, ya existente en `app.ts`). El salto solo se ejercita con `host: '0.0.0.0'` (`server.ts:241`, hecho verificado en T1417).
 * Modelo de cadena: Cloud Run añade al XFF la IP que ve; Cloudflare pone la del cliente. Con Cloudflare recibe «cliente, ip-borde-cloudflare» (2 saltos de confianza).
 * H-01 A: el caso directo `*.run.app` con XFF rotado y HOPS=2 deja `request.ip` controlable y anula REQ-EDG10-003; se documenta, no verde por defecto
 * (se ejecuta solo con `ARGOS_DOC_DIRECT_RUN_APP=1`). H-02 A: el límite es «por instancia y por IP real» (hasta 10 cuentas por IP en 24 h con 2 instancias).
 *
 * @implements REQ-EDG10-001, REQ-EDG10-002, REQ-EDG10-003, EDGE-010-001, EDGE-010-002, EDGE-010-008, EDGE-010-009, SC-010-014, SC-010-015, SC-010-016
 */
const CLIENT = '203.0.113.7';
const CLIENT_B = '203.0.113.8';
const EDGE = '198.51.100.2';
const EDGE_2 = '198.51.100.3';
const ATTACKER = '6.6.6.6';

let sandbox: string;
let base: AppConfig;
const apps: FastifyInstance[] = [];

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-t1416-'));
  base = loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(sandbox, 'argos.sqlite') });
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  rmSync(sandbox, { recursive: true, force: true });
});

/** Compone la aplicación real con N saltos (campo propuesto `trustProxyHops`) y devuelve un observador de `request.ip`. */
async function instance(hops: number, host: '0.0.0.0' | '127.0.0.1' = '0.0.0.0') {
  const app = await createProductionApp({ ...base, host, trustProxyHops: hops } as AppConfig, false, { staticRoot: sandbox });
  apps.push(app);
  let seen = '';
  app.addHook('onRequest', async (request) => {
    seen = request.ip;
  });
  return {
    ip: async (xff?: string | string[]): Promise<string> => {
      seen = '';
      const response = await app.inject({ method: 'GET', url: '/healthz', ...(xff === undefined ? {} : { headers: { 'x-forwarded-for': xff } }) });
      expect(response.statusCode).toBe(200);
      return seen;
    },
  };
}

describe('T1416 [REQ-EDG10-001] ARGOS_TRUST_PROXY_HOPS: lectura y validación en app-config', () => {
  const env = (value?: string) => loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(sandbox, 'x.sqlite'), ...(value === undefined ? {} : { ARGOS_TRUST_PROXY_HOPS: value }) });

  it('el defecto es 1 (comportamiento actual) y 0..3 se aceptan', () => {
    expect((env() as unknown as { trustProxyHops: number }).trustProxyHops).toBe(1);
    for (const n of [0, 1, 2, 3]) expect((env(String(n)) as unknown as { trustProxyHops: number }).trustProxyHops).toBe(n);
  });

  it('[trustProxy: true prohibido] «true», negativos, 4, decimales y texto se rechazan nombrando solo la variable, sin eco del valor', () => {
    for (const bad of ['true', 'TRUE', '-1', '4', '1.5', 'abc', '01', '1e1', ' 2']) {
      let thrown: unknown;
      try {
        env(bad);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `valor ${JSON.stringify(bad)}`).toBeInstanceOf(AppConfigError);
      expect(String((thrown as Error).message)).toContain('ARGOS_TRUST_PROXY_HOPS');
      expect(String((thrown as Error).message)).not.toContain(bad.trim() === '' ? '\u0000' : `=${bad}`);
    }
  });
});

describe('T1416 [REQ-EDG10-002] [SC-010-014] request.ip con 1, 2 y 3 saltos de confianza (cadena válida de proxy)', () => {
  it('HOPS=1 con cadena de 1 elemento: la IP es el cliente', async () => {
    expect(await (await instance(1)).ip(CLIENT)).toBe(CLIENT);
  });
  it('HOPS=2 (Cloudflare + Cloud Run): la IP es el cliente, no el borde de Cloudflare', async () => {
    expect(await (await instance(2)).ip(`${CLIENT}, ${EDGE}`)).toBe(CLIENT);
  });
  it('HOPS=3 con cadena de 3 elementos: la IP es el cliente', async () => {
    expect(await (await instance(3)).ip(`${CLIENT}, ${EDGE_2}, ${EDGE}`)).toBe(CLIENT);
  });
  it('HOPS=0: nunca se confía en XFF, la IP es la del socket', async () => {
    expect(await (await instance(0)).ip(`${CLIENT}, ${EDGE}`)).toBe('127.0.0.1');
  });
  it('valor ausente: sin XFF la IP es la del socket con cualquier HOPS', async () => {
    for (const n of [1, 2, 3]) expect(await (await instance(n)).ip()).toBe('127.0.0.1');
  });
  it('con host 127.0.0.1 no se confía en XFF aunque HOPS sea 2 (server.ts:241, desarrollo local)', async () => {
    expect(await (await instance(2, '127.0.0.1')).ip(`${CLIENT}, ${EDGE}`)).toBe('127.0.0.1');
  });
});

describe('T1416 [REQ-EDG10-002] [SC-010-015] XFF falsificado por el cliente no determina request.ip', () => {
  it('HOPS=2: un elemento inyectado al inicio se ignora', async () => {
    expect(await (await instance(2)).ip(`${ATTACKER}, ${CLIENT}, ${EDGE}`)).toBe(CLIENT);
  });
  it('HOPS=2: varios elementos inyectados al inicio se ignoran', async () => {
    expect(await (await instance(2)).ip(`${ATTACKER}, 7.7.7.7, 8.8.8.8, ${CLIENT}, ${EDGE}`)).toBe(CLIENT);
  });
  it('HOPS=3: un elemento inyectado al inicio se ignora', async () => {
    expect(await (await instance(3)).ip(`${ATTACKER}, ${CLIENT}, ${EDGE_2}, ${EDGE}`)).toBe(CLIENT);
  });
  it('HOPS=1: el elemento inyectado a la izquierda no se usa (comportamiento actual, línea base)', async () => {
    expect(await (await instance(1)).ip(`${ATTACKER}, ${CLIENT}`)).toBe(CLIENT);
  });
});

describe('T1416 [EDGE-010-001] IPv6, puertos, cabecera duplicada y basura en X-Forwarded-For', () => {
  it('IPv6 en la cadena con HOPS=2', async () => {
    expect(await (await instance(2)).ip('2001:db8::7, 2001:db8::cf')).toBe('2001:db8::7');
    expect(await (await instance(2)).ip(`${ATTACKER}, 2001:db8::7, 2001:db8::cf`)).toBe('2001:db8::7');
  });
  it('elemento con puerto: el elemento inyectado a la izquierda sigue ignorado y la IP resuelta es la del cliente (sin eco del atacante)', async () => {
    const ip = await (await instance(2)).ip(`${ATTACKER}, ${CLIENT}:51234, ${EDGE}`);
    expect(ip.startsWith(CLIENT)).toBe(true);
    expect(ip).not.toContain(ATTACKER);
  });
  it('cabecera duplicada: dos líneas X-Forwarded-For equivalen a la cadena unida con coma; la primera (falsificable) se ignora', async () => {
    const ip = await (await instance(2)).ip([ATTACKER, `${CLIENT}, ${EDGE}`]);
    expect(ip).toBe(CLIENT);
  });
  it('más elementos que saltos de confianza no desplazan la IP resuelta', async () => {
    const chain = Array.from({ length: 12 }, (_, i) => `192.0.2.${i + 10}`).join(', ');
    expect(await (await instance(2)).ip(`${chain}, ${CLIENT}, ${EDGE}`)).toBe(CLIENT);
  });
  it('valores malformados y vacíos no rompen la petición (200, sin 5xx) y no producen la IP del atacante', async () => {
    const app = await instance(2);
    for (const xff of ['', ',', ',,,', 'no-es-ip', // T1417: el elemento vacío se descarta al analizar; «ATACANTE, , BORDE» queda «ATACANTE, BORDE» y el atacante sería el cliente legítimo del modelo; se antepone el cliente real (entrada del harness, aserción intacta).
      `${ATTACKER}, , ${CLIENT}, ${EDGE}`, `${'1.'.repeat(300)}1`, '\u0000, x']) {
      const ip = await app.ip(xff);
      expect(typeof ip).toBe('string');
      expect(ip).not.toBe(ATTACKER);
    }
  });
});

describe('T1416 [EDGE-010-002] HOPS=1 detrás de Cloudflare: todos comparten IP (detección)', () => {
  it('con HOPS=1 y cadena de 2 elementos dos clientes distintos resuelven la MISMA IP (la del borde); con HOPS=2 resuelven IPs distintas', async () => {
    const one = await instance(1);
    const a1 = await one.ip(`${CLIENT}, ${EDGE}`);
    const b1 = await one.ip(`${CLIENT_B}, ${EDGE}`);
    expect(a1).toBe(EDGE);
    expect(b1).toBe(EDGE);
    const two = await instance(2);
    expect(await two.ip(`${CLIENT}, ${EDGE}`)).toBe(CLIENT);
    expect(await two.ip(`${CLIENT_B}, ${EDGE}`)).toBe(CLIENT_B);
  });
  it('consecuencia: con HOPS=1 mal fijado el sexto usuario de ese conjunto es bloqueado; con HOPS=2 cada cliente tiene su contador', async () => {
    const limiter = new RegistrationRateLimiter(() => 1_000_000);
    const mis = await instance(1);
    const ok = await instance(2);
    const ipA = await mis.ip(`${CLIENT}, ${EDGE}`);
    for (let i = 0; i < 5; i += 1) limiter.recordCreated(ipA);
    const ipB1 = await mis.ip(`${CLIENT_B}, ${EDGE}`);
    const ipB2 = await ok.ip(`${CLIENT_B}, ${EDGE}`);
    expect(() => limiter.assertAllowed(ipB1)).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    expect(() => limiter.assertAllowed(ipB2)).not.toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
});

describe('T1416 [REQ-EDG10-003] [SC-010-016] límites por IP real: dos clientes distintos detrás de Cloudflare no comparten contador', () => {
  it('registro 5/24 h: el cliente A agota su cupo y el cliente B sigue permitido', async () => {
    const limiter = new RegistrationRateLimiter(() => 1_000_000);
    const app = await instance(2);
    const a = await app.ip(`${CLIENT}, ${EDGE}`);
    const b = await app.ip(`${CLIENT_B}, ${EDGE}`);
    expect(a).not.toBe(b);
    for (let i = 0; i < 5; i += 1) limiter.recordCreated(a);
    expect(() => limiter.assertAllowed(a)).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    expect(() => limiter.assertAllowed(b)).not.toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
  it('login de /admin 10/15 min: el cliente A se bloquea y el cliente B no', async () => {
    const limiter = new AdminAccessLimiter(() => 1_000_000);
    const app = await instance(2);
    const a = await app.ip(`${CLIENT}, ${EDGE}`);
    const b = await app.ip(`${CLIENT_B}, ${EDGE}`);
    expect(a).not.toBe(b);
    for (let i = 0; i < 10; i += 1) limiter.recordFailure(a);
    expect(() => limiter.assertNotBlocked(a)).toThrow('ERR-ADMIN-RATE-LIMITED');
    expect(() => limiter.assertNotBlocked(b)).not.toThrow('ERR-ADMIN-RATE-LIMITED');
  });
  it('un XFF inyectado no permite rotar la IP para evadir el tope de registro (HOPS=2): la IP resuelta es siempre la del cliente real', async () => {
    const app = await instance(2);
    const ips = new Set<string>();
    for (let i = 0; i < 8; i += 1) ips.add(await app.ip(`10.0.0.${i}, ${CLIENT}, ${EDGE}`));
    expect([...ips]).toEqual([CLIENT]);
  });
});

describe('T1416 [EDGE-010-009] [H-02 A] contador de registro «por instancia y por IP real»', () => {
  it('dos instancias simuladas permiten hasta 10 cuentas por IP en 24 h (5 por instancia); la 6.ª de cada instancia es rechazada', async () => {
    const real = await (await instance(2)).ip(`${CLIENT}, ${EDGE}`);
    expect(real).toBe(CLIENT);
    const first = new RegistrationRateLimiter(() => 1_000_000);
    const second = new RegistrationRateLimiter(() => 1_000_000);
    for (let i = 0; i < 5; i += 1) {
      first.assertAllowed(real);
      first.recordCreated(real);
      second.assertAllowed(real);
      second.recordCreated(real);
    }
    expect(() => first.assertAllowed(real)).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    expect(() => second.assertAllowed(real)).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
  it('el reinicio del contador (escalado a cero) devuelve el cupo completo: documenta el comportamiento real', async () => {
    const real = await (await instance(2)).ip(`${CLIENT}, ${EDGE}`);
    let now = 1_000_000;
    const before = new RegistrationRateLimiter(() => now);
    for (let i = 0; i < 5; i += 1) before.recordCreated(real);
    expect(() => before.assertAllowed(real)).toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
    now += 60_000;
    const restarted = new RegistrationRateLimiter(() => now);
    expect(() => restarted.assertAllowed(real)).not.toThrow('ERR-ACCOUNT-REGISTRATION-RATE-LIMITED');
  });
});

describe('T1416 [EDGE-010-008] [H-01 A] acceso directo a *.run.app con XFF rotado y HOPS=2 (documentado, no verde por defecto)', () => {
  it.skipIf(process.env['ARGOS_DOC_DIRECT_RUN_APP'] !== '1')('request.ip queda controlado por el atacante: cada XFF rotado produce una IP distinta y el tope de registro se elude', async () => {
    const app = await instance(2);
    const limiter = new RegistrationRateLimiter(() => 1_000_000);
    for (let i = 0; i < 12; i += 1) {
      // Directo a Cloud Run no hay Cloudflare: la cadena es «lo-que-envía-el-atacante, ip-real-vista-por-Google».
      const ip = await app.ip(`172.16.0.${i}, ${ATTACKER}`);
      limiter.assertAllowed(ip);
      limiter.recordCreated(ip);
    }
    expect(true).toBe(true);
  });
});
