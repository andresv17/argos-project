/**
 * Casos de uso del portal de administración (Feature 009, Fase 3, `#19`; Enmienda constitucional 009-A; REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, INV-ADM9-001, INV-ADM9-002).
 * - Identidad: es administrador quien entra con Google (OIDC reutilizando el puerto de 008) con correo verificado EN la lista cerrada de configuración (`deps.admin.allowedEmails`, inyectada
 *   desde `app-config.ts`; ni `domain/admin` ni tipo de valor propio, MIF-03). La identidad se ancla al `sub` en el primer acceso con un `adminId` UUID v4 de `IdGeneratorPort` (nunca
 *   derivado del correo ni del `sub`); desde entonces el acceso exige correo en la lista Y `sub` igual al anclado (EDGE-009-047). No crea ni modifica cuentas de usuario.
 * - Estado del flujo en un almacén PROPIO (`admin_oauth_flow_states`), identificado por el SHA-256 del identificador opaco de `argos_admin_oauth`; un solo uso por compare-and-set.
 * - Todo fallo del retorno (cancelación, `state` ajeno o reutilizado, vencido, canje o `id_token` inválidos, correo fuera de la lista o sub distinto del anclado) es el MISMO resultado
 *   `{ ok: false }`: la capa HTTP lo traduce al 404 uniforme sin distinguir la causa ni revelar la lista. El canje en Google ocurre FUERA de la transacción.
 * - Sesión propia (solo el SHA-256 del identificador de 32 bytes, rotado en cada retorno); vigencia 30 min absolutos / 10 min de inactividad (`admin-session-policy.ts`); solo las
 *   acciones de mutación renuevan la inactividad. Cada petición revalida que el correo siga en la lista vigente; si no, revoca la sesión (EDGE-009-047).
 * - Sin sesión válida, la autenticación siempre recorre la MISMA secuencia de puertos (una sola lectura por hash) tanto si falta la cookie como si es ajena, vencida o revocada (EDGE-009-008).
 * - Auditoría propia (`admin_audit_entries`): id de administrador, acción y marca de tiempo; nunca correo, `sub`, identificador de sesión ni valores de prompt.
 * - Feature 011: además de la raíz (`ARGOS_ADMIN_EMAILS`) entra el delegado con fila `ACTIVE`, o `INVITED` vigente (primer acceso: ancla el `sub` con el correo exacto, caducidad de 72 h). Todo lo demás es
 *   el MISMO `DENIED` uniforme. El rol efectivo se resuelve desde la base en CADA petición (H-7, `admin-access.ts`) y la sesión no lo guarda.
 *
 * @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, INV-ADM9-001, INV-ADM9-002, EDGE-009-008, EDGE-009-009, EDGE-009-013, EDGE-009-034, EDGE-009-047, INV-ARCH-001, INV-ARCH-002, INV-ARCH-005
 */

import { constantTimeEqual, generateOneTimeToken, hashOneTimeToken, isWellFormedOneTimeToken, issueOneTimeToken } from '../../domain/auth/one-time-token.ts';
import { adminSessionExpiry, adminSessionPurgeCutoff, adminSessionStateAt } from '../../domain/auth/admin-session-policy.ts';
import { hashSessionToken } from '../../domain/auth/session-policy.ts';
import { isInvitationExpired, toDelegate, type Delegate } from '../../domain/admin/delegate-rules.ts';
import type { PlatformRole } from '../../domain/admin/platform-role.ts';
import { DomainError } from '../../generated/index.ts';
import type { AdminDelegateRecord, AdminIdentityRecord } from '../ports/admin.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { resolveAdminAccess } from './admin-access.ts';
import { ADMIN_DELEGATE_AUDIT_ACTIONS } from './admin-delegate-use-cases.ts';
import type { AdminServices, ApplicationDeps } from './use-case-support.ts';

/** Acciones auditadas de administración (cerradas; sin valores). Las de aprobación de registros (T1247) están aquí; los parámetros llegan con la Fase 5. */
export const ADMIN_AUDIT_ACTIONS = {
  sessionStart: 'ADMIN_SESSION_START',
  sessionEnd: 'ADMIN_SESSION_END',
  registrationApprove: 'ADMIN_REGISTRATION_APPROVE',
  registrationReject: 'ADMIN_REGISTRATION_REJECT',
  parameterUpdate: 'ADMIN_PARAMETER_UPDATE',
  sceneQuotaReset: 'ADMIN_SCENE_QUOTA_RESET',
} as const;

/** Sin la configuración de administración (`deps.admin` ausente) las operaciones fallan cerrado: es un error de configuración del servidor, nunca un 404 distinguible. */
function requireAdmin(deps: ApplicationDeps): AdminServices {
  if (deps.admin === undefined) throw new DomainError('ERR-INTERNAL-UNEXPECTED');
  return deps.admin;
}

/** Correo en minúsculas y sin espacios (la lista de configuración está normalizada igual). */
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Hash del identificador de la cookie si tiene la forma exacta (43 caracteres base64url); `null` si falta o está mal formado. */
const hashOfCookie = (oauthToken: string | null): string | null => (oauthToken !== null && isWellFormedOneTimeToken(oauthToken) ? hashOneTimeToken(oauthToken) : null);

/** Inicio del flujo: la URL de Google y el identificador opaco que la capa HTTP entrega en `argos_admin_oauth` (nunca se guarda en claro). */
export interface AdminAuthorizationStart {
  readonly authorizationUrl: string;
  readonly oauthToken: string;
}

/** @implements REQ-ADM9-006, EDGE-009-035 */
export class StartAdminGoogleLoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** No consulta la lista de administradores (no revela nada). Purga antes los estados vencidos. */
  async execute(): Promise<AdminAuthorizationStart> {
    const admin = requireAdmin(this.deps);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      await repositories.adminFlows.purgeExpired(now);
      const issued = issueOneTimeToken(admin.entropy, now);
      const state = generateOneTimeToken(admin.entropy);
      const nonce = generateOneTimeToken(admin.entropy);
      const codeVerifier = generateOneTimeToken(admin.entropy);
      await repositories.adminFlows.insert({ tokenHash: issued.tokenHash, state, nonce, codeVerifier, createdAt: now, expiresAt: issued.expiresAt, consumedAt: null });
      return { oauthToken: issued.token, authorizationUrl: admin.oidc.authorizationUrl({ state, nonce, codeVerifier }) };
    });
  }
}

export interface AdminCallbackInput {
  /** Valor de la cookie `argos_admin_oauth`; `null` si no llegó. */
  readonly oauthToken: string | null;
  readonly code?: string | undefined;
  readonly state?: string | undefined;
  /** Cualquier valor de `error` que Google envíe: fallo uniforme, no se refleja. */
  readonly error?: string | undefined;
}

export type AdminLoginResult = { readonly ok: true; readonly sessionToken: string } | { readonly ok: false };

const DENIED: AdminLoginResult = { ok: false };

/** @implements REQ-ADM9-002, REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, EDGE-009-009, EDGE-009-047 */
export class CompleteAdminGoogleLoginUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: AdminCallbackInput): Promise<AdminLoginResult> {
    const admin = requireAdmin(this.deps);
    const now = this.deps.clock.nowIsoTimestamp();
    const tokenHash = hashOfCookie(input.oauthToken);
    // Un solo uso: el estado se consume (y la consumición se confirma) antes de cualquier otra comprobación, también si Google devolvió un error.
    const flow = tokenHash === null ? null : await this.deps.uow.runInTransaction((repositories) => repositories.adminFlows.consume(tokenHash, now));
    if (flow === null || input.error !== undefined || input.code === undefined || input.state === undefined || !constantTimeEqual(flow.state, input.state)) return DENIED;

    let sub: string;
    let email: string;
    try {
      const identity = await admin.oidc.complete({ code: input.code, codeVerifier: flow.codeVerifier, nonce: flow.nonce });
      sub = identity.sub;
      email = normalizeEmail(identity.email);
    } catch {
      return DENIED;
    }
    const isRoot = admin.allowedEmails.includes(email);

    const sessionToken = generateOneTimeToken(admin.entropy);
    try {
      return await this.deps.uow.runInTransaction(async (repositories): Promise<AdminLoginResult> => {
        const adminId = isRoot ? await this.resolveIdentity(repositories, sub, email, now) : await this.resolveDelegate(repositories, sub, email, now);
        if (adminId === null) return DENIED;
        await repositories.adminSessions.purgeCreatedBefore(adminSessionPurgeCutoff(now));
        await repositories.adminSessions.insert({ tokenHash: hashSessionToken(sessionToken), adminId, createdAt: now, lastActivityAt: now, revokedAt: null });
        await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId, action: ADMIN_AUDIT_ACTIONS.sessionStart, objectRef: null, occurredAt: now });
        return { ok: true, sessionToken };
      });
    } catch (error) {
      // Un anclaje que perdió la carrera revierte la transacción entera (sin identidad huérfana) y es el mismo DENIED.
      if (error instanceof AnchorAborted) return DENIED;
      throw error;
    }
  }

  /** `adminId` de la identidad anclada, o `null` si el `sub` o el correo ya pertenecen a otra identidad (EDGE-009-047). Crea el ancla solo en el primer acceso verificado. */
  private async resolveIdentity(repositories: RepositorySet, sub: string, email: string, now: string): Promise<string | null> {
    const bySubject = await repositories.adminIdentities.findBySubject('GOOGLE', sub);
    if (bySubject !== null) return bySubject.email === email ? bySubject.adminId : null;
    if ((await repositories.adminIdentities.findByEmail(email)) !== null) return null;
    const adminId = this.deps.ids.nextId();
    if (await repositories.adminIdentities.insertIfAbsent({ adminId, provider: 'GOOGLE', providerSubject: sub, email, createdAt: now })) return adminId;
    // Carrera: otro acceso anclaba la misma identidad a la vez; se recupera la ganadora solo si es coherente.
    const winner = await repositories.adminIdentities.findBySubject('GOOGLE', sub);
    return winner !== null && winner.email === email ? winner.adminId : null;
  }

  /**
   * Acceso de un delegado (feature 011, REQ-ADM11-006): la fila `ACTIVE` exige el `sub` anclado y la identidad coherente; la `INVITED` vigente (`now <= invitedExpiresAt`, límite inclusivo) ancla el `sub`
   * con compare-and-set, crea la identidad con el MISMO `admin_id` y audita `ADMIN_DELEGATE_ANCHORED` con autor = el propio delegado. Sin fila viva, caducada, `DISABLED`, con `sub` distinto o con
   * rol o estado desconocidos: `null` (DENIED uniforme).
   */
  private async resolveDelegate(repositories: RepositorySet, sub: string, email: string, now: string): Promise<string | null> {
    const row = await repositories.adminDelegates.findLiveByEmail(email);
    const delegate = row === null ? null : toDelegate(row);
    if (row === null || delegate === null) return null;
    if (delegate.status === 'ACTIVE') {
      if (delegate.providerSubject !== sub) return null;
      const identity = await repositories.adminIdentities.findBySubject('GOOGLE', sub);
      if (identity !== null) return identity.adminId === delegate.adminId && identity.email === email ? delegate.adminId : null;
      // Identidad retirada al reciclar el correo y reactivación posterior de esta fila: se vuelve a crear con el mismo `admin_id`.
      return (await this.claimIdentity(repositories, delegate, sub, email, now)) ? delegate.adminId : null;
    }
    if (delegate.status !== 'INVITED' || delegate.providerSubject !== null || isInvitationExpired(delegate, now) || delegate.invitedExpiresAt === null) return null;
    return (await this.anchor(repositories, row, delegate, sub, email, now)) ? delegate.adminId : null;
  }

  private async anchor(repositories: RepositorySet, row: AdminDelegateRecord, delegate: Delegate, sub: string, email: string, now: string): Promise<boolean> {
    await repositories.adminDelegates.lockForGuard();
    if (!(await this.claimIdentity(repositories, delegate, sub, email, now))) throw new AnchorAborted();
    if (!(await repositories.adminDelegates.anchor(row.adminId, 'GOOGLE', sub, now))) throw new AnchorAborted();
    await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: delegate.adminId, action: ADMIN_DELEGATE_AUDIT_ACTIONS.anchored, objectRef: delegate.adminId, occurredAt: now });
    return true;
  }

  /** Lecturas previas a cualquier escritura: el `sub` y el correo solo pueden estar en identidades RETIRABLES (sin delegado vivo ni raíz): EDGE-011-019. */
  private async identityIsFree(repositories: RepositorySet, delegate: Delegate, sub: string, email: string): Promise<boolean> {
    const holders = await this.identityHolders(repositories, sub, email);
    if (holders === null) return false;
    for (const holder of holders) {
      if (holder.adminId === delegate.adminId) return false;
      const live = await repositories.adminDelegates.findById(holder.adminId);
      if (live !== null && (live.status === 'ACTIVE' || live.status === 'INVITED')) return false;
      if (this.deps.admin?.allowedEmails.includes(holder.email) === true) return false;
    }
    return true;
  }

  /** Identidades que ya ocupan el `sub` o el correo; `null` si el `sub` pertenece a otro correo (no se recicla). */
  private async identityHolders(repositories: RepositorySet, sub: string, email: string): Promise<AdminIdentityRecord[] | null> {
    const bySubject = await repositories.adminIdentities.findBySubject('GOOGLE', sub);
    if (bySubject !== null && bySubject.email !== email) return null;
    const byEmail = await repositories.adminIdentities.findByEmail(email);
    const holders: AdminIdentityRecord[] = [];
    for (const holder of [bySubject, byEmail]) {
      if (holder !== null && !holders.some((known) => known.adminId === holder.adminId)) holders.push(holder);
    }
    return holders;
  }

  /** Retira las identidades obsoletas y crea la del delegado con su `admin_id`; `false` si algo lo impide (el llamador revierte). */
  private async claimIdentity(repositories: RepositorySet, delegate: Delegate, sub: string, email: string, now: string): Promise<boolean> {
    const holders = await this.identityHolders(repositories, sub, email);
    if (holders === null) return false;
    if (!(await this.identityIsFree(repositories, delegate, sub, email))) return false;
    for (const holder of holders) await repositories.adminIdentities.deleteById(holder.adminId);
    return repositories.adminIdentities.insertIfAbsent({ adminId: delegate.adminId, provider: 'GOOGLE', providerSubject: sub, email, createdAt: now });
  }
}

/** Señal interna: el anclaje no pudo completarse tras haber leído una fila vigente; revierte la transacción y se responde el mismo DENIED. */
class AnchorAborted extends Error {}

/**
 * Sesión de administración vigente tal como la devuelve la autenticación: nunca el correo, el `sub` ni el identificador de sesión. `role` e `isRoot` se resuelven desde la base en ESTA petición
 * (feature 011, H-7) y no viajan en la cookie ni se guardan en la sesión; solo los usa la capa HTTP contra el registro central de roles por ruta.
 */
export interface AdminSessionInfo {
  readonly adminId: string;
  readonly expiresAt: string;
  readonly idleExpiresAt: string;
  readonly role: PlatformRole;
  readonly isRoot: boolean;
}

/**
 * Sesión vigente del identificador, o `null`. SIEMPRE una sola lectura por hash (aunque falte la cookie), de modo que la secuencia de puertos de una petición sin sesión válida no
 * depende de por qué no la hay (EDGE-009-008). Revoca la sesión si el administrador ya no tiene acceso: correo fuera de la lista raíz Y sin fila de delegado `ACTIVE` coherente (EDGE-009-047,
 * REQ-ADM11-004: desactivar, caducar, cambiar el correo o un rol desconocido cortan en la petición siguiente). Renueva la inactividad solo con `renew`.
 */
async function resolveActiveSession(deps: ApplicationDeps, repositories: RepositorySet, sessionToken: string | null, now: string, renew: boolean, renewForRole?: (role: PlatformRole) => boolean): Promise<AdminSessionInfo | null> {
  const tokenHash = hashSessionToken(sessionToken ?? '');
  const session = await repositories.adminSessions.findByTokenHash(tokenHash);
  if (session === null || sessionToken === null || adminSessionStateAt(session, now) !== 'ACTIVE') return null;
  const access = deps.admin === undefined ? null : await resolveAdminAccess(repositories, deps.admin.allowedEmails, session.adminId);
  if (access === null) {
    await repositories.adminSessions.revoke(tokenHash, now);
    return null;
  }
  // La inactividad se renueva solo si la ruta alcanza al rol: un 403 de rol no mantiene viva la sesión (O1, /trinity).
  const doRenew = renew && (renewForRole === undefined || renewForRole(access.role));
  const current = doRenew ? { ...session, lastActivityAt: now } : session;
  if (doRenew) await repositories.adminSessions.touch(tokenHash, now);
  return { adminId: session.adminId, ...adminSessionExpiry(current), role: access.role, isRoot: access.isRoot };
}

/** @implements REQ-ADM9-001, REQ-ADM9-002, INV-ADM9-002, EDGE-009-008, EDGE-009-047 */
export class AuthenticateAdminUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `renew` por omisión es `false`: solo una acción real de mutación del portal renueva la inactividad; `GET /api/admin/session` no (sin keep-alive). */
  async execute(sessionToken: string | null, options: { readonly renew?: boolean; readonly renewForRole?: (role: PlatformRole) => boolean } = {}): Promise<AdminSessionInfo | null> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => resolveActiveSession(this.deps, repositories, sessionToken, now, options.renew === true, options.renewForRole));
  }
}

/** @implements REQ-ADM9-002, REQ-ADM9-004, EDGE-009-047 */
export class EndAdminSessionUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Revoca la sesión en el servidor y la audita; `false` si ya no hay sesión vigente (la segunda llamada recibe el 404 uniforme). */
  async execute(sessionToken: string | null): Promise<boolean> {
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const session = await resolveActiveSession(this.deps, repositories, sessionToken, now, false);
      if (session === null) return false;
      if (!(await repositories.adminSessions.revoke(hashSessionToken(sessionToken!), now))) return false;
      await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: session.adminId, action: ADMIN_AUDIT_ACTIONS.sessionEnd, objectRef: null, occurredAt: now });
      return true;
    });
  }
}
