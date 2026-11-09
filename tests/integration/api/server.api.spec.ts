import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';

/** TASK-111: composición de producción (SQLite en archivo, scrypt real, tokens aleatorios, reloj de APP_TIMEZONE). */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('TASK-111: arranque de producción (src/infrastructure/http/server.ts)', () => {
  it('[REQ-AUTH-001][REQ-AUTH-002] con la configuración validada: registro, login con scrypt real y sesión; el hash nunca sale por la API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-server-'));
    dirs.push(dir);
    const config = loadAppConfig({ DATABASE_PATH: join(dir, 'datos', 'argos.sqlite') });
    const app = await createProductionApp(config, false);
    const post = (url: string, body: unknown, cookie?: string) =>
      app.inject({ method: 'POST', url, headers: { 'x-argos-request': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, payload: JSON.stringify(body) });
    const registered = await post('/api/auth/register', { username: 'prueba', displayName: 'Prueba', password: 'Clave2026x' });
    const wrong = await post('/api/auth/login', { username: 'prueba', password: 'Clave2026y' });
    const logged = await post('/api/auth/login', { username: 'prueba', password: 'Clave2026x' });
    const cookie = String(logged.headers['set-cookie']).split(';')[0]!;
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    await app.close();
    expect([
      registered.statusCode,
      wrong.statusCode,
      logged.statusCode,
      /^argos_session=[A-Za-z0-9_-]{43}$/.test(cookie),
      me.statusCode,
      [registered.body, logged.body, me.body].some((b) => b.includes('scrypt')),
      existsSync(join(dir, 'datos', 'argos.sqlite')),
    ]).toEqual([201, 401, 200, true, 200, false, true]);
  });
});
