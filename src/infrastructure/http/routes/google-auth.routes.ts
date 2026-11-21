/**
 * Rutas del acceso con Google (Feature 008, `#16`; contratos 004 3.4.0: `startGoogleLogin`, `completeGoogleLogin`, `chooseGoogleUsername`, `startGoogleLink`).
 * - `GET /api/auth/google/start`: 302 a Google sin cuerpo y `Cache-Control: no-store`; entrega la cookie `argos_oauth` (`HttpOnly`, `SameSite=Lax`,
 *   `Path=/api/auth/google`, `Max-Age` 900 s, `Secure` en Cloud) con SOLO un identificador opaco (ADR-008-03, Enmienda constitucional 3.8.0). `argos_session` sigue `Strict`.
 * - `GET /api/auth/google/callback`: responde `200` con una página mínima SIN script (meta refresh; la CSP global de la API ya prohíbe script en línea, H-8-03) y establece
 *   `argos_session` `Strict` en esa misma respuesta, no en un 302 cross-site (EDGE-008-006); la vinculación (intención LINK) NO emite `argos_session`: conserva la sesión de origen (REQ-VIN8-004). `argos_oauth` se retira siempre, salvo en el paso «Elige tu usuario», donde se
 *   renueva con el estado USERNAME. Cualquier fallo es el mismo 400 `ERR-AUTH-GOOGLE-FAILED`; ni `code`, ni `state`, ni `error` se reflejan.
 * - `POST /api/auth/google/username` (CSRF, sin sesión) y `POST /api/auth/google/link` (CSRF, con sesión).
 * - Límite de tasa por IP efectiva (`start`, `callback`, `username`) y por usuario (`link`): `ERR-RATE-LIMITED` uniforme (SC-008-061).
 *
 * @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, REQ-VIN8-004, INV-VIN8-005, ADR-008-03, EDGE-008-006, INV-AUTH-003
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ONE_TIME_TOKEN_TTL_SECONDS } from '../../../domain/auth/one-time-token.ts';
import type { GoogleRateLimiter } from '../google-rate-limit.ts';
import { jsonBody } from '../request-input.ts';
import { requireSession, sessionTokenOf, setSessionCookie } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

export const OAUTH_COOKIE = 'argos_oauth';
export const OAUTH_COOKIE_PATH = '/api/auth/google';
/** Ruta de la SPA del paso «Elige tu usuario» (T1122 construye la pantalla); el callback navega aquí cuando el `sub` no tiene cuenta. */
export const CHOOSE_USERNAME_PATH = '/elige-usuario';

const MAX_CODE_LENGTH = 2048;
const MAX_STATE_LENGTH = 256;

function setOAuthCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(OAUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: ONE_TIME_TOKEN_TTL_SECONDS, secure });
}

function clearOAuthCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(OAUTH_COOKIE, { httpOnly: true, sameSite: 'lax', path: OAUTH_COOKIE_PATH, secure });
}

const oauthTokenOf = (request: FastifyRequest): string | null => request.cookies[OAUTH_COOKIE] ?? null;

/** Valor de la consulta si es una cadena no vacía dentro del tope del contrato; si no, `undefined` (se trata como ausente, sin reflejarlo). */
const bounded = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined);

/** Página mínima del callback: navega con `meta refresh` (sin script en línea, sin enlaces externos). */
function landingPage(path: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}"><meta name="referrer" content="no-referrer"><title>ARGOS</title></head><body><p>Continuando en ARGOS...</p><p><a href="${path}">Continuar</a></p></body></html>`;
}

/** @implements REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, ADR-008-03, EDGE-008-006 */
export function registerGoogleAuthRoutes(app: FastifyInstance, { useCases, cookieSecure }: RouteContext, limiter: GoogleRateLimiter): void {
  app.get('/api/auth/google/start', async (request, reply) => {
    limiter.consume('start', request.ip);
    const { authorizationUrl, oauthToken } = await useCases.googleStart.execute();
    setOAuthCookie(reply, oauthToken, cookieSecure);
    return reply.header('cache-control', 'no-store').redirect(authorizationUrl, 302);
  });

  app.get<{ Querystring: { code?: unknown; state?: unknown; error?: unknown } }>('/api/auth/google/callback', async (request, reply) => {
    limiter.consume('callback', request.ip);
    const { code, state, error } = request.query;
    try {
      const result = await useCases.googleComplete.execute({
        oauthToken: oauthTokenOf(request),
        code: bounded(code, MAX_CODE_LENGTH),
        state: bounded(state, MAX_STATE_LENGTH),
        error: error === undefined ? undefined : 'error',
      });
      reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').type('text/html; charset=utf-8');
      if (result.kind === 'CHOOSE_USERNAME') {
        setOAuthCookie(reply, result.oauthToken, cookieSecure);
        return reply.status(200).send(landingPage(CHOOSE_USERNAME_PATH));
      }
      clearOAuthCookie(reply, cookieSecure);
      // REQ-VIN8-004: la vinculación NO emite `argos_session`: la cookie `Strict` de la sesión de origen sigue vigente al navegar a `/` (H-A21-2b).
      if (result.kind === 'SESSION') setSessionCookie(reply, result.sessionToken, cookieSecure);
      return reply.status(200).send(landingPage('/'));
    } catch (failure) {
      clearOAuthCookie(reply, cookieSecure);
      throw failure;
    }
  });

  app.post('/api/auth/google/username', async (request, reply) => {
    limiter.consume('username', request.ip);
    const { sessionToken, session } = await useCases.googleChooseUsername.execute(oauthTokenOf(request), jsonBody(request.body));
    clearOAuthCookie(reply, cookieSecure);
    setSessionCookie(reply, sessionToken, cookieSecure);
    return reply.status(201).send(session);
  });

  app.post('/api/auth/google/link', { onRequest: requireSession(useCases.authenticate) }, async (request, reply) => {
    limiter.consume('link', request.userId);
    const { authorizationUrl, oauthToken } = await useCases.googleLink.execute(request.userId, sessionTokenOf(request)!, jsonBody(request.body));
    setOAuthCookie(reply, oauthToken, cookieSecure);
    return reply.header('cache-control', 'no-store').status(200).send({ authorizationUrl });
  });
}
