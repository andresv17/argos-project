/**
 * Rutas `households` del OpenAPI. Todas exigen sesión. Visibilidad (D-01): un INVITED recibe 404 al leer el hogar
 * (EDGE-037); el OWNER ve las membresías INVITED en `members` y un MEMBER solo las ACTIVE (EDGE-038). La baja de
 * `DELETE /households/{id}/members/{userId}` es abandono si `userId` es el propio actor y retirada si no. Un id con
 * formato inválido no existe: responde el 404 que declara el OpenAPI para la ruta. `GET /households/{id}/pets` admite
 * `q` y `species` (OpenAPI 2.4.0, DEUDA-UI-FILTRO-001) con las reglas de `GET /pets`; como en toda ruta con
 * identificador de hogar, el acceso se comprueba antes que la consulta: quien no ve el hogar
 * recibe 404 aunque la consulta sea inválida.
 *
 * PATCH .../members/{userId} cambia el rol (cuerpo ChangeRoleInput, 200 HouseholdMemberView) y POST .../ownership-transfer
 * transfiere la propiedad (TransferHouseholdOwnershipInput, 200 HouseholdView); T246.
 *
 * @implements REQ-HOUSE-001, REQ-HOUSE2-002, REQ-HOUSE2-001, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, ERR-HOUSE-NOT-FOUND, ERR-HOUSE-MEMBERSHIP-NOT-FOUND
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody, petListQuery } from '../request-input.ts';
import { parseChangeRoleInput } from '../../../application/use-cases/household-use-cases.ts';
import type { PetListQuery } from '../../../application/use-cases/pet-use-cases.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type HouseholdParams = { Params: { householdId: string } };
type MemberParams = { Params: { householdId: string; userId: string } };

/** @implements REQ-HOUSE-001, REQ-HOUSE2-001, REQ-HOUSE-003, REQ-HOUSE-004, REQ-HOUSE-005, ERR-HOUSE-NOT-FOUND, ERR-HOUSE-MEMBERSHIP-NOT-FOUND */
export function registerHouseholdRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.get('/api/households', { onRequest }, async (request) => useCases.listMyHouseholds.execute(request.userId));

  app.post('/api/households', { onRequest }, async (request, reply) =>
    reply.status(201).send(await useCases.createHousehold.execute(request.userId, jsonBody(request.body))),
  );

  app.get<HouseholdParams>('/api/households/:householdId', { onRequest }, async (request) =>
    useCases.getHousehold.execute(request.userId, request.params.householdId),
  );

  app.delete<HouseholdParams>('/api/households/:householdId', { onRequest }, async (request, reply) => {
    await useCases.deleteHousehold.execute(request.userId, request.params.householdId);
    return reply.status(204).send();
  });

  app.post<HouseholdParams>('/api/households/:householdId/invitations', { onRequest }, async (request, reply) =>
    reply.status(202).send(await useCases.inviteMember.execute(request.userId, request.params.householdId, jsonBody(request.body))),
  );

  app.patch<MemberParams>('/api/households/:householdId/members/:userId', { onRequest }, async (request) => {
    const { householdId, userId } = request.params;
    const { role } = parseChangeRoleInput(jsonBody(request.body));
    return useCases.changeMemberRole.execute(request.userId, householdId, { userId, role });
  });

  app.post<HouseholdParams>('/api/households/:householdId/ownership-transfer', { onRequest }, async (request) =>
    useCases.transferHouseholdOwnership.execute(request.userId, request.params.householdId, jsonBody(request.body)),
  );

  app.delete<MemberParams>('/api/households/:householdId/members/:userId', { onRequest }, async (request, reply) => {
    const { householdId, userId: target } = request.params;
    if (target === request.userId) await useCases.leaveHousehold.execute(request.userId, householdId);
    else await useCases.removeMember.execute(request.userId, householdId, target);
    return reply.status(204).send();
  });

  app.get<HouseholdParams>('/api/households/:householdId/pets', { onRequest }, async (request) => {
    const { householdId } = request.params;
    let query: PetListQuery;
    try {
      query = petListQuery(request.query);
    } catch (invalidQuery) {
      await useCases.householdPets.execute(request.userId, householdId); // D-108-4: 404 antes que el 422
      throw invalidQuery;
    }
    return useCases.householdPets.execute(request.userId, householdId, query);
  });

  app.get('/api/invitations', { onRequest }, async (request) => useCases.listMyInvitations.execute(request.userId));

  app.post<HouseholdParams>('/api/invitations/:householdId/accept', { onRequest }, async (request) =>
    useCases.respondInvitation.execute(request.userId, request.params.householdId, 'ACCEPT'),
  );

  app.post<HouseholdParams>('/api/invitations/:householdId/decline', { onRequest }, async (request, reply) => {
    await useCases.respondInvitation.execute(request.userId, request.params.householdId, 'DECLINE');
    return reply.status(204).send();
  });
}
