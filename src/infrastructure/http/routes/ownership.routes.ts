/**
 * POST /pets/{petId}/ownership-transfer (REQ-OWN-001, SC-016): cuerpo TransferPetOwnershipInput, 200
 * TransferPetOwnershipResult. Exige sesión; el acceso a la mascota (404/403) se comprueba antes que el cuerpo (422).
 *
 * @implements REQ-OWN-001, INV-OWN2-001, ERR-OWN-TRANSFER-INVALID-TARGET
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

/** @implements REQ-OWN-001, INV-OWN2-001 */
export function registerOwnershipRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.post<{ Params: { petId: string } }>('/api/pets/:petId/ownership-transfer', { onRequest }, async (request) =>
    useCases.transferPetOwnership.execute(request.userId, request.params.petId, jsonBody(request.body)),
  );
}
