import { afterEach, describe, expect, it } from 'vitest';
import { REGISTRATION_LIMIT } from '../../../src/infrastructure/config/app-config.ts';
import { createIdentityApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1288 (pruebas rojas, Feature 009, Fase 4, #18; ADR-009-15, D9-25): límite de registros nuevos por IP efectiva (EDGE-009-040, REQ-APR9-002). Más de 5 altas en 24 h desde la misma IP
 * responden de forma uniforme `429` `ERR-ACCOUNT-REGISTRATION-RATE-LIMITED` con `Retry-After`, sin crear fila ni cookie; el intento rechazado no consume cupo ni prolonga la ventana; el
 * `409` de `username` ocupado no cambia (EDGE-009-004). Los números salen de `app-config.ts`. La advertencia de umbral de PENDING está en `tests/unit/t1288-umbral-pendientes-009.spec.ts`.
 * @implements REQ-APR9-002, EDGE-009-040, EDGE-009-004, ERR-ACCOUNT-REGISTRATION-RATE-LIMITED, SC-009-001
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const IP_A = '203.0.113.10';
const IP_B = '203.0.113.11';
const WINDOW_MS = REGISTRATION_LIMIT.windowMinutes * 60_000;
const body = (name: string) => ({ username: name, displayName: 'Solicitante', password: 'Clave2026x!', confirmPassword: 'Clave2026x!', email: `${name}@example.test`, adultDeclaration: true });
const register = (a: Api, name: string, ip: string, headers: Record<string, string> = {}) => a.call('POST', '/api/auth/register', { body: body(name), ip, headers, contract: false });
const users = (a: Api): number => a.db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number;
const at = (a: Api, ms: number): void => {
  const iso = new Date(ms).toISOString();
  a.clock.setClock(iso.slice(0, 10), iso);
};
const problem = (r: ApiResponse) => r.json as { status: number; code: string; title: string; detail: string };
async function fill(a: Api, ip: string, count = REGISTRATION_LIMIT.maxNewAccounts): Promise<void> {
  for (let i = 0; i < count; i += 1) expect((await register(a, `cupo.${ip.slice(-2)}.${i}`, ip)).status).toBe(201);
}

describe('T1288 [REQ-APR9-002] [EDGE-009-040] ERR-ACCOUNT-REGISTRATION-RATE-LIMITED: el valor aprobado vive solo en app-config.ts (D9-25)', () => {
  it('el tope es de 5 registros nuevos por IP efectiva en 24 h', () => {
    expect(REGISTRATION_LIMIT).toEqual({ maxNewAccounts: 5, windowMinutes: 24 * 60 });
  });
});

describe('T1288 [EDGE-009-040] [SC-009-001] ERR-ACCOUNT-REGISTRATION-RATE-LIMITED: el registro número 6 desde la misma IP responde 429 uniforme sin crear fila', () => {
  it('los 5 primeros registros nacen PENDING (201) y el 6.º es 429 ERR-ACCOUNT-REGISTRATION-RATE-LIMITED con Retry-After, sin cookie ni fila nueva', async () => {
    api = await createIdentityApi();
    const before = users(api);
    await fill(api, IP_A);
    expect(users(api)).toBe(before + 5);
    const blocked = await register(api, 'sexto.registro', IP_A);
    expect(problem(blocked)).toMatchObject({ status: 429, code: 'ERR-ACCOUNT-REGISTRATION-RATE-LIMITED' });
    expect(blocked.cookie).toBeNull();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(WINDOW_MS / 1000);
    expect(users(api)).toBe(before + 5);
    expect(api.db.prepare("SELECT COUNT(*) FROM users WHERE lower(username) = 'sexto.registro'").pluck().get()).toBe(0);
  });

  it('la respuesta al exceso es uniforme: el mismo cuerpo con un username libre que con uno ocupado, y no revela nada del correo ni del username', async () => {
    api = await createIdentityApi();
    await fill(api, IP_A);
    const free = await register(api, 'nombre.libre', IP_A);
    const taken = await register(api, 'ana.duena', IP_A);
    expect(free.status).toBe(429);
    expect(taken.status).toBe(429);
    const strip = (r: ApiResponse) => ({ ...(r.json as Record<string, unknown>), instance: undefined });
    expect(strip(taken)).toEqual(strip(free));
    expect(free.text).not.toContain('nombre.libre');
  });

  it('el límite es por IP efectiva: otra IP sigue registrando y falsear X-Forwarded-For no evade el tope (sin proxy de confianza)', async () => {
    api = await createIdentityApi();
    await fill(api, IP_A);
    expect((await register(api, 'otra.ip', IP_B)).status).toBe(201);
    const spoofed = await register(api, 'xff.evasion', IP_A, { 'x-forwarded-for': '198.51.100.99' });
    expect(spoofed.status).toBe(429);
  });
});

describe('T1288 [EDGE-009-040] el intento rechazado no consume cupo ni prolonga la ventana', () => {
  it('tras varios rechazos, la ventana vence 24 h después del PRIMER alta y el Retry-After es exacto', async () => {
    api = await createIdentityApi();
    const start = Date.parse(api.clock.nowIsoTimestamp());
    await fill(api, IP_A);
    at(api, start + 3_600_000);
    const first = await register(api, 'rechazo.uno', IP_A);
    at(api, start + 7_200_000);
    expect((await register(api, 'rechazo.dos', IP_A)).status).toBe(429);
    expect(Number(first.headers['retry-after'])).toBe((WINDOW_MS - 3_600_000) / 1000);
    at(api, start + WINDOW_MS - 1_000);
    expect((await register(api, 'aun.no', IP_A)).status).toBe(429);
    at(api, start + WINDOW_MS + 1_000);
    expect((await register(api, 'ya.si', IP_A)).status).toBe(201);
  });
});

describe('T1288 [EDGE-009-004] [EDGE-009-040] el límite no cambia la respuesta de username ocupado y el 409 no consume cupo', () => {
  it('con cupo disponible, un username ocupado sigue siendo 409 ERR-AUTH-USERNAME-TAKEN y no gasta uno de los 5 altas', async () => {
    api = await createIdentityApi();
    for (let i = 0; i < 7; i += 1) {
      const r = await register(api, 'ana.duena', IP_A);
      expect(problem(r)).toMatchObject({ status: 409, code: 'ERR-AUTH-USERNAME-TAKEN' });
    }
    await fill(api, IP_A);
    expect((await register(api, 'sexto.registro', IP_A)).status).toBe(429);
  });

  it('un registro inválido (422) tampoco consume cupo', async () => {
    api = await createIdentityApi();
    for (let i = 0; i < 7; i += 1) {
      const r = await api.call('POST', '/api/auth/register', { body: { ...body(`malo.${i}`), confirmPassword: 'otra' }, ip: IP_A, contract: false });
      expect(r.status).toBe(422);
    }
    await fill(api, IP_A);
  });
});
