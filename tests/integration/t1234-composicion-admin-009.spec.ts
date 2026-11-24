import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../src/infrastructure/http/server.ts';

/**
 * T1234 (Feature 009, Fase 3, #19): composición de producción del portal de administración con el verificador REAL (`jose` en `google-oidc-verify.ts`) y Google SIMULADO (token endpoint y
 * JWKS inyectados, ninguna red). La URI de redirección de administración es la fija del origen configurado más `/api/admin/auth/google/callback`, la lista cerrada sale solo de
 * `ARGOS_ADMIN_EMAILS` y sin Google configurado `/api/admin/*` no existe. REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-006, INV-ARCH-006; SC-009-048.
 */
const CLIENT_ID = 'argos-admin-test.apps.googleusercontent.com';
const CLIENT_SECRET = 'secreto-simulado-de-prueba';
const KID = 'admin-test-key';
const ORIGIN = 'https://argos.example.test';
const ADMIN = 'admin.real@example.test';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function boot(env: Record<string, string>, grantEmail: string = ADMIN, verified = true) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
  const exchanges: Array<{ redirectUri: string | null }> = [];
  let nonceOfGrant = '';
  const googleFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ''));
    exchanges.push({ redirectUri: body.get('redirect_uri') });
    const idToken = await new SignJWT({ nonce: nonceOfGrant, email: grantEmail, email_verified: verified })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('google-sub-admin-real')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), 'argos-t1234-'));
  dirs.push(dir);
  const config = loadAppConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(dir, 'argos.sqlite'),
    COOKIE_SECURE: 'false',
    GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: `${ORIGIN}/api/auth/google/callback`,
    ...env,
  });
  const app = await createProductionApp(config, false, { googleFetch, googleJwks: jwks });
  apps.push(app);
  const flow = async () => {
    const start = await app.inject({ method: 'GET', url: '/api/admin/auth/google/start' });
    const authorization = new URL(String(start.headers['location']));
    nonceOfGrant = authorization.searchParams.get('nonce') ?? '';
    const oauth = String(([] as string[]).concat(start.headers['set-cookie'] ?? [])[0]).split(';')[0]!;
    const done = await app.inject({ method: 'GET', url: `/api/admin/auth/google/callback?code=c0de&state=${authorization.searchParams.get('state')}`, headers: { cookie: oauth } });
    return { start, authorization, done };
  };
  return { app, flow, exchanges };
}

describe('T1234 [REQ-ADM9-006] composición de producción del portal de administración', () => {
  it('con Google configurado y el correo en ARGOS_ADMIN_EMAILS: la URL de Google y el canje usan la URI de administración fija; el acceso emite la cookie de sesión', async () => {
    const { app, flow, exchanges } = await boot({ ARGOS_ADMIN_EMAILS: ADMIN });
    const { start, authorization, done } = await flow();
    expect(start.statusCode).toBe(302);
    expect(authorization.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/admin/auth/google/callback`);
    expect(authorization.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(exchanges).toEqual([{ redirectUri: `${ORIGIN}/api/admin/auth/google/callback` }]);
    expect(done.statusCode).toBe(200);
    const cookie = ([] as string[]).concat(done.headers['set-cookie'] ?? []).find((c) => c.startsWith('argos_admin_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/admin/);
    const view = await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie: cookie.split(';')[0]! } });
    expect(view.statusCode).toBe(200);
  });

  it('un correo verificado de Google que NO está en la lista cerrada recibe el 404 uniforme y ninguna cookie', async () => {
    const { flow } = await boot({ ARGOS_ADMIN_EMAILS: 'otro.admin@example.test' });
    const { done } = await flow();
    expect(done.statusCode).toBe(404);
    expect(done.headers['set-cookie']).toBeUndefined();
  });

  it('con la lista vacía (sin ARGOS_ADMIN_EMAILS) nadie entra: falla cerrado', async () => {
    const { flow } = await boot({});
    expect((await flow()).done.statusCode).toBe(404);
  });

  it('un correo NO verificado por Google no entra aunque esté en la lista', async () => {
    const { flow } = await boot({ ARGOS_ADMIN_EMAILS: ADMIN }, ADMIN, false);
    expect((await flow()).done.statusCode).toBe(404);
  });

  it('sin credenciales de Google no existe ninguna ruta de /api/admin/* (404)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t1234b-'));
    dirs.push(dir);
    const app = await createProductionApp(loadAppConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'argos.sqlite'), ARGOS_ADMIN_EMAILS: ADMIN }), false);
    apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/api/admin/auth/google/start' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/admin/session' })).statusCode).toBe(404);
  });
});
