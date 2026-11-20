/**
 * Rutas AUTENTICADAS del enlace veterinario (OpenAPI 3.3.0, feature 005; cookie + CSRF como el resto): creación y listado por mascota o por hogar, revocación y
 * vista previa del resumen (REQ-VET-001, REQ-VET-005, REQ-SUM-004, D5-15).
 * - Las dos creaciones exigen `Idempotency-Key` (UUID v4): 201 `CreateShareLinkResult` con la URL UNA sola vez; el reintento con la misma clave es 200
 *   `CreateShareLinkReplay` sin URL (EDGE-005-16/17). La respuesta se envía solo después del COMMIT (lo garantiza el caso de uso).
 * - Un único manejador parametrizado por alcance sirve los pares create/list y preview `PET`/`HOUSEHOLD` (MIF-005-04): los 10 `operationId` no cambian.
 * - `Cache-Control: no-store` en toda respuesta de estas rutas, errores incluidos (la URL con el token nunca se cachea ni se registra).
 * - La URL pública se arma con el protocolo y el host de la petición (`trustProxy` de 1 salto en Cloud Run); el token solo existe en esa respuesta.
 *
 * @implements REQ-VET-001, REQ-VET-005, REQ-SUM-004, INV-005-005, SC-005-015, SC-005-025, SC-005-051
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ShareScopeRef } from '../../../application/sharing/share-access.ts';
import { jsonBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

/** `/api/pets/<id>/(share-links|clinical-summary)`, `/api/households/<id>/(share-links|clinical-summary)` y `/api/share-links/<id>`. */
const SHARE_PATH = /^\/api\/(?:(?:pets|households)\/[^/?]+\/(?:share-links|clinical-summary)|share-links\/[^/?]+)(?:[/?]|$)/;

type PetParams = { Params: { petId: string } };
type HouseholdParams = { Params: { householdId: string } };

const publicBase = (request: FastifyRequest): string => `${request.protocol}://${request.host}`;

/** @implements REQ-VET-001, REQ-VET-005, REQ-SUM-004, SC-005-015, SC-005-051 */
export function registerShareLinkRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  const onRequest = requireSession(useCases.authenticate);

  app.addHook('onSend', async (request, reply, payload) => {
    if (SHARE_PATH.test(request.url.split('?')[0] ?? request.url)) reply.header('cache-control', 'no-store');
    return payload;
  });

  const create = async (request: FastifyRequest, reply: import('fastify').FastifyReply, ref: ShareScopeRef) => {
    const outcome = await useCases.createShareLink.execute(request.userId, ref, request.headers['idempotency-key'], jsonBody(request.body));
    if (outcome.kind === 'REPLAY') return reply.status(200).send({ link: outcome.link, urlAvailable: false });
    return reply.status(201).send({ link: outcome.link, url: `${publicBase(request)}/shared/${outcome.token}` });
  };

  app.post<PetParams>('/api/pets/:petId/share-links', { onRequest }, (request, reply) => create(request, reply, { scope: 'PET', petId: request.params.petId }));
  app.get<PetParams>('/api/pets/:petId/share-links', { onRequest }, (request) => useCases.listShareLinks.execute(request.userId, { scope: 'PET', petId: request.params.petId }));
  app.post<HouseholdParams>('/api/households/:householdId/share-links', { onRequest }, (request, reply) =>
    create(request, reply, { scope: 'HOUSEHOLD', householdId: request.params.householdId }),
  );
  app.get<HouseholdParams>('/api/households/:householdId/share-links', { onRequest }, (request) =>
    useCases.listShareLinks.execute(request.userId, { scope: 'HOUSEHOLD', householdId: request.params.householdId }),
  );

  app.delete<{ Params: { shareLinkId: string } }>('/api/share-links/:shareLinkId', { onRequest }, async (request, reply) => {
    await useCases.revokeShareLink.execute(request.userId, request.params.shareLinkId);
    return reply.status(204).send();
  });

  type PreviewQuery = { Querystring: { includeMicrochip?: unknown; includeClinicalFiles?: unknown; includeDeceasedAt?: unknown } };
  app.get<PetParams & PreviewQuery>('/api/pets/:petId/clinical-summary', { onRequest }, (request) =>
    useCases.previewSummary.execute(request.userId, { scope: 'PET', petId: request.params.petId }, request.query),
  );
  app.get<HouseholdParams & PreviewQuery>('/api/households/:householdId/clinical-summary', { onRequest }, (request) =>
    useCases.previewSummary.execute(request.userId, { scope: 'HOUSEHOLD', householdId: request.params.householdId }, request.query),
  );
}
