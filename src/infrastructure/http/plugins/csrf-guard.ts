/**
 * Defensa CSRF: toda petición que modifica estado debe traer
 * `X-Argos-Request: 1`; si no, ERR-AUTH-CSRF-REJECTED (403). Se comprueba en `onRequest`, antes que la sesión, el
 * cuerpo y el esquema, y también en las rutas públicas (registro, login, logout).
 *
 * @implements INV-AUTH-007, ERR-AUTH-CSRF-REJECTED
 */

import type { FastifyInstance } from 'fastify';
import { DomainError } from '../../../generated/index.ts';

export const CSRF_HEADER = 'x-argos-request';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** @implements INV-AUTH-007, ERR-AUTH-CSRF-REJECTED */
/** Ruta del Scheduler: autenticada con Bearer OIDC, sin cookies; excluida de CSRF (H-MERO-017). */
const CSRF_EXEMPT_PATH = '/internal/maintenance';

export function registerCsrfGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    if (MUTATING_METHODS.has(request.method) && request.url.split('?')[0] !== CSRF_EXEMPT_PATH && request.headers[CSRF_HEADER] !== '1') {
      throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'X-Argos-Request');
    }
  });
}
