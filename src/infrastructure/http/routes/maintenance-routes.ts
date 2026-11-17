/**
 * POST /internal/maintenance: la invoca Cloud Scheduler con un token OIDC (Bearer). Ajena a cookies y a CSRF.
 * - Sin Bearer o `verifyOidc` rechaza -> 401 ERR-AUTH-UNAUTHENTICATED (sin purga).
 * - `identity.email !== schedulerEmail` (igualdad exacta) -> 403 ERR-ACC-FORBIDDEN.
 * - Identidad correcta -> `runMaintenance()` y 200 con los 5 conteos de MaintenanceResult.
 * El log registra solo conteos: nunca el token ni la identidad. Un fallo responde 500 sin causa.
 *
 * @implements REQ-CLD-007, REQ-SEC-007, INV-AUD-001, SC-CLD-009
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import type { MaintenanceCounts } from '../../../application/ports/unit-of-work.port.ts';
import type { VerifyOidc } from '../oidc-verify.ts';
import { sendProblem } from '../plugins/problem-details.ts';

export const MAINTENANCE_PATH = '/internal/maintenance';

export interface MaintenanceRouteOptions {
  readonly verifyOidc: VerifyOidc;
  readonly runMaintenance: () => Promise<MaintenanceCounts>;
  readonly schedulerEmail: string;
}

const BEARER = /^Bearer ([^\s]+)$/;

export function registerMaintenanceRoute(app: FastifyInstance, { verifyOidc, runMaintenance, schedulerEmail }: MaintenanceRouteOptions): void {
  app.post(MAINTENANCE_PATH, async (request: FastifyRequest, reply: FastifyReply) => {
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) return sendProblem(reply, request, new DomainError('ERR-AUTH-UNAUTHENTICATED'));
    let email: string;
    try {
      email = (await verifyOidc(token)).email;
    } catch {
      return sendProblem(reply, request, new DomainError('ERR-AUTH-UNAUTHENTICATED'));
    }
    if (email !== schedulerEmail) return sendProblem(reply, request, new DomainError('ERR-ACC-FORBIDDEN'));
    let counts: MaintenanceCounts;
    try {
      counts = await runMaintenance();
    } catch {
      request.log.warn('mantenimiento por Scheduler falló');
      return sendProblem(reply, request, new DomainError('ERR-INTERNAL-UNEXPECTED'));
    }
    const { sessionsPurged, confirmationTokensPurged, membershipsPurged, invitationsPurged, auditRowsPurged } = counts;
    const result = { sessionsPurged, confirmationTokensPurged, membershipsPurged, invitationsPurged, auditRowsPurged };
    app.log.info({ maintenance: result }, 'mantenimiento por Scheduler');
    return reply.send(result);
  });
}
