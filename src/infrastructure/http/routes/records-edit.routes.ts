/**
 * Rutas genéricas de edición y borrado de registros `/pets/{petId}/records/{collection}/{recordId}` del OpenAPI
 * (operaciones updateRecord y deleteRecord). Todas exigen sesión; la colección y el RBAC los resuelve el caso de uso.
 *
 * `PATCH` lee la cabecera `If-Match: "<n>"` (revisión del registro, D-16 A): ausente la trata el caso de uso (ERR-SCHEMA-VALIDATION-FAILED,
 * campo If-Match); con otro formato se rechaza aquí con el mismo error.
 *
 * @implements REQ-REC2-003, REQ-BOR-005, REQ-RBAC-001, SC-015, ERR-REC-CONFLICT, ERR-REC-SUPERSEDED-IMMUTABLE, ERR-ACC-FORBIDDEN
 */

import type { FastifyInstance } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type RecordParams = { Params: { petId: string; collection: string; recordId: string } };

const IF_MATCH = /^"(\d{1,15})"$/;

/**
 * Revisión de la cabecera `If-Match` (entre comillas, decimal sin signo); null si no viene. Cualquier otro formato (sin comillas, débil
 * `W/"…"`, lista, vacío, repetida) es ERR-SCHEMA-VALIDATION-FAILED en el campo If-Match.
 * @implements REQ-BOR-005
 */
export function parseIfMatch(header: string | string[] | undefined): number | null {
  if (header === undefined) return null;
  const match = typeof header === 'string' ? IF_MATCH.exec(header) : null;
  if (match === null) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'If-Match debe ser la revisión del registro entre comillas, por ejemplo "3".', 'If-Match');
  return Number(match[1]);
}

/** @implements REQ-REC2-003, REQ-BOR-005, REQ-RBAC-001 */
export function registerRecordEditRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.patch<RecordParams>('/api/pets/:petId/records/:collection/:recordId', { onRequest }, async (request) =>
    useCases.updateRecord.execute(request.userId, request.params.petId, request.params.collection, request.params.recordId, jsonBody(request.body), parseIfMatch(request.headers['if-match'])),
  );

  app.delete<RecordParams>('/api/pets/:petId/records/:collection/:recordId', { onRequest }, async (request, reply) => {
    await useCases.deleteRecord.execute(request.userId, request.params.petId, request.params.collection, request.params.recordId);
    return reply.status(204).send();
  });
}
