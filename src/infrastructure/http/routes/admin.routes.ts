/**
 * Rutas del portal de administración (Feature 009, Fase 3, `#19`; Enmienda constitucional 009-A; contrato `admin.openapi.yaml` 1.2.0).
 * - `GET /api/admin/auth/google/start`: 302 a Google con la cookie `argos_admin_oauth` (`HttpOnly`, `SameSite=Lax`, `Path=/api/admin/auth/google`, `Max-Age` 900 s, `Secure` en Cloud) con
 *   SOLO un identificador opaco. No consulta la lista. Bloqueada (429 `ERR-ADMIN-RATE-LIMITED` con `Retry-After`) si la IP efectiva acumuló demasiados fallos (EDGE-009-035).
 * - `GET /api/admin/auth/google/callback`: éxito = 200 con una página SIN script en línea que navega a `/admin` y `argos_admin_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api/admin`,
 *   `Secure` en Cloud, identificador NUEVO) en esa misma respuesta, no en un 302 cross-site; cualquier fallo = el MISMO 404 que una ruta inexistente (sin `Set-Cookie`, sin distinguir la causa).
 * - `GET` y `DELETE /api/admin/session`: sesión de administración o el 404 uniforme; `GET` no renueva la inactividad; `DELETE` exige origen propio y revoca en el servidor.
 * - `GET /api/admin/pending-count` (T1247, REQ-APR9-005): contador de `PENDING` vigentes y `warning`; si superan el umbral escribe el aviso del operador (`warnPendingBacklog`, solo conteos).
 * - `GET /api/admin/registrations` (lista paginada por cursor) y `POST /api/admin/registrations/{id}/approve|reject` (decision atomica con compare-and-set; 404 problem+json
 *   `ERR-ADMIN-REGISTRATION-NOT-FOUND` si la perdio). Orden: `X-Argos-Request` (403, hook global) -> sesion (404 uniforme) -> validacion (422) -> decision. Solo las decisiones renuevan la inactividad.
 * - `GET /api/admin/parameters` y `PUT /api/admin/parameters/{key}` (T1264, contrato 1.4.0): catalogo cerrado de seis claves y edicion con `If-Match` (412) sin valores en la auditoria.
 * - Cualquier otra ruta bajo `/api/admin` recorre la MISMA autenticación y responde el 404 uniforme (secuencia de puertos idéntica a la de las rutas ocultas, EDGE-009-008).
 * - El 404 uniforme se delega al manejador de rutas inexistentes (`reply.callNotFound()`): el mismo cuerpo y las mismas cabeceras que una ruta inexistente de `/api/`, sin código `ERR-*`.
 * `argos_session` y `argos_oauth` no se leen ni se tocan (INV-ADM9-002).
 *
 * @implements REQ-ADM9-001, REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-005, REQ-ADM9-006, INV-ADM9-001, INV-ADM9-002, EDGE-009-008, EDGE-009-011, EDGE-009-035, EDGE-009-047, REQ-APR9-003, REQ-APR9-005, EDGE-009-040
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ADMIN_SESSION_MAX_AGE_SECONDS } from '../../../domain/auth/admin-session-policy.ts';
import { ONE_TIME_TOKEN_TTL_SECONDS } from '../../../domain/auth/one-time-token.ts';
import { DomainError } from '../../../generated/index.ts';
import type { AdminAccessLimiter } from '../admin-rate-limit.ts';
import { warnPendingBacklog } from '../pending-backlog-notice.ts';
import { jsonBody } from '../request-input.ts';
import type { RouteContext } from './use-cases.ts';

export const ADMIN_SESSION_COOKIE = 'argos_admin_session';
export const ADMIN_SESSION_COOKIE_PATH = '/api/admin';
export const ADMIN_OAUTH_COOKIE = 'argos_admin_oauth';
export const ADMIN_OAUTH_COOKIE_PATH = '/api/admin/auth/google';
/** Pantalla estática del portal (la sirve el bundle de la SPA; T1235). */
export const ADMIN_PORTAL_PATH = '/admin';

/** CSP estricta de las respuestas autenticadas del portal: sin nada cargable (la API solo devuelve JSON o una página de navegación sin script). */
export const ADMIN_API_CONTENT_SECURITY_POLICY = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MAX_CODE_LENGTH = 2048;
const MAX_STATE_LENGTH = 256;

const adminSessionTokenOf = (request: FastifyRequest): string | null => request.cookies[ADMIN_SESSION_COOKIE] ?? null;
const adminOAuthTokenOf = (request: FastifyRequest): string | null => request.cookies[ADMIN_OAUTH_COOKIE] ?? null;

/** Valor de la consulta si es una cadena no vacía dentro del tope; si no, `undefined` (se trata como ausente, sin reflejarlo). */
const bounded = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined);

const setAdminOAuthCookie = (reply: FastifyReply, token: string, secure: boolean): void => {
  reply.setCookie(ADMIN_OAUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: ADMIN_OAUTH_COOKIE_PATH, maxAge: ONE_TIME_TOKEN_TTL_SECONDS, secure });
};
const clearAdminOAuthCookie = (reply: FastifyReply, secure: boolean): void => {
  reply.clearCookie(ADMIN_OAUTH_COOKIE, { httpOnly: true, sameSite: 'lax', path: ADMIN_OAUTH_COOKIE_PATH, secure });
};
const setAdminSessionCookie = (reply: FastifyReply, token: string, secure: boolean): void => {
  reply.setCookie(ADMIN_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: ADMIN_SESSION_COOKIE_PATH, maxAge: ADMIN_SESSION_MAX_AGE_SECONDS, secure });
};
const clearAdminSessionCookie = (reply: FastifyReply, secure: boolean): void => {
  reply.clearCookie(ADMIN_SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', path: ADMIN_SESSION_COOKIE_PATH, secure });
};

/** Página mínima del callback: navega con `meta refresh` (sin script en línea, sin enlaces externos). */
const landingPage = (path: string): string =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}"><meta name="referrer" content="no-referrer"><title>ARGOS</title></head><body><p>Continuando...</p><p><a href="${path}">Continuar</a></p></body></html>`;

/** El 404 de una ruta inexistente: mismo cuerpo, cabeceras y estado que cualquier otra ruta que no existe. */
function uniformNotFound(reply: FastifyReply): FastifyReply {
  reply.callNotFound();
  return reply;
}

/** Origen AJENO: `Origin` presente y distinto del propio (incluye `null`). Sin cabecera no cambia el comportamiento (SEN-T1271-01; las escrituras de parametros ya exigen `X-Argos-Request`). */
const hasForeignOrigin = (request: FastifyRequest): boolean => request.headers.origin !== undefined && !isOwnOrigin(request);

/** `Origin` presente y EXACTAMENTE igual al origen propio (esquema, host y puerto). `null`, ausente, otro esquema, host o puerto = rechazo (REQ-ADM9-005). */
function isOwnOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') return false;
  try {
    const presented = new URL(origin);
    return presented.origin === origin && presented.origin === new URL(`${request.protocol}://${request.host}`).origin;
  } catch {
    return false;
  }
}

/** @implements REQ-ADM9-001, REQ-ADM9-002, REQ-ADM9-005, REQ-ADM9-006, INV-ADM9-002, EDGE-009-008, EDGE-009-035 */
export function registerAdminRoutes(app: FastifyInstance, { useCases, cookieSecure }: RouteContext, limiter: AdminAccessLimiter, onQuotaReset?: (userIds: readonly string[]) => void): void {
  app.get('/api/admin/auth/google/start', async (request, reply) => {
    limiter.assertNotBlocked(request.ip);
    limiter.consumeStart(request.ip);
    const { authorizationUrl, oauthToken } = await useCases.adminStart.execute();
    setAdminOAuthCookie(reply, oauthToken, cookieSecure);
    return reply.header('cache-control', 'no-store').redirect(authorizationUrl, 302);
  });

  app.get<{ Querystring: { code?: unknown; state?: unknown; error?: unknown } }>('/api/admin/auth/google/callback', async (request, reply) => {
    limiter.assertNotBlocked(request.ip);
    const { code, state, error } = request.query;
    const result = await useCases.adminComplete.execute({
      oauthToken: adminOAuthTokenOf(request),
      code: bounded(code, MAX_CODE_LENGTH),
      state: bounded(state, MAX_STATE_LENGTH),
      error: error === undefined ? undefined : 'error',
    });
    if (!result.ok) {
      limiter.recordFailure(request.ip);
      return uniformNotFound(reply);
    }
    clearAdminOAuthCookie(reply, cookieSecure);
    setAdminSessionCookie(reply, result.sessionToken, cookieSecure);
    return reply
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', ADMIN_API_CONTENT_SECURITY_POLICY)
      .type('text/html; charset=utf-8')
      .status(200)
      .send(landingPage(ADMIN_PORTAL_PATH));
  });

  app.get('/api/admin/session', async (request, reply) => {
    // Sin keep-alive: leer el estado NO renueva la inactividad (REQ-ADM9-002; Neo, T1225).
    const session = await useCases.adminAuthenticate.execute(adminSessionTokenOf(request), { renew: false });
    if (session === null) return uniformNotFound(reply);
    return reply
      .header('cache-control', 'no-store')
      .header('content-security-policy', ADMIN_API_CONTENT_SECURITY_POLICY)
      .status(200)
      .send({ authenticated: true, adminId: session.adminId, expiresAt: session.expiresAt, idleExpiresAt: session.idleExpiresAt });
  });

  app.delete('/api/admin/session', async (request, reply) => {
    const token = adminSessionTokenOf(request);
    // Sin sesión: 404 uniforme. Con sesión pero origen ajeno o ausente: 403 sin revocar ni auditar (REQ-ADM9-005, EDGE-009-011).
    if ((await useCases.adminAuthenticate.execute(token, { renew: false })) === null) return uniformNotFound(reply);
    if (!isOwnOrigin(request)) throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'Origin');
    if (!(await useCases.adminEnd.execute(token))) return uniformNotFound(reply);
    clearAdminSessionCookie(reply, cookieSecure);
    return reply.status(204).send();
  });

  /** Sesion de administracion o `null` tras haber respondido el 404 uniforme (la misma lectura de sesion que el resto de rutas reales). */
  const requireAdminSession = async (request: FastifyRequest, reply: FastifyReply, renew: boolean) => {
    const session = await useCases.adminAuthenticate.execute(adminSessionTokenOf(request), { renew });
    if (session === null) uniformNotFound(reply);
    return session;
  };
  const noStore = (reply: FastifyReply): FastifyReply => reply.header('cache-control', 'no-store').header('content-security-policy', ADMIN_API_CONTENT_SECURITY_POLICY);

  app.get('/api/admin/pending-count', async (request, reply) => {
    if ((await requireAdminSession(request, reply, false)) === null) return reply;
    const pending = await useCases.adminPendingCount.execute();
    const notice = warnPendingBacklog(request.log, pending);
    return noStore(reply).status(200).send({ pending, warning: notice.exceeded });
  });

  app.get<{ Querystring: { limit?: unknown; cursor?: unknown } }>('/api/admin/registrations', async (request, reply) => {
    if ((await requireAdminSession(request, reply, false)) === null) return reply;
    const { limit, cursor } = request.query;
    return noStore(reply).status(200).send(await useCases.adminListRegistrations.execute({ limit, cursor }));
  });

  for (const [action, event] of [['approve', 'APPROVE'], ['reject', 'REJECT']] as const) {
    app.post<{ Params: { registrationId: string } }>(`/api/admin/registrations/:registrationId/${action}`, async (request, reply) => {
      const session = await requireAdminSession(request, reply, true);
      if (session === null) return reply;
      const decision = await useCases.adminDecideRegistration.execute({ adminId: session.adminId, registrationId: request.params.registrationId, event });
      return noStore(reply).status(200).send(decision);
    });
  }

  // Parametros en caliente (T1264, REQ-CFG9-001/007): lista de las seis claves del catalogo y escritura con If-Match. Orden: X-Argos-Request (403, hook global) -> sesion (404 uniforme) -> esquema (422)
  // -> precondicion (412). La lista no renueva la inactividad; la escritura si.
  app.get('/api/admin/parameters', async (request, reply) => {
    if ((await requireAdminSession(request, reply, false)) === null) return reply;
    return noStore(reply).status(200).send(await useCases.adminListParameters.execute());
  });

  app.put<{ Params: { key: string }; Body: unknown }>('/api/admin/parameters/:key', async (request, reply) => {
    const session = await requireAdminSession(request, reply, true);
    if (session === null) return reply;
    if (hasForeignOrigin(request)) throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'Origin');
    const view = await useCases.adminUpdateParameter.execute({ adminId: session.adminId, key: request.params.key, ifMatch: request.headers['if-match'], body: jsonBody(request.body) });
    return noStore(reply).header('etag', view.etag).status(200).send(view);
  });

  // Reinicio de cuota de las cuentas del administrador (T1268, REQ-CFG9-006): operacion sin clave ni etag. Orden: X-Argos-Request (403, hook global) -> sesion (404) -> cuerpo vacio (422) -> reinicio (409 si pierde la carrera).
  app.post<{ Body: unknown }>('/api/admin/parameters/scene-quota/reset', async (request, reply) => {
    const session = await requireAdminSession(request, reply, true);
    if (session === null) return reply;
    if (hasForeignOrigin(request)) throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'Origin');
    const { accountsReset, resetAt, userIds } = await useCases.adminResetSceneQuota.execute({ adminId: session.adminId, body: request.body });
    // 5.º límite (D9-31): el cupo GENERATE en RAM de las cuentas del administrador se reinicia solo tras confirmar la transacción.
    onQuotaReset?.(userIds);
    return noStore(reply).status(200).send({ accountsReset, resetAt });
  });

  // Todo lo demás bajo /api/admin: la misma lectura de sesión que las rutas reales y el 404 uniforme (con o sin sesión, la ruta no existe). Mantiene idéntica la secuencia de puertos.
  const hidden = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    await useCases.adminAuthenticate.execute(adminSessionTokenOf(request), { renew: false });
    return uniformNotFound(reply);
  };
  app.all('/api/admin', hidden);
  app.all('/api/admin/*', hidden);
}
