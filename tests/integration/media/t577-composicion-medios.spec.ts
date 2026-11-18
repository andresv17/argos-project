/**
 * T576/T577 [US4] conexión de medios en `createProductionApp` (REQ-GCS-003, REQ-ARC-001, REQ-ARC-003, SC-ALM-012): según `ARGOS_MEDIA_DRIVER` se compone el
 * adaptador de memoria (con la ruta de desarrollo `/__dev/media/…`) o el de GCS (sin esa ruta); los topes salen de `ARGOS_MEDIA_*`; el SDK solo se carga
 * con el driver `gcs` (prueba C-4: únicamente el adaptador lo importa).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';
import { PDF } from '../../fixtures/media-harness.ts';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'argos-t577-'));
  dirs.push(dir);
  const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'argos.sqlite'), ...extra }), false);
  apps.push(app);
  const post = (url: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, headers: { 'x-argos-request': '1', 'content-type': 'application/json', ...(cookie === undefined ? {} : { cookie }), ...headers }, payload: JSON.stringify(body) });
  const registered = await post('/api/auth/register', { username: 'prueba', displayName: 'Prueba', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' });
  const cookie = String(registered.headers['set-cookie']).split(';')[0]!;
  const pet = await post('/api/pets', { name: 'Lucía', species: 'CANINE', breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE', avatarUrl: null }, cookie);
  return { app, cookie, petId: (pet.json() as { id: string }).id, post };
}

describe('T577 composición con ARGOS_MEDIA_DRIVER=memory (desarrollo y pruebas)', () => {
  it('[REQ-GCS-003] las rutas de medios existen: sube un archivo, lo lista, pide acceso y la ruta /__dev/media sirve el objeto autenticada', async () => {
    const { app, cookie, petId } = await start();
    const headers = { 'x-argos-request': '1', 'x-argos-filename': 'a.pdf', 'content-type': 'application/octet-stream', cookie };
    const created = await app.inject({ method: 'POST', url: `/api/pets/${petId}/media?kind=FILE`, headers, payload: Buffer.from(PDF()) });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;
    const list = await app.inject({ method: 'GET', url: `/api/pets/${petId}/media?kind=FILE`, headers: { cookie } });
    expect((list.json() as { total: number }).total).toBe(1);
    const access = await app.inject({ method: 'GET', url: `/api/pets/${petId}/media/${id}/access`, headers: { cookie } });
    const url = (access.json() as { url: string }).url;
    expect([access.statusCode, url]).toEqual([200, `/__dev/media/pets/${petId}/files/${id}`]);
    const served = await app.inject({ method: 'GET', url, headers: { cookie } });
    const anonymous = await app.inject({ method: 'GET', url });
    expect([served.statusCode, served.headers['x-content-type-options'], served.rawPayload.length, anonymous.statusCode]).toEqual([200, 'nosniff', 64, 401]);
    expect(app.hasRoute({ method: 'GET', url: '/__dev/media/*' })).toBe(true);
  });

  it('[REQ-ARC-005] los topes salen de ARGOS_MEDIA_*: con ARGOS_MEDIA_MAX_BYTES = 1000 un archivo de 1001 bytes es 413', async () => {
    const { app, cookie, petId } = await start({ ARGOS_MEDIA_MAX_BYTES: '1000' });
    const headers = { 'x-argos-request': '1', 'x-argos-filename': 'a.pdf', 'content-type': 'application/octet-stream', cookie };
    const big = await app.inject({ method: 'POST', url: `/api/pets/${petId}/media?kind=FILE`, headers, payload: Buffer.from(PDF(1001)) });
    const ok = await app.inject({ method: 'POST', url: `/api/pets/${petId}/media?kind=FILE`, headers, payload: Buffer.from(PDF(1000)) });
    expect([big.statusCode, (big.json() as { code: string }).code, ok.statusCode]).toEqual([413, 'ERR-MEDIA-TOO-LARGE', 201]);
  });

  it('[REQ-ARC-003] la caducidad de la URL firmada sale de ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS', async () => {
    const { app, cookie, petId } = await start({ ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '60' });
    const headers = { 'x-argos-request': '1', 'x-argos-filename': 'a.pdf', 'content-type': 'application/octet-stream', cookie };
    const id = ((await app.inject({ method: 'POST', url: `/api/pets/${petId}/media?kind=FILE`, headers, payload: Buffer.from(PDF()) })).json() as { id: string }).id;
    const access = (await app.inject({ method: 'GET', url: `/api/pets/${petId}/media/${id}/access`, headers: { cookie } })).json() as { expiresAt: string };
    const seconds = (Date.parse(access.expiresAt) - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(55);
    expect(seconds).toBeLessThanOrEqual(61);
  });
});

describe('T577 composición con ARGOS_MEDIA_DRIVER=gcs', () => {
  it('[REQ-GCS-003][SC-ALM-012] con gcs se conecta el adaptador de GCS: hay rutas de medios, no hay ruta de desarrollo y la CSP lleva el host del bucket', async () => {
    const { app, petId } = await start({ ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' });
    // Sin sesión: no llega al bucket (no hay red ni credenciales en la prueba); basta la cabecera CSP de la respuesta 401.
    const list = await app.inject({ method: 'GET', url: `/api/pets/${petId}/media` });
    expect(app.hasRoute({ method: 'GET', url: '/__dev/media/*' })).toBe(false);
    expect(app.hasRoute({ method: 'POST', url: '/api/pets/:petId/media' })).toBe(true);
    expect(list.statusCode).toBe(401);
    expect(String(list.headers['content-security-policy'])).toContain('https://argos-test-media.storage.googleapis.com');
  });
});
