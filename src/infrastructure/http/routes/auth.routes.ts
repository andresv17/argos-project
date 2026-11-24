/**
 * Rutas `auth` del OpenAPI: registro (201), login (200), logout idempotente (204, también sin sesión, D-04) y
 * sesión actual (200). Registro y login envían la cookie `argos_session`; logout la borra.
 *
 * @implements REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, REQ-APR9-002, EDGE-009-040, ERR-ACCOUNT-REGISTRATION-RATE-LIMITED
 */

import type { FastifyInstance } from 'fastify';
import { isAccountStatusResult } from '../../../application/use-cases/auth-use-cases.ts';
import { jsonBody } from '../request-input.ts';
import { clearSessionCookie, requireSession, sessionTokenOf, setSessionCookie } from '../plugins/session-auth.ts';
import type { RegistrationRateLimiter } from '../registration-rate-limit.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-AUTH2-001, REQ-AUTH2-002, REQ-AUTH-003, REQ-AUTH-004, INV-AUTH2-002, REQ-APR9-002, EDGE-009-040, ERR-ACCOUNT-REGISTRATION-RATE-LIMITED */
export function registerAuthRoutes(app: FastifyInstance, { useCases, cookieSecure }: RouteContext, registrationLimiter: RegistrationRateLimiter): void {
  app.post('/api/auth/register', async (request, reply) => {
    // 009 (REQ-APR9-001, REQ-APR9-002): la cuenta nace PENDING; el cuerpo es solo el estado y NO hay Set-Cookie ni fila de sesión.
    // EDGE-009-040: el tope por IP efectiva se consulta ANTES (sin consumir) y solo cuenta la cuenta ya creada; un 409/400 no gasta cupo.
    registrationLimiter.assertAllowed(request.ip);
    const result = await useCases.register.execute(jsonBody(request.body));
    registrationLimiter.recordCreated(request.ip);
    return reply.status(201).send(result);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const result = await useCases.login.execute(jsonBody(request.body));
    // EDGE-009-005: una cuenta PENDING o REJECTED con credenciales válidas recibe su estado, sin cookie.
    if (isAccountStatusResult(result)) return reply.status(200).send(result);
    setSessionCookie(reply, result.sessionToken, cookieSecure);
    return reply.status(200).send(result.session);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await useCases.logout.execute(sessionTokenOf(request));
    clearSessionCookie(reply, cookieSecure);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { onRequest: requireSession(useCases.authenticate) }, async (request) => useCases.currentSession.execute(sessionTokenOf(request)));
}
