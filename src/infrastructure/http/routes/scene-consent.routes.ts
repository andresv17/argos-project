/**
 * Consentimiento de la escena (feature 006; REQ-ESC6-023, REQ-ESC6-024, REQ-ESC6-025, REQ-ESC6-026, REQ-ESC6-034): `GET /scene-consent/notice` (versión del aviso y
 * proveedor vigentes), `POST /scene-consent` (204; 409 `ERR-SCENE-NOTICE-OUTDATED` si la versión no es la vigente) y `DELETE /scene-consent` (204, retiro con purga
 * inmediata). Cada usuario consiente solo por sus propios datos (D6-16); 10 por hora entre consentir y retirar.
 *
 * @implements REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026, REQ-ESC6-034
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireSession } from '../plugins/session-auth.ts';
import { jsonBody } from '../request-input.ts';
import type { SceneRateLimiter } from '../scene-rate-limit.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026, REQ-ESC6-034 */
export function registerSceneConsentRoutes(app: FastifyInstance, { useCases }: RouteContext, limiter: SceneRateLimiter): void {
  const onRequest = requireSession(useCases.authenticate);
  const limited = async (request: FastifyRequest): Promise<void> => limiter.consume('CONSENT', request.userId);

  app.get('/api/scene-consent/notice', { onRequest }, async () => useCases.sceneNotice.execute());

  app.post('/api/scene-consent', { onRequest: [onRequest, limited] }, async (request, reply) => {
    await useCases.grantSceneConsent.execute(request.userId, jsonBody(request.body));
    return reply.status(204).send();
  });

  app.delete('/api/scene-consent', { onRequest: [onRequest, limited] }, async (request, reply) => {
    await useCases.revokeSceneConsent.execute(request.userId);
    return reply.status(204).send();
  });
}
