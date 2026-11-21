/**
 * Harness de Google SIMULADO para los E2E del acceso con Google (Feature 008, T1123). Levanta, dentro del proceso de la prueba, la API real (`createProductionApp` con
 * `googleFetch` y `googleJwks` inyectados: token endpoint y llaves simulados, ninguna red ni credencial real) y una SPA Vite propia que apunta a ella. Los puertos son los de
 * los E2E más 100 (API 3300 y web 5373 con `E2E_API_PORT=3200` y `E2E_WEB_PORT=5273`), de modo que no chocan con el `webServer` de `playwright.config.ts`.
 * El «consentimiento» de Google lo resuelve el propio harness en el servidor: un gancho `onSend` conserva la URL de autorización real (`lastAuthorizationUrl`) y sustituye el
 * `Location` hacia `accounts.google.com` por `/api/__sim/google-consent`, que redirige al `callback` con un código de un solo uso (o con `error=access_denied`). La cadena de
 * redirecciones es HTTP pura, idéntica en Chromium, Firefox y WebKit, y nada sale a internet.
 *
 * @implements REQ-SSO8-001, REQ-SSO8-004, EDGE-008-006
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

export const SIM_API_PORT = Number(process.env['E2E_API_PORT'] ?? '3100') + 100;
export const SIM_WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? '5173') + 100;
export const SIM_WEB_URL = `http://127.0.0.1:${SIM_WEB_PORT}`;

/** Lo que «Google» responde en el siguiente consentimiento: una persona identificada por `sub` y correo, o la cancelación. */
export type GoogleScenario = { readonly kind: 'login'; readonly sub: string; readonly email: string } | { readonly kind: 'cancel' };

interface Grant {
  readonly nonce: string;
  readonly sub: string;
  readonly email: string;
}

export interface GoogleSim {
  /** Escenario del siguiente consentimiento. */
  next: GoogleScenario;
  /** Última URL de retorno al `callback` (con `code` y `state`), para reutilizarla. */
  lastCallbackUrl: string | null;
  /** Última URL de autorización que el servidor entregó para Google (la real, antes de sustituirla por el consentimiento simulado). */
  lastAuthorizationUrl: string | null;
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

export async function startGoogleSim(): Promise<GoogleSim> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
  const grants = new Map<string, Grant>();
  const googleFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ''));
    const code = body.get('code') ?? '';
    const grant = grants.get(code);
    grants.delete(code); // un código de Google se canjea una sola vez
    if (grant === undefined || body.get('client_id') !== CLIENT_ID || body.get('client_secret') !== CLIENT_SECRET) return new Response('{"error":"invalid_grant"}', { status: 400 });
    const idToken = await new SignJWT({ nonce: grant.nonce, email: grant.email, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject(grant.sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const config = loadAppConfig({
    PORT: String(SIM_API_PORT),
    HOST: '127.0.0.1',
    DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'argos-e2e-google-')), 'argos.sqlite'),
    APP_TIMEZONE: 'America/Bogota',
    COOKIE_SECURE: 'false',
    NODE_ENV: 'test',
    GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: `${SIM_WEB_URL}/api/auth/google/callback`,
  });
  const app: FastifyInstance = await createProductionApp(config, false, { googleFetch, googleJwks: jwks });
  const sim: GoogleSim = {
    next: { kind: 'cancel' },
    lastCallbackUrl: null,
    lastAuthorizationUrl: null,
    async stop() {
      vite.kill('SIGTERM');
      await app.close();
    },
  };
  app.addHook('onSend', async (request, reply, payload) => {
    const location = reply.getHeader('location');
    if (request.url.startsWith('/api/auth/google/start') && typeof location === 'string' && location.startsWith('https://accounts.google.com/')) {
      sim.lastAuthorizationUrl = location;
      const params = new URL(location).searchParams;
      reply.header('location', `/api/__sim/google-consent?${new URLSearchParams({ state: params.get('state') ?? '', nonce: params.get('nonce') ?? '' }).toString()}`);
    }
    return payload;
  });
  app.get<{ Querystring: { state?: string; nonce?: string } }>('/api/__sim/google-consent', async (request, reply) => {
    const callback = new URL(`${SIM_WEB_URL}/api/auth/google/callback`);
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
  await app.listen({ host: '127.0.0.1', port: SIM_API_PORT });

  const vite: ChildProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: process.cwd(),
    env: { ...process.env, E2E_API_PORT: String(SIM_API_PORT), E2E_WEB_PORT: String(SIM_WEB_PORT) },
    stdio: 'ignore',
  });
  await waitFor(`${SIM_WEB_URL}/api/auth/me`, 60_000);

  return sim;
}
