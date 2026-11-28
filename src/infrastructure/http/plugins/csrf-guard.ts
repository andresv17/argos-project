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
/** Rutas internas autenticadas con Bearer OIDC, sin cookies; excluidas de CSRF (H-MERO-017): el Planificador y la cola de la escena (006, REQ-ESC6-033). */
const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/internal/maintenance', '/internal/scene-worker']);
/** La superficie pública del enlace veterinario no tiene sesión ni CSRF: todo verbo que no sea GET responde allí el mismo 404 uniforme sin resolver el token (REQ-VET-006). */
const PUBLIC_SHARED_PREFIX = '/api/shared';
/** La ficha QR pública (012, #32; `/api/emergency/…` y el shell `/e/…`) tampoco tiene sesión ni CSRF: todo verbo que no sea GET recibe el MISMO 404 uniforme del prefijo, no un 403 distinguible (INV-QR12-002, SC-012-126). */
const PUBLIC_EMERGENCY_PREFIXES = ['/api/emergency', '/e'] as const;

export function registerCsrfGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (path === PUBLIC_SHARED_PREFIX || path.startsWith(`${PUBLIC_SHARED_PREFIX}/`)) return;
    if (PUBLIC_EMERGENCY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;
    if (MUTATING_METHODS.has(request.method) && !CSRF_EXEMPT_PATHS.has(path) && request.headers[CSRF_HEADER] !== '1') {
      throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'X-Argos-Request');
    }
  });
}
