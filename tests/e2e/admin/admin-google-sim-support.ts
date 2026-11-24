/**
 * Harness de Google SIMULADO para el portal `/admin` (Feature 009, T1237). Misma técnica que `tests/e2e/visual/google-sim-support.ts` (API real con `googleFetch` y `googleJwks`
 * inyectados, ninguna red ni credencial), pero con la lista cerrada de administradores (`ARGOS_ADMIN_EMAILS`) y el flujo `/api/admin/auth/google/*`. Puertos: los de los E2E más 200
 * (API 3300, web 5373 con los valores por defecto), para no chocar con el `webServer` ni con el harness de 008.
 *
 * @implements REQ-ADM9-001, REQ-ADM9-002, REQ-ADM9-006
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { loadAppConfig } from '../../../src/infrastructure/config/app-config.ts';
import { createProductionApp } from '../../../src/infrastructure/http/server.ts';

const CLIENT_ID = 'argos-e2e-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'secreto-simulado-de-e2e';
const KID = 'e2e-google-key';
/** Único correo de la lista cerrada de administradores del harness. */
export const ADMIN_EMAIL = 'admin.e2e@example.com';

export const ADMIN_SIM_API_PORT = Number(process.env['E2E_API_PORT'] ?? '3100') + 200;
export const ADMIN_SIM_WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? '5173') + 200;
export const ADMIN_SIM_WEB_URL = `http://127.0.0.1:${ADMIN_SIM_WEB_PORT}`;

/** Lo que «Google» responde en el siguiente consentimiento: una persona identificada por `sub` y correo, o la cancelación. */
export type AdminGoogleScenario = { readonly kind: 'login'; readonly sub: string; readonly email: string } | { readonly kind: 'cancel' };

interface Grant {
  readonly nonce: string;
  readonly sub: string;
  readonly email: string;
}

export interface AdminGoogleSim {
  /** Escenario del siguiente consentimiento. */
  next: AdminGoogleScenario;
  /** Última URL de retorno al `callback` (con `code` y `state`), para reutilizarla. */
  lastCallbackUrl: string | null;
  /** Última URL de autorización que el servidor entregó para Google (la real, antes de sustituirla por el consentimiento simulado). */
  lastAuthorizationUrl: string | null;
  /** Archivo SQLite de la API simulada: ahí se siembran cuentas `ACTIVE` por repositorio (arnés de T1244). */
  readonly databasePath: string;
  stop(): Promise<void>;
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(url)).status > 0) return;
    } catch {
      // aún no responde
    }
    if (Date.now() > deadline) throw new Error(`Sin respuesta de ${url}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

export async function startAdminGoogleSim(): Promise<AdminGoogleSim> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
  const grants = new Map<string, Grant>();
  const googleFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ''));
    const code = body.get('code') ?? '';
    const grant = grants.get(code);
    grants.delete(code); // un código de Google se canjea una sola vez
    if (grant === undefined || body.get('client_id') !== CLIENT_ID || body.get('client_secret') !== CLIENT_SECRET) return new Response('{"error":"invalid_grant"}', { status: 400 });
    const idToken = await new SignJWT({ nonce: grant.nonce, email: grant.email, email_verified: true, auth_time: Math.floor(Date.now() / 1000) }) // 009: Google devuelve `auth_time` cuando se pide `max_age` (reautenticación de borrado)
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject(grant.sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const databasePath = join(mkdtempSync(join(tmpdir(), 'argos-e2e-admin-google-')), 'argos.sqlite');
  const config = loadAppConfig({
    PORT: String(ADMIN_SIM_API_PORT),
    HOST: '127.0.0.1',
    DATABASE_PATH: databasePath,
    APP_TIMEZONE: 'America/Bogota',
    COOKIE_SECURE: 'false',
    NODE_ENV: 'test',
    ARGOS_ADMIN_EMAILS: ADMIN_EMAIL,
    GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: `${ADMIN_SIM_WEB_URL}/api/auth/google/callback`,
  });
  const app: FastifyInstance = await createProductionApp(config, false, { googleFetch, googleJwks: jwks });
  const sim: AdminGoogleSim = {
    next: { kind: 'cancel' },
    lastCallbackUrl: null,
    lastAuthorizationUrl: null,
    databasePath,
    async stop() {
      vite.kill('SIGTERM');
      await app.close();
    },
  };
  app.addHook('onSend', async (request, reply, payload) => {
    const location = reply.getHeader('location');
    if (request.url.startsWith('/api/admin/auth/google/start') && typeof location === 'string' && location.startsWith('https://accounts.google.com/')) {
      sim.lastAuthorizationUrl = location;
      const params = new URL(location).searchParams;
      reply.header('location', `/api/__sim/admin-google-consent?${new URLSearchParams({ state: params.get('state') ?? '', nonce: params.get('nonce') ?? '' }).toString()}`);
    }
    return payload;
  });
  app.get<{ Querystring: { state?: string; nonce?: string } }>('/api/__sim/admin-google-consent', async (request, reply) => {
    const callback = new URL(`${ADMIN_SIM_WEB_URL}/api/admin/auth/google/callback`);
    if (sim.next.kind === 'cancel') {
      callback.searchParams.set('error', 'access_denied');
    } else {
      const code = randomBytes(16).toString('hex');
      grants.set(code, { nonce: request.query.nonce ?? '', sub: sim.next.sub, email: sim.next.email });
      callback.searchParams.set('code', code);
    }
    callback.searchParams.set('state', request.query.state ?? '');
    sim.lastCallbackUrl = callback.toString();
    return reply.redirect(sim.lastCallbackUrl, 302);
  });
  await app.listen({ host: '127.0.0.1', port: ADMIN_SIM_API_PORT });

  const vite: ChildProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: process.cwd(),
    env: { ...process.env, E2E_API_PORT: String(ADMIN_SIM_API_PORT), E2E_WEB_PORT: String(ADMIN_SIM_WEB_PORT) },
    stdio: 'ignore',
  });
  await waitFor(`${ADMIN_SIM_WEB_URL}/api/auth/me`, 60_000);

  return sim;
}
