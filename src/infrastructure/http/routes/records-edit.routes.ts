/**
 * Rutas genéricas de edición y borrado de registros `/pets/{petId}/records/{collection}/{recordId}` del OpenAPI
 * (operaciones updateRecord y deleteRecord). Todas exigen sesión; la colección y el RBAC los resuelve el caso de uso.
 *
 * @implements REQ-REC2-003, REQ-RBAC-001, SC-015, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-ACC-FORBIDDEN
 */

import type { FastifyInstance } from 'fastify';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type RecordParams = { Params: { petId: string; collection: string; recordId: string } };

/** @implements REQ-REC2-003, REQ-RBAC-001 */
export function registerRecordEditRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.patch<RecordParams>('/api/pets/:petId/records/:collection/:recordId', { onRequest }, async (request) =>
    useCases.updateRecord.execute(request.userId, request.params.petId, request.params.collection, request.params.recordId, jsonBody(request.body)),
  );

  app.delete<RecordParams>('/api/pets/:petId/records/:collection/:recordId', { onRequest }, async (request, reply) => {
    await useCases.deleteRecord.execute(request.userId, request.params.petId, request.params.collection, request.params.recordId);
    return reply.status(204).send();
  });
}
