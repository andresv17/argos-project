/**
 * Rol de plataforma de `/admin` (feature 011, REQ-ADM11-002, H-8, D11-01 = A): conjunto cerrado `SUPER_ADMIN | OPERATOR | SUPPORT` como tipo NOMINAL (con marca) distinto de cualquier rol de hogar.
 * La marca impide asignar una cadena cualquiera o un rol de otro dominio a un valor de este tipo: la única puerta de entrada es `parsePlatformRole`, que compara por IGUALDAD EXACTA
 * (nunca por subcadena ni expresión regular) y devuelve `null` para un valor desconocido (falla cerrada: un rol desconocido deja sin acceso, REQ-ADM11-003).
 * Este módulo no importa nada de hogares y ningún módulo de hogares lo importa (separación nominal, REQ-ADM11-002).
 *
 * @implements REQ-ADM11-002, REQ-ADM11-003, INV-ADM11-001
 */

declare const platformRoleBrand: unique symbol;

/** Rol de plataforma: valor cerrado con marca nominal. */
export type PlatformRole = ('SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT') & { readonly [platformRoleBrand]: true };

const SUPER_ADMIN_VALUE = 'SUPER_ADMIN';
const OPERATOR_VALUE = 'OPERATOR';
const SUPPORT_VALUE = 'SUPPORT';

/** Los tres roles en orden de mayor a menor alcance. */
export const PLATFORM_ROLES: readonly PlatformRole[] = [SUPER_ADMIN_VALUE as PlatformRole, OPERATOR_VALUE as PlatformRole, SUPPORT_VALUE as PlatformRole];

export const SUPER_ADMIN: PlatformRole = SUPER_ADMIN_VALUE as PlatformRole;
export const OPERATOR: PlatformRole = OPERATOR_VALUE as PlatformRole;
export const SUPPORT: PlatformRole = SUPPORT_VALUE as PlatformRole;

/** Rol de plataforma si el valor es EXACTAMENTE uno de los tres; `null` en cualquier otro caso (incluidas variantes con espacios, mayúsculas o prefijos). */
export function parsePlatformRole(value: unknown): PlatformRole | null {
  for (const candidate of PLATFORM_ROLES) {
    if (value === candidate) return candidate;
  }
  return null;
}

export const isSuperAdmin = (role: PlatformRole): boolean => role === SUPER_ADMIN;
