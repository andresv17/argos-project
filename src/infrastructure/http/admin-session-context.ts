/**
 * Sesión de administración y rol efectivo de UNA petición, resueltos por la puerta única (`admin-gate.ts`, feature 011, H-7) y leídos por los manejadores de las rutas. Módulo aparte para que
 * la puerta y las rutas no se importen entre sí.
 *
 * @implements REQ-ADM11-003
 */

import type { FastifyRequest } from 'fastify';
import type { AdminSessionInfo } from '../../application/use-cases/admin-use-cases.ts';

const sessionOf = new WeakMap<FastifyRequest, AdminSessionInfo>();

export const setAdminSessionOfRequest = (request: FastifyRequest, session: AdminSessionInfo): void => void sessionOf.set(request, session);

/** Sesión y rol efectivo que la puerta resolvió para esta petición; `undefined` si la ruta no pasa por la puerta. */
export const adminSessionOfRequest = (request: FastifyRequest): AdminSessionInfo | undefined => sessionOf.get(request);
