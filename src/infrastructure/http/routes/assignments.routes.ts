/**
 * Rutas de asignación mascota-hogar del OpenAPI (REQ-HOUSE2-003, SC-017): GET /pets/{petId}/assignments (200),
 * PUT /pets/{petId}/assignments/{householdId} (200 PetAssignment, idempotente) y DELETE (204). Exigen sesión; el acceso
 * a la mascota (404/403) lo resuelve el caso de uso antes que cualquier otra comprobación.
 *
 * @implements REQ-HOUSE2-003, INV-HOUSE-004, ERR-PET-NOT-FOUND, ERR-ACC-FORBIDDEN
 */

import type { FastifyInstance } from 'fastify';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type PetParams = { Params: { petId: string } };
type AssignmentParams = { Params: { petId: string; householdId: string } };

/** @implements REQ-HOUSE2-003, INV-HOUSE-004 */
export function registerAssignmentRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.get<PetParams>('/api/pets/:petId/assignments', { onRequest }, async (request) =>
    useCases.listPetAssignments.execute(request.userId, request.params.petId),
  );

  app.put<AssignmentParams>('/api/pets/:petId/assignments/:householdId', { onRequest }, async (request) =>
    useCases.assignPetToHousehold.execute(request.userId, request.params.petId, request.params.householdId),
  );

  app.delete<AssignmentParams>('/api/pets/:petId/assignments/:householdId', { onRequest }, async (request, reply) => {
    await useCases.unassignPetFromHousehold.execute(request.userId, request.params.petId, request.params.householdId);
    return reply.status(204).send();
  });
}
