/**
 * Errores HTTP como RFC 9457 (`application/problem+json`) desde el catálogo.
 * - `DomainError` → su `status` y `toProblemDetails(ruta)`, incluido `finalState` cuando la importación terminó en
 *   `ROLLED_BACK` o `UNKNOWN`.
 * - Errores de Fastify de la petición (cuerpo demasiado grande, URL inválida…) → ERR-SCHEMA-VALIDATION-FAILED (422);
 *   en `POST /api/backup/import` y `/import/preview`, el cuerpo demasiado grande es ERR-BACKUP-PAYLOAD-TOO-LARGE con `finalState`
 *   `ROLLED_BACK`, igual que si lo rechazara STATE-BACKUP-001.
 * - Cualquier otro error → ERR-INTERNAL-UNEXPECTED (500) con el detalle del catálogo: sin mensaje ni traza internos.
 *
 * @implements ERR-INTERNAL-UNEXPECTED, ERR-BACKUP-PAYLOAD-TOO-LARGE, INV-ARCH-004
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import { MAX_IMPORT_BYTES } from '../../../application/use-cases/backup-use-cases.ts';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';
export const BACKUP_IMPORT_PATH = '/api/backup/import';

/** Ruta de la petición sin la cadena de consulta (campo `instance`). */
export const requestPath = (request: FastifyRequest) => request.url.split('?')[0] ?? request.url;

function isFastifyRequestError(error: unknown): error is FastifyError {
  const e = error as Partial<FastifyError> | null;
  return typeof e?.code === 'string' && e.code.startsWith('FST_') && typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500;
}

/**
 * Traduce cualquier error a un DomainError del catálogo.
 * @implements ERR-INTERNAL-UNEXPECTED, ERR-BACKUP-PAYLOAD-TOO-LARGE
 */
export function toDomainError(error: unknown, request: FastifyRequest): DomainError {
  if (error instanceof DomainError) return error;
  if (isFastifyRequestError(error)) {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' && (requestPath(request) === BACKUP_IMPORT_PATH || requestPath(request) === `${BACKUP_IMPORT_PATH}/preview`)) {
      return new DomainError('ERR-BACKUP-PAYLOAD-TOO-LARGE', `El archivo supera el máximo de ${MAX_IMPORT_BYTES} bytes (10 MB).`, null, 'ROLLED_BACK');
    }
    return new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'La petición no cumple el formato esperado.');
  }
  return new DomainError('ERR-INTERNAL-UNEXPECTED');
}

export function sendProblem(reply: FastifyReply, request: FastifyRequest, error: DomainError): FastifyReply {
  return reply.status(error.status).type(PROBLEM_CONTENT_TYPE).send(error.toProblemDetails(requestPath(request)));
}

/** @implements ERR-INTERNAL-UNEXPECTED */
export function registerProblemDetails(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const problem = toDomainError(error, request);
    if (problem.code === 'ERR-INTERNAL-UNEXPECTED' && !(error instanceof DomainError)) request.log.error({ err: error }, 'error no previsto');
    return sendProblem(reply, request, problem);
  });
}
