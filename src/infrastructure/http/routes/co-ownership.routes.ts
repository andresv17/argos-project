/**
 * Rutas de co-propiedad y de solicitudes de acciones críticas (Feature 012, Bloque A, #22; T1617; `contracts/openapi/co-ownership.openapi.yaml`):
 * GET /pets/{petId}/ownership, POST /pets/{petId}/co-owners (202 uniforme), .../co-owners/{id}/cancel (204), .../co-owners/leave (200), .../co-owners/promotion-notice/ack (204),
 * GET /co-owner-invitations y POST .../{id}/accept|decline, POST /pets/{petId}/owner-requests (201), GET /owner-requests y /owner-requests/{id}, POST .../approve|reject (200) y .../cancel (204).
 * Todas exigen sesión; el 404 uniforme a terceros (nunca 403, H-05) lo resuelve el caso de uso ANTES del cuerpo (422) y del bloqueo por mascota.
 *
 * @implements REQ-OWN12-002, REQ-OWN12-004, REQ-OWN12-005, REQ-OWN12-006, INV-OWN12-004, ERR-PET-NOT-FOUND
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type PetParams = { Params: { petId: string } };
type CoOwnerParams = { Params: { coOwnerId: string } };
type PetCoOwnerParams = { Params: { petId: string; coOwnerId: string } };
type RequestParams = { Params: { requestId: string } };

/** @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004 */
export function registerCoOwnershipRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.get<PetParams>('/api/pets/:petId/ownership', { onRequest }, async (request) => useCases.getPetOwnership.execute(request.userId, request.params.petId));

  app.post<PetParams>('/api/pets/:petId/co-owners', { onRequest }, async (request, reply) => {
    const accepted = await useCases.inviteCoOwner.execute(request.userId, request.params.petId, jsonBody(request.body));
    return reply.status(202).send(accepted);
  });

  app.post<PetCoOwnerParams>('/api/pets/:petId/co-owners/:coOwnerId/cancel', { onRequest }, async (request, reply) => {
    await useCases.cancelCoOwnerInvitation.execute(request.userId, request.params.petId, request.params.coOwnerId);
    return reply.status(204).send();
  });

  app.post<PetParams>('/api/pets/:petId/co-owners/leave', { onRequest }, async (request) => useCases.leavePet.execute(request.userId, request.params.petId, jsonBody(request.body) ?? {}));

  app.post<PetParams>('/api/pets/:petId/co-owners/promotion-notice/ack', { onRequest }, async (request, reply) => {
    await useCases.ackPromotionNotice.execute(request.userId, request.params.petId);
    return reply.status(204).send();
  });

  app.get('/api/co-owner-invitations', { onRequest }, async (request) => useCases.listMyCoOwnerInvitations.execute(request.userId));

  app.post<CoOwnerParams>('/api/co-owner-invitations/:coOwnerId/accept', { onRequest }, async (request) => useCases.acceptCoOwnerInvitation.execute(request.userId, request.params.coOwnerId));

  app.post<CoOwnerParams>('/api/co-owner-invitations/:coOwnerId/decline', { onRequest }, async (request, reply) => {
    await useCases.declineCoOwnerInvitation.execute(request.userId, request.params.coOwnerId);
    return reply.status(204).send();
  });

  app.post<PetParams>('/api/pets/:petId/owner-requests', { onRequest }, async (request, reply) => {
    const created = await useCases.createOwnerRequest.execute(request.userId, request.params.petId, jsonBody(request.body));
    return reply.status(201).send(created);
  });

  app.get('/api/owner-requests', { onRequest }, async (request) => useCases.listMyOwnerRequests.execute(request.userId));

  app.get<RequestParams>('/api/owner-requests/:requestId', { onRequest }, async (request) => useCases.getOwnerRequest.execute(request.userId, request.params.requestId));

  app.post<RequestParams>('/api/owner-requests/:requestId/approve', { onRequest }, async (request) => useCases.approveOwnerRequest.execute(request.userId, request.params.requestId));

  app.post<RequestParams>('/api/owner-requests/:requestId/reject', { onRequest }, async (request) => useCases.rejectOwnerRequest.execute(request.userId, request.params.requestId));

  app.post<RequestParams>('/api/owner-requests/:requestId/cancel', { onRequest }, async (request, reply) => {
    await useCases.cancelOwnerRequest.execute(request.userId, request.params.requestId);
    return reply.status(204).send();
  });
}
