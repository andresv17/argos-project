/**
 * REGISTRO CENTRAL de roles por ruta de `/api/admin/*` (feature 011, ADR-011-01, H-7, REQ-ADM11-003): el ÚNICO módulo de `infrastructure/http/` que declara `método + ruta -> roles` (o el marcador
 * `PUBLIC_PRE_SESSION`, solo el inicio y el callback de Google). Es la copia en código de la matriz `x-sdd-role-matrix` de `admin.openapi.yaml` 1.8.0 y la prueba meta de T1525 compara ambas con las
 * rutas realmente montadas. DENY-BY-DEFAULT: una ruta `/api/admin/*` montada y ausente de este registro se rechaza con el 404 uniforme; un rol fuera del conjunto de la ruta recibe 403
 * `ERR-ADM11-ROLE-NOT-AUTHORIZED` antes de leer el cuerpo. Los roles se comparan por IGUALDAD EXACTA del tipo nominal `PlatformRole` (H-8), nunca por subcadena.
 *
 * `SUPER_ADMIN` figura en toda fila. `SUPPORT`: solo aprobaciones, `session` y `me`. `OPERATOR`: lo anterior más parámetros, reinicio de cuota y Acerca de.
 *
 * @implements REQ-ADM11-003, REQ-ADM11-002, INV-ADM11-001, SC-011-021, EDGE-009-008
 */

import { OPERATOR, SUPER_ADMIN, SUPPORT, type PlatformRole } from '../../domain/admin/platform-role.ts';

/** Marcador de una ruta anterior a la sesión (acceso con Google): sin sesión ni rol. */
export const PUBLIC_PRE_SESSION = 'PUBLIC_PRE_SESSION';

type Access = typeof PUBLIC_PRE_SESSION | readonly PlatformRole[];
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AdminRouteEntry {
  readonly method: Method;
  /** Ruta en la forma del contrato OpenAPI (`{param}`). */
  readonly path: string;
  readonly access: Access;
}

const ALL_ROLES: readonly PlatformRole[] = [SUPER_ADMIN, OPERATOR, SUPPORT];
const OPERATIONS: readonly PlatformRole[] = [SUPER_ADMIN, OPERATOR];
const SUPER_ONLY: readonly PlatformRole[] = [SUPER_ADMIN];

export const ADMIN_ROUTE_REGISTRY: readonly AdminRouteEntry[] = [
  { method: 'GET', path: '/api/admin/auth/google/start', access: PUBLIC_PRE_SESSION },
  { method: 'GET', path: '/api/admin/auth/google/callback', access: PUBLIC_PRE_SESSION },
  { method: 'GET', path: '/api/admin/session', access: ALL_ROLES },
  { method: 'DELETE', path: '/api/admin/session', access: ALL_ROLES },
  { method: 'GET', path: '/api/admin/me', access: ALL_ROLES },
  { method: 'GET', path: '/api/admin/pending-count', access: ALL_ROLES },
  { method: 'GET', path: '/api/admin/registrations', access: ALL_ROLES },
  { method: 'POST', path: '/api/admin/registrations/{registrationId}/approve', access: ALL_ROLES },
  { method: 'POST', path: '/api/admin/registrations/{registrationId}/reject', access: ALL_ROLES },
  { method: 'GET', path: '/api/admin/parameters', access: OPERATIONS },
  { method: 'PUT', path: '/api/admin/parameters/{key}', access: OPERATIONS },
  { method: 'POST', path: '/api/admin/parameters/scene-quota/reset', access: OPERATIONS },
  { method: 'GET', path: '/api/admin/about', access: OPERATIONS },
  { method: 'PUT', path: '/api/admin/about', access: OPERATIONS },
  { method: 'PUT', path: '/api/admin/about/photo', access: OPERATIONS },
  { method: 'GET', path: '/api/admin/administrators', access: SUPER_ONLY },
  { method: 'POST', path: '/api/admin/administrators', access: SUPER_ONLY },
  { method: 'PUT', path: '/api/admin/administrators/{adminId}/role', access: SUPER_ONLY },
  { method: 'POST', path: '/api/admin/administrators/{adminId}/disable', access: SUPER_ONLY },
  { method: 'POST', path: '/api/admin/administrators/{adminId}/reactivate', access: SUPER_ONLY },
  { method: 'POST', path: '/api/admin/administrators/{adminId}/reinvite', access: SUPER_ONLY },
];

/** Resultado de consultar el registro para una ruta montada. */
export type AdminRouteAccess = { readonly pre_session: true } | { readonly pre_session: false; allows(role: PlatformRole): boolean };

/** Forma de una ruta sin los nombres de sus parámetros (`{id}` de OpenAPI y `:id` de Fastify coinciden). */
const shapeOf = (path: string): string => path.replace(/\{[A-Za-z]+\}|:[A-Za-z]+/g, ':p');

const INDEX: ReadonlyMap<string, AdminRouteEntry> = new Map(ADMIN_ROUTE_REGISTRY.map((entry) => [`${entry.method} ${shapeOf(entry.path)}`, entry]));

function allowsRole(allowed: readonly PlatformRole[], role: PlatformRole): boolean {
  for (const candidate of allowed) {
    if (candidate === role) return true;
  }
  return false;
}

/**
 * Acceso declarado para `método + ruta montada` (la forma `routeOptions.url` de Fastify); `undefined` si la ruta no figura en el registro (deny-by-default). HEAD se declara como GET.
 */
export function adminRouteAccess(method: string, routeUrl: string): AdminRouteAccess | undefined {
  const entry = INDEX.get(`${method === 'HEAD' ? 'GET' : method} ${shapeOf(routeUrl)}`);
  if (entry === undefined) return undefined;
  if (entry.access === PUBLIC_PRE_SESSION) return { pre_session: true };
  const allowed = entry.access;
  return { pre_session: false, allows: (role) => allowsRole(allowed, role) };
}
