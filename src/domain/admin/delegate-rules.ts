/**
 * Reglas puras del administrador delegado de `/admin` (feature 011): estado `STATE-ADM11-001`, concesión de roles (H-6), autoafectación, raíz protegida, topes y guarda del último
 * `SUPER_ADMIN` efectivo (H-2a). Sin E/S: el servicio de aplicación `AdminDelegateService` carga los hechos bajo la transacción serializada (SELECT ... FOR UPDATE en PostgreSQL,
 * BEGIN IMMEDIATE en SQLite) y aplica estas funciones; el reloj llega por parámetro (INV-ARCH-006). Ningún rol se compara por subcadena (H-8) ni se lee de la sesión (H-7).
 *
 * Orden de comprobación de las escrituras sobre un delegado existente (contrato `admin.openapi.yaml` 1.8.0):
 * existencia (la resuelve el servicio) -> autoafectación -> concesión (H-6) -> raíz protegida -> estado -> precondición (If-Match) -> tope -> guarda del último SUPER_ADMIN.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-004, REQ-ADM11-005, STATE-ADM11-001, INV-ADM11-001, EDGE-011-002, EDGE-011-003, EDGE-011-009, EDGE-011-011
 */

import { parsePlatformRole, SUPER_ADMIN, type PlatformRole } from './platform-role.ts';

export type DelegateStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

/** Códigos de error de las reglas (catálogo 011 1.1.0); el servicio los eleva como `DomainError`. */
export type DelegateRuleError =
  | 'ERR-ADM11-SELF-MODIFICATION-FORBIDDEN'
  | 'ERR-ADM11-GRANT-FORBIDDEN'
  | 'ERR-ADM11-ROOT-PROTECTED'
  | 'ERR-ADM11-INVALID-TRANSITION'
  | 'ERR-ADM11-PRECONDITION-FAILED'
  | 'ERR-ADM11-DELEGATE-LIMIT-REACHED'
  | 'ERR-ADM11-LAST-SUPER-ADMIN';

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly code: DelegateRuleError };
const PASS: Verdict = { ok: true };
const deny = (code: DelegateRuleError): Verdict => ({ ok: false, code });

/** Fila de delegado ya interpretada (rol y estado válidos). Una fila con rol o estado desconocido NO produce `Delegate`: sin acceso. */
export interface Delegate {
  readonly adminId: string;
  readonly email: string;
  readonly role: PlatformRole;
  readonly status: DelegateStatus;
  readonly providerSubject: string | null;
  readonly invitedAt: string | null;
  readonly invitedExpiresAt: string | null;
  readonly anchoredAt: string | null;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Quien actúa: su rol efectivo sale de la base en esta petición y `isRoot` solo de la lista de configuración. */
export interface DelegateActor {
  readonly adminId: string;
  readonly role: PlatformRole;
  readonly isRoot: boolean;
}

export type DelegateAction = 'CHANGE_ROLE' | 'DISABLE' | 'REACTIVATE' | 'REINVITE';

/** Estado válido o `null` (falla cerrada ante un valor desconocido). */
export function parseDelegateStatus(value: unknown): DelegateStatus | null {
  if (value === 'INVITED') return 'INVITED';
  if (value === 'ACTIVE') return 'ACTIVE';
  if (value === 'DISABLED') return 'DISABLED';
  return null;
}

/** La invitación caducó: `now` es posterior a `invitedExpiresAt` (el límite es inclusivo: con `now = invitedExpiresAt` aún vale). Las marcas ISO con milisegundos y `Z` se comparan en orden lexicográfico. */
export const isInvitationExpired = (delegate: Pick<Delegate, 'status' | 'invitedExpiresAt'>, now: string): boolean =>
  delegate.status === 'INVITED' && delegate.invitedExpiresAt !== null && delegate.invitedExpiresAt < now;

/** Ocupa plaza del tope de vigentes: `ACTIVE` o `INVITED` no caducada (D11-03 = B+A). */
export const occupiesSlot = (delegate: Pick<Delegate, 'status' | 'invitedExpiresAt'>, now: string): boolean => delegate.status === 'ACTIVE' || (delegate.status === 'INVITED' && !isInvitationExpired(delegate, now));

/** Estado destino de cada acción desde `from`; `null` si la transición no está declarada en STATE-ADM11-001. */
export function nextStatus(action: DelegateAction, delegate: Pick<Delegate, 'status' | 'providerSubject'>): DelegateStatus | null {
  switch (action) {
    case 'CHANGE_ROLE':
      return delegate.status === 'DISABLED' ? null : delegate.status;
    case 'DISABLE':
      return delegate.status === 'DISABLED' ? null : 'DISABLED';
    case 'REACTIVATE':
      return delegate.status === 'DISABLED' && delegate.providerSubject !== null ? 'ACTIVE' : null;
    case 'REINVITE':
      if (delegate.status === 'INVITED') return 'INVITED';
      return delegate.status === 'DISABLED' && delegate.providerSubject === null ? 'INVITED' : null;
  }
}

/** Una fila de delegado cuyo correo está en la lista raíz es raíz efectiva (EDGE-011-003). */
export const isRootEmail = (email: string, rootEmails: readonly string[]): boolean => rootEmails.some((root) => root === email);

/**
 * H-6: solo la raíz concede o retira `SUPER_ADMIN`; un `SUPER_ADMIN` delegado gestiona `OPERATOR` y `SUPPORT` y no toca a otro `SUPER_ADMIN`.
 * `targetRole` es el rol vigente del objetivo (`null` en el alta); `requestedRole` el rol que se asigna (`null` si la acción no asigna ninguno, p. ej. desactivar).
 */
export function checkGrant(actor: DelegateActor, targetRole: PlatformRole | null, requestedRole: PlatformRole | null): Verdict {
  if (actor.isRoot) return PASS;
  if (targetRole === SUPER_ADMIN || requestedRole === SUPER_ADMIN) return deny('ERR-ADM11-GRANT-FORBIDDEN');
  return PASS;
}

/** Autoafectación y concesión, en el orden del contrato. */
export function checkTargetAccess(actor: DelegateActor, target: Delegate, requestedRole: PlatformRole | null): Verdict {
  if (actor.adminId === target.adminId) return deny('ERR-ADM11-SELF-MODIFICATION-FORBIDDEN');
  return checkGrant(actor, target.role, requestedRole);
}

/** Raíz protegida: la fila objetivo tiene el correo de la lista raíz; solo cambia de la tabla lo que la configuración permite (EDGE-011-003). `REACTIVATE` y `REINVITE` no la comprueban (no tocan una raíz activa). */
export function checkRootProtection(action: DelegateAction, target: Delegate, rootEmails: readonly string[]): Verdict {
  if ((action === 'CHANGE_ROLE' || action === 'DISABLE') && isRootEmail(target.email, rootEmails)) return deny('ERR-ADM11-ROOT-PROTECTED');
  return PASS;
}

export const checkTransition = (action: DelegateAction, target: Delegate): Verdict => (nextStatus(action, target) === null ? deny('ERR-ADM11-INVALID-TRANSITION') : PASS);

/** Precondición optimista: el etag del cliente es el del estado vigente. */
export const checkPrecondition = (presentedEtag: string, currentEtag: string): Verdict => (presentedEtag === currentEtag ? PASS : deny('ERR-ADM11-PRECONDITION-FAILED'));

export interface SlotFacts {
  /** Delegados vigentes (ACTIVE + INVITED no caducadas) SIN contar al propio objetivo. */
  readonly occupiedByOthers: number;
  /** Filas totales de la tabla (incluidas DISABLED). */
  readonly totalRows: number;
  readonly activeLimit: number;
  readonly rowLimit: number;
}

/** Tope de plazas: toda transición que ocupa plaza (alta, re-invitación, reactivación) exige `occupiedByOthers < activeLimit`; el alta además `totalRows < rowLimit`. */
export function checkSlot(facts: SlotFacts, createsRow: boolean): Verdict {
  if (facts.occupiedByOthers >= facts.activeLimit) return deny('ERR-ADM11-DELEGATE-LIMIT-REACHED');
  if (createsRow && facts.totalRows >= facts.rowLimit) return deny('ERR-ADM11-DELEGATE-LIMIT-REACHED');
  return PASS;
}

/**
 * Guarda del último `SUPER_ADMIN` efectivo (H-2a): tras la operación debe quedar al menos uno contando la lista raíz y los delegados `ACTIVE` con ese rol (sin duplicar a quien está en ambas).
 * `remainingActiveSuperAdmins` ya EXCLUYE al objetivo y a quienes figuran en la lista raíz.
 */
export function checkLastSuperAdmin(rootEmails: readonly string[], remainingActiveSuperAdmins: number): Verdict {
  return rootEmails.length + remainingActiveSuperAdmins >= 1 ? PASS : deny('ERR-ADM11-LAST-SUPER-ADMIN');
}

/** `true` si la acción quita a un `SUPER_ADMIN` activo de su rol efectivo (degradación a otro rol o desactivación). */
export function removesSuperAdmin(action: DelegateAction, target: Delegate, newRole: PlatformRole | null): boolean {
  if (target.status !== 'ACTIVE' || target.role !== SUPER_ADMIN) return false;
  if (action === 'DISABLE') return true;
  return action === 'CHANGE_ROLE' && newRole !== SUPER_ADMIN;
}

/** Normaliza un correo: sin espacios en los extremos y en minúsculas (la lista raíz está normalizada igual). */
export const normalizeDelegateEmail = (email: string): string => email.trim().toLowerCase();

/** Interpreta una fila cruda; `null` si el rol o el estado son desconocidos. */
export function toDelegate(row: {
  readonly adminId: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly providerSubject: string | null;
  readonly invitedAt: string | null;
  readonly invitedExpiresAt: string | null;
  readonly anchoredAt: string | null;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}): Delegate | null {
  const role = parsePlatformRole(row.role);
  const status = parseDelegateStatus(row.status);
  if (role === null || status === null) return null;
  return { adminId: row.adminId, email: row.email, role, status, providerSubject: row.providerSubject, invitedAt: row.invitedAt, invitedExpiresAt: row.invitedExpiresAt, anchoredAt: row.anchoredAt, disabledAt: row.disabledAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
