/**
 * Rutas `account` del OpenAPI 3.0.0: cambio de contraseña (204), perfil (200) y eliminación de cuenta en dos fases
 * (204 con la cookie expirada). Todas exigen CSRF (global) y sesión vigente (`onRequest`) antes de leer el cuerpo.
 * La eliminación va por `POST /account/deletion` porque el contrato lo fija así (STATE-ACCOUNT-DELETE-001).
 *
 * @implements REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-TIME-001, STATE-ACCOUNT-DELETE-001
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody } from '../request-input.ts';
import { clearSessionCookie, requireSession, sessionTokenOf } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003 */
export function registerAccountRoutes(app: FastifyInstance, { useCases, cookieSecure }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.post('/api/account/password', { onRequest }, async (request, reply) => {
    await useCases.changePassword.execute(request.userId, sessionTokenOf(request), jsonBody(request.body));
    return reply.status(204).send();
  });

  app.patch('/api/account/profile', { onRequest }, async (request) => useCases.updateProfile.execute(request.userId, jsonBody(request.body)));

  app.post('/api/account/deletion', { onRequest }, async (request, reply) => {
    await useCases.deleteAccount.execute(request.userId, sessionTokenOf(request), jsonBody(request.body));
    clearSessionCookie(reply, cookieSecure);
    return reply.status(204).send();
  });
}
