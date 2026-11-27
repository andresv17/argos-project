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
// El catálogo 3.1.0 (feature 004) añade códigos que el 002 no tiene (ERR-REC-CONFLICT): su DomainError es otra clase con el mismo contrato.
import { DomainError as DomainErrorV31 } from '../../../generated/v31/index.ts';
// El catálogo 3.3.0 (feature 005) añade ERR-MEDIA-ALBUM-LIMIT: tercera clase con el mismo contrato.
import { DomainError as DomainErrorV33 } from '../../../generated/v33/index.ts';
// El catálogo 3.4.0 (feature 006) añade los ERR-SCENE-*: cuarta clase con el mismo contrato.
import { DomainError as DomainErrorV34 } from '../../../generated/v34/index.ts';
// El catálogo 3.5.0 (feature 009) añade ERR-ACCOUNT-DELETE-* y ERR-ADMIN-*: quinta clase con el mismo contrato.
import { DomainError as DomainErrorV35 } from '../../../generated/v35/index.ts';
// El catálogo 3.6.0 (feature 010) añade ERR-MEN10-ADULT-DECLARATION-REQUIRED: sexta clase con el mismo contrato.
import { DomainError as DomainErrorV36 } from '../../../generated/v36/index.ts';
// El catálogo 1.1.0 de la feature 011 añade los ERR-ADM11-*: séptima clase con el mismo contrato.
import { DomainError as DomainErrorV37 } from '../../../generated/v37/index.ts';
// El catálogo de la feature 012 (v38) añade los ERR-OWN12-*, ERR-CHP12-*, ERR-CAR12-*, ERR-QR12-* y ERR-VET12-*: octava clase con el mismo contrato.
import { DomainError as DomainErrorV38 } from '../../../generated/v38/index.ts';
import { MAX_IMPORT_BYTES } from '../../../application/use-cases/backup-use-cases.ts';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';
export const BACKUP_IMPORT_PATH = '/api/backup/import';
/** `POST /api/pets/<id>/media`, `PUT /api/pets/<id>/avatar` y `PUT /api/households/<id>/photo` (006) `PUT /api/admin/about/photo` (010) y `PUT /api/account/avatar` (011, #78, Trinity H-1): rutas de cuerpo crudo de medios. */
const MEDIA_UPLOAD_PATH = /^\/api\/(?:pets\/[^/]+\/(?:media|avatar)|households\/[^/]+\/photo|admin\/about\/photo|account\/avatar)$/;
/** `PUT /api/admin/about` (010, H-ARCH-ACE-413): el JSON de texto que supera el límite de lectura es `ERR-ACE10-BODY-TOO-LARGE` (413), solo en esta ruta. */
const ABOUT_TEXT_PATH = '/api/admin/about';

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
export function toDomainError(error: unknown, request: FastifyRequest): DomainError | DomainErrorV31 | DomainErrorV33 | DomainErrorV34 | DomainErrorV35 | DomainErrorV36 | DomainErrorV37 | DomainErrorV38 {
  if (error instanceof DomainError || error instanceof DomainErrorV31 || error instanceof DomainErrorV33 || error instanceof DomainErrorV34 || error instanceof DomainErrorV35 || error instanceof DomainErrorV36 || error instanceof DomainErrorV37 || error instanceof DomainErrorV38) return error;
  if (isFastifyRequestError(error)) {
    // Medios y avatar (REQ-ARC-001, REQ-AVA-001): el cuerpo que supera el tope de lectura es ERR-MEDIA-TOO-LARGE (413), no un fallo de esquema.
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' && MEDIA_UPLOAD_PATH.test(requestPath(request))) return new DomainErrorV31('ERR-MEDIA-TOO-LARGE');
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' && requestPath(request) === ABOUT_TEXT_PATH && request.method === 'PUT') return new DomainErrorV36('ERR-ACE10-BODY-TOO-LARGE');
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' && (requestPath(request) === BACKUP_IMPORT_PATH || requestPath(request) === `${BACKUP_IMPORT_PATH}/preview`)) {
      return new DomainError('ERR-BACKUP-PAYLOAD-TOO-LARGE', `El archivo supera el máximo de ${MAX_IMPORT_BYTES} bytes (10 MB).`, null, 'ROLLED_BACK');
    }
    return new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'La petición no cumple el formato esperado.');
  }
  return new DomainError('ERR-INTERNAL-UNEXPECTED');
}

export function sendProblem(reply: FastifyReply, request: FastifyRequest, error: DomainError | DomainErrorV31 | DomainErrorV33 | DomainErrorV34 | DomainErrorV35 | DomainErrorV36 | DomainErrorV37 | DomainErrorV38): FastifyReply {
  return reply.status(error.status).type(PROBLEM_CONTENT_TYPE).send(error.toProblemDetails(requestPath(request)));
}

/** @implements ERR-INTERNAL-UNEXPECTED */
export function registerProblemDetails(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const problem = toDomainError(error, request);
    if (problem.code === 'ERR-INTERNAL-UNEXPECTED' && !(error instanceof DomainError) && !(error instanceof DomainErrorV31) && !(error instanceof DomainErrorV33) && !(error instanceof DomainErrorV34) && !(error instanceof DomainErrorV35) && !(error instanceof DomainErrorV36 || error instanceof DomainErrorV37 || error instanceof DomainErrorV38)) request.log.error({ err: error }, 'error no previsto');
    // 429 de la escena (REQ-ESC6-034), de administración y del registro (009): los segundos de espera viajan en `Retry-After`.
    const retryAfter = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if ((problem.code === 'ERR-RATE-LIMITED' || problem.code === 'ERR-ADMIN-RATE-LIMITED' || problem.code === 'ERR-ACCOUNT-REGISTRATION-RATE-LIMITED') && typeof retryAfter === 'number') reply.header('retry-after', String(retryAfter));
    // 429 de administración (009, EDGE-009-035): sin caché y sin revelar nada más que el código del catálogo.
    if (problem.code === 'ERR-ADMIN-RATE-LIMITED') reply.header('cache-control', 'no-store');
    return sendProblem(reply, request, problem);
  });
}
