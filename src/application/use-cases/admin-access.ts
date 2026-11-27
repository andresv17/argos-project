/**
 * Resolución del acceso de administración por petición (feature 011, ADR-011-01, H-7, REQ-ADM11-003/004): el rol efectivo se lee de la BASE en cada petición y de nuevo dentro de la transacción de
 * escritura (EDGE-011-015); nunca de la sesión ni de la cookie. SUPER_ADMIN raíz si el correo de la identidad está en `ARGOS_ADMIN_EMAILS`; si no, el rol del delegado `ACTIVE` con el correo exacto
 * y el `sub` anclado; cualquier otro caso (sin fila, `INVITED`, `DISABLED`, sin ancla, correo o `sub` distintos, rol o estado desconocidos) = sin acceso (`null`, falla cerrada).
 *
 * @implements REQ-ADM11-003, REQ-ADM11-004, EDGE-011-003, EDGE-011-015, INV-ADM11-001
 */

import { isRootEmail, toDelegate } from '../../domain/admin/delegate-rules.ts';
import { SUPER_ADMIN, type PlatformRole } from '../../domain/admin/platform-role.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';

export interface AdminAccess {
  readonly adminId: string;
  readonly role: PlatformRole;
  /** `true` si el correo está en la lista de configuración (la raíz: única que concede o retira SUPER_ADMIN). */
  readonly isRoot: boolean;
}

/** Acceso vigente del administrador `adminId`, o `null` si no tiene ninguno. */
export async function resolveAdminAccess(repositories: RepositorySet, rootEmails: readonly string[], adminId: string): Promise<AdminAccess | null> {
  const identity = await repositories.adminIdentities.findById(adminId);
  if (identity === null) return null;
  if (isRootEmail(identity.email, rootEmails)) return { adminId, role: SUPER_ADMIN, isRoot: true };
  const row = await repositories.adminDelegates.findById(adminId);
  if (row === null) return null;
  const delegate = toDelegate(row);
  if (delegate === null || delegate.status !== 'ACTIVE' || delegate.providerSubject !== identity.providerSubject || delegate.email !== identity.email) return null;
  return { adminId, role: delegate.role, isRoot: false };
}
