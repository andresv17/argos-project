/**
 * Puerta única por petición de `/api/admin/*` (feature 011, ADR-011-01, H-7, REQ-ADM11-003/004): `onRequest` global que, ANTES de leer el cuerpo y de cualquier efecto,
 * (1) busca la ruta montada en el registro central de roles (`admin-role-registry.ts`; sin entrada = 404 uniforme, deny-by-default),
 * (2) resuelve la sesión de administración y el rol efectivo DESDE LA BASE en esta petición (404 uniforme si no hay acceso; el rol nunca sale de la cookie), y
 * (3) rechaza con 403 `ERR-ADM11-ROLE-NOT-AUTHORIZED` si el rol queda fuera del conjunto de la ruta.
 * Orden de la frontera: `X-Argos-Request` (403, hook global previo) -> sesión (404) -> rol (403) -> cuerpo y esquema (422) -> efecto. Las rutas previas a la sesión (inicio y callback de Google) y
 * el comodín `/api/admin/*` (404 uniforme) no pasan por aquí. Solo las acciones de mutación renuevan la inactividad (no `GET` ni `DELETE /session`).
 *
 * @implements REQ-ADM11-003, REQ-ADM11-004, INV-ADM11-001, INV-ADM9-002, EDGE-009-008
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../generated/v37/index.ts';
import { adminRouteAccess } from './admin-role-registry.ts';
import { setAdminSessionOfRequest } from './admin-session-context.ts';
import { adminSessionTokenOf, uniformNotFound } from './routes/admin.routes.ts';
import type { UseCases } from './routes/use-cases.ts';

const READ_METHODS = new Set(['GET', 'HEAD']);
const SESSION_PATH = '/api/admin/session';

/** `true` si la ruta montada pertenece a `/api/admin/*` y tiene su propio manejador (no el comodín de respaldo). */
const isOwnAdminRoute = (routeUrl: string | undefined): routeUrl is string => routeUrl !== undefined && routeUrl.startsWith('/api/admin/') && !routeUrl.endsWith('*');

/** Registra la puerta; DEBE llamarse antes de montar las rutas de administración (los hooks globales solo alcanzan a las rutas posteriores). */
export function registerAdminGate(app: FastifyInstance, useCases: Pick<UseCases, 'adminAuthenticate'>): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const routeUrl = request.routeOptions.url;
    if (!isOwnAdminRoute(routeUrl)) return undefined;
    const access = adminRouteAccess(request.method, routeUrl);
    if (access?.pre_session === true) return undefined;
    const renew = !READ_METHODS.has(request.method) && !(request.method === 'DELETE' && routeUrl === SESSION_PATH);
    const session = await useCases.adminAuthenticate.execute(adminSessionTokenOf(request), { renew: access === undefined ? false : renew, ...(access === undefined || access.pre_session ? {} : { renewForRole: access.allows }) });
    // Sin sesión o sin acceso (DENIED) y también una ruta montada pero sin declarar: el mismo 404 uniforme (deny-by-default).
    if (session === null || access === undefined) return uniformNotFound(reply);
    if (!access.allows(session.role)) throw new DomainError('ERR-ADM11-ROLE-NOT-AUTHORIZED');
    setAdminSessionOfRequest(request, session);
    return undefined;
  });
}
