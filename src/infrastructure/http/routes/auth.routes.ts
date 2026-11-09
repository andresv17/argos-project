/**
 * Rutas `auth` del OpenAPI: registro (201), login (200), logout idempotente (204, también sin sesión, D-04) y
 * sesión actual (200). Registro y login envían la cookie `argos_session`; logout la borra.
 *
 * @implements REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody } from '../request-input.ts';
import { clearSessionCookie, requireSession, sessionTokenOf, setSessionCookie } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004 */
export function registerAuthRoutes(app: FastifyInstance, { useCases, cookieSecure }: RouteContext): void {
  app.post('/api/auth/register', async (request, reply) => {
    const { sessionToken, session } = await useCases.register.execute(jsonBody(request.body));
    setSessionCookie(reply, sessionToken, cookieSecure);
    return reply.status(201).send(session);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { sessionToken, session } = await useCases.login.execute(jsonBody(request.body));
    setSessionCookie(reply, sessionToken, cookieSecure);
    return reply.status(200).send(session);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await useCases.logout.execute(sessionTokenOf(request));
    clearSessionCookie(reply, cookieSecure);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { onRequest: requireSession(useCases.authenticate) }, async (request) => useCases.currentSession.execute(sessionTokenOf(request)));
}
