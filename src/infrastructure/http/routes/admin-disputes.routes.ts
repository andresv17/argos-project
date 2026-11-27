/**
 * Rutas de la cola de disputas de `/admin` (Feature 012, Bloque B, #23, T1636; `contracts/openapi/admin-disputes.openapi.yaml`, APPROVED): 9 operaciones bajo `/api/admin/disputes`.
 * - La puerta única (`admin-gate.ts`) ya resolvió sesión y rol (404 uniforme sin sesión, 403 `ERR-ADM11-ROLE-NOT-AUTHORIZED` para `SUPPORT`) ANTES de leer el cuerpo; el registro central de roles declara las 9 filas.
 * - `resolve` y `confirm` exigen un `StepUpGrant` vigente y de UN SOLO USO ligado a `(adminId, disputeId, acción)` (`assertStepUpGrant`): sin él, 403 genérico de `/admin` sin código de catálogo nuevo.
 * - `person_id` del administrador se lee de `admin_identities` en cada petición; ausente = el caso de uso falla cerrado con `ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT`. Nunca se auditan `person_id` ni el motivo libre.
 * - Expediente inexistente = 404 uniforme; `AdminForbiddenError` = 403 genérico. Todas las respuestas llevan `Cache-Control: no-store`.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-004, INV-CHP12-006, EDGE-012-043, EDGE-012-060, EDGE-012-061, EDGE-012-064, SC-012-098, SC-012-104
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import { AdminForbiddenError, DisputeNotFoundError, type ArbiterActor } from '../../../application/use-cases/chip-dispute-admin-use-cases.ts';
import { AdminStepUpStore } from '../admin-stepup-store.ts';
import { adminSessionOfRequest } from '../admin-session-context.ts';
import { PROBLEM_CONTENT_TYPE, requestPath } from '../plugins/problem-details.ts';
import { jsonBody } from '../request-input.ts';
import { hasForeignOrigin, uniformNotFound } from './admin.routes.ts';
import type { RouteContext } from './use-cases.ts';

const OPAQUE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const invalid = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'La petición no cumple el formato esperado.', field);

/** Objeto JSON sin campos fuera de la lista (`additionalProperties: false`); cuerpo ausente o no objeto = 422. */
function strictBody(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  const parsed = jsonBody(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid('body');
  const extra = Object.keys(parsed).find((key) => !allowed.includes(key));
  if (extra !== undefined) throw invalid(extra);
  return parsed as Record<string, unknown>;
}

/** Motivo obligatorio y auditado: texto de 1 a 500 puntos de código. */
function requireReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || [...value.normalize('NFC')].length > 500) throw invalid('reason');
  return value;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) throw invalid(field);
  return value;
}

/** @implements REQ-CHP12-009, INV-CHP12-006 */
export function registerAdminDisputeRoutes(app: FastifyInstance, { useCases }: RouteContext, stepUps: AdminStepUpStore = new AdminStepUpStore()): void {
  const noStore = (reply: FastifyReply): FastifyReply => reply.header('cache-control', 'no-store');
  const forbidden = (request: FastifyRequest, reply: FastifyReply): FastifyReply => noStore(reply).status(403).type(PROBLEM_CONTENT_TYPE).send({ type: 'about:blank', title: 'Forbidden', status: 403, instance: requestPath(request) });

  const actorOf = async (request: FastifyRequest): Promise<ArbiterActor | null> => {
    const session = adminSessionOfRequest(request);
    if (session === undefined) return null;
    return { adminId: session.adminId, role: session.role as ArbiterActor['role'], personId: await useCases.adminPersonId(session.adminId) };
  };

  /** Resuelve el actor y ejecuta; traduce el 404 uniforme y el 403 genérico de `/admin`. */
  const guarded = async (request: FastifyRequest, reply: FastifyReply, work: (actor: ArbiterActor) => Promise<unknown>, status = 200): Promise<FastifyReply> => {
    const actor = await actorOf(request);
    if (actor === null) return uniformNotFound(reply);
    try {
      const result = await work(actor);
      return noStore(reply).status(status).send(result);
    } catch (error) {
      if (error instanceof DisputeNotFoundError) return uniformNotFound(reply);
      if (error instanceof AdminForbiddenError) return forbidden(request, reply);
      throw error;
    }
  };

  type Params = { Params: { disputeId: string } };
  const disputeId = (request: FastifyRequest<Params>): string => requireId(request.params.disputeId, 'disputeId');

  app.get<{ Querystring: Record<string, unknown> }>('/api/admin/disputes', async (request, reply) =>
    guarded(request, reply, (actor) => useCases.adminListDisputes.execute(actor, request.query)),
  );

  app.get<Params>('/api/admin/disputes/:disputeId', async (request, reply) => guarded(request, reply, (actor) => useCases.adminGetDispute.execute(actor, disputeId(request))));

  app.get<{ Params: { disputeId: string; evidenceId: string } }>('/api/admin/disputes/:disputeId/evidence/:evidenceId', async (request, reply) => {
    const id = requireId(request.params.disputeId, 'disputeId');
    const evidenceId = requireId(request.params.evidenceId, 'evidenceId');
    return guarded(request, reply, (actor) => useCases.adminReadDisputeEvidence.execute(actor, id, evidenceId));
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/extend-freeze', async (request, reply) => {
    const id = disputeId(request);
    const reason = requireReason(strictBody(request.body, ['reason'])['reason']);
    return guarded(request, reply, async (actor) => useCases.adminDisputeFile(actor, await useCases.adminExtendDisputeFreeze.execute(actor, id, { reason })));
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/step-up', async (request, reply) => {
    const id = disputeId(request);
    const body = strictBody(request.body, ['disputeId', 'action']);
    if (requireId(body['disputeId'], 'disputeId') !== id) throw invalid('disputeId');
    const action = body['action'];
    if (action !== 'resolve' && action !== 'confirm') throw invalid('action');
    // Reautenticación mínima: sesión de administración vigente (la puerta única) y origen propio; un origen ajeno nunca obtiene un grant.
    if (hasForeignOrigin(request)) return forbidden(request, reply);
    return guarded(
      request,
      reply,
      async (actor) => {
        await useCases.adminAuthorizeStepUp(actor, id);
        return stepUps.issue({ adminId: actor.adminId, disputeId: id, action, now: useCases.nowIso(), newId: useCases.newId });
      },
      201,
    );
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/resolve', async (request, reply) => {
    const id = disputeId(request);
    const body = strictBody(request.body, ['resolution', 'reason', 'stepUpGrantId', 'executionMode']);
    const resolution = body['resolution'];
    if (resolution !== 'REJECT' && resolution !== 'ADD_CO_OWNER' && resolution !== 'REQUEST_CHANGE_PRINCIPAL' && resolution !== 'END_CO_OWNERSHIP') throw invalid('resolution');
    const mode = body['executionMode'];
    if (mode !== undefined && mode !== 'DUAL_CONTROL' && mode !== 'WINDOW_72H') throw invalid('executionMode');
    const reason = requireReason(body['reason']);
    const grantId = requireId(body['stepUpGrantId'], 'stepUpGrantId');
    return guarded(request, reply, async (actor) => {
      stepUps.consume(grantId, { adminId: actor.adminId, disputeId: id, action: 'resolve' }, useCases.nowIso());
      return useCases.adminDisputeFile(actor, await useCases.adminResolveDispute.execute(actor, id, { resolution, reason, ...(mode === undefined ? {} : { executionMode: mode }) }));
    });
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/confirm', async (request, reply) => {
    const id = disputeId(request);
    const body = strictBody(request.body, ['reason', 'stepUpGrantId']);
    const reason = requireReason(body['reason']);
    const grantId = requireId(body['stepUpGrantId'], 'stepUpGrantId');
    return guarded(request, reply, async (actor) => {
      stepUps.consume(grantId, { adminId: actor.adminId, disputeId: id, action: 'confirm' }, useCases.nowIso());
      return useCases.adminDisputeFile(actor, await useCases.adminConfirmDispute.execute(actor, id, { reason }));
    });
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/cancel-execution', async (request, reply) => {
    const id = disputeId(request);
    const reason = requireReason(strictBody(request.body, ['reason'])['reason']);
    return guarded(request, reply, async (actor) => useCases.adminDisputeFile(actor, await useCases.adminCancelDisputeExecution.execute(actor, id, { reason })));
  });

  app.post<Params & { Body: unknown }>('/api/admin/disputes/:disputeId/close-moot', async (request, reply) => {
    const id = disputeId(request);
    const mootReason = strictBody(request.body, ['mootReason'])['mootReason'];
    if (typeof mootReason !== 'string' || !['TARGET_LEFT', 'TARGET_NOT_ACTIVE', 'REQUESTER_NOT_ACTIVE', 'TRIGGER_LOST', 'PET_GONE'].includes(mootReason)) throw invalid('mootReason');
    return guarded(request, reply, async (actor) => useCases.adminDisputeFile(actor, await useCases.adminCloseDisputeMoot.execute(actor, id, { mootReason: mootReason as 'PET_GONE' })));
  });
}
