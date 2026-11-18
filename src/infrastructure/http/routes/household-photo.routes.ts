/**
 * Foto de referencia del hogar (feature 006; REQ-ESC6-001, REQ-ESC6-018, REQ-ESC6-020, REQ-ESC6-027, REQ-ESC6-034, INV-ESC6-009): `PUT /households/{id}/photo` con cuerpo
 * crudo (como el avatar de 004: el tipo lo decide la firma, nunca el `Content-Type`; sin cabecera de nombre), `GET` por `302` firmada y `DELETE` idempotente. El tope de
 * lectura es `ARGOS_MEDIA_MAX_BYTES + 1` (más, a lo sumo, un fragmento) y el límite de tasa por usuario (10 por hora) se aplica ANTES de leer el cuerpo.
 *
 * @implements REQ-ESC6-001, REQ-ESC6-020, REQ-ESC6-027, REQ-ESC6-034, INV-ESC6-009
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MediaServices } from '../../../application/use-cases/use-case-support.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { rawBody } from '../request-input.ts';
import type { SceneRateLimiter } from '../scene-rate-limit.ts';
import { redirectToSigned } from './scene.routes.ts';
import type { RouteContext } from './use-cases.ts';

type HouseholdParams = { Params: { householdId: string } };

/** @implements REQ-ESC6-001, REQ-ESC6-020, REQ-ESC6-034 */
export function registerHouseholdPhotoRoutes(app: FastifyInstance, { useCases }: RouteContext, media: MediaServices, limiter: SceneRateLimiter): void {
  const onRequest = requireSession(useCases.authenticate);
  const limited = async (request: FastifyRequest): Promise<void> => limiter.consume('PHOTO', request.userId);

  app.put<HouseholdParams>('/api/households/:householdId/photo', { onRequest: [onRequest, limited], bodyLimit: media.limits.maxBytes + 1 }, async (request) =>
    useCases.putHouseholdPhoto.execute(request.userId, request.params.householdId, rawBody(request.body)),
  );

  app.get<HouseholdParams>('/api/households/:householdId/photo', { onRequest }, async (request, reply) => {
    const photo = await useCases.getHouseholdPhoto.execute(request.userId, request.params.householdId);
    return redirectToSigned(reply, photo.url);
  });

  app.delete<HouseholdParams>('/api/households/:householdId/photo', { onRequest: [onRequest, limited] }, async (request, reply) => {
    await useCases.deleteHouseholdPhoto.execute(request.userId, request.params.householdId);
    return reply.status(204).send();
  });
}
